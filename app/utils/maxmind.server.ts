import maxmind from 'maxmind';
import type { CityResponse, Reader } from 'maxmind';
import path from 'path';
import fs from 'fs';
import { checkAndRunLiteUpdate } from '../services/geoip-updater.server';
import { COUNTRIES_WITH_STATES, getStateCodeByName } from './states';

let reader: Reader<CityResponse> | null = null;
let initPromise: Promise<void> | null = null;
let reloadPromise: Promise<void> | null = null;
let loadedDatabasePath: string | null = null;
let loadedDatabaseMtimeMs = 0;
let lastReloadCheckAt = 0;

const DB_PATH = path.join(process.cwd(), 'data', 'GeoLite2-City.mmdb');
const LEGACY_DB_PATH = path.join(process.cwd(), 'data', 'GeoLite2-Country.mmdb');
const DEFAULT_RELOAD_CHECK_INTERVAL_MS = 60_000;
const IPINFO_PUBLIC_URL = 'https://ipinfo.io';
const IPINFO_FALLBACK_TIMEOUT_MS = 800;
const IPINFO_FALLBACK_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const IPINFO_FALLBACK_NEGATIVE_CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const MAX_FALLBACK_CACHE_ENTRIES = 5000;

type GeoLookupResult = {
    countryCode: string;
    regionCode: string;
    regionName: string;
    city: string;
};

type GeoLookupOptions = {
    useFreeFallback?: boolean;
    requireCity?: boolean;
};

type FallbackCacheEntry = {
    expiresAt: number;
    geo: GeoLookupResult;
};

type IpinfoPublicResponse = {
    city?: string;
    country?: string;
    error?: unknown;
    ip?: string;
    region?: string;
};

const fallbackCache = new Map<string, FallbackCacheEntry>();
const countriesWithStates = new Set(COUNTRIES_WITH_STATES);

const emptyGeo: GeoLookupResult = { countryCode: '', regionCode: '', regionName: '', city: '' };

function getDatabasePath() {
    if (fs.existsSync(DB_PATH)) return DB_PATH;
    if (fs.existsSync(LEGACY_DB_PATH)) return LEGACY_DB_PATH;
    return null;
}

function getReloadCheckIntervalMs() {
    const configured = Number.parseInt(process.env.MAXMIND_RELOAD_CHECK_INTERVAL_MS || '', 10);
    return Number.isFinite(configured) && configured >= 5_000
        ? configured
        : DEFAULT_RELOAD_CHECK_INTERVAL_MS;
}

async function loadDatabaseReader(dbFile: string, reason: 'initial' | 'updated') {
    const nextReader = await maxmind.open<CityResponse>(dbFile);
    const nextMtimeMs = fs.statSync(dbFile).mtimeMs;

    // Keep the existing reader available until the replacement is fully open.
    reader = nextReader;
    loadedDatabasePath = dbFile;
    loadedDatabaseMtimeMs = nextMtimeMs;
    console.log(
        reason === 'updated'
            ? `[MaxMind] Reloaded updated database: ${path.basename(dbFile)}`
            : `[MaxMind] Database loaded successfully: ${path.basename(dbFile)}`,
    );
}

function isPublicLookupCandidate(ip: string) {
    const value = ip.trim();
    if (!value || value === 'unknown') return false;
    if (value === '::1' || value === '127.0.0.1') return false;
    if (value.startsWith('10.') || value.startsWith('192.168.')) return false;
    if (/^172\.(1[6-9]|2\d|3[0-1])\./.test(value)) return false;
    if (/^(fc|fd)[0-9a-f]{2}:/i.test(value)) return false;
    return /^[0-9a-f:.]+$/i.test(value);
}

function shouldUseFreeFallback(geo: GeoLookupResult, options: GeoLookupOptions) {
    if (options.requireCity && !geo.city) return true;
    if (geo.regionCode || geo.regionName) return false;
    return !geo.countryCode || countriesWithStates.has(geo.countryCode);
}

function getCachedFallback(ip: string) {
    const cached = fallbackCache.get(ip);
    if (!cached) return null;
    if (cached.expiresAt <= Date.now()) {
        fallbackCache.delete(ip);
        return null;
    }
    return cached.geo;
}

function setCachedFallback(ip: string, geo: GeoLookupResult) {
    if (fallbackCache.size >= MAX_FALLBACK_CACHE_ENTRIES) {
        const firstKey = fallbackCache.keys().next().value;
        if (firstKey) fallbackCache.delete(firstKey);
    }

    const hasRegion = Boolean(geo.regionCode || geo.regionName);
    fallbackCache.set(ip, {
        expiresAt: Date.now() + (hasRegion ? IPINFO_FALLBACK_CACHE_TTL_MS : IPINFO_FALLBACK_NEGATIVE_CACHE_TTL_MS),
        geo,
    });
}

async function getFreeFallbackGeoFromIP(ip: string): Promise<GeoLookupResult> {
    const cached = getCachedFallback(ip);
    if (cached) return cached;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), IPINFO_FALLBACK_TIMEOUT_MS);

    try {
        const response = await fetch(`${IPINFO_PUBLIC_URL}/${encodeURIComponent(ip)}/json`, {
            headers: { accept: 'application/json' },
            signal: controller.signal,
        });

        if (!response.ok) {
            setCachedFallback(ip, emptyGeo);
            return emptyGeo;
        }

        const data = (await response.json()) as IpinfoPublicResponse;
        if (data.error) {
            setCachedFallback(ip, emptyGeo);
            return emptyGeo;
        }

        const countryCode = data.country?.trim().toUpperCase().slice(0, 2) || '';
        const regionName = data.region?.trim() || '';
        const regionCode = countryCode && regionName
            ? getStateCodeByName(countryCode, regionName) || ''
            : '';
        const city = data.city?.trim() || '';
        const geo = { countryCode, regionCode, regionName, city };

        setCachedFallback(ip, geo);
        return geo;
    } catch (error) {
        if ((error as Error)?.name !== 'AbortError') {
            console.error('[IPinfo Fallback] Lookup error for IP', ip, ':', error);
        }
    } finally {
        clearTimeout(timeout);
    }

    return emptyGeo;
}

function mergeGeoResults(primary: GeoLookupResult, fallback: GeoLookupResult): GeoLookupResult {
    if (!fallback.countryCode && !fallback.regionCode && !fallback.regionName && !fallback.city) {
        return primary;
    }
    if (primary.countryCode && fallback.countryCode && primary.countryCode !== fallback.countryCode) {
        return primary;
    }

    return {
        countryCode: primary.countryCode || fallback.countryCode,
        regionCode: primary.regionCode || fallback.regionCode,
        regionName: primary.regionName || fallback.regionName,
        city: primary.city || fallback.city,
    };
}

/**
 * Initialize MaxMind GeoLite2-Country database reader.
 * Called lazily on first request, or eagerly from startBackgroundJobs.
 */
async function initReader(): Promise<void> {
    if (reader) return;

    // Trigger auto-update check.
    // If the DB file exists, this is just a fast stat() call.
    // If it is missing, the updater downloads the current database before opening it.
    await checkAndRunLiteUpdate().catch(err => console.error('[MaxMind] Update check failed:', err));

    try {
        const dbFile = getDatabasePath();
        if (!dbFile) {
            console.error('[MaxMind] No database file found at', DB_PATH, 'or', LEGACY_DB_PATH);
            return;
        }
        await loadDatabaseReader(dbFile, 'initial');
    } catch (error) {
        console.error('[MaxMind] Failed to load database:', error);
    }
}

async function ensureReaderCurrent() {
    if (!reader) {
        if (!initPromise) initPromise = initReader();
        await initPromise;
    }

    if (!reader) return;

    const now = Date.now();
    if (now - lastReloadCheckAt < getReloadCheckIntervalMs()) return;
    lastReloadCheckAt = now;

    const dbFile = getDatabasePath();
    if (!dbFile) return;

    try {
        const currentMtimeMs = fs.statSync(dbFile).mtimeMs;
        if (dbFile === loadedDatabasePath && currentMtimeMs === loadedDatabaseMtimeMs) return;

        if (!reloadPromise) {
            reloadPromise = loadDatabaseReader(dbFile, 'updated').finally(() => {
                reloadPromise = null;
            });
        }
        await reloadPromise;
    } catch (error) {
        // Continue serving lookups with the last known-good reader.
        console.error('[MaxMind] Failed to reload updated database:', error);
    }
}

/**
 * Force-reload the MaxMind reader after a database file update.
 * Call this after updateGeoIPDatabase() succeeds.
 */
export function invalidateReader(): void {
    reader = null;
    initPromise = null;
    reloadPromise = null;
    loadedDatabasePath = null;
    loadedDatabaseMtimeMs = 0;
    lastReloadCheckAt = 0;
    console.log('[MaxMind] Reader invalidated — will reload on next lookup');
}

/**
 * Pre-warm the MaxMind reader in the background (non-blocking).
 * Called from entry.server.tsx startBackgroundJobs().
 */
export function preloadReader(): void {
    if (!initPromise) {
        initPromise = initReader();
    }
}

/**
 * Get country code from IP address using MaxMind GeoLite2
 * @param ip - IP address to lookup
 * @returns ISO 3166-1 alpha-2 country code (e.g., "US", "VN") or empty string if not found
 */
export async function getCountryFromIP(ip: string): Promise<string> {
    await ensureReaderCurrent();

    if (!reader) {
        return '';
    }

    try {
        const result = reader.get(ip);
        if (result && result.country && result.country.iso_code) {
            return result.country.iso_code;
        }
    } catch (error) {
        console.error('[MaxMind] Lookup error for IP', ip, ':', error);
    }

    return '';
}

/**
 * Get full geo info from IP address using MaxMind GeoLite2-City
 * @param ip - IP address to lookup
 * @returns Object with countryCode, regionCode (ISO 3166-2), regionName, and city
 */
export async function getGeoFromIP(ip: string, options: GeoLookupOptions = {}): Promise<{
    countryCode: string;
    regionCode: string;
    regionName: string;
    city: string;
}> {
    await ensureReaderCurrent();

    if (!reader) {
        return options.useFreeFallback && isPublicLookupCandidate(ip)
            ? await getFreeFallbackGeoFromIP(ip)
            : emptyGeo;
    }

    try {
        const result = reader.get(ip);
        if (!result) {
            return options.useFreeFallback && isPublicLookupCandidate(ip)
                ? await getFreeFallbackGeoFromIP(ip)
                : emptyGeo;
        }

        const countryCode = result.country?.iso_code || '';
        const subdivision = result.subdivisions?.[0];
        const subdivisionCode = subdivision?.iso_code || '';
        const regionName = subdivision?.names?.en || '';
        const regionCode = countryCode && subdivisionCode
            ? `${countryCode}-${subdivisionCode}`
            : '';
        const city = result.city?.names?.en || '';

        const localGeo = { countryCode, regionCode, regionName, city };
        if (!options.useFreeFallback || !isPublicLookupCandidate(ip) || !shouldUseFreeFallback(localGeo, options)) {
            return localGeo;
        }

        return mergeGeoResults(localGeo, await getFreeFallbackGeoFromIP(ip));
    } catch (error) {
        console.error('[MaxMind] Geo lookup error for IP', ip, ':', error);
    }

    return emptyGeo;
}

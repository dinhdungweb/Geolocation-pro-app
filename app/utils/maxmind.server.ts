import maxmind from 'maxmind';
import type { CityResponse, Reader } from 'maxmind';
import path from 'path';
import fs from 'fs';
import { checkAndRunLiteUpdate } from '../services/geoip-updater.server';

let reader: Reader<CityResponse> | null = null;
let initPromise: Promise<void> | null = null;

const DB_PATH = path.join(process.cwd(), 'data', 'GeoLite2-City.mmdb');
const LEGACY_DB_PATH = path.join(process.cwd(), 'data', 'GeoLite2-Country.mmdb');

/**
 * Initialize MaxMind GeoLite2-Country database reader.
 * Called lazily on first request, or eagerly from startBackgroundJobs.
 */
async function initReader(): Promise<void> {
    if (reader) return;

    // Trigger auto-update check.
    // If the DB file exists, this is just a fast stat() call.
    // If it's missing, it will download (~5MB) — only happens on first deploy.
    await checkAndRunLiteUpdate().catch(err => console.error('[MaxMind] Update check failed:', err));

    try {
        // Try City DB first, fall back to legacy Country DB
        const dbFile = fs.existsSync(DB_PATH) ? DB_PATH : LEGACY_DB_PATH;
        if (!fs.existsSync(dbFile)) {
            console.error('[MaxMind] No database file found at', DB_PATH, 'or', LEGACY_DB_PATH);
            return;
        }
        reader = await maxmind.open<CityResponse>(dbFile);
        console.log('[MaxMind] Database loaded successfully:', path.basename(dbFile));
    } catch (error) {
        console.error('[MaxMind] Failed to load database:', error);
    }
}

/**
 * Force-reload the MaxMind reader after a database file update.
 * Call this after updateGeoIPDatabase() succeeds.
 */
export function invalidateReader(): void {
    reader = null;
    initPromise = null;
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
    // Initialize reader if not done yet (singleton pattern)
    if (!reader) {
        if (!initPromise) {
            initPromise = initReader();
        }
        await initPromise;
    }

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
export async function getGeoFromIP(ip: string): Promise<{
    countryCode: string;
    regionCode: string;
    regionName: string;
    city: string;
}> {
    // Initialize reader if not done yet
    if (!reader) {
        if (!initPromise) {
            initPromise = initReader();
        }
        await initPromise;
    }

    const empty = { countryCode: '', regionCode: '', regionName: '', city: '' };
    if (!reader) return empty;

    try {
        const result = reader.get(ip);
        if (!result) return empty;

        const countryCode = result.country?.iso_code || '';
        const subdivision = result.subdivisions?.[0];
        const subdivisionCode = subdivision?.iso_code || '';
        const regionName = subdivision?.names?.en || '';
        const regionCode = countryCode && subdivisionCode
            ? `${countryCode}-${subdivisionCode}`
            : '';
        const city = result.city?.names?.en || '';

        return { countryCode, regionCode, regionName, city };
    } catch (error) {
        console.error('[MaxMind] Geo lookup error for IP', ip, ':', error);
    }

    return empty;
}

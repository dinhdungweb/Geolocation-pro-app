import maxmind, { CountryResponse, Reader } from 'maxmind';
import path from 'path';
import fs from 'fs';

let reader: Reader<CountryResponse> | null = null;
let initPromise: Promise<void> | null = null;

/**
 * Initialize MaxMind GeoLite2-Country database reader
 * This is called once when the first request comes in
 */
async function initReader(): Promise<void> {
    if (reader) return;

    const dbPath = path.join(process.cwd(), 'data', 'GeoLite2-Country.mmdb');

    // Check if database file exists
    if (!fs.existsSync(dbPath)) {
        console.error('[MaxMind] Database file not found:', dbPath);
        return;
    }

    try {
        reader = await maxmind.open<CountryResponse>(dbPath);
        console.log('[MaxMind] Database loaded successfully');
    } catch (error) {
        console.error('[MaxMind] Failed to load database:', error);
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
        console.log('[MaxMind] Reader not available, returning empty');
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

import fs from 'fs';
import path from 'path';
import * as tar from 'tar';
import { Readable } from 'stream';
import { invalidateReader } from '../utils/maxmind.server';

const DB_DIR = path.join(process.cwd(), 'data');
const DB_FILENAME = 'GeoLite2-City.mmdb';
const DB_PATH = path.join(DB_DIR, DB_FILENAME);
const DB_METADATA_PATH = path.join(DB_DIR, 'GeoLite2-City.meta.json');
const LICENSE_KEY = process.env.MAXMIND_LICENSE_KEY;
const DEFAULT_UPDATE_INTERVAL_HOURS = 23;

// URLs for MaxMind GeoLite2
// Note: Requires a valid license key
const DOWNLOAD_URL = `https://download.maxmind.com/app/geoip_download?edition_id=GeoLite2-City&license_key=${LICENSE_KEY}&suffix=tar.gz`;

type RemoteDatabaseMetadata = {
    etag: string | null;
    lastModified: string | null;
};

function readStoredMetadata(): RemoteDatabaseMetadata | null {
    try {
        const value = JSON.parse(fs.readFileSync(DB_METADATA_PATH, 'utf8')) as Partial<RemoteDatabaseMetadata>;
        return {
            etag: typeof value.etag === 'string' ? value.etag : null,
            lastModified: typeof value.lastModified === 'string' ? value.lastModified : null,
        };
    } catch {
        return null;
    }
}

function writeStoredMetadata(metadata: RemoteDatabaseMetadata) {
    const tempPath = `${DB_METADATA_PATH}.${process.pid}.tmp`;
    fs.writeFileSync(tempPath, JSON.stringify(metadata), 'utf8');
    try {
        fs.renameSync(tempPath, DB_METADATA_PATH);
    } catch {
        try {
            fs.copyFileSync(tempPath, DB_METADATA_PATH);
        } finally {
            fs.rmSync(tempPath, { force: true });
        }
    }
}

async function getRemoteMetadata(): Promise<RemoteDatabaseMetadata | null> {
    try {
        const response = await fetch(DOWNLOAD_URL, { method: 'HEAD' });
        if (!response.ok) {
            console.warn(`[MaxMind Auto-Update] Version check returned HTTP ${response.status}; downloading normally.`);
            return null;
        }

        return {
            etag: response.headers.get('etag'),
            lastModified: response.headers.get('last-modified'),
        };
    } catch (error) {
        console.warn('[MaxMind Auto-Update] Version check failed; downloading normally:', error);
        return null;
    }
}

function metadataMatches(
    stored: RemoteDatabaseMetadata | null,
    remote: RemoteDatabaseMetadata | null,
) {
    if (!stored || !remote) return false;
    if (stored.etag && remote.etag) return stored.etag === remote.etag;
    return Boolean(
        stored.lastModified &&
        remote.lastModified &&
        stored.lastModified === remote.lastModified,
    );
}

function replaceDatabaseFile(sourcePath: string) {
    const stagedPath = path.join(DB_DIR, `${DB_FILENAME}.${process.pid}.${Date.now()}.tmp`);
    fs.copyFileSync(sourcePath, stagedPath);

    try {
        // Atomic on the Linux production host because both paths share a directory.
        fs.renameSync(stagedPath, DB_PATH);
    } catch (error) {
        // Some development filesystems do not replace an existing destination on rename.
        try {
            fs.copyFileSync(stagedPath, DB_PATH);
        } finally {
            fs.rmSync(stagedPath, { force: true });
        }
        console.warn('[MaxMind Auto-Update] Atomic replacement was unavailable; used a copy fallback:', error);
    }
}

export async function updateGeoIPDatabase() {
    if (!LICENSE_KEY) {
        console.warn('[MaxMind Auto-Update] Skipped: No MAXMIND_LICENSE_KEY found in environment variables.');
        return;
    }

    const remoteMetadata = await getRemoteMetadata();
    if (fs.existsSync(DB_PATH) && metadataMatches(readStoredMetadata(), remoteMetadata)) {
        console.log('[MaxMind Auto-Update] Database is already the latest available version.');
        return;
    }

    console.log('[MaxMind Auto-Update] Downloading a newer database...');

    let tempExtractDir: string | null = null;

    try {
        // 1. Download the tar.gz file
        const response = await fetch(DOWNLOAD_URL);

        if (!response.ok) {
            throw new Error(`Failed to download database: ${response.statusText}`);
        }

        if (!response.body) {
            throw new Error('Response body is empty');
        }

        // Ensure data directory exists
        if (!fs.existsSync(DB_DIR)) {
            fs.mkdirSync(DB_DIR, { recursive: true });
        }

        // Extract to a temporary folder, then atomically copy the .mmdb file into place.
        tempExtractDir = fs.mkdtempSync(path.join(DB_DIR, 'geoip-update-'));
        const extractDir = tempExtractDir;

        // Convert web stream to Node readable stream
        // Using Readable.from because fromWeb has compatibility issues in some Node versions
        const nodeStream = Readable.from(response.body as any);

        await new Promise((resolve, reject) => {
            nodeStream.pipe(
                tar.x({
                    cwd: extractDir,
                })
            ).on('finish', resolve).on('error', reject);
        });

        // 3. Find the mmdb file in the temp directory
        const findMMDB = (dir: string): string | null => {
            const files = fs.readdirSync(dir);
            for (const file of files) {
                const fullPath = path.join(dir, file);
                const stat = fs.statSync(fullPath);
                if (stat.isDirectory()) {
                    const result = findMMDB(fullPath);
                    if (result) return result;
                } else if (file.endsWith('.mmdb')) {
                    return fullPath;
                }
            }
            return null;
        };

        const extractedFilePath = findMMDB(extractDir);

        if (extractedFilePath) {
            replaceDatabaseFile(extractedFilePath);
            writeStoredMetadata({
                etag: response.headers.get('etag') || remoteMetadata?.etag || null,
                lastModified:
                    response.headers.get('last-modified') || remoteMetadata?.lastModified || null,
            });
            // Force the in-memory reader to reload the new DB file
            invalidateReader();
            console.log(`[MaxMind Auto-Update] Database updated successfully at ${DB_PATH}`);
        } else {
            console.error('[MaxMind Auto-Update] Could not find .mmdb file in the downloaded archive.');
        }

    } catch (error) {
        console.error('[MaxMind Auto-Update] Update failed:', error);
    } finally {
        if (tempExtractDir) {
            fs.rmSync(tempExtractDir, { recursive: true, force: true });
        }
    }
}

// Check on the configured cadence; updateGeoIPDatabase verifies that MaxMind
// actually published a newer build before downloading the archive.
export async function checkAndRunLiteUpdate() {
    // Check if DB exists
    if (!fs.existsSync(DB_PATH)) {
        await updateGeoIPDatabase();
        return;
    }

    const stats = fs.statSync(DB_PATH);
    const now = new Date();
    const fileAgeInHours = (now.getTime() - stats.mtime.getTime()) / (1000 * 60 * 60);
    const configuredInterval = Number.parseFloat(process.env.MAXMIND_UPDATE_INTERVAL_HOURS || '');
    const updateIntervalHours = Number.isFinite(configuredInterval) && configuredInterval > 0
        ? configuredInterval
        : DEFAULT_UPDATE_INTERVAL_HOURS;

    // The production worker checks daily at 03:00. A 23-hour default avoids
    // skipping the next run because the previous download completed a few
    // seconds after the scheduled time.
    if (fileAgeInHours >= updateIntervalHours) {
        console.log(`[MaxMind Auto-Update] Database is ${fileAgeInHours.toFixed(1)} hours old. Updating...`);
        await updateGeoIPDatabase();
    } else {
        console.log(
            `[MaxMind Auto-Update] Database is current (${fileAgeInHours.toFixed(1)} hours old; update interval ${updateIntervalHours} hours).`,
        );
    }
}

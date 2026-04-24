import fs from 'fs';
import path from 'path';
import * as tar from 'tar';
import { Readable } from 'stream';

const DB_DIR = path.join(process.cwd(), 'data');
const DB_FILENAME = 'GeoLite2-Country.mmdb';
const DB_PATH = path.join(DB_DIR, DB_FILENAME);
const LICENSE_KEY = process.env.MAXMIND_LICENSE_KEY;

// URLs for MaxMind GeoLite2
// Note: Requires a valid license key
const DOWNLOAD_URL = `https://download.maxmind.com/app/geoip_download?edition_id=GeoLite2-Country&license_key=${LICENSE_KEY}&suffix=tar.gz`;

export async function updateGeoIPDatabase() {
    if (!LICENSE_KEY) {
        console.warn('[MaxMind Auto-Update] Skipped: No MAXMIND_LICENSE_KEY found in environment variables.');
        return;
    }

    console.log('[MaxMind Auto-Update] Starting database update...');

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
        const tempExtractDir = path.join(DB_DIR, 'temp_extract');
        if (!fs.existsSync(tempExtractDir)) {
            fs.mkdirSync(tempExtractDir, { recursive: true });
        }

        // Convert web stream to Node readable stream
        // Using Readable.from because fromWeb has compatibility issues in some Node versions
        const nodeStream = Readable.from(response.body as any);

        await new Promise((resolve, reject) => {
            nodeStream.pipe(
                tar.x({
                    cwd: tempExtractDir,
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

        const extractedFilePath = findMMDB(tempExtractDir);

        if (extractedFilePath) {
            // 4. Atomic replacement (move new file to destination)
            // Rename might fail across partitions, but here it's same dir.
            // Copy then delete is safer.
            fs.copyFileSync(extractedFilePath, DB_PATH);
            console.log(`[MaxMind Auto-Update] Database updated successfully at ${DB_PATH}`);
        } else {
            console.error('[MaxMind Auto-Update] Could not find .mmdb file in the downloaded archive.');
        }

        // 5. Cleanup
        fs.rmSync(tempExtractDir, { recursive: true, force: true });

    } catch (error) {
        console.error('[MaxMind Auto-Update] Update failed:', error);
    }
}

// Function to check if update is needed (e.g. file is older than 30 days)
export async function checkAndRunLiteUpdate() {
    // Check if DB exists
    if (!fs.existsSync(DB_PATH)) {
        await updateGeoIPDatabase();
        return;
    }

    const stats = fs.statSync(DB_PATH);
    const now = new Date();
    const fileAgeInDays = (now.getTime() - stats.mtime.getTime()) / (1000 * 60 * 60 * 24);

    // Update if older than 7 days (MaxMind updates effectively weekly/monthly)
    // Adjust logic as needed. Weekly is good.
    if (fileAgeInDays > 7) {
        console.log(`[MaxMind Auto-Update] Database is ${Math.round(fileAgeInDays)} days old. Updating...`);
        await updateGeoIPDatabase();
    } else {
        console.log(`[MaxMind Auto-Update] Database is current (${Math.round(fileAgeInDays)} days old).`);
    }
}

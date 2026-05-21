import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import maxmind from "maxmind";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DB_PATH = path.join(__dirname, '..', '..', 'data', 'GeoLite2-City.mmdb');

async function test() {
    console.log("Checking database at:", DB_PATH);
    if (!fs.existsSync(DB_PATH)) {
        console.error("Database not found!");
        return;
    }
    const reader = await maxmind.open(DB_PATH);
    
    const ips = ['169.197.142.208', '169.197.85.173', '161.185.160.93', '108.160.128.1'];
    
    for (const ip of ips) {
        const geo = reader.get(ip);
        if (!geo) {
            console.log(`IP ${ip}: No geo data`);
            continue;
        }
        const countryCode = geo.country?.iso_code || '';
        const subdivisionCode = geo.subdivisions?.[0]?.iso_code || '';
        const regionCode = countryCode && subdivisionCode ? `${countryCode}-${subdivisionCode}` : '';
        const city = geo.city?.names?.en || '';
        
        console.log(`IP ${ip} -> Country: ${countryCode}, Region: ${regionCode}, City: ${city}`);
    }
}

test();

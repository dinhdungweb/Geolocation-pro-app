import "dotenv/config";
import { spawn } from "node:child_process";
import { mkdir, readdir, rm } from "node:fs/promises";
import path from "node:path";

const databaseUrl = process.env.DATABASE_URL?.trim();
if (!databaseUrl) {
  throw new Error("DATABASE_URL is required");
}

const retentionDays = Number.parseInt(process.env.BACKUP_RETENTION_DAYS || "14", 10);
if (!Number.isInteger(retentionDays) || retentionDays < 1) {
  throw new Error("BACKUP_RETENTION_DAYS must be a positive integer");
}

const connection = new URL(databaseUrl);
if (!["postgres:", "postgresql:"].includes(connection.protocol)) {
  throw new Error("DATABASE_URL must point to PostgreSQL");
}

const databaseName = decodeURIComponent(connection.pathname.replace(/^\/+/, ""));
if (!databaseName) {
  throw new Error("DATABASE_URL must include a database name");
}

const backupDir = path.resolve(process.env.BACKUP_DIR || "backups/postgres");
const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
const safeDatabaseName = databaseName.replace(/[^a-zA-Z0-9_-]/g, "_");
const filename = `postgres-${safeDatabaseName}-${timestamp}.dump`;
const outputPath = path.join(backupDir, filename);

await mkdir(backupDir, { recursive: true });

const pgEnvironment = {
  ...process.env,
  PGHOST: decodeURIComponent(connection.hostname),
  PGPORT: connection.port || "5432",
  PGUSER: decodeURIComponent(connection.username),
  PGPASSWORD: decodeURIComponent(connection.password),
};

const sslMode = connection.searchParams.get("sslmode");
if (sslMode) {
  pgEnvironment.PGSSLMODE = sslMode;
}

const args = [
  "--format=custom",
  "--compress=9",
  "--no-owner",
  "--no-privileges",
  "--file",
  outputPath,
  databaseName,
];

try {
  await new Promise((resolve, reject) => {
    const child = spawn("pg_dump", args, {
      env: pgEnvironment,
      stdio: ["ignore", "inherit", "inherit"],
      windowsHide: true,
    });

    child.on("error", reject);
    child.on("exit", (code, signal) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(new Error(`pg_dump failed (${signal ? `signal ${signal}` : `exit ${code}`})`));
    });
  });
} catch (error) {
  await rm(outputPath, { force: true });
  throw error;
}

const cutoff = Date.now() - retentionDays * 24 * 60 * 60 * 1000;
const entries = await readdir(backupDir, { withFileTypes: true });
let removed = 0;

for (const entry of entries) {
  if (!entry.isFile() || !/^postgres-.+\.dump$/.test(entry.name)) {
    continue;
  }

  const match = entry.name.match(/-(\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z)\.dump$/);
  if (!match) {
    continue;
  }

  const createdAt = Date.parse(match[1].replace(
    /T(\d{2})-(\d{2})-(\d{2})-(\d{3})Z$/,
    "T$1:$2:$3.$4Z",
  ));

  if (Number.isFinite(createdAt) && createdAt < cutoff) {
    await rm(path.join(backupDir, entry.name), { force: true });
    removed += 1;
  }
}

console.log(`[Backup] Created ${outputPath}`);
console.log(`[Backup] Removed ${removed} backup(s) older than ${retentionDays} day(s)`);

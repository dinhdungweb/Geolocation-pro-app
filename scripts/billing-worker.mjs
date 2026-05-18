import "dotenv/config";
import { access } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

async function getWorkerModuleUrl() {
  const workerPath = path.resolve(process.cwd(), "build", "worker", "billing-worker.js");
  await access(workerPath);
  return pathToFileURL(workerPath).href;
}

try {
  await import(await getWorkerModuleUrl());
} catch (error) {
  console.error("[Worker] Failed to start billing worker. Run `npm run build` first.", error);
  process.exit(1);
}

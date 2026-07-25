import "dotenv/config";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const healthcheckUrl = process.env.HEALTHCHECK_URL || "http://127.0.0.1:3001/healthz";
const timeoutMs = Number.parseInt(process.env.HEALTHCHECK_TIMEOUT_MS || "10000", 10);
const failureThreshold = Number.parseInt(process.env.HEALTHCHECK_FAILURE_THRESHOLD || "2", 10);
const statePath = path.resolve(
  process.env.HEALTHCHECK_STATE_FILE || ".runtime/healthcheck-state.json",
);
const alertWebhookUrl = process.env.ALERT_WEBHOOK_URL?.trim();

if (!Number.isInteger(timeoutMs) || timeoutMs < 1000) {
  throw new Error("HEALTHCHECK_TIMEOUT_MS must be an integer of at least 1000");
}

if (!Number.isInteger(failureThreshold) || failureThreshold < 1) {
  throw new Error("HEALTHCHECK_FAILURE_THRESHOLD must be a positive integer");
}

async function readState() {
  try {
    return JSON.parse(await readFile(statePath, "utf8"));
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
      return { consecutiveFailures: 0, status: "unknown" };
    }
    throw error;
  }
}

async function saveState(state) {
  await mkdir(path.dirname(statePath), { recursive: true });
  await writeFile(statePath, `${JSON.stringify(state, null, 2)}\n`, "utf8");
}

async function sendAlert(message) {
  if (!alertWebhookUrl) {
    console.warn("[Healthcheck] ALERT_WEBHOOK_URL is not configured");
    return;
  }

  const response = await fetch(alertWebhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text: message }),
    signal: AbortSignal.timeout(timeoutMs),
  });

  if (!response.ok) {
    throw new Error(`Alert webhook returned HTTP ${response.status}`);
  }
}

async function trySendAlert(message) {
  try {
    await sendAlert(message);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`[Healthcheck] Failed to send alert: ${errorMessage}`);
  }
}

const previous = await readState();
const checkedAt = new Date().toISOString();

try {
  const response = await fetch(healthcheckUrl, {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(timeoutMs),
  });

  if (!response.ok) {
    throw new Error(`Health endpoint returned HTTP ${response.status}`);
  }

  const payload = await response.json();
  if (payload?.status !== "ok") {
    throw new Error(`Unexpected health status: ${payload?.status || "missing"}`);
  }

  if (previous.status === "down") {
    await trySendAlert(`GeoPro recovered at ${checkedAt}: ${healthcheckUrl}`);
  }

  await saveState({
    checkedAt,
    consecutiveFailures: 0,
    status: "up",
  });
  console.log(`[Healthcheck] OK ${healthcheckUrl}`);
} catch (error) {
  const consecutiveFailures = Number(previous.consecutiveFailures || 0) + 1;
  const errorMessage = error instanceof Error ? error.message : String(error);
  const status = consecutiveFailures >= failureThreshold ? "down" : "degraded";

  if (status === "down" && previous.status !== "down") {
    await trySendAlert(
      `GeoPro is DOWN after ${consecutiveFailures} failed checks at ${checkedAt}: ${errorMessage}`,
    );
  }

  await saveState({
    checkedAt,
    consecutiveFailures,
    error: errorMessage,
    status,
  });
  console.error(`[Healthcheck] FAILED (${consecutiveFailures}/${failureThreshold}): ${errorMessage}`);
  process.exitCode = 1;
}

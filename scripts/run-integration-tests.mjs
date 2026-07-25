import { spawnSync } from "node:child_process";
import path from "node:path";
import process from "node:process";
import { config as loadEnv } from "dotenv";

loadEnv({ path: ".env" });
loadEnv({ path: ".env.test", override: true });

function validatedTestDatabaseUrl() {
  const rawUrl = process.env.TEST_DATABASE_URL?.trim();
  if (!rawUrl) {
    throw new Error(
      "TEST_DATABASE_URL is required. Copy .env.test.example and use a dedicated test schema.",
    );
  }

  const url = new URL(rawUrl);
  if (!["postgres:", "postgresql:"].includes(url.protocol)) {
    throw new Error("TEST_DATABASE_URL must point to PostgreSQL");
  }

  const schema = url.searchParams.get("schema") || "";
  if (!schema || schema === "public" || !/(test|integration)/i.test(schema)) {
    throw new Error(
      'TEST_DATABASE_URL must use a non-public schema containing "test" or "integration"',
    );
  }

  if (process.env.DATABASE_URL?.trim() === rawUrl) {
    throw new Error("TEST_DATABASE_URL must not be identical to DATABASE_URL");
  }

  return rawUrl;
}

function runNodeModule(entryPath, args, env) {
  const result = spawnSync(process.execPath, [entryPath, ...args], {
    cwd: process.cwd(),
    env,
    stdio: "inherit",
  });

  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

try {
  const testDatabaseUrl = validatedTestDatabaseUrl();
  const testEnv = {
    ...process.env,
    DATABASE_URL: testDatabaseUrl,
    DISABLE_ANALYTICS_QUEUE_WORKER: "true",
    NODE_ENV: "test",
    SHOPIFY_API_SECRET: process.env.SHOPIFY_API_SECRET || "integration-test-secret",
  };

  runNodeModule(
    path.resolve("node_modules/prisma/build/index.js"),
    ["db", "push", "--skip-generate", "--accept-data-loss"],
    testEnv,
  );
  runNodeModule(
    path.resolve("node_modules/vitest/vitest.mjs"),
    ["run", "--config", "vitest.integration.config.ts"],
    testEnv,
  );
} catch (error) {
  console.error(`[Integration Test] ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}

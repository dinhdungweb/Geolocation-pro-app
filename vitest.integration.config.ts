import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    exclude: [],
    fileParallelism: false,
    hookTimeout: 30_000,
    include: ["test/**/*.integration.test.ts"],
    maxWorkers: 1,
    pool: "forks",
    restoreMocks: true,
    setupFiles: ["./test/integration/setup.ts"],
    testTimeout: 15_000,
  },
});

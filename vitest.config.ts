import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["app/**/*.test.ts"],
    restoreMocks: true,
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
      reportsDirectory: "coverage",
      include: [
        "app/utils/analytics-token.server.ts",
        "app/utils/billing-mode.server.ts",
        "app/utils/page-targeting.ts",
        "app/utils/request-ip.server.ts",
        "app/utils/rule-conflicts.ts",
      ],
      thresholds: {
        branches: 70,
        functions: 90,
        lines: 85,
        statements: 85,
      },
    },
  },
});

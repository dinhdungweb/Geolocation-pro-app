import { defineConfig } from "vite";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [tsconfigPaths()],
  build: {
    emptyOutDir: false,
    outDir: "build/worker",
    ssr: "app/worker.billing.server.ts",
    rollupOptions: {
      output: {
        entryFileNames: "billing-worker.js",
      },
    },
  },
});

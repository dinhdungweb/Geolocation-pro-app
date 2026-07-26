import path from "node:path";
import { defineConfig } from "vite";

export default defineConfig({
  publicDir: false,
  build: {
    emptyOutDir: false,
    lib: {
      entry: path.resolve(
        process.cwd(),
        "extensions/geolocation-popup/src/geolocation.js",
      ),
      fileName: () => "geolocation.js",
      formats: ["iife"],
      name: "GeolocationStorefront",
    },
    minify: "esbuild",
    outDir: path.resolve(
      process.cwd(),
      "extensions/geolocation-popup/assets",
    ),
    target: "es2020",
  },
});

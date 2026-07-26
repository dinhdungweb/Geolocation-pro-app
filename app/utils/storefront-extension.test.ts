import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const extensionRoot = path.resolve(
  process.cwd(),
  "extensions/geolocation-popup",
);
const liquidPath = path.join(
  extensionRoot,
  "blocks/geolocation-popup.liquid",
);
const sourcePath = path.resolve(process.cwd(), "storefront/geolocation.js");
const assetPath = path.join(extensionRoot, "assets/geolocation.js");

describe("storefront geolocation extension", () => {
  it("keeps the Liquid bootstrap small and loads the versioned JavaScript asset", () => {
    const liquid = fs.readFileSync(liquidPath, "utf8");

    expect(Buffer.byteLength(liquid)).toBeLessThan(2_500);
    expect(liquid).toContain(`{{ 'geolocation.js' | asset_url }}`);
    expect(liquid).toContain("async");
    expect(liquid).toContain("window.__GEOLOCATION_CONFIG__");
    expect(liquid).not.toContain("const CookieManager");
  });

  it("serializes every dynamic Liquid value as JSON before JavaScript reads it", () => {
    const liquid = fs.readFileSync(liquidPath, "utf8");

    expect(liquid).toContain("shop.permanent_domain | json");
    expect(liquid).toContain("geo_analytics_url | json");
    expect(liquid).toContain("geo_visitor_country | json");
    expect(liquid).toContain("geo_market_handle | json");
    expect(liquid).toContain("geo_market_id | json");
  });

  it("ships a minified cached asset while retaining a maintainable source file", () => {
    const source = fs.readFileSync(sourcePath, "utf8");
    const asset = fs.readFileSync(assetPath, "utf8");

    expect(source).toContain("const GEOLOCATION_CONFIG = window.__GEOLOCATION_CONFIG__");
    expect(source).not.toMatch(/{{|{%/);
    expect(Buffer.byteLength(asset)).toBeLessThan(30_000);
    expect(Buffer.byteLength(asset)).toBeLessThan(Buffer.byteLength(source));
  });
});

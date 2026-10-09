import { describe, expect, it } from "vitest";
import { getShopifyAdminAppUrl } from "./app-recovery";

describe("getShopifyAdminAppUrl", () => {
  it("builds a fresh Shopify Admin app URL from the embedded shop parameter", () => {
    expect(
      getShopifyAdminAppUrl(
        "https://geopro.bluepeaks.top/app?embedded=1&shop=heliosjewels-vn.myshopify.com",
      ),
    ).toBe(
      "https://admin.shopify.com/store/heliosjewels-vn/apps/geolocation-app-4/app",
    );
  });

  it("normalizes a valid Shopify shop domain", () => {
    expect(
      getShopifyAdminAppUrl(
        "https://geopro.bluepeaks.top/app?shop=Demo-Store.myshopify.com",
      ),
    ).toBe(
      "https://admin.shopify.com/store/demo-store/apps/geolocation-app-4/app",
    );
  });

  it("uses the remembered shop after client-side navigation drops the query", () => {
    expect(
      getShopifyAdminAppUrl(
        "https://geopro.bluepeaks.top/app/settings",
        "heliosjewels-vn.myshopify.com",
      ),
    ).toBe(
      "https://admin.shopify.com/store/heliosjewels-vn/apps/geolocation-app-4/app",
    );
  });

  it("rejects non-Shopify and malformed shop parameters", () => {
    expect(
      getShopifyAdminAppUrl(
        "https://geopro.bluepeaks.top/app?shop=example.com",
      ),
    ).toBeNull();
    expect(getShopifyAdminAppUrl("not-a-url")).toBeNull();
  });
});

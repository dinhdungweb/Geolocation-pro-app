import { afterEach, describe, expect, it, vi } from "vitest";
import { isBillingTestMode } from "./billing-mode.server";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("isBillingTestMode", () => {
  it("defaults to test billing outside production", () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("SHOPIFY_BILLING_TEST", "");
    expect(isBillingTestMode()).toBe(true);
  });

  it("defaults to live billing in production", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("SHOPIFY_BILLING_TEST", "");
    expect(isBillingTestMode()).toBe(false);
  });

  it.each(["1", "true", "YES", " on "])("accepts %j as an explicit test-mode override", (value) => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("SHOPIFY_BILLING_TEST", value);
    expect(isBillingTestMode()).toBe(true);
  });

  it.each(["0", "false", "no", "off"])("accepts %j as an explicit live-mode override", (value) => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("SHOPIFY_BILLING_TEST", value);
    expect(isBillingTestMode()).toBe(false);
  });
});

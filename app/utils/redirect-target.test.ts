import { describe, expect, it } from "vitest";
import {
  defaultRedirectFrequency,
  effectiveRedirectFrequency,
  isExternalRedirectTarget,
  isSafeMerchantUrl,
  normalizeRedirectFrequency,
} from "./redirect-target";

const shop = "mystore.myshopify.com";
const ownHosts = [shop, "mystore.com", "mystore.ca"];

describe("redirect target classification", () => {
  it("treats relative paths and the store's own domains as the same store", () => {
    expect(isExternalRedirectTarget("/en-ca", shop, ownHosts)).toBe(false);
    expect(isExternalRedirectTarget("https://www.mystore.com/en-ca", shop, ownHosts)).toBe(false);
    expect(isExternalRedirectTarget("https://mystore.ca", shop, ownHosts)).toBe(false);
    expect(isExternalRedirectTarget(`https://${shop}/pages/x`, shop, [])).toBe(false);
    expect(isExternalRedirectTarget("https://other-store.com", shop, ownHosts)).toBe(true);
  });

  it("defaults new rules to once on this store and always elsewhere", () => {
    expect(defaultRedirectFrequency("/en-ca", shop, ownHosts)).toBe("once");
    expect(defaultRedirectFrequency("https://www.mystore.com/en-ca", shop, ownHosts)).toBe("once");
    expect(defaultRedirectFrequency("https://other-store.com", shop, ownHosts)).toBe("always");
    // An empty URL (form just opened) is not another store.
    expect(defaultRedirectFrequency("", shop, ownHosts)).toBe("once");
  });

  it("keeps a stored frequency and resolves legacy rules like the storefront", () => {
    expect(
      effectiveRedirectFrequency({ redirectFrequency: "always", targetUrl: "/en-ca" }, shop, ownHosts),
    ).toBe("always");
    expect(
      effectiveRedirectFrequency({ redirectFrequency: null, targetUrl: "https://mystore.com/fr" }, shop, ownHosts),
    ).toBe("once");
    expect(
      effectiveRedirectFrequency({ redirectFrequency: null, targetUrl: "https://other.com" }, shop, ownHosts),
    ).toBe("always");
  });
});

describe("submitted redirect frequency", () => {
  it("keeps legacy rules unset and defaults invalid values to always", () => {
    expect(normalizeRedirectFrequency("auto_redirect", "once")).toBe("once");
    expect(normalizeRedirectFrequency("auto_redirect", "legacy")).toBeNull();
    expect(normalizeRedirectFrequency("auto_redirect", "bogus")).toBe("always");
    expect(normalizeRedirectFrequency("popup", "once")).toBeNull();
  });
});

describe("merchant URL allowlist", () => {
  it("allows http(s), relative paths and empty values", () => {
    for (const url of ["", "https://shop.de", "http://x.com/a", "/en-ca", "pages/about"]) {
      expect(isSafeMerchantUrl(url)).toBe(true);
    }
  });

  it("rejects script URLs, including disguised ones", () => {
    for (const url of ["javascript:alert(1)", "java	script:alert(1)", "javascript:alert(1)", "data:text/html,x", "vbscript:x"]) {
      expect(isSafeMerchantUrl(url)).toBe(false);
    }
  });

  it("allows mailto only where requested", () => {
    expect(isSafeMerchantUrl("mailto:help@shop.com")).toBe(false);
    expect(isSafeMerchantUrl("mailto:help@shop.com", { allowMailto: true })).toBe(true);
  });
});

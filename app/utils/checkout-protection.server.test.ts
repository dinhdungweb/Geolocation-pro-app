import { beforeEach, describe, expect, it, vi } from "vitest";

const prismaMock = vi.hoisted(() => ({
  redirectRule: { findMany: vi.fn() },
  settings: { findMany: vi.fn(), findUnique: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
}));

const unauthenticatedAdmin = vi.hoisted(() => vi.fn());

vi.mock("../db.server", () => ({ default: prismaMock }));
vi.mock("../shopify.server", () => ({
  unauthenticated: { admin: unauthenticatedAdmin },
}));

import {
  getCheckoutEligibleRules,
  getShopHostsWithin,
  isCheckoutProtectionDesired,
  isExternalRedirectTarget,
  normalizeCheckoutCountryCodes,
  reconcileCheckoutProtectionDrift,
  resyncCheckoutProtectionAfterPlanChange,
  syncCheckoutProtection,
  syncCheckoutProtectionSafely,
} from "./checkout-protection.server";

const shop = "checkout-test.myshopify.com";

function settings(overrides: Record<string, unknown> = {}) {
  return {
    blockedMessage: "Not available",
    checkoutProtectionEnabled: true,
    checkoutValidationId: null,
    currentPlan: "premium",
    billingOverrideEnabled: false,
    billingOverridePlan: null,
    isEnabled: true,
    mode: "auto_redirect",
    ...overrides,
  };
}

// Returns canned GraphQL payloads in call order and records each operation.
function adminWith(...payloads: unknown[]) {
  const graphql = vi.fn(async (_query: string, _options?: { variables?: Record<string, unknown> }) =>
    Response.json(payloads.shift() ?? {}),
  );
  const operation = (index: number) =>
    String(graphql.mock.calls[index]?.[0]).match(/(query|mutation) (\w+)/)?.[2];
  return { admin: { graphql }, graphql, operation };
}

const updateOk = { data: { validationUpdate: { validation: { id: "x" }, userErrors: [] } } };
const createOk = (id: string) => ({
  data: { validationCreate: { validation: { id, enabled: true }, userErrors: [] } },
});
const blockRule = (countryCodes: string) => ({
  countryCodes,
  redirectMode: "auto_redirect",
  ruleType: "block",
  targetUrl: "",
});
const redirectRule = (countryCodes: string, targetUrl: string, redirectMode = "auto_redirect") => ({
  countryCodes,
  redirectMode,
  ruleType: "redirect",
  targetUrl,
});
const shopHosts = {
  data: {
    shop: { myshopifyDomain: shop, primaryDomain: { host: "www.mystore.com" } },
    webPresences: {
      nodes: [{ domain: { host: "mystore.ca" }, rootUrls: [{ url: "https://mystore.ca" }] }],
    },
  },
};
const ownValidation = (id: string) => ({
  id,
  shopifyFunction: { handle: "geo-checkout-validation", appKey: "test-api-key" },
});

describe("checkout protection sync", () => {
  beforeEach(() => {
    vi.stubEnv("SHOPIFY_API_KEY", "test-api-key");
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    prismaMock.redirectRule.findMany.mockResolvedValue([blockRule("CN, ru")]);
    prismaMock.settings.findUnique.mockResolvedValue(settings());
    prismaMock.settings.update.mockResolvedValue({});
    prismaMock.settings.updateMany.mockResolvedValue({ count: 1 });
  });

  it("normalizes, validates, de-duplicates, and sorts country codes", () => {
    expect(
      normalizeCheckoutCountryCodes([
        { countryCodes: "CN, us  CA" },
        { countryCodes: "cn,INVALID, GB" },
      ]),
    ).toEqual(["CA", "CN", "GB", "US"]);
  });

  it("classifies redirect targets on this store as internal", () => {
    const hosts = [shop, "mystore.com", "mystore.ca"];
    expect(isExternalRedirectTarget("/en-ca", shop, hosts)).toBe(false);
    expect(isExternalRedirectTarget("mystore.ca/pages/x", shop, hosts)).toBe(false);
    expect(isExternalRedirectTarget("https://www.mystore.com/fr", shop, hosts)).toBe(false);
    expect(isExternalRedirectTarget(`https://${shop}/collections/all`, shop, hosts)).toBe(false);
    expect(isExternalRedirectTarget("https://MYSTORE.ca", shop, hosts)).toBe(false);
    expect(isExternalRedirectTarget("javascript:alert(1)", shop, hosts)).toBe(false);
    expect(isExternalRedirectTarget("", shop, hosts)).toBe(false);
    expect(isExternalRedirectTarget("https://other-store.com", shop, hosts)).toBe(true);
    expect(isExternalRedirectTarget("//other-store.de/shop", shop, hosts)).toBe(true);
  });

  it("enforces block rules and only external auto-redirects at checkout", async () => {
    prismaMock.redirectRule.findMany.mockResolvedValue([
      blockRule("CN"),
      blockRule("*"),
      redirectRule("CA", "/en-ca"),
      redirectRule("FR", "https://www.mystore.com/fr"),
      redirectRule("MX", "https://other-store.com", "popup"),
      redirectRule("DE", "https://other-store.de"),
      { ...redirectRule("JP", "https://other-store.jp"), redirectFrequency: "once" },
      { ...redirectRule("IT", "https://other-store.it"), redirectFrequency: "always" },
    ]);
    const { admin, operation } = adminWith(shopHosts);

    const rules = await getCheckoutEligibleRules("hosts-test.myshopify.com", admin);

    expect(operation(0)).toBe("GeoCheckoutShopHosts");
    // DE: legacy (no frequency) external auto redirect; IT: explicit "always".
    // JP is "redirect once", so the visitor may come back and buy.
    expect(normalizeCheckoutCountryCodes(rules)).toEqual(["CN", "DE", "IT"]);
  });

  it("skips the domain lookup when there are no redirect rules", async () => {
    prismaMock.redirectRule.findMany.mockResolvedValue([blockRule("CN")]);
    const { admin, graphql } = adminWith();

    expect(normalizeCheckoutCountryCodes(await getCheckoutEligibleRules(shop, admin))).toEqual(["CN"]);
    expect(graphql).not.toHaveBeenCalled();
  });

  it("does not touch Shopify for shops that never used checkout protection", async () => {
    prismaMock.settings.findUnique.mockResolvedValue(
      settings({ checkoutProtectionEnabled: false, checkoutValidationId: null }),
    );
    const { admin, graphql } = adminWith();

    const result = await syncCheckoutProtection({ admin, shop });

    expect(result).toEqual({ blockedCountries: [], enabled: false, validationId: null });
    expect(graphql).not.toHaveBeenCalled();
    expect(prismaMock.redirectRule.findMany).not.toHaveBeenCalled();
  });

  it("disables the validation when the app itself is turned off", async () => {
    prismaMock.settings.findUnique.mockResolvedValue(
      settings({ isEnabled: false, checkoutValidationId: "gid://shopify/Validation/1" }),
    );
    const { admin, graphql } = adminWith(updateOk);

    const result = await syncCheckoutProtection({ admin, shop });

    expect(result.enabled).toBe(false);
    const variables = (graphql.mock.calls[0] as any)[1].variables;
    expect(variables.validation.enable).toBe(false);
  });

  it("disables the validation on the Free plan", async () => {
    prismaMock.settings.findUnique.mockResolvedValue(
      settings({ currentPlan: "free", checkoutValidationId: "gid://shopify/Validation/1" }),
    );
    const { admin, graphql } = adminWith(updateOk);

    const result = await syncCheckoutProtection({ admin, shop });

    expect(result.enabled).toBe(false);
    expect((graphql.mock.calls[0] as any)[1].variables.validation.enable).toBe(false);
  });

  it("treats a paid billing override as a paid plan", async () => {
    prismaMock.settings.findUnique.mockResolvedValue(
      settings({
        currentPlan: "free",
        billingOverrideEnabled: true,
        billingOverridePlan: "elite",
        checkoutValidationId: "gid://shopify/Validation/1",
      }),
    );
    const { admin } = adminWith(updateOk);

    expect((await syncCheckoutProtection({ admin, shop })).enabled).toBe(true);
  });

  it("skips plan-change resync for shops that never used checkout protection", async () => {
    prismaMock.settings.findUnique.mockResolvedValue(
      settings({ checkoutProtectionEnabled: false, checkoutValidationId: null }),
    );

    await resyncCheckoutProtectionAfterPlanChange(shop);

    expect(unauthenticatedAdmin).not.toHaveBeenCalled();
  });

  it("resyncs with the offline session after a plan change outside a request", async () => {
    prismaMock.settings.findUnique.mockResolvedValue(
      settings({ currentPlan: "free", checkoutValidationId: "gid://shopify/Validation/1" }),
    );
    const { admin, graphql } = adminWith(updateOk);
    unauthenticatedAdmin.mockResolvedValue({ admin });

    await resyncCheckoutProtectionAfterPlanChange(shop);

    expect(unauthenticatedAdmin).toHaveBeenCalledWith(shop);
    expect((graphql.mock.calls[0] as any)[1].variables.validation.enable).toBe(false);
  });

  it("adopts an existing validation instead of creating a duplicate, and removes extras", async () => {
    const { admin, operation } = adminWith(
      { data: { validations: { nodes: [ownValidation("v1"), ownValidation("v2")] } } },
      { data: { validationDelete: { deletedId: "v2", userErrors: [] } } },
      updateOk,
    );

    const result = await syncCheckoutProtection({ admin, shop });

    expect([operation(0), operation(1), operation(2)]).toEqual([
      "GeoCheckoutValidations",
      "GeoCheckoutValidationDelete",
      "GeoCheckoutValidationUpdate",
    ]);
    expect(result.validationId).toBe("v1");
    expect(prismaMock.settings.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ checkoutValidationId: "v1" }) }),
    );
  });

  it("recreates the validation when the stored ID no longer exists", async () => {
    prismaMock.settings.findUnique.mockResolvedValue(
      settings({ checkoutValidationId: "gid://shopify/Validation/stale" }),
    );
    const { admin, operation } = adminWith(
      { data: { validationUpdate: { validation: null, userErrors: [{ code: "NOT_FOUND", message: "Validation not found" }] } } },
      { data: { validations: { nodes: [] } } },
      createOk("gid://shopify/Validation/new"),
    );

    const result = await syncCheckoutProtection({ admin, shop });

    expect([operation(0), operation(1), operation(2)]).toEqual([
      "GeoCheckoutValidationUpdate",
      "GeoCheckoutValidations",
      "GeoCheckoutValidationCreate",
    ]);
    expect(result.validationId).toBe("gid://shopify/Validation/new");
  });

  it("ignores validations owned by other apps", async () => {
    const { admin, operation } = adminWith(
      {
        data: {
          validations: {
            nodes: [{ id: "other", shopifyFunction: { handle: "geo-checkout-validation", appKey: "other-app" } }],
          },
        },
      },
      createOk("mine"),
    );

    const result = await syncCheckoutProtection({ admin, shop });

    expect(operation(1)).toBe("GeoCheckoutValidationCreate");
    expect(result.validationId).toBe("mine");
  });

  it("serializes concurrent syncs so only one validation is created", async () => {
    let created = 0;
    const graphql = vi.fn(async (query: string) => {
      if (query.includes("GeoCheckoutValidations")) {
        return Response.json({
          data: { validations: { nodes: created ? [ownValidation("only")] : [] } },
        });
      }
      if (query.includes("GeoCheckoutValidationCreate")) {
        created++;
        return Response.json(createOk("only"));
      }
      return Response.json(updateOk);
    });
    // The second sync reads the ID the first one stored.
    prismaMock.settings.update.mockImplementation(async ({ data }: any) => {
      prismaMock.settings.findUnique.mockResolvedValue(
        settings({ checkoutValidationId: data.checkoutValidationId }),
      );
      return {};
    });

    await Promise.all([
      syncCheckoutProtection({ admin: { graphql }, shop }),
      syncCheckoutProtection({ admin: { graphql }, shop }),
    ]);

    expect(created).toBe(1);
  });

  it("explains a missing permission instead of surfacing the raw access error", async () => {
    const { admin } = adminWith(
      { data: { validations: { nodes: [] } } },
      { errors: [{ message: "Access denied for validationCreate field. Required access: `write_validations`." }] },
    );

    const result = await syncCheckoutProtectionSafely({ admin, shop });

    expect(result.error).toMatch(/approve the new permissions/i);
    expect(prismaMock.settings.updateMany).toHaveBeenCalled();
  });
});

describe("shop host lookup for page loaders", () => {
  it("falls back to the myshopify domain when Shopify is slow", async () => {
    vi.useFakeTimers();
    try {
      const slowShop = "slow-hosts.myshopify.com";
      const admin = { graphql: vi.fn(() => new Promise<Response>(() => undefined)) };

      const pending = getShopHostsWithin(admin, slowShop, 2_500);
      await vi.advanceTimersByTimeAsync(2_500);

      await expect(pending).resolves.toEqual([slowShop]);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("checkout protection drift", () => {
  const base = {
    billingOverrideEnabled: false,
    billingOverridePlan: null,
    checkoutProtectionEnabled: true,
    currentPlan: "premium",
    isEnabled: true,
    mode: "auto_redirect",
  };

  it("wants enforcement only on a paid plan with the app and toggle on", () => {
    expect(isCheckoutProtectionDesired(base)).toBe(true);
    expect(isCheckoutProtectionDesired({ ...base, currentPlan: "free" })).toBe(false);
    expect(
      isCheckoutProtectionDesired({
        ...base,
        currentPlan: "free",
        billingOverrideEnabled: true,
        billingOverridePlan: "elite",
      }),
    ).toBe(true);
    expect(isCheckoutProtectionDesired({ ...base, isEnabled: false })).toBe(false);
    expect(isCheckoutProtectionDesired({ ...base, mode: "disabled" })).toBe(false);
    expect(isCheckoutProtectionDesired({ ...base, checkoutProtectionEnabled: false })).toBe(false);
  });

  it("resyncs only shops whose Shopify state no longer matches their plan", async () => {
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    prismaMock.settings.findMany.mockResolvedValue([
      // In sync: paid and enforcing.
      { ...base, shop: "a.myshopify.com", checkoutValidationActive: true },
      // Downgraded to Free by a path that skipped the resync: still enforcing.
      { ...base, shop: "b.myshopify.com", currentPlan: "free", checkoutValidationActive: true },
      // Upgraded but never re-enabled.
      { ...base, shop: "c.myshopify.com", checkoutValidationActive: false },
    ]);
    // The resync itself reads settings; returning null makes it a no-op here.
    prismaMock.settings.findUnique.mockResolvedValue(null);

    expect(await reconcileCheckoutProtectionDrift()).toBe(2);
    const resyncedShops = prismaMock.settings.findUnique.mock.calls.map(
      (call: any) => call[0].where.shop,
    );
    expect(resyncedShops).toEqual(["b.myshopify.com", "c.myshopify.com"]);
  });
});

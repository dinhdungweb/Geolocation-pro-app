import { beforeEach, describe, expect, it, vi } from "vitest";

const prismaMock = vi.hoisted(() => ({
  redirectRule: { findMany: vi.fn() },
  settings: { findUnique: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
}));

vi.mock("../db.server", () => ({ default: prismaMock }));

import {
  getCheckoutEligibleRules,
  normalizeCheckoutCountryCodes,
  syncCheckoutProtection,
  syncCheckoutProtectionSafely,
} from "./checkout-protection.server";

const shop = "checkout-test.myshopify.com";

function settings(overrides: Record<string, unknown> = {}) {
  return {
    blockedMessage: "Not available",
    checkoutProtectionEnabled: true,
    checkoutValidationId: null,
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
const ownValidation = (id: string) => ({
  id,
  shopifyFunction: { handle: "geo-checkout-validation", appKey: "test-api-key" },
});

describe("checkout protection sync", () => {
  beforeEach(() => {
    vi.stubEnv("SHOPIFY_API_KEY", "test-api-key");
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    prismaMock.redirectRule.findMany.mockResolvedValue([{ countryCodes: "CN, ru" }]);
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

  it("does not count wildcard-only rules as eligible", async () => {
    prismaMock.redirectRule.findMany.mockResolvedValue([
      { countryCodes: "*" },
      { countryCodes: "CN" },
    ]);
    expect(await getCheckoutEligibleRules(shop)).toEqual([{ countryCodes: "CN" }]);
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

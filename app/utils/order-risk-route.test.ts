import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  adminGraphql: vi.fn(),
  authenticateAdmin: vi.fn(),
  checkBillingWithFallback: vi.fn(),
  createRedirectRule: vi.fn(),
  decryptProtectedData: vi.fn(),
  findOrderRiskRecords: vi.fn(),
  findOrderRiskRecord: vi.fn(),
  findRedirectRules: vi.fn(),
  findSettings: vi.fn(),
  invalidateStorefrontConfigCache: vi.fn(),
  updateOrderRiskRecords: vi.fn(),
}));

vi.mock("../shopify.server", () => ({
  authenticate: {
    admin: mocks.authenticateAdmin,
  },
  unauthenticated: {
    admin: vi.fn(),
  },
}));

vi.mock("../db.server", () => ({
  default: {
    orderRiskRecord: {
      findMany: mocks.findOrderRiskRecords,
      findFirst: mocks.findOrderRiskRecord,
      updateMany: mocks.updateOrderRiskRecords,
    },
    redirectRule: {
      create: mocks.createRedirectRule,
      findMany: mocks.findRedirectRules,
    },
    settings: {
      findUnique: mocks.findSettings,
    },
  },
}));

vi.mock("./billing-mode.server", () => ({
  isBillingTestMode: vi.fn(() => false),
}));

vi.mock("./billing.server", () => ({
  checkBillingWithFallback: mocks.checkBillingWithFallback,
}));

vi.mock("./effective-plan.server", () => ({
  getStableShopifyPlanFromBillingCheck: vi.fn(() => "PRO"),
  hasPaidPlanAccess: vi.fn(() => true),
  resolveEffectivePlan: vi.fn(() => ({ effectivePlan: "PRO" })),
}));

vi.mock("./secret-crypto.server", () => ({
  decryptProtectedData: mocks.decryptProtectedData,
  hashProtectedData: vi.fn((value: string) => `hash:${value}`),
}));

vi.mock("./storefront-config-cache.server", () => ({
  invalidateStorefrontConfigCache: mocks.invalidateStorefrontConfigCache,
}));

import { action } from "../routes/app.order-risk";

describe("Order Risk Shopify detail API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.authenticateAdmin.mockResolvedValue({
      admin: { graphql: mocks.adminGraphql },
      billing: {},
      session: { shop: "risk-test.myshopify.com" },
    });
    mocks.findOrderRiskRecord.mockResolvedValue({
      legacyOrderId: "hashed-order-id",
      legacyOrderIdEncrypted: "encrypted-order-id",
    });
    mocks.findOrderRiskRecords.mockResolvedValue([]);
    mocks.findRedirectRules.mockResolvedValue([]);
    mocks.findSettings.mockResolvedValue({ currentPlan: "PRO" });
    mocks.checkBillingWithFallback.mockResolvedValue({
      appSubscriptions: [],
      hasActivePayment: true,
    });
    mocks.updateOrderRiskRecords.mockResolvedValue({ count: 0 });
    mocks.decryptProtectedData.mockReturnValue("1234567890");
    mocks.adminGraphql.mockResolvedValue(
      Response.json({
        data: {
          order: {
            risk: {
              assessments: [
                {
                  facts: [
                    {
                      description: "Billing country matches the order location.",
                      sentiment: "POSITIVE",
                    },
                    {
                      description: "CVV isn't available.",
                      sentiment: "NEUTRAL",
                    },
                  ],
                  provider: null,
                  riskLevel: "LOW",
                },
                {
                  facts: [
                    {
                      description: "VPN or proxy detected.",
                      sentiment: "NEGATIVE",
                    },
                  ],
                  provider: { title: "Geo Risk" },
                  riskLevel: "MEDIUM",
                },
              ],
              recommendation: "ACCEPT",
            },
          },
        },
      }),
    );
  });

  it("loads Shopify facts and preserves their provider and sentiment", async () => {
    const formData = new FormData();
    formData.set("intent", "load_risk_details");
    formData.set("id", "risk-record-id");

    const response = await action({
      context: {},
      params: {},
      request: new Request("https://app.test/app/order-risk", {
        method: "POST",
        body: formData,
      }),
    } as never);

    expect(mocks.findOrderRiskRecord).toHaveBeenCalledWith({
      where: {
        id: "risk-record-id",
        shop: "risk-test.myshopify.com",
      },
      select: {
        legacyOrderId: true,
        legacyOrderIdEncrypted: true,
      },
    });
    expect(mocks.adminGraphql).toHaveBeenCalledWith(
      expect.stringContaining("GeoOrderRiskDetails"),
      {
        variables: {
          id: "gid://shopify/Order/1234567890",
        },
      },
    );
    expect(response.data).toEqual({
      recordId: "risk-record-id",
      riskDetails: {
        assessments: [
          {
            facts: [
              {
                description: "Billing country matches the order location.",
                sentiment: "POSITIVE",
              },
              {
                description: "CVV isn't available.",
                sentiment: "NEUTRAL",
              },
            ],
            providerTitle: null,
            riskLevel: "LOW",
          },
          {
            facts: [
              {
                description: "VPN or proxy detected.",
                sentiment: "NEGATIVE",
              },
            ],
            providerTitle: "Geo Risk",
            riskLevel: "MEDIUM",
          },
        ],
        recommendation: "ACCEPT",
      },
    });
  });

  it("marks only selected records from the authenticated shop as reviewed", async () => {
    mocks.updateOrderRiskRecords.mockResolvedValue({ count: 2 });
    const formData = new FormData();
    formData.set("intent", "bulk_mark_reviewed");
    formData.append("ids", "risk-record-1");
    formData.append("ids", "risk-record-2");
    formData.append("ids", "risk-record-2");

    const response = await action({
      context: {},
      params: {},
      request: new Request("https://app.test/app/order-risk", {
        method: "POST",
        body: formData,
      }),
    } as never);

    expect(mocks.updateOrderRiskRecords).toHaveBeenCalledWith({
      where: {
        id: { in: ["risk-record-1", "risk-record-2"] },
        shop: "risk-test.myshopify.com",
      },
      data: { reviewStatus: "reviewed" },
    });
    expect(response.data).toEqual({
      message: "2 selected orders marked as reviewed.",
    });
  });

  it("bulk blocks unique new IPs and skips IPs already blocked", async () => {
    mocks.findOrderRiskRecords.mockResolvedValue([
      { clientIp: "encrypted-ip-1" },
      { clientIp: "encrypted-ip-2" },
      { clientIp: "encrypted-ip-1" },
    ]);
    mocks.findRedirectRules.mockResolvedValue([
      { ipAddresses: "198.51.100.20" },
    ]);
    mocks.decryptProtectedData.mockImplementation((value: string) => {
      if (value === "encrypted-ip-1") return "198.51.100.10";
      if (value === "encrypted-ip-2") return "198.51.100.20";
      return "1234567890";
    });
    mocks.createRedirectRule.mockResolvedValue({ id: "rule-1" });
    const formData = new FormData();
    formData.set("intent", "bulk_block_ips");
    formData.append("ids", "risk-record-1");
    formData.append("ids", "risk-record-2");
    formData.append("ids", "risk-record-3");

    const response = await action({
      context: {},
      params: {},
      request: new Request("https://app.test/app/order-risk", {
        method: "POST",
        body: formData,
      }),
    } as never);

    expect(mocks.findOrderRiskRecords).toHaveBeenCalledWith({
      where: {
        id: {
          in: ["risk-record-1", "risk-record-2", "risk-record-3"],
        },
        shop: "risk-test.myshopify.com",
      },
      select: { clientIp: true },
    });
    expect(mocks.createRedirectRule).toHaveBeenCalledWith({
      data: expect.objectContaining({
        ipAddresses: "198.51.100.10",
        isActive: true,
        matchType: "ip",
        ruleType: "block",
        shop: "risk-test.myshopify.com",
      }),
    });
    expect(mocks.invalidateStorefrontConfigCache).toHaveBeenCalledWith(
      "risk-test.myshopify.com",
    );
    expect(response.data).toEqual({
      message: "1 IP address blocked; 1 already blocked.",
    });
  });
});

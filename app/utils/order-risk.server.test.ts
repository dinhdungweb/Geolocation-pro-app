import { beforeEach, describe, expect, it, vi } from "vitest";

const prismaMock = vi.hoisted(() => ({
  orderRiskRecord: {
    count: vi.fn(),
    findUnique: vi.fn(),
    update: vi.fn(),
    upsert: vi.fn(),
  },
  visitorLog: {
    findMany: vi.fn(),
  },
}));

vi.mock("../db.server", () => ({
  default: prismaMock,
}));

vi.mock("./maxmind.server", () => ({
  getGeoFromIP: vi.fn().mockResolvedValue({
    city: "Toronto",
    countryCode: "CA",
    regionCode: "CA-ON",
    regionName: "Ontario",
  }),
}));

vi.mock("./ip-risk.server", () => ({
  getCachedIpRiskByHash: vi.fn().mockResolvedValue(null),
}));

import {
  getOrderIdFromWebhookPayload,
  hasOrderScope,
  hasWriteOrderScope,
  syncOrderRisk,
} from "./order-risk.server";
import {
  decryptProtectedData,
  hashProtectedData,
} from "./secret-crypto.server";

function shopifyOrderResponse() {
  return {
    data: {
      order: {
        id: "gid://shopify/Order/123",
        legacyResourceId: "123",
        name: "#1001",
        createdAt: "2026-07-27T12:00:00.000Z",
        processedAt: "2026-07-27T12:01:00.000Z",
        clientIp: "203.0.113.10",
        displayFinancialStatus: "PAID",
        displayFulfillmentStatus: "UNFULFILLED",
        totalPriceSet: {
          shopMoney: {
            amount: "125.50",
            currencyCode: "USD",
          },
        },
        risk: {
          recommendation: "INVESTIGATE",
          assessments: [
            {
              riskLevel: "MEDIUM",
              provider: null,
              facts: [],
            },
          ],
        },
      },
    },
  };
}

describe("order risk synchronization", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("APP_ENCRYPTION_KEY", "order-risk-test-encryption-key");
    prismaMock.visitorLog.findMany.mockResolvedValue([
      {
        action: "blocked",
        city: "Toronto",
        countryCode: "CA",
        regionCode: "CA-ON",
        regionName: "Ontario",
        ruleName: "Block Canada",
        timestamp: new Date("2026-07-27T11:30:00.000Z"),
      },
    ]);
    prismaMock.orderRiskRecord.count.mockResolvedValue(0);
    prismaMock.orderRiskRecord.findUnique.mockResolvedValue(null);
    prismaMock.orderRiskRecord.upsert.mockImplementation(async ({ create }) => ({
      id: "risk-record",
      ...create,
    }));
    prismaMock.orderRiskRecord.update.mockImplementation(async ({ data }) => ({
      id: "risk-record",
      ...data,
    }));
  });

  it("scores Geo signals and publishes a Shopify assessment", async () => {
    const admin = {
      graphql: vi
        .fn()
        .mockResolvedValueOnce({
          json: async () => shopifyOrderResponse(),
        })
        .mockResolvedValueOnce({
          json: async () => ({
            data: {
              orderRiskAssessmentCreate: {
                orderRiskAssessment: { riskLevel: "HIGH" },
                userErrors: [],
              },
            },
          }),
        }),
    };

    await syncOrderRisk({
      admin,
      orderId: "123",
      publishAssessment: true,
      shop: "risk-test.myshopify.com",
    });

    expect(prismaMock.orderRiskRecord.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          appRiskLevel: "MEDIUM",
          appRiskScore: 35,
          clientIp: expect.stringMatching(/^v1:/),
          clientIpHash: hashProtectedData("203.0.113.10"),
          ipCountryCode: expect.stringMatching(/^v1:/),
          legacyOrderId: hashProtectedData("123"),
          orderGid: hashProtectedData("gid://shopify/Order/123"),
          orderName: expect.stringMatching(/^v1:/),
          riskSignals: expect.stringMatching(/^v1:/),
          shopifyRiskLevel: "MEDIUM",
          totalAmount: 0,
          totalAmountEncrypted: expect.stringMatching(/^v1:/),
        }),
      }),
    );
    expect(admin.graphql).toHaveBeenCalledTimes(2);
    expect(admin.graphql.mock.calls[1]?.[1]).toEqual(
      expect.objectContaining({
        variables: {
          input: expect.objectContaining({
            orderId: "gid://shopify/Order/123",
            riskLevel: "MEDIUM",
          }),
        },
      }),
    );
    expect(prismaMock.orderRiskRecord.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          assessmentFingerprint: expect.any(String),
          assessmentSyncedAt: expect.any(Date),
        }),
      }),
    );
    const createData =
      prismaMock.orderRiskRecord.upsert.mock.calls[0]?.[0]?.create;
    expect(decryptProtectedData(createData?.clientIp)).toBe("203.0.113.10");
    expect(decryptProtectedData(createData?.ipCountryCode)).toBe("CA");
    expect(decryptProtectedData(createData?.legacyOrderIdEncrypted)).toBe(
      "123",
    );
    expect(decryptProtectedData(createData?.orderName)).toBe("#1001");
    expect(decryptProtectedData(createData?.totalAmountEncrypted)).toBe(
      "125.5",
    );
    expect(JSON.parse(decryptProtectedData(createData?.riskSignals))).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "previously_blocked" }),
      ]),
    );
    expect(String(admin.graphql.mock.calls[0]?.[0])).not.toContain(
      "shippingAddress",
    );
  });

  it("stores risk data without publishing when write access is unavailable", async () => {
    const admin = {
      graphql: vi.fn().mockResolvedValue({
        json: async () => shopifyOrderResponse(),
      }),
    };

    await syncOrderRisk({
      admin,
      orderId: "gid://shopify/Order/123",
      publishAssessment: false,
      shop: "risk-test.myshopify.com",
    });

    expect(admin.graphql).toHaveBeenCalledTimes(1);
    expect(prismaMock.orderRiskRecord.update).not.toHaveBeenCalled();
  });

  it("normalizes webhook IDs and order scopes", () => {
    expect(getOrderIdFromWebhookPayload({ id: 123 })).toBe(
      "gid://shopify/Order/123",
    );
    expect(
      getOrderIdFromWebhookPayload({
        admin_graphql_api_id: "gid://shopify/Order/456",
      }),
    ).toBe("gid://shopify/Order/456");
    expect(hasOrderScope("read_themes,read_orders")).toBe(true);
    expect(hasOrderScope("read_themes")).toBe(false);
    expect(hasWriteOrderScope("read_orders,write_orders")).toBe(true);
  });
});

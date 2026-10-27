import { beforeEach, describe, expect, it, vi } from "vitest";

const prismaMock = vi.hoisted(() => ({
  orderRiskRecord: { findMany: vi.fn(), deleteMany: vi.fn() },
  visitorLog: { findMany: vi.fn(), deleteMany: vi.fn() },
  gdprDataRequest: { create: vi.fn() },
}));

vi.mock("../db.server", () => ({ default: prismaMock }));

import { hashIP } from "./analytics-token.server";
import { recordCustomerDataRequest, redactCustomerData } from "./gdpr.server";
import { decryptProtectedData, encryptProtectedData } from "./secret-crypto.server";

const shop = "gdpr-test.myshopify.com";

describe("GDPR customer webhooks", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("APP_ENCRYPTION_KEY", "gdpr-test-encryption-key");
    vi.stubEnv("SHOPIFY_API_SECRET", "gdpr-test-secret");
    prismaMock.orderRiskRecord.findMany.mockResolvedValue([
      {
        legacyOrderId: "hash",
        legacyOrderIdEncrypted: encryptProtectedData("1001"),
        orderName: encryptProtectedData("#1001"),
        orderCreatedAt: new Date("2026-10-01T00:00:00Z"),
        clientIp: encryptProtectedData("203.0.113.9"),
        ipCountryCode: encryptProtectedData("CA"),
        ipRegionName: encryptProtectedData("Ontario"),
        ipCity: encryptProtectedData("Toronto"),
        appRiskLevel: "LOW",
        appRiskScore: 5,
      },
    ]);
    prismaMock.visitorLog.findMany.mockResolvedValue([{ action: "visit" }]);
    prismaMock.visitorLog.deleteMany.mockResolvedValue({ count: 3 });
    prismaMock.orderRiskRecord.deleteMany.mockResolvedValue({ count: 1 });
    prismaMock.gdprDataRequest.create.mockResolvedValue({});
  });

  it("stores an encrypted export of the customer's linked data", async () => {
    const result = await recordCustomerDataRequest(shop, {
      customer: { id: 42 },
      orders_requested: [1001],
    });

    expect(result).toEqual({ orders: 1, records: 1, visitorLogs: 1 });
    const stored = prismaMock.gdprDataRequest.create.mock.calls[0][0].data;
    expect(stored).toMatchObject({ shop, customerId: "42", ordersRequested: "1001", status: "pending" });

    const exported = JSON.parse(decryptProtectedData(stored.exportEncrypted) as string);
    expect(exported.orderRiskRecords[0]).toMatchObject({
      orderId: "1001",
      orderName: "#1001",
      clientIp: "203.0.113.9",
      ipCity: "Toronto",
    });
    expect(prismaMock.visitorLog.findMany.mock.calls[0][0].where.ipHash.in).toEqual([
      hashIP("203.0.113.9"),
    ]);
  });

  it("redacts order risk records and the visitor logs of the orders' IPs", async () => {
    const result = await redactCustomerData(shop, { orders_to_redact: [1001] });

    expect(result).toEqual({ orders: 1, visitorLogs: 3 });
    const where = prismaMock.visitorLog.deleteMany.mock.calls[0][0].where;
    expect(where.OR).toEqual([
      { ipHash: { in: [hashIP("203.0.113.9")] } },
      { ipAddress: { in: ["203.0.113.9"] } },
    ]);
    expect(prismaMock.orderRiskRecord.deleteMany).toHaveBeenCalled();
  });

  it("does nothing for a redact request without orders", async () => {
    expect(await redactCustomerData(shop, { orders_to_redact: [] })).toEqual({ orders: 0, visitorLogs: 0 });
    expect(prismaMock.visitorLog.deleteMany).not.toHaveBeenCalled();
  });
});

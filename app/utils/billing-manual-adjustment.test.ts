import { beforeEach, describe, expect, it, vi } from "vitest";

const prismaMock = vi.hoisted(() => ({
  monthlyUsage: {
    findUnique: vi.fn(),
    updateMany: vi.fn(),
  },
  usageChargeAttempt: {
    create: vi.fn(),
    findFirst: vi.fn(),
    findMany: vi.fn(),
    findUnique: vi.fn(),
    update: vi.fn(),
  },
}));

vi.mock("../db.server", () => ({
  default: prismaMock,
}));

vi.mock("../shopify.server", () => ({
  unauthenticated: {
    admin: vi.fn(),
  },
}));

import { chargeOverageUsageRecord } from "./billing.server";

describe("manual billing adjustments", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.usageChargeAttempt.findMany.mockResolvedValue([]);
    prismaMock.usageChargeAttempt.findUnique.mockResolvedValue(null);
    prismaMock.usageChargeAttempt.create.mockResolvedValue({ id: "attempt" });
    prismaMock.usageChargeAttempt.update.mockResolvedValue({ id: "attempt" });
    prismaMock.monthlyUsage.updateMany.mockResolvedValue({ count: 1 });
  });

  it("uses a unique manual adjustment key and preserves it after charging", async () => {
    const admin = {
      graphql: vi.fn().mockResolvedValue({
        json: async () => ({
          data: {
            appUsageRecordCreate: {
              appUsageRecord: {
                id: "gid://shopify/AppUsageRecord/manual",
              },
              userErrors: [],
            },
          },
        }),
      }),
    };

    const result = await chargeOverageUsageRecord({
      admin,
      chargedVisitors: 0,
      currentPlan: "plus",
      currentUsage: 3_500,
      manualAdjustmentKey: "manual-key",
      planLimit: 2_500,
      shop: "manual-adjustment.myshopify.com",
      usageLineItemId: "gid://shopify/AppSubscriptionLineItem/usage",
      usagePeriod: {
        key: "shopify:period",
        yearMonth: "2026-07",
        billingPeriodStart: new Date("2026-07-01T00:00:00.000Z"),
        billingPeriodEnd: new Date("2026-08-01T00:00:00.000Z"),
        billingSubscriptionId: "gid://shopify/AppSubscription/current",
        billingUsageLineItemId: "gid://shopify/AppSubscriptionLineItem/usage",
      },
    });

    expect(result).toMatchObject({
      status: "charged",
      overageVisitors: 1_000,
    });
    expect(prismaMock.usageChargeAttempt.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        manualAdjustmentKey: "manual-key",
      }),
    });
    expect(prismaMock.monthlyUsage.updateMany).toHaveBeenCalledWith({
      where: expect.objectContaining({
        manualChargedVisitorsKey: "manual-key",
      }),
      data: expect.objectContaining({
        chargedVisitors: 1_000,
      }),
    });
    expect(
      prismaMock.monthlyUsage.updateMany.mock.calls[0]?.[0]?.data,
    ).not.toHaveProperty("manualChargedVisitorsKey");
  });

  it("does not restore a historical charge after a newer manual override", async () => {
    const admin = {
      graphql: vi.fn(),
    };

    prismaMock.usageChargeAttempt.findMany.mockResolvedValue([
      { id: "historical-attempt" },
    ]);
    prismaMock.usageChargeAttempt.findFirst.mockResolvedValue({
      idempotencyKey: "historical-attempt-key",
      manualAdjustmentKey: null,
      overageVisitors: 1_000,
      toChargedVisitors: 1_000,
    });
    prismaMock.monthlyUsage.updateMany.mockResolvedValue({ count: 0 });
    prismaMock.monthlyUsage.findUnique.mockResolvedValue({
      chargedVisitors: 0,
      manualChargedVisitorsKey: "new-manual-override",
    });

    const result = await chargeOverageUsageRecord({
      admin,
      chargedVisitors: 0,
      currentPlan: "plus",
      currentUsage: 3_500,
      manualAdjustmentKey: "new-manual-override",
      planLimit: 2_500,
      shop: "manual-adjustment.myshopify.com",
      usageLineItemId: "gid://shopify/AppSubscriptionLineItem/usage",
      usagePeriod: {
        key: "shopify:period",
        yearMonth: "2026-07",
        billingPeriodStart: new Date("2026-07-01T00:00:00.000Z"),
        billingPeriodEnd: new Date("2026-08-01T00:00:00.000Z"),
        billingSubscriptionId: "gid://shopify/AppSubscription/current",
        billingUsageLineItemId: "gid://shopify/AppSubscriptionLineItem/usage",
      },
    });

    expect(result).toEqual({ status: "reconciled" });
    expect(prismaMock.monthlyUsage.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          manualChargedVisitorsKey: null,
        }),
      }),
    );
    expect(prismaMock.usageChargeAttempt.update).toHaveBeenCalledWith({
      where: { idempotencyKey: "historical-attempt-key" },
      data: {
        status: "succeeded",
        error: null,
      },
    });
    expect(admin.graphql).not.toHaveBeenCalled();
  });

  it("preserves a manual override made while a Shopify charge is in flight", async () => {
    const admin = {
      graphql: vi.fn().mockResolvedValue({
        json: async () => ({
          data: {
            appUsageRecordCreate: {
              appUsageRecord: {
                id: "gid://shopify/AppUsageRecord/in-flight",
              },
              userErrors: [],
            },
          },
        }),
      }),
    };

    prismaMock.monthlyUsage.updateMany.mockResolvedValue({ count: 0 });
    prismaMock.monthlyUsage.findUnique.mockResolvedValue({
      chargedVisitors: 0,
      manualChargedVisitorsKey: "new-manual-override",
    });

    const result = await chargeOverageUsageRecord({
      admin,
      chargedVisitors: 0,
      currentPlan: "plus",
      currentUsage: 3_500,
      planLimit: 2_500,
      shop: "manual-adjustment.myshopify.com",
      usageLineItemId: "gid://shopify/AppSubscriptionLineItem/usage",
      usagePeriod: {
        key: "shopify:period",
        yearMonth: "2026-07",
        billingPeriodStart: new Date("2026-07-01T00:00:00.000Z"),
        billingPeriodEnd: new Date("2026-08-01T00:00:00.000Z"),
        billingSubscriptionId: "gid://shopify/AppSubscription/current",
        billingUsageLineItemId: "gid://shopify/AppSubscriptionLineItem/usage",
      },
    });

    expect(result).toMatchObject({ status: "charged" });
    expect(prismaMock.monthlyUsage.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          manualChargedVisitorsKey: null,
        }),
      }),
    );
    expect(prismaMock.usageChargeAttempt.update).toHaveBeenLastCalledWith({
      where: { idempotencyKey: expect.any(String) },
      data: {
        status: "succeeded",
        shopifyUsageRecordId: "gid://shopify/AppUsageRecord/in-flight",
        error: null,
      },
    });
  });

  it("charges only the remaining Shopify balance", async () => {
    const admin = {
      graphql: vi.fn().mockResolvedValue({
        json: async () => ({
          data: {
            appUsageRecordCreate: {
              appUsageRecord: {
                id: "gid://shopify/AppUsageRecord/final-balance",
              },
              userErrors: [],
            },
          },
        }),
      }),
    };

    const result = await chargeOverageUsageRecord({
      admin,
      chargedVisitors: 43_005,
      currentPlan: "premium",
      currentUsage: 50_036,
      planLimit: 1_000,
      shop: "capped-balance.myshopify.com",
      usageLineItemId: "gid://shopify/AppSubscriptionLineItem/usage",
      usagePeriod: {
        key: "shopify:period",
        yearMonth: "2026-10",
        billingPeriodStart: new Date("2026-09-22T00:00:00.000Z"),
        billingPeriodEnd: new Date("2026-10-22T00:00:00.000Z"),
        billingSubscriptionId: "gid://shopify/AppSubscription/current",
        billingUsageLineItemId: "gid://shopify/AppSubscriptionLineItem/usage",
        usageBalanceUsed: 90,
        usageCappedAmount: 99.99,
      },
    });

    expect(result).toEqual({
      status: "charged",
      overageVisitors: 4_995,
      chargeAmount: 9.99,
    });
    expect(admin.graphql).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        variables: expect.objectContaining({
          description: "Overage: 4995 visitors beyond 1000 limit",
          price: {
            amount: "9.99",
            currencyCode: "USD",
          },
        }),
      }),
    );
    expect(prismaMock.monthlyUsage.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          chargedVisitors: 48_000,
        }),
      }),
    );
  });

  it("stops without creating a charge when Shopify has no balance remaining", async () => {
    const admin = { graphql: vi.fn() };

    const result = await chargeOverageUsageRecord({
      admin,
      chargedVisitors: 43_005,
      currentPlan: "premium",
      currentUsage: 50_036,
      planLimit: 1_000,
      shop: "capped-balance.myshopify.com",
      usageLineItemId: "gid://shopify/AppSubscriptionLineItem/usage",
      usagePeriod: {
        key: "shopify:period",
        yearMonth: "2026-10",
        billingPeriodStart: new Date("2026-09-22T00:00:00.000Z"),
        billingPeriodEnd: new Date("2026-10-22T00:00:00.000Z"),
        billingSubscriptionId: "gid://shopify/AppSubscription/current",
        billingUsageLineItemId: "gid://shopify/AppSubscriptionLineItem/usage",
        usageBalanceUsed: 99.99,
        usageCappedAmount: 99.99,
      },
    });

    expect(result).toEqual({ status: "cap_reached" });
    expect(admin.graphql).not.toHaveBeenCalled();
    expect(prismaMock.usageChargeAttempt.create).not.toHaveBeenCalled();
  });

  it("retries a previously capped attempt after recalculating Shopify balance", async () => {
    const admin = {
      graphql: vi.fn().mockResolvedValue({
        json: async () => ({
          data: {
            appUsageRecordCreate: {
              appUsageRecord: {
                id: "gid://shopify/AppUsageRecord/retried-cap",
              },
              userErrors: [],
            },
          },
        }),
      }),
    };
    prismaMock.usageChargeAttempt.findUnique.mockResolvedValue({
      status: "capped",
    });

    const result = await chargeOverageUsageRecord({
      admin,
      chargedVisitors: 43_005,
      currentPlan: "premium",
      currentUsage: 50_036,
      planLimit: 1_000,
      shop: "retry-capped.myshopify.com",
      usageLineItemId: "gid://shopify/AppSubscriptionLineItem/usage",
      usagePeriod: {
        key: "shopify:period",
        yearMonth: "2026-10",
        billingPeriodStart: new Date("2026-09-22T00:00:00.000Z"),
        billingPeriodEnd: new Date("2026-10-22T00:00:00.000Z"),
        billingSubscriptionId: "gid://shopify/AppSubscription/current",
        billingUsageLineItemId: "gid://shopify/AppSubscriptionLineItem/usage",
        usageBalanceUsed: 86.01,
        usageCappedAmount: 99.99,
      },
    });

    expect(result).toEqual({
      status: "charged",
      overageVisitors: 6_031,
      chargeAmount: 12.06,
    });
    expect(prismaMock.usageChargeAttempt.update).toHaveBeenCalledWith({
      where: { idempotencyKey: expect.any(String) },
      data: expect.objectContaining({
        status: "pending",
        amount: 12.06,
        error: null,
      }),
    });
    expect(admin.graphql).toHaveBeenCalledTimes(1);
  });
});

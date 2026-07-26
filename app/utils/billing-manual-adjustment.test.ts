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

  it("uses a unique manual adjustment key and clears it after charging", async () => {
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
        manualChargedVisitorsKey: null,
      }),
    });
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";

const prismaMock = vi.hoisted(() => ({
  $queryRaw: vi.fn(),
  billableUsageEvent: {
    count: vi.fn(),
  },
  monthlyUsage: {
    create: vi.fn(),
    findMany: vi.fn(),
    findUnique: vi.fn(),
    update: vi.fn(),
  },
  usageChargeAttempt: {
    findFirst: vi.fn(),
  },
  settings: {
    upsert: vi.fn(),
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

import {
  getUsagePeriodForShop,
  syncUsagePeriodForShop,
} from "./billing-period.server";

describe("getUsagePeriodForShop cached usage reconciliation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.billableUsageEvent.count.mockResolvedValue(0);
    prismaMock.$queryRaw.mockResolvedValue([]);
    prismaMock.monthlyUsage.findUnique.mockResolvedValue(null);
    prismaMock.usageChargeAttempt.findFirst.mockResolvedValue(null);
    prismaMock.monthlyUsage.findMany.mockResolvedValue([
      {
        totalVisitors: 6,
        redirected: 0,
        blocked: 3,
        popupShown: 3,
        chargedVisitors: 0,
        manualChargedVisitorsKey: null,
      },
    ]);
    prismaMock.monthlyUsage.create.mockResolvedValue({ id: "usage-row" });
  });

  it("carries usage to a replacement subscription with the same period end", async () => {
    const billingPeriodEnd = new Date("2026-08-27T13:43:04.000Z");
    const currentKey =
      "shopify:gid://shopify/AppSubscription/new:gid://shopify/AppSubscriptionLineItem/new:2026-08-27";

    const period = await getUsagePeriodForShop({
      shop: "replacement-subscription.myshopify.com",
      currentPlan: "elite",
      settings: {
        billingPlanName: "elite",
        billingPeriodKey: currentKey,
        billingPeriodStart: null,
        billingPeriodEnd,
        billingSubscriptionId:
          "gid://shopify/AppSubscription/new",
        billingUsageLineItemId:
          "gid://shopify/AppSubscriptionLineItem/new",
      },
    });

    expect(period.key).toBe(currentKey);
    expect(prismaMock.monthlyUsage.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          OR: expect.arrayContaining([
            {
              billingPeriodKey: {
                endsWith: ":2026-08-27",
              },
            },
          ]),
        }),
      }),
    );
    expect(prismaMock.monthlyUsage.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        billingPeriodKey: currentKey,
        totalVisitors: 6,
        popupShown: 3,
        redirected: 0,
        blocked: 3,
      }),
    });
  });

  it("preserves an admin-adjusted charged visitor baseline during Shopify sync", async () => {
    const billingPeriodEnd = new Date("2026-08-27T13:43:04.000Z");
    const billingPeriodKey =
      "shopify:gid://shopify/AppSubscription/current:gid://shopify/AppSubscriptionLineItem/current:2026-08-27";

    prismaMock.monthlyUsage.findMany.mockResolvedValue([]);
    prismaMock.monthlyUsage.findUnique.mockResolvedValue({
      id: "usage-row",
      shop: "manual-adjustment.myshopify.com",
      yearMonth: "2026-08",
      billingPeriodKey,
      billingPeriodStart: new Date("2026-07-28T13:43:04.000Z"),
      billingPeriodEnd,
      billingSubscriptionId: "gid://shopify/AppSubscription/current",
      billingUsageLineItemId: "gid://shopify/AppSubscriptionLineItem/current",
      totalVisitors: 8_249,
      redirected: 0,
      blocked: 0,
      popupShown: 0,
      chargedVisitors: 0,
      manualChargedVisitorsKey: "manual-adjustment-key",
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    await syncUsagePeriodForShop("manual-adjustment.myshopify.com", "elite", {
      key: billingPeriodKey,
      yearMonth: "2026-08",
      billingPeriodStart: new Date("2026-07-28T13:43:04.000Z"),
      billingPeriodEnd,
      billingSubscriptionId: "gid://shopify/AppSubscription/current",
      billingUsageLineItemId: "gid://shopify/AppSubscriptionLineItem/current",
      chargedVisitors: 2_249,
      source: "shopify",
    });

    expect(prismaMock.monthlyUsage.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          chargedVisitors: 0,
          manualChargedVisitorsKey: "manual-adjustment-key",
        }),
      }),
    );
  });

  it("does not add historical Shopify charges after a manual baseline is charged", async () => {
    const billingPeriodEnd = new Date("2026-08-27T13:43:04.000Z");
    const billingPeriodKey =
      "shopify:gid://shopify/AppSubscription/current:gid://shopify/AppSubscriptionLineItem/current:2026-08-27";

    prismaMock.monthlyUsage.findMany.mockResolvedValue([]);
    prismaMock.monthlyUsage.findUnique.mockResolvedValue({
      id: "usage-row",
      shop: "manual-adjustment.myshopify.com",
      yearMonth: "2026-08",
      billingPeriodKey,
      billingPeriodStart: new Date("2026-07-28T13:43:04.000Z"),
      billingPeriodEnd,
      billingSubscriptionId: "gid://shopify/AppSubscription/current",
      billingUsageLineItemId: "gid://shopify/AppSubscriptionLineItem/current",
      totalVisitors: 8_249,
      redirected: 0,
      blocked: 0,
      popupShown: 0,
      chargedVisitors: 1_000,
      manualChargedVisitorsKey: "manual-adjustment-key",
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    await syncUsagePeriodForShop("manual-adjustment.myshopify.com", "elite", {
      key: billingPeriodKey,
      yearMonth: "2026-08",
      billingPeriodStart: new Date("2026-07-28T13:43:04.000Z"),
      billingPeriodEnd,
      billingSubscriptionId: "gid://shopify/AppSubscription/current",
      billingUsageLineItemId: "gid://shopify/AppSubscriptionLineItem/current",
      chargedVisitors: 3_249,
      source: "shopify",
    });

    expect(prismaMock.monthlyUsage.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          chargedVisitors: 1_000,
          manualChargedVisitorsKey: "manual-adjustment-key",
        }),
      }),
    );
  });

  it("recovers a manual baseline that an older worker cleared", async () => {
    const billingPeriodEnd = new Date("2026-08-27T13:43:04.000Z");
    const billingPeriodKey =
      "shopify:gid://shopify/AppSubscription/current:gid://shopify/AppSubscriptionLineItem/current:2026-08-27";

    prismaMock.monthlyUsage.findMany.mockResolvedValue([]);
    prismaMock.monthlyUsage.findUnique.mockResolvedValue({
      id: "usage-row",
      shop: "manual-adjustment.myshopify.com",
      yearMonth: "2026-08",
      billingPeriodKey,
      billingPeriodStart: new Date("2026-07-28T13:43:04.000Z"),
      billingPeriodEnd,
      billingSubscriptionId: "gid://shopify/AppSubscription/current",
      billingUsageLineItemId: "gid://shopify/AppSubscriptionLineItem/current",
      totalVisitors: 8_249,
      redirected: 0,
      blocked: 0,
      popupShown: 0,
      chargedVisitors: 3_249,
      manualChargedVisitorsKey: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    prismaMock.usageChargeAttempt.findFirst.mockResolvedValue({
      manualAdjustmentKey: "manual-adjustment-key",
      toChargedVisitors: 1_000,
    });

    await syncUsagePeriodForShop("manual-adjustment.myshopify.com", "elite", {
      key: billingPeriodKey,
      yearMonth: "2026-08",
      billingPeriodStart: new Date("2026-07-28T13:43:04.000Z"),
      billingPeriodEnd,
      billingSubscriptionId: "gid://shopify/AppSubscription/current",
      billingUsageLineItemId: "gid://shopify/AppSubscriptionLineItem/current",
      chargedVisitors: 3_249,
      source: "shopify",
    });

    expect(prismaMock.monthlyUsage.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          chargedVisitors: 1_000,
          manualChargedVisitorsKey: "manual-adjustment-key",
        }),
      }),
    );
  });
});

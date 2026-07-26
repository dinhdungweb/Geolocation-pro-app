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
}));

vi.mock("../db.server", () => ({
  default: prismaMock,
}));

vi.mock("../shopify.server", () => ({
  unauthenticated: {
    admin: vi.fn(),
  },
}));

import { getUsagePeriodForShop } from "./billing-period.server";

describe("getUsagePeriodForShop cached usage reconciliation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.billableUsageEvent.count.mockResolvedValue(0);
    prismaMock.$queryRaw.mockResolvedValue([]);
    prismaMock.monthlyUsage.findUnique.mockResolvedValue(null);
    prismaMock.monthlyUsage.findMany.mockResolvedValue([
      {
        totalVisitors: 6,
        redirected: 0,
        blocked: 3,
        popupShown: 3,
        chargedVisitors: 0,
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
});

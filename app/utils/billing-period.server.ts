import prisma from "../db.server";
import { FREE_PLAN, OVERAGE_RATE, hasUnlimitedUsage, type CustomPlanLimitSettings } from "../billing.config";
import { unauthenticated } from "../shopify.server";
import { getYearMonth } from "./analytics-token.server";

export type UsagePeriodSource = "calendar" | "shopify" | "cached" | "unresolved";

export interface UsagePeriod {
  key: string;
  yearMonth: string;
  billingPeriodStart: Date | null;
  billingPeriodEnd: Date | null;
  billingSubscriptionId: string | null;
  billingUsageLineItemId: string | null;
  chargedVisitors: number;
  source: UsagePeriodSource;
}

type BillingPeriodSettings = CustomPlanLimitSettings & {
  billingPeriodKey?: string | null;
  billingPeriodStart?: Date | string | null;
  billingPeriodEnd?: Date | string | null;
  billingSubscriptionId?: string | null;
  billingUsageLineItemId?: string | null;
  billingPlanName?: string | null;
};

const CACHE_REFRESH_BUFFER_MS = 60 * 1000;

export function getCalendarUsagePeriod(date = new Date()): UsagePeriod {
  const yearMonth = getYearMonth(date);
  return {
    key: `calendar:${yearMonth}`,
    yearMonth,
    billingPeriodStart: new Date(date.getFullYear(), date.getMonth(), 1),
    billingPeriodEnd: null,
    billingSubscriptionId: null,
    billingUsageLineItemId: null,
    chargedVisitors: 0,
    source: "calendar",
  };
}

function getUnresolvedUsagePeriod(shop: string, currentPlan: string, date = new Date()): UsagePeriod {
  const yearMonth = getYearMonth(date);
  return {
    key: `unresolved:${shop}:${currentPlan}`,
    yearMonth,
    billingPeriodStart: null,
    billingPeriodEnd: null,
    billingSubscriptionId: null,
    billingUsageLineItemId: null,
    chargedVisitors: 0,
    source: "unresolved",
  };
}

function asDate(value: Date | string | null | undefined) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function yearMonthFromDate(value: Date | string | null | undefined) {
  const date = asDate(value);
  return date ? getYearMonth(date) : getYearMonth();
}

function cachedUsagePeriod(settings?: BillingPeriodSettings | null): UsagePeriod | null {
  if (!settings?.billingPeriodKey) return null;

  const billingPeriodStart = asDate(settings.billingPeriodStart);
  const billingPeriodEnd = asDate(settings.billingPeriodEnd);
  return {
    key: settings.billingPeriodKey,
    yearMonth: yearMonthFromDate(billingPeriodEnd),
    billingPeriodStart,
    billingPeriodEnd,
    billingSubscriptionId: settings.billingSubscriptionId || null,
    billingUsageLineItemId: settings.billingUsageLineItemId || null,
    chargedVisitors: 0,
    source: "cached",
  };
}

function isCachedPeriodCurrent(settings: BillingPeriodSettings | null | undefined, currentPlan: string) {
  const periodEnd = asDate(settings?.billingPeriodEnd);
  if (!settings?.billingPeriodKey || !periodEnd) return false;
  if (settings.billingPlanName && settings.billingPlanName !== currentPlan) return false;
  return periodEnd.getTime() > Date.now() + CACHE_REFRESH_BUFFER_MS;
}

function isCachedPeriodForPlan(settings: BillingPeriodSettings | null | undefined, currentPlan: string) {
  return Boolean(settings?.billingPeriodKey && (!settings.billingPlanName || settings.billingPlanName === currentPlan));
}

function getUsageLineItem(subscription: any) {
  return subscription?.lineItems?.find(
    (item: any) => item.plan?.pricingDetails?.__typename === "AppUsagePricing"
  );
}

async function getBillableUsageCounts(shop: string, billingPeriodKey: string) {
  const events = await prisma.billableUsageEvent.findMany({
    where: {
      shop,
      billingPeriodKey,
    },
    select: { action: true },
  });

  return {
    totalVisitors: events.length,
    redirected: events.filter((event) =>
      ["redirected", "auto_redirected", "ip_redirected"].includes(event.action)
    ).length,
    blocked: events.filter((event) =>
      ["blocked", "ip_blocked", "vpn_blocked"].includes(event.action)
    ).length,
    popupShown: events.filter((event) => event.action === "popup_shown").length,
  };
}

async function getCarryForwardUsageCounts(shop: string, period: UsagePeriod) {
  if (period.source !== "shopify" || !period.billingPeriodEnd) {
    return null;
  }

  const legacyRows = await prisma.monthlyUsage.findMany({
    where: {
      shop,
      billingPeriodKey: { not: period.key },
      OR: [
        { billingPeriodEnd: period.billingPeriodEnd },
        { billingPeriodKey: `calendar:${period.yearMonth}` },
      ],
    },
    select: {
      totalVisitors: true,
      redirected: true,
      blocked: true,
      popupShown: true,
      chargedVisitors: true,
    },
  });

  if (legacyRows.length === 0) return null;

  return legacyRows.reduce(
    (carry, row) => ({
      totalVisitors: Math.max(carry.totalVisitors, row.totalVisitors),
      redirected: Math.max(carry.redirected, row.redirected),
      blocked: Math.max(carry.blocked, row.blocked),
      popupShown: Math.max(carry.popupShown, row.popupShown || 0),
      chargedVisitors: Math.max(carry.chargedVisitors, row.chargedVisitors),
    }),
    {
      totalVisitors: 0,
      redirected: 0,
      blocked: 0,
      popupShown: 0,
      chargedVisitors: 0,
    },
  );
}

function inferBillingPeriodStart(
  subscription: any,
  periodKey: string,
  periodEnd: Date,
  settings?: BillingPeriodSettings | null,
) {
  const usageLineItem = getUsageLineItem(subscription);
  const cachedStart = asDate(settings?.billingPeriodStart);
  const cachedEnd = asDate(settings?.billingPeriodEnd);
  const sameSubscription =
    settings?.billingSubscriptionId === subscription?.id &&
    settings?.billingUsageLineItemId === usageLineItem?.id;

  if (sameSubscription && settings?.billingPeriodKey === periodKey && cachedStart) {
    return cachedStart;
  }

  if (sameSubscription && settings?.billingPeriodKey !== periodKey && cachedEnd && cachedEnd < periodEnd) {
    return cachedEnd;
  }

  const createdAt = asDate(subscription?.createdAt);
  if (createdAt && createdAt < periodEnd) {
    const maxFirstPeriodMs = 32 * 24 * 60 * 60 * 1000;
    if (periodEnd.getTime() - createdAt.getTime() <= maxFirstPeriodMs) {
      return createdAt;
    }
  }

  return null;
}

function getUsageRecordChargedVisitors(usageLineItem: any, periodStart: Date | null, periodEnd: Date) {
  if (!periodStart) return 0;

  const records = usageLineItem?.usageRecords?.nodes || [];
  const chargedAmount = records.reduce((sum: number, record: any) => {
    const createdAt = asDate(record.createdAt);
    if (!createdAt || createdAt < periodStart || createdAt >= periodEnd) return sum;

    const amount = Number(record.price?.amount || 0);
    return Number.isFinite(amount) ? sum + amount : sum;
  }, 0);

  // Note: Small floating point errors (±1 visitor) from amount/OVERAGE_RATE are
  // acceptable. This value seeds chargedVisitors from Shopify records; the DB
  // value takes precedence after the initial sync.
  return Math.max(0, Math.round(chargedAmount / OVERAGE_RATE));
}

function truncateToDay(date: Date): string {
  return date.toISOString().slice(0, 10); // e.g. "2026-06-15"
}

export function usagePeriodFromSubscription(
  subscription: any,
  settings?: BillingPeriodSettings | null,
): UsagePeriod | null {
  const usageLineItem = getUsageLineItem(subscription);
  const currentPeriodEnd = subscription?.currentPeriodEnd;

  if (!subscription?.id || !usageLineItem?.id || !currentPeriodEnd) {
    return null;
  }

  const billingPeriodEnd = new Date(currentPeriodEnd);
  if (Number.isNaN(billingPeriodEnd.getTime())) return null;
  const key = `shopify:${subscription.id}:${usageLineItem.id}:${truncateToDay(billingPeriodEnd)}`;
  const billingPeriodStart = inferBillingPeriodStart(subscription, key, billingPeriodEnd, settings);

  return {
    key,
    yearMonth: getYearMonth(billingPeriodEnd),
    billingPeriodStart,
    billingPeriodEnd,
    billingSubscriptionId: subscription.id,
    billingUsageLineItemId: usageLineItem.id,
    chargedVisitors: getUsageRecordChargedVisitors(usageLineItem, billingPeriodStart, billingPeriodEnd),
    source: "shopify",
  };
}

async function seedUsagePeriodRow(shop: string, period: UsagePeriod) {
  if (period.source !== "shopify" || !period.billingPeriodEnd) return;

  const usageCounts = await getBillableUsageCounts(shop, period.key);
  const carryForwardCounts = await getCarryForwardUsageCounts(shop, period);
  const existing = await prisma.monthlyUsage.findUnique({
    where: {
      shop_billingPeriodKey: {
        shop,
        billingPeriodKey: period.key,
      },
    },
  });

  if (existing) {
    const nextChargedVisitors = Math.max(
      existing.chargedVisitors,
      period.chargedVisitors,
      carryForwardCounts?.chargedVisitors || 0,
    );
    await prisma.monthlyUsage.update({
      where: {
        shop_billingPeriodKey: {
          shop,
          billingPeriodKey: period.key,
        },
      },
      data: {
        totalVisitors: Math.max(existing.totalVisitors, usageCounts.totalVisitors, carryForwardCounts?.totalVisitors || 0),
        redirected: Math.max(existing.redirected, usageCounts.redirected, carryForwardCounts?.redirected || 0),
        blocked: Math.max(existing.blocked, usageCounts.blocked, carryForwardCounts?.blocked || 0),
        popupShown: Math.max(existing.popupShown || 0, usageCounts.popupShown, carryForwardCounts?.popupShown || 0),
        chargedVisitors: nextChargedVisitors,
        billingPeriodStart: period.billingPeriodStart,
        billingPeriodEnd: period.billingPeriodEnd,
        billingSubscriptionId: period.billingSubscriptionId,
        billingUsageLineItemId: period.billingUsageLineItemId,
      },
    });
    return;
  }

  const chargedVisitors = Math.max(period.chargedVisitors, carryForwardCounts?.chargedVisitors || 0);
  const totalVisitors = Math.max(usageCounts.totalVisitors, carryForwardCounts?.totalVisitors || 0);
  const redirected = Math.max(usageCounts.redirected, carryForwardCounts?.redirected || 0);
  const blocked = Math.max(usageCounts.blocked, carryForwardCounts?.blocked || 0);
  const popupShown = Math.max(usageCounts.popupShown, carryForwardCounts?.popupShown || 0);

  if (totalVisitors === 0 && chargedVisitors === 0) return;

  try {
    await prisma.monthlyUsage.create({
      data: {
        shop,
        yearMonth: period.yearMonth,
        billingPeriodKey: period.key,
        billingPeriodStart: period.billingPeriodStart,
        billingPeriodEnd: period.billingPeriodEnd,
        billingSubscriptionId: period.billingSubscriptionId,
        billingUsageLineItemId: period.billingUsageLineItemId,
        totalVisitors,
        redirected,
        blocked,
        popupShown,
        chargedVisitors,
      },
    });
  } catch (error: any) {
    if (error?.code !== "P2002") throw error;
  }
}

export async function syncUsagePeriodForShop(shop: string, plan: string, period: UsagePeriod) {
  if (period.source !== "shopify") return;

  await prisma.settings.upsert({
    where: { shop },
    update: {
      currentPlan: plan,
      billingPlanName: plan,
      billingPeriodKey: period.key,
      billingPeriodStart: period.billingPeriodStart,
      billingPeriodEnd: period.billingPeriodEnd,
      billingSubscriptionId: period.billingSubscriptionId,
      billingUsageLineItemId: period.billingUsageLineItemId,
    },
    create: {
      shop,
      currentPlan: plan,
      billingPlanName: plan,
      billingPeriodKey: period.key,
      billingPeriodStart: period.billingPeriodStart,
      billingPeriodEnd: period.billingPeriodEnd,
      billingSubscriptionId: period.billingSubscriptionId,
      billingUsageLineItemId: period.billingUsageLineItemId,
    },
  });

  await seedUsagePeriodRow(shop, period);
}

export async function fetchShopifyUsagePeriod(
  shop: string,
  settings?: BillingPeriodSettings | null,
): Promise<{ plan: string; period: UsagePeriod } | null> {
  const context = await unauthenticated.admin(shop);
  const admin = context.admin;
  if (!admin) return null;

  const response = await admin.graphql(`
    #graphql
    query {
      currentAppInstallation {
        activeSubscriptions {
          id
          name
          status
          createdAt
          currentPeriodEnd
          lineItems {
            id
            usageRecords(first: 100, reverse: true, sortKey: CREATED_AT) {
              nodes {
                createdAt
                price {
                  amount
                  currencyCode
                }
              }
            }
            plan {
              pricingDetails {
                __typename
              }
            }
          }
        }
      }
    }
  `);

  const data: any = await response.json();
  if (data?.errors?.length) {
    throw new Error(data.errors.map((error: any) => error.message).join("; "));
  }

  const activeSubscriptions = data?.data?.currentAppInstallation?.activeSubscriptions || [];
  const subscription =
    activeSubscriptions.find((sub: any) => getUsageLineItem(sub)) ||
    activeSubscriptions[0];

  if (!subscription) return null;

  const period = usagePeriodFromSubscription(subscription, settings);
  if (!period) return null;

  return {
    plan: subscription.name || FREE_PLAN,
    period,
  };
}

export async function getUsagePeriodForShop({
  currentPlan,
  forceRefresh = false,
  settings,
  shop,
}: {
  shop: string;
  currentPlan: string;
  settings?: BillingPeriodSettings | null;
  forceRefresh?: boolean;
}): Promise<UsagePeriod> {
  if (currentPlan === FREE_PLAN || hasUnlimitedUsage(currentPlan, settings)) {
    return getCalendarUsagePeriod();
  }

  if (!forceRefresh && isCachedPeriodCurrent(settings, currentPlan)) {
    return cachedUsagePeriod(settings)!;
  }

  try {
    const shopifyPeriod = await fetchShopifyUsagePeriod(shop, settings);
    if (shopifyPeriod?.period) {
      await syncUsagePeriodForShop(shop, shopifyPeriod.plan || currentPlan, shopifyPeriod.period);
      return shopifyPeriod.period;
    }
  } catch (error) {
    console.error(`[Billing Period] Failed to fetch Shopify billing period for ${shop}:`, error);
  }

  const cached = isCachedPeriodForPlan(settings, currentPlan) ? cachedUsagePeriod(settings) : null;
  if (cached) return cached;

  return getUnresolvedUsagePeriod(shop, currentPlan);
}

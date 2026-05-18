import prisma from "../db.server";
import { FREE_PLAN, OVERAGE_RATE, hasUnlimitedUsage, type CustomPlanLimitSettings } from "../billing.config";
import { unauthenticated } from "../shopify.server";
import { getYearMonth } from "./analytics-token.server";

export type UsagePeriodSource = "calendar" | "shopify" | "cached" | "unresolved";

export interface UsagePeriod {
  key: string;
  yearMonth: string;
  billingPeriodEnd: Date | null;
  billingSubscriptionId: string | null;
  billingUsageLineItemId: string | null;
  chargedVisitors: number;
  source: UsagePeriodSource;
}

type BillingPeriodSettings = CustomPlanLimitSettings & {
  billingPeriodKey?: string | null;
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

  const billingPeriodEnd = asDate(settings.billingPeriodEnd);
  return {
    key: settings.billingPeriodKey,
    yearMonth: yearMonthFromDate(billingPeriodEnd),
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

function getBillingPeriodStart(periodEnd: Date) {
  return new Date(periodEnd.getTime() - 30 * 24 * 60 * 60 * 1000);
}

function getYearMonthsInRange(start: Date, end: Date) {
  const months: string[] = [];
  const cursor = new Date(start.getFullYear(), start.getMonth(), 1);
  const endMonth = new Date(end.getFullYear(), end.getMonth(), 1);

  while (cursor <= endMonth) {
    months.push(getYearMonth(cursor));
    cursor.setMonth(cursor.getMonth() + 1);
  }

  return months;
}

async function getBillableUsageCounts(shop: string, periodStart: Date, periodEnd: Date) {
  const events = await prisma.billableUsageEvent.findMany({
    where: {
      shop,
      createdAt: {
        gte: periodStart,
        lt: periodEnd,
      },
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

async function hasLegacyCalendarUsage(shop: string, periodStart: Date, periodEnd: Date) {
  const months = getYearMonthsInRange(periodStart, periodEnd);
  if (months.length === 0) return false;

  const legacyRows = await prisma.monthlyUsage.count({
    where: {
      shop,
      yearMonth: { in: months },
      billingPeriodKey: { startsWith: "calendar:" },
    },
  });

  return legacyRows > 0;
}

function getUsageRecordChargedVisitors(usageLineItem: any, periodEnd: Date) {
  const periodStart = getBillingPeriodStart(periodEnd);
  const records = usageLineItem?.usageRecords?.nodes || [];
  const chargedAmount = records.reduce((sum: number, record: any) => {
    const createdAt = asDate(record.createdAt);
    if (!createdAt || createdAt < periodStart || createdAt >= periodEnd) return sum;

    const amount = Number(record.price?.amount || 0);
    return Number.isFinite(amount) ? sum + amount : sum;
  }, 0);

  return Math.max(0, Math.round(chargedAmount / OVERAGE_RATE));
}

export function usagePeriodFromSubscription(subscription: any): UsagePeriod | null {
  const usageLineItem = getUsageLineItem(subscription);
  const currentPeriodEnd = subscription?.currentPeriodEnd;

  if (!subscription?.id || !usageLineItem?.id || !currentPeriodEnd) {
    return null;
  }

  const billingPeriodEnd = new Date(currentPeriodEnd);
  if (Number.isNaN(billingPeriodEnd.getTime())) return null;

  return {
    key: `shopify:${subscription.id}:${usageLineItem.id}:${billingPeriodEnd.toISOString()}`,
    yearMonth: getYearMonth(billingPeriodEnd),
    billingPeriodEnd,
    billingSubscriptionId: subscription.id,
    billingUsageLineItemId: usageLineItem.id,
    chargedVisitors: getUsageRecordChargedVisitors(usageLineItem, billingPeriodEnd),
    source: "shopify",
  };
}

async function seedUsagePeriodRow(shop: string, period: UsagePeriod) {
  if (period.source !== "shopify" || !period.billingPeriodEnd) return;

  const periodStart = getBillingPeriodStart(period.billingPeriodEnd);
  const usageCounts = await getBillableUsageCounts(shop, periodStart, period.billingPeriodEnd);
  const hasLegacyUsage = await hasLegacyCalendarUsage(shop, periodStart, period.billingPeriodEnd);
  const existing = await prisma.monthlyUsage.findUnique({
    where: {
      shop_billingPeriodKey: {
        shop,
        billingPeriodKey: period.key,
      },
    },
  });

  if (existing) {
    const nextChargedVisitors = hasLegacyUsage
      ? existing.chargedVisitors
      : Math.max(existing.chargedVisitors, period.chargedVisitors);
    await prisma.monthlyUsage.update({
      where: {
        shop_billingPeriodKey: {
          shop,
          billingPeriodKey: period.key,
        },
      },
      data: {
        totalVisitors: Math.max(existing.totalVisitors, usageCounts.totalVisitors),
        redirected: Math.max(existing.redirected, usageCounts.redirected),
        blocked: Math.max(existing.blocked, usageCounts.blocked),
        popupShown: Math.max(existing.popupShown || 0, usageCounts.popupShown),
        chargedVisitors: nextChargedVisitors,
        billingPeriodEnd: period.billingPeriodEnd,
        billingSubscriptionId: period.billingSubscriptionId,
        billingUsageLineItemId: period.billingUsageLineItemId,
      },
    });
    return;
  }

  const chargedVisitors = hasLegacyUsage ? 0 : period.chargedVisitors;
  if (usageCounts.totalVisitors === 0 && chargedVisitors === 0) return;

  try {
    await prisma.monthlyUsage.create({
      data: {
        shop,
        yearMonth: period.yearMonth,
        billingPeriodKey: period.key,
        billingPeriodEnd: period.billingPeriodEnd,
        billingSubscriptionId: period.billingSubscriptionId,
        billingUsageLineItemId: period.billingUsageLineItemId,
        totalVisitors: usageCounts.totalVisitors,
        redirected: usageCounts.redirected,
        blocked: usageCounts.blocked,
        popupShown: usageCounts.popupShown,
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
      billingPeriodEnd: period.billingPeriodEnd,
      billingSubscriptionId: period.billingSubscriptionId,
      billingUsageLineItemId: period.billingUsageLineItemId,
    },
    create: {
      shop,
      currentPlan: plan,
      billingPlanName: plan,
      billingPeriodKey: period.key,
      billingPeriodEnd: period.billingPeriodEnd,
      billingSubscriptionId: period.billingSubscriptionId,
      billingUsageLineItemId: period.billingUsageLineItemId,
    },
  });

  await seedUsagePeriodRow(shop, period);
}

export async function fetchShopifyUsagePeriod(shop: string): Promise<{ plan: string; period: UsagePeriod } | null> {
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

  const period = usagePeriodFromSubscription(subscription);
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
    const shopifyPeriod = await fetchShopifyUsagePeriod(shop);
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

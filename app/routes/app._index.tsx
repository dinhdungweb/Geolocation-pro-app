import { useCallback, useEffect, useRef, useState } from "react";
import type { LoaderFunctionArgs } from "react-router";
import { data as responseData } from "react-router";
import { useLoaderData, useRevalidator } from "react-router";
import {
  Page,
  Card,
  Text,
  BlockStack,
  InlineStack,
  Badge,
  Button,
  Banner,
  ProgressBar,
  Icon,
} from "@shopify/polaris";
import { CheckIcon, ChevronDownIcon, ChevronUpIcon } from "@shopify/polaris-icons";
import { TitleBar } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";
export { shopifyBoundaryHeaders as headers } from "../utils/shopify-boundary.server";
import {
  FREE_PLAN,
  PREMIUM_PLAN,
  PLUS_PLAN,
  CUSTOM_PLAN,
  getPlanLimit,
  hasMonthlyUnlimitedReward,
  hasUnlimitedUsage,
} from "../billing.config";
import prisma from "../db.server";
import { COUNTRY_MAP } from "../utils/countries";
import { isBillingTestMode } from "../utils/billing-mode.server";
import { getUsagePeriodForShop } from "../utils/billing-period.server";
import { checkBillingWithFallback } from "../utils/billing.server";
import { getStableShopifyPlanFromBillingCheck, resolveEffectivePlan } from "../utils/effective-plan.server";
import { invalidateStorefrontConfigCache } from "../utils/storefront-config-cache.server";
import { getShopIdentity } from "../utils/shop-identity.server";
import { getThemeAppEmbedStatus } from "../utils/theme-app-embed.server";

// Helper to get country name (simplified version of the one in app.rules.tsx)
//Ideally this should be shared, but for now we put it here or rely on code.
// Used from shared utils now


// Interface for the data items to fix implicit any
interface VisitsDataItem {
  id: string;
  country: string;
  code: string;
  visitors: string;
  popup: number;
  redirected: string;
  blocked: number;
}

const STANDARD_PLAN_UPGRADES: Record<string, { label: string; actionContent: string }> = {
  [FREE_PLAN]: { label: "Premium", actionContent: "Upgrade to Premium" },
  [PREMIUM_PLAN]: { label: "Plus", actionContent: "Upgrade to Plus" },
  [PLUS_PLAN]: { label: "Elite", actionContent: "Upgrade to Elite" },
};

const CUSTOM_PLAN_REQUEST_ACTION = { content: "Request custom plan", url: "/app/pricing" };
const SETUP_DISMISSED_KEY = "geo_dashboard_setup_dismissed";

function formatPlanLabel(planName: string) {
  if (!planName) return "current";
  if (planName === PREMIUM_PLAN) return "Premium";
  return planName.charAt(0).toUpperCase() + planName.slice(1);
}

function formatUsagePeriodEnd(value: string | null) {
  if (!value) return null;

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;

  return new Intl.DateTimeFormat("en", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(date);
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const loaderStartedAt = performance.now();
  const { session, billing } = await authenticate.admin(request);
  const shop = session.shop;
  const accessToken = session.accessToken || "";

  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const dashboardDataPromise = Promise.all([
    prisma.redirectRule.count({ where: { shop } }),
    prisma.redirectRule.count({ where: { shop, isActive: true } }),
    prisma.visitorLog.findFirst({
      where: { shop },
      orderBy: { timestamp: "desc" },
      select: { id: true },
    }),
    prisma.analyticsCountry.groupBy({
      by: ['countryCode'],
      where: {
        shop,
        date: { gte: thirtyDaysAgo }
      },
      _sum: {
        visitors: true,
        popupShown: true,
        redirected: true,
        blocked: true,
      },
      orderBy: {
        _sum: {
          visitors: "desc",
        },
      },
    }),
    prisma.analyticsRule.groupBy({
      by: ['ruleName', 'ruleId'],
      where: {
        shop,
        date: { gte: thirtyDaysAgo }
      },
      _sum: {
        seen: true,
        clickedYes: true,
        clickedNo: true,
        dismissed: true,
        autoRedirected: true,
      }
    }),
    getShopIdentity({
      shop,
      accessToken,
    }),
    getThemeAppEmbedStatus({
      shop,
      accessToken,
      scopeString: session.scope,
    }),
  ]);

  const settingsAndBillingPromise = Promise.all([
    prisma.settings.upsert({
      where: { shop },
      update: {},
      create: { shop },
    }),
    checkBillingWithFallback(billing, isBillingTestMode()),
  ]);

  const planAndUsagePromise = settingsAndBillingPromise.then(async ([settings, billingConfig]) => {
    const shopifyPlan = getStableShopifyPlanFromBillingCheck(
      billingConfig,
      settings.currentPlan,
    );
    const { effectivePlan: currentPlan, isBillingOverridden } = resolveEffectivePlan({
      settings,
      shopifyPlan,
    });
    const usagePeriod = await getUsagePeriodForShop({ shop, currentPlan, settings });
    const monthlyUsage = await prisma.monthlyUsage.findUnique({
      where: {
        shop_billingPeriodKey: {
          shop,
          billingPeriodKey: usagePeriod.key,
        },
      },
    });

    return {
      settings,
      shopifyPlan,
      currentPlan,
      isBillingOverridden,
      usagePeriod,
      monthlyUsage,
    };
  });

  const [
    [
      rulesCount,
      activeRulesCount,
      latestVisitorLog,
      countryStats,
      ruleStats,
      shopIdentity,
      appEmbedStatus,
    ],
    {
      settings,
      shopifyPlan,
      currentPlan,
      isBillingOverridden,
      usagePeriod,
      monthlyUsage,
    },
  ] = await Promise.all([dashboardDataPromise, planAndUsagePromise]);

  const planLimit = getPlanLimit(currentPlan, settings);
  const planDisplayName = currentPlan === CUSTOM_PLAN ? settings.customPlanName : currentPlan;
  const currentUsage = monthlyUsage?.totalVisitors || 0;
  const chargedVisitors = monthlyUsage?.chargedVisitors || 0;
  const isUnlimitedUsage =
    hasUnlimitedUsage(currentPlan, settings) ||
    hasMonthlyUnlimitedReward(currentPlan, chargedVisitors);
  const usagePeriodEnd = usagePeriod.billingPeriodEnd?.toISOString() || null;

  // Keep proxy limit checks up to date without delaying the dashboard response.
  const settingsSyncData = shopifyPlan === FREE_PLAN || hasUnlimitedUsage(shopifyPlan, settings)
    ? {
        currentPlan: shopifyPlan,
        blockVpn: shopifyPlan === FREE_PLAN && !isBillingOverridden ? false : settings.blockVpn,
        billingPlanName: null,
        billingPeriodKey: null,
        billingPeriodStart: null,
        billingPeriodEnd: null,
        billingSubscriptionId: null,
        billingUsageLineItemId: null,
      }
    : { currentPlan: shopifyPlan };

  prisma.settings.upsert({
    where: { shop },
    update: settingsSyncData,
    create: { shop, currentPlan: shopifyPlan },
  }).then(() => {
    invalidateStorefrontConfigCache(shop);
  }).catch((error) => {
    console.error("[Settings] Failed to sync currentPlan:", error);
  });

  const hasVisitorLogs = Boolean(latestVisitorLog);
  const totalCountries = Array.isArray(countryStats) ? countryStats.length : 0;
  const totalRedirected = Array.isArray(countryStats) ? (countryStats as any[]).reduce((sum: number, item: any) => sum + (item._sum.redirected || 0), 0) : 0;
  const totalBlocked = Array.isArray(countryStats) ? (countryStats as any[]).reduce((sum: number, item: any) => sum + (item._sum.blocked || 0), 0) : 0;
  const blockStats = Array.isArray(countryStats)
    ? [...countryStats]
      .filter((item: any) => (item._sum.blocked || 0) > 0)
      .sort((left: any, right: any) => (right._sum.blocked || 0) - (left._sum.blocked || 0))
    : [];

  // Process visits data
  const visitsData: VisitsDataItem[] = Array.isArray(countryStats) ? (countryStats as any[]).map((stat: any) => ({
    id: stat.countryCode,
    country: COUNTRY_MAP[stat.countryCode] || stat.countryCode,
    code: stat.countryCode,
    visitors: (stat._sum.visitors || 0).toLocaleString(),
    popup: stat._sum.popupShown || 0,
    redirected: (stat._sum.redirected || 0).toLocaleString(),
    blocked: stat._sum.blocked || 0,
  })) : [];

  // Process Popups Data (for Banners and Popups table)
  const popupsData = Array.isArray(ruleStats) ? ruleStats.map((stat: any) => ({
    id: stat.ruleId,
    rule: stat.ruleName || 'Unknown Rule',
    seen: stat._sum.seen || 0,
    clickedYes: stat._sum.clickedYes || 0,
    clickedNo: stat._sum.clickedNo || 0,
    dismissed: stat._sum.dismissed || 0,
  })) : [];

  // Process Auto Redirects Data (for Instant Redirects table)
  const autoRedirectsData = Array.isArray(ruleStats) ? ruleStats.map((stat: any) => ({
    id: stat.ruleId,
    rule: stat.ruleName || 'Unknown Rule',
    autoRedirected: stat._sum.autoRedirected || 0,
  })).filter((item: any) => item.autoRedirected > 0) : [];

  // Process Blocks Data
  const blocksData = Array.isArray(blockStats) ? blockStats.map((stat: any) => ({
    id: stat.countryCode,
    block: COUNTRY_MAP[stat.countryCode] || stat.countryCode,
    blocked: stat._sum.blocked || 0
  })) : [];

  return responseData({
    shop,
    onboardingInstallAt: settings.onboardingInstallAt.toISOString(),
    hasProPlan: currentPlan !== FREE_PLAN,
    shopifyPlan,
    isBillingOverridden,
    currentPlan,
    planDisplayName,
    planLimit,
    isUnlimitedUsage,
    currentUsage,
    usagePeriod: {
      source: usagePeriod.source,
      billingPeriodEnd: usagePeriodEnd,
    },
    stats: {
      totalRules: rulesCount,
      activeRules: activeRulesCount,
      hasVisitorLogs,
      visitorLogs: hasVisitorLogs ? 1 : 0,
      mode: settings?.mode || "disabled",
      totalRedirected: totalRedirected.toLocaleString(),
      totalBlocked: totalBlocked.toLocaleString(),
      isEnabled: settings?.isEnabled !== false,
    },
    totalCountries,
    shopIdentity,
    appEmbedStatus,
    visitsData,
    popupsData,
    autoRedirectsData,
    blocksData,
  }, {
    headers: {
      "Server-Timing": `geo-home;dur=${(performance.now() - loaderStartedAt).toFixed(1)}`,
    },
  });
};



export default function Index() {
  const { shop, onboardingInstallAt, currentPlan, planDisplayName, planLimit, isUnlimitedUsage, currentUsage, usagePeriod, stats, shopIdentity, appEmbedStatus, visitsData, popupsData, autoRedirectsData, blocksData, totalCountries } = useLoaderData<typeof loader>();
  const revalidator = useRevalidator();
  const [setupDismissed, setSetupDismissed] = useState<boolean | null>(null);
  const [setupCollapsed, setSetupCollapsed] = useState(false);
  const [activeSetupStepId, setActiveSetupStepId] = useState<string | null>(null);
  const lastPermissionRefreshAt = useRef(0);
  const installKey = `${shop}:${onboardingInstallAt}`;
  const setupDismissedKey = `${SETUP_DISMISSED_KEY}:${installKey}`;

  useEffect(() => {
    try {
      localStorage.removeItem(SETUP_DISMISSED_KEY);
      setSetupDismissed(localStorage.getItem(setupDismissedKey) === "true");
    } catch {
      setSetupDismissed(false);
    }
  }, [setupDismissedKey]);

  useEffect(() => {
    if (appEmbedStatus.state !== "missing_scope") return;

    const refreshPermissionStatus = () => {
      const now = Date.now();
      if (
        document.visibilityState !== "visible" ||
        revalidator.state !== "idle" ||
        now - lastPermissionRefreshAt.current < 3_000
      ) {
        return;
      }
      lastPermissionRefreshAt.current = now;
      revalidator.revalidate();
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        refreshPermissionStatus();
      }
    };

    const initialRefreshTimer = window.setTimeout(refreshPermissionStatus, 2_500);
    window.addEventListener("focus", refreshPermissionStatus);
    window.addEventListener("pageshow", refreshPermissionStatus);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      window.clearTimeout(initialRefreshTimer);
      window.removeEventListener("focus", refreshPermissionStatus);
      window.removeEventListener("pageshow", refreshPermissionStatus);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [appEmbedStatus.state, revalidator.state, revalidator.revalidate]);

  // Calculate usage percentage
  const isUnlimitedPlan = isUnlimitedUsage;
  const usagePercent = isUnlimitedPlan ? 100 : Math.min(100, Math.round((currentUsage / planLimit) * 100));
  const isNearLimit = !isUnlimitedPlan && usagePercent >= 80;
  const isAtLimit = !isUnlimitedPlan && currentUsage >= planLimit;
  const upgradeTarget = STANDARD_PLAN_UPGRADES[currentPlan];
  const canRequestCustomPlan = currentPlan !== FREE_PLAN && currentPlan !== CUSTOM_PLAN && !isUnlimitedPlan;
  const currentPlanLabel = formatPlanLabel(planDisplayName || currentPlan);
  const billingPeriodEndLabel = formatUsagePeriodEnd(usagePeriod.billingPeriodEnd);
  const usageHeading =
    usagePeriod.source === "shopify" || usagePeriod.source === "cached"
      ? "Billing Period Usage"
      : "Monthly Usage";
  const usageScopeText = billingPeriodEndLabel
    ? `Current Shopify billing period, resets on ${billingPeriodEndLabel}.`
    : usagePeriod.source === "unresolved"
      ? "Current billing period usage. Shopify billing dates will sync when available."
      : "Current calendar month usage.";
  const usageBannerAction = upgradeTarget
    ? { content: upgradeTarget.actionContent, url: "/app/pricing" }
    : canRequestCustomPlan
      ? CUSTOM_PLAN_REQUEST_ACTION
    : { content: "View pricing", url: "/app/pricing" };
  const usageBannerSecondaryAction = upgradeTarget && canRequestCustomPlan
    ? CUSTOM_PLAN_REQUEST_ACTION
    : undefined;
  const limitReachedMessage = upgradeTarget && canRequestCustomPlan
    ? `You have reached your ${currentPlanLabel} plan limit. Upgrade to ${upgradeTarget.label} for more visitors, or request a custom plan for heavier traffic.`
    : upgradeTarget
      ? `You have reached your ${currentPlanLabel} plan limit. Upgrade to ${upgradeTarget.label} for a higher visitor limit.`
      : canRequestCustomPlan
        ? `You have reached your ${currentPlanLabel} plan limit. Request a custom plan for higher traffic.`
        : `You have reached your ${currentPlanLabel} plan limit. Review available plans to manage overage charges.`;
  const nearLimitMessage = upgradeTarget && canRequestCustomPlan
    ? `You're approaching your ${currentPlanLabel} plan limit (${usagePercent}% used). Upgrade to ${upgradeTarget.label}, or request a custom plan for heavier traffic.`
    : upgradeTarget
      ? `You're approaching your ${currentPlanLabel} plan limit (${usagePercent}% used). Upgrade to ${upgradeTarget.label} for more visitors.`
      : canRequestCustomPlan
        ? `You're approaching your ${currentPlanLabel} plan limit (${usagePercent}% used). Request a custom plan for higher monthly traffic.`
        : `You're approaching your ${currentPlanLabel} plan limit (${usagePercent}% used). Review available plans before overage applies.`;

  const handleOpenThemeEditor = () => {
    const shopName = shop.replace('.myshopify.com', '');
    window.open(`https://admin.shopify.com/store/${shopName}/themes/current/editor?context=apps`, '_blank');
  };

  const handleDismissSetup = useCallback(() => {
    setSetupDismissed(true);
    try {
      localStorage.removeItem(SETUP_DISMISSED_KEY);
      localStorage.setItem(setupDismissedKey, "true");
    } catch {}
  }, [setupDismissedKey]);

  const setupSteps: Array<{
    id: "embed" | "rule" | "logs";
    title: string;
    completed: boolean;
    status: string;
    statusTone: "success" | "warning" | "attention";
  }> = [
    {
      id: "embed",
      title: "Enable app embed",
      completed: appEmbedStatus.state === "enabled",
      status: appEmbedStatus.label,
      statusTone: appEmbedStatus.state === "enabled" ? "success" : appEmbedStatus.state === "missing_scope" ? "warning" : "attention",
    },
    {
      id: "rule",
      title: "Create rule",
      completed: stats.activeRules > 0,
      status: stats.activeRules > 0 ? `${stats.activeRules} active` : stats.totalRules > 0 ? "Inactive" : "Pending",
      statusTone: stats.activeRules > 0 ? "success" : stats.totalRules > 0 ? "warning" : "attention",
    },
    {
      id: "logs",
      title: "Check visitor logs",
      completed: stats.hasVisitorLogs,
      status: stats.hasVisitorLogs ? "Available" : "No logs yet",
      statusTone: stats.hasVisitorLogs ? "success" : "attention",
    },
  ];
  const activeSetupStep = activeSetupStepId || setupSteps.find((step) => !step.completed)?.id || "logs";
  const completedSetupSteps = setupSteps.filter((step) => step.completed).length;
  const totalBlockedActions = blocksData.reduce((sum: number, item: any) => sum + Number(item.blocked || 0), 0);
  const totalPopupSeen = popupsData.reduce((sum: number, item: any) => sum + Number(item.seen || 0), 0);
  const totalAutoRedirected = autoRedirectsData.reduce((sum: number, item: any) => sum + Number(item.autoRedirected || 0), 0);
  const isAppActive = stats.isEnabled && stats.mode !== "disabled";
  const remainingVisitors = isUnlimitedPlan ? null : Math.max(0, planLimit - currentUsage);

  return (
    <Page>
      <TitleBar title="Geo: Redirect & Country Block" />
      <style>
        {`
          .dashboard-welcome {
            display: flex;
            align-items: flex-end;
            justify-content: space-between;
            gap: 16px;
            padding: 2px 4px 0;
          }
          .dashboard-page,
          .dashboard-shell,
          .dashboard-overview-grid,
          .dashboard-content-grid,
          .dashboard-side-stack,
          .dashboard-card-frame,
          .dashboard-panel {
            min-width: 0;
            max-width: 100%;
          }
          .dashboard-page {
            box-sizing: border-box;
            width: 100%;
          }
          .dashboard-page > .Polaris-BlockStack > * {
            order: 4;
          }
          .dashboard-page > .Polaris-BlockStack > .dashboard-welcome {
            order: 1;
          }
          .dashboard-page > .Polaris-BlockStack > :has(.dashboard-app-embed-status) {
            order: 2;
          }
          .dashboard-page > .Polaris-BlockStack > :has(.setup-guide-card) {
            order: 3;
          }
          .dashboard-page > .Polaris-BlockStack,
          .dashboard-page .Polaris-ShadowBevel {
            --pc-shadow-bevel-border-radius-xs: var(--p-border-radius-200, 8px) !important;
            box-sizing: border-box;
            width: 100%;
            min-width: 0;
            max-width: 100%;
            border-radius: var(--p-border-radius-200, 8px);
            overflow: hidden;
          }
          .dashboard-page .Polaris-ShadowBevel > .Polaris-Box {
            box-sizing: border-box;
            width: 100%;
            min-width: 0;
            max-width: 100%;
            border-radius: inherit;
          }
          .dashboard-shell {
            display: grid;
            gap: 16px;
          }
          .dashboard-overview-grid {
            display: grid;
            grid-template-columns: minmax(0, 1fr);
            gap: 16px;
            align-items: stretch;
          }
          .dashboard-usage-card {
            padding: 16px;
            height: 100%;
            display: flex;
            flex-direction: column;
          }
          .dashboard-usage-header,
          .dashboard-panel-header {
            display: flex;
            align-items: flex-start;
            justify-content: space-between;
            gap: 12px;
          }
          .dashboard-usage-header > .Polaris-BlockStack,
          .dashboard-panel-header > .Polaris-BlockStack {
            min-width: 0;
            flex: 1 1 auto;
          }
          .dashboard-header-badge,
          .dashboard-header-badges {
            display: flex;
            flex: 0 0 auto;
            justify-content: flex-end;
            max-width: 48%;
          }
          .dashboard-header-badge .Polaris-Badge,
          .dashboard-header-badges .Polaris-Badge {
            width: fit-content;
            max-width: 100%;
          }
          .dashboard-usage-progress {
            display: grid;
            gap: 8px;
            margin-top: 12px;
            margin-bottom: auto;
          }
          .dashboard-content-grid {
            --dashboard-traffic-panel-height: 432px;
            display: grid;
            grid-template-columns: minmax(0, 2fr) minmax(280px, 0.9fr);
            grid-template-rows: var(--dashboard-traffic-panel-height);
            gap: 16px;
            align-items: stretch;
          }
          .dashboard-card-frame {
            height: 100%;
            min-width: 0;
            min-height: 0;
          }
          .dashboard-card-frame > .Polaris-ShadowBevel,
          .dashboard-card-frame > .Polaris-ShadowBevel > .Polaris-Box {
            height: 100%;
            min-height: 0;
          }
          .dashboard-side-stack {
            display: grid;
            gap: 16px;
            grid-template-rows: repeat(2, minmax(0, 1fr));
            height: 100%;
            min-height: 0;
          }
          .dashboard-panel {
            min-height: 0;
            height: 100%;
            display: flex;
            flex-direction: column;
            overflow: hidden;
          }
          .dashboard-panel-header {
            padding: 16px;
            border-bottom: 1px solid var(--p-color-border-secondary, #ebebeb);
          }
          .dashboard-table-scroll {
            overflow-x: auto;
            overflow-y: auto;
            width: 100%;
            max-width: 100%;
            max-height: 360px;
            min-height: 0;
            min-width: 0;
            contain: inline-size;
          }
          .dashboard-table-scroll-short {
            overflow-x: auto;
            overflow-y: auto;
            width: 100%;
            max-width: 100%;
            max-height: 190px;
            min-height: 0;
            min-width: 0;
            contain: inline-size;
          }
          .dashboard-table-scroll,
          .dashboard-table-scroll-short {
            --dashboard-scrollbar-thumb: rgba(138, 138, 138, 0.42);
            --dashboard-scrollbar-thumb-hover: rgba(97, 97, 97, 0.72);
            --dashboard-scrollbar-track: transparent;
            scrollbar-color: var(--dashboard-scrollbar-thumb) var(--dashboard-scrollbar-track);
            scrollbar-width: thin;
          }
          .dashboard-table-scroll::-webkit-scrollbar,
          .dashboard-table-scroll-short::-webkit-scrollbar {
            width: 8px;
            height: 8px;
          }
          .dashboard-table-scroll::-webkit-scrollbar-track,
          .dashboard-table-scroll-short::-webkit-scrollbar-track {
            background: var(--dashboard-scrollbar-track);
          }
          .dashboard-table-scroll::-webkit-scrollbar-thumb,
          .dashboard-table-scroll-short::-webkit-scrollbar-thumb {
            background-color: var(--dashboard-scrollbar-thumb);
            border: 2px solid transparent;
            border-radius: 999px;
            background-clip: padding-box;
          }
          .dashboard-table-scroll:hover::-webkit-scrollbar-thumb,
          .dashboard-table-scroll-short:hover::-webkit-scrollbar-thumb {
            background-color: var(--dashboard-scrollbar-thumb-hover);
          }
          .dashboard-table-scroll::-webkit-scrollbar-button,
          .dashboard-table-scroll-short::-webkit-scrollbar-button {
            width: 0;
            height: 0;
            display: none;
          }
          .dashboard-table-scroll-short.is-empty {
            overflow-y: hidden;
          }
          .dashboard-content-grid .dashboard-table-scroll,
          .dashboard-content-grid .dashboard-table-scroll-short {
            flex: 1;
            max-height: none;
          }
          .dashboard-table {
            width: 100%;
            border-collapse: collapse;
            font-size: 13px;
          }
          .dashboard-table th {
            padding: 9px 14px;
            text-align: left;
            font-weight: 600;
            color: var(--p-color-text-secondary, #616161);
            border-bottom: 1px solid var(--p-color-border-secondary, #ebebeb);
            position: sticky;
            top: 0;
            background: var(--p-color-bg-surface-secondary, #f7f7f7);
            z-index: 1;
            white-space: nowrap;
          }
          .dashboard-table th.text-right {
            text-align: right;
          }
          .dashboard-table td {
            padding: 9px 14px;
            border-bottom: 1px solid var(--p-color-border-secondary, #ebebeb);
            vertical-align: middle;
          }
          .dashboard-table td.text-right {
            text-align: right;
          }
          .dashboard-table tbody tr:hover {
            background: var(--p-color-bg-surface-hover, #f7f7f7);
          }
          .dashboard-table tbody tr:last-child td {
            border-bottom: 0;
          }
          .dashboard-entity-cell {
            display: flex;
            align-items: center;
            gap: 8px;
            min-width: 0;
          }
          .dashboard-entity-cell img {
            border-radius: 2px;
            object-fit: cover;
            box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.08);
          }
          .dashboard-entity-cell span {
            font-weight: 600;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
          }
          .dashboard-count {
            display: inline-flex;
            justify-content: flex-end;
            min-width: 28px;
            font-variant-numeric: tabular-nums;
            color: var(--p-color-text, #303030);
          }
          .dashboard-empty {
            padding: 32px 16px;
            text-align: center;
            color: var(--p-color-text-secondary, #616161);
          }
          .setup-guide-header-actions {
            display: flex;
            align-items: flex-start;
            gap: 8px;
            flex: 0 0 auto;
          }
          .setup-guide-card {
            padding: 16px;
          }
          .dashboard-app-embed-status {
            min-height: 52px;
            padding: 12px 16px;
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 16px;
          }
          .dashboard-app-embed-status > :first-child {
            flex: 1 1 auto;
            min-width: 0;
          }
          .dashboard-app-embed-status > :last-child {
            flex: 0 0 auto;
          }
          .setup-guide-header {
            display: flex;
            align-items: flex-start;
            justify-content: space-between;
            gap: 16px;
          }
          .setup-guide-header > .Polaris-BlockStack {
            flex: 1 1 auto;
            min-width: 0;
          }
          .setup-guide-steps {
            display: grid;
            gap: 6px;
          }
          .setup-guide-step {
            border-radius: 8px;
          }
          .setup-guide-step.is-active {
            background: var(--p-color-bg-surface-secondary, #f3f3f3);
          }
          .setup-guide-step-header {
            width: 100%;
            display: grid;
            grid-template-columns: 24px minmax(0, 1fr) auto;
            align-items: center;
            gap: 10px;
            padding: 10px 12px;
            border: 0;
            background: transparent;
            text-align: left;
            cursor: pointer;
          }
          .setup-guide-step-header > .Polaris-Badge {
            width: fit-content;
            max-width: 100%;
            justify-self: end;
          }
          .setup-guide-step-header > span:not(.setup-guide-step-marker):not(.Polaris-Badge) {
            min-width: 0;
          }
          .setup-guide-step-marker {
            width: 20px;
            height: 20px;
            border-radius: 50%;
            border: 1px dashed var(--p-color-border-emphasis, #8a8a8a);
            display: flex;
            align-items: center;
            justify-content: center;
          }
          .setup-guide-step-marker.is-complete {
            border: 0;
            background: var(--p-color-bg-fill-inverse, #303030);
            color: #ffffff;
          }
          .setup-guide-step-marker .Polaris-Icon {
            width: 14px;
            height: 14px;
          }
          .setup-guide-step-marker.is-complete .Polaris-Icon svg {
            fill: #ffffff;
          }
          .setup-guide-step-body {
            padding: 0 12px 14px 46px;
          }
          .setup-guide-list {
            margin: 0;
            padding-left: 18px;
            color: var(--p-color-text-secondary, #616161);
            font-size: 13px;
            line-height: 1.45;
          }
          .setup-guide-list li + li {
            margin-top: 4px;
          }
          @media (max-width: 47.9975em) {
            :where(html, body):has(.dashboard-page) {
              overflow-x: hidden;
            }
            body:has(.dashboard-page) .Polaris-Page,
            body:has(.dashboard-page) .Polaris-Page__Content {
              box-sizing: border-box;
              width: 100%;
              min-width: 0;
              max-width: 100%;
            }
            .dashboard-page {
              width: 100%;
              max-width: 100%;
            }
            .dashboard-welcome {
              flex-direction: column;
              align-items: flex-start;
              padding: 2px 0 0;
            }
            .dashboard-overview-grid,
            .dashboard-content-grid {
              grid-template-columns: 1fr;
              grid-template-rows: none;
            }
            .dashboard-card-frame,
            .dashboard-card-frame > .Polaris-ShadowBevel,
            .dashboard-card-frame > .Polaris-ShadowBevel > .Polaris-Box,
            .dashboard-side-stack {
              height: auto;
            }
            .dashboard-side-stack {
              grid-template-rows: none;
            }
            .dashboard-panel {
              height: auto;
              overflow: visible;
            }
            .dashboard-content-grid .dashboard-table-scroll {
              flex: none;
              max-height: none;
              overflow-y: visible;
            }
            .dashboard-content-grid .dashboard-table-scroll-short {
              flex: none;
              max-height: none;
              overflow-y: visible;
            }
            .dashboard-table-scroll-short.is-empty {
              overflow-y: visible;
            }
            .dashboard-table {
              min-width: 560px;
            }
            .dashboard-usage-header,
            .dashboard-panel-header {
              flex-direction: row;
              align-items: flex-start;
            }
            .dashboard-header-badge,
            .dashboard-header-badges {
              margin-left: auto;
              max-width: 46%;
            }
            .dashboard-header-badges .Polaris-InlineStack {
              justify-content: flex-end;
            }
            .dashboard-table-scroll,
            .dashboard-table-scroll-short {
              overscroll-behavior-x: contain;
            }
            .setup-guide-step-header {
              grid-template-columns: 24px minmax(0, 1fr) max-content;
            }
            .setup-guide-step-header > .Polaris-Badge {
              grid-column: 3;
              justify-self: end;
            }
            .setup-guide-step-body {
              padding-left: 46px;
            }
          }
          @media (max-width: 30em) {
            .dashboard-shell,
            .dashboard-overview-grid,
            .dashboard-content-grid,
            .dashboard-side-stack {
              gap: var(--p-space-400, 16px);
            }
            .setup-guide-card,
            .dashboard-usage-card,
            .dashboard-panel-header {
              padding: var(--p-space-400, 16px);
            }
            .dashboard-usage-header,
            .dashboard-panel-header {
              display: grid;
              grid-template-columns: minmax(0, 1fr) max-content;
              align-items: start;
            }
            .dashboard-header-badge,
            .dashboard-header-badges {
              justify-self: end;
              max-width: 44vw;
            }
            .dashboard-header-badges .Polaris-InlineStack {
              flex-wrap: wrap;
            }
            .setup-guide-header-actions {
              align-items: center;
            }
            .setup-guide-step-header {
              gap: 8px;
              padding: 10px 8px;
            }
            .setup-guide-step-body {
              padding-right: 8px;
              padding-left: 42px;
            }
          }
        `}
      </style>
      <div className="dashboard-page" style={{ paddingBottom: '32px' }}>
      <BlockStack gap="500">

        <div className="dashboard-welcome">
          <BlockStack gap="100">
            <Text as="h1" variant="headingLg">
              Welcome, {shopIdentity.ownerName}
            </Text>
            <Text as="p" variant="bodyMd" tone="subdued">
              {shopIdentity.shopName} dashboard overview
            </Text>
          </BlockStack>
        </div>

        {setupDismissed === true && <Card padding="0">
          <div className="dashboard-app-embed-status">
            <Text as="p" variant="bodyMd">
              <strong>Geo: Redirect</strong>{" "}
              {appEmbedStatus.state === "enabled"
                ? "is enabled in your live theme"
                : "is not enabled in your live theme"}
            </Text>
            {appEmbedStatus.state === "enabled" ? (
              <Badge tone="success">Enabled</Badge>
            ) : (
              <Button onClick={handleOpenThemeEditor}>Enable</Button>
            )}
          </div>
        </Card>}

        {setupDismissed === false && (
          <Card padding="0">
            <div className="setup-guide-card">
              <BlockStack gap="400">
                <div className="setup-guide-header">
                <BlockStack gap="100">
                  <Text as="h2" variant="headingMd">Setup guide</Text>
                  <Text as="p" variant="bodyMd">
                    Get started with the app in just a few simple steps.
                  </Text>
                  <div>
                    <Badge>{`${completedSetupSteps} / ${setupSteps.length} completed`}</Badge>
                  </div>
                </BlockStack>
                  <div className="setup-guide-header-actions">
                    {completedSetupSteps === setupSteps.length && (
                      <Button variant="primary" onClick={handleDismissSetup}>
                        Finish
                      </Button>
                    )}
                    <Button
                      icon={setupCollapsed ? ChevronDownIcon : ChevronUpIcon}
                      onClick={() => setSetupCollapsed((collapsed) => !collapsed)}
                      accessibilityLabel={setupCollapsed ? "Expand setup guide" : "Collapse setup guide"}
                    />
                  </div>
                </div>

              {!setupCollapsed && <div className="setup-guide-steps">
                {setupSteps.map((step) => {
                  const isActive = activeSetupStep === step.id;

                  return (
                    <div
                      key={step.id}
                      className={`setup-guide-step ${isActive ? "is-active" : ""}`}
                    >
                      <button
                        type="button"
                        className="setup-guide-step-header"
                        onClick={() => setActiveSetupStepId(step.id)}
                      >
                        <span
                          className={`setup-guide-step-marker ${step.completed ? "is-complete" : ""}`}
                          aria-hidden="true"
                        >
                          {step.completed && <Icon source={CheckIcon} tone="base" />}
                        </span>
                        <Text as="span" variant="bodyMd" fontWeight="semibold">
                          {step.title}
                        </Text>
                        <Badge tone={step.statusTone}>{step.status}</Badge>
                      </button>

                      {isActive && (
                        <div className="setup-guide-step-body">
                          {step.id === "embed" && (
                            <BlockStack gap="300">
                              {appEmbedStatus.state === "missing_scope" && (
                                <Banner tone="warning">
                                  The app needs read_themes permission to read your current theme and show this status.
                                </Banner>
                              )}
                              <Text as="p" variant="bodyMd" tone="subdued">
                                {appEmbedStatus.helpText}
                              </Text>
                              <ul className="setup-guide-list">
                                <li>Click "Enable app embed" below.</li>
                                <li>Open App embeds in the theme customizer.</li>
                                <li>Enable "Geolocation", click Save, then reload this dashboard.</li>
                              </ul>
                              <InlineStack gap="200">
                                <Button onClick={handleOpenThemeEditor}>
                                  Enable app embed
                                </Button>
                              </InlineStack>
                            </BlockStack>
                          )}

                          {step.id === "rule" && (
                            <BlockStack gap="300">
                              <Text as="p" variant="bodyMd" tone="subdued">
                                Create at least one redirect, block, or popup rule so the storefront script has an action to run.
                              </Text>
                              <ul className="setup-guide-list">
                                <li>Select the countries, markets, states, or IPs you want to target.</li>
                                <li>Choose Redirect, Block, or Popup and keep the rule active.</li>
                              </ul>
                              <InlineStack gap="200">
                                <Button url="/app/rules">Create rule</Button>
                              </InlineStack>
                            </BlockStack>
                          )}

                          {step.id === "logs" && (
                            <BlockStack gap="300">
                              <Text as="p" variant="bodyMd" tone="subdued">
                                Open visitor logs after testing the storefront to confirm visits, redirects, blocks, and popups are being recorded.
                              </Text>
                              <ul className="setup-guide-list">
                                <li>Use an incognito window or clear the geolocation choice cookie before testing.</li>
                                <li>Reload the storefront, then check the latest visitor log entries.</li>
                              </ul>
                              <InlineStack gap="200">
                                <Button url="/app/logs">Check visitor logs</Button>
                              </InlineStack>
                            </BlockStack>
                          )}

                        </div>
                      )}
                    </div>
                  );
                })}
              </div>}
              </BlockStack>
            </div>
          </Card>
        )}

        <div className="dashboard-shell">
          <div className="dashboard-overview-grid">
            <Card padding="0">
              <div className="dashboard-usage-card">
                <div className="dashboard-usage-header">
                  <BlockStack gap="100">
                    <Text as="h3" variant="headingSm">{usageHeading}</Text>
                    <Text as="p" variant="bodySm" tone="subdued">{usageScopeText}</Text>
                  </BlockStack>
                  <div className="dashboard-header-badges">
                    <InlineStack gap="200">
                      <Badge tone={isAtLimit ? "warning" : isNearLimit ? "warning" : "success"}>
                        {formatPlanLabel(planDisplayName)}
                      </Badge>
                      <Badge tone={isAppActive ? "success" : "warning"}>
                        {isAppActive ? "Active" : "Paused"}
                      </Badge>
                    </InlineStack>
                  </div>
                </div>
                <div className="dashboard-usage-progress">
                  <InlineStack align="space-between" blockAlign="center" gap="300">
                    <Text as="p" variant="bodySm">
                      <strong>{currentUsage.toLocaleString()}</strong> / {isUnlimitedPlan ? "Unlimited" : planLimit.toLocaleString()} billable visitors
                    </Text>
                    <Text as="p" variant="bodySm" tone={isAtLimit ? "caution" : isNearLimit ? "caution" : "subdued"}>
                      {isUnlimitedPlan ? "Unlimited" : `${usagePercent}%`}
                    </Text>
                  </InlineStack>
                  <ProgressBar
                    progress={Math.min(100, usagePercent)}
                    tone={isAtLimit ? "highlight" : undefined}
                    size="small"
                  />
                  {remainingVisitors !== null && (
                    <Text as="p" variant="bodySm" tone={isAtLimit ? "caution" : isNearLimit ? "caution" : "subdued"}>
                      {isAtLimit
                        ? currentPlan === FREE_PLAN
                          ? "Limit reached — app paused for this period"
                          : "Limit reached — overage charges may apply"
                        : `${remainingVisitors.toLocaleString()} visitors remaining${currentPlan !== FREE_PLAN ? " before overage" : ""}`
                      }
                    </Text>
                  )}
                </div>
                {!isAppActive && (
                  <div style={{ marginTop: "12px" }}>
                    <Banner tone="warning" action={{ content: "Go to Settings", url: "/app/settings" }}>
                      The app is currently paused. Enable it in Settings so visitors can see redirects, popups, and blocks.
                    </Banner>
                  </div>
                )}
                {isAtLimit && (
                  <div style={{ marginTop: "12px" }}>
                    <Banner tone="warning" action={usageBannerAction} secondaryAction={usageBannerSecondaryAction}>
                      {limitReachedMessage}
                    </Banner>
                  </div>
                )}
                {isNearLimit && !isAtLimit && (
                  <div style={{ marginTop: "12px" }}>
                    <Banner tone="warning" action={usageBannerAction} secondaryAction={usageBannerSecondaryAction}>
                      {nearLimitMessage}
                    </Banner>
                  </div>
                )}
              </div>
            </Card>

          </div>

          <div className="dashboard-content-grid">
            <div className="dashboard-card-frame">
              <Card padding="0">
                <div className="dashboard-panel">
                  <div className="dashboard-panel-header">
                    <BlockStack gap="100">
                      <Text as="h3" variant="headingMd">Traffic Overview</Text>
                      <Text as="p" variant="bodySm" tone="subdued">Visits and actions by country in the last 30 days.</Text>
                    </BlockStack>
                    <div className="dashboard-header-badge">
                      <Badge>{`${totalCountries} countries`}</Badge>
                    </div>
                  </div>
                  <div className="dashboard-table-scroll">
                    <table className="dashboard-table">
                      <thead>
                        <tr>
                          <th>Country</th>
                          <th className="text-right">Visits</th>
                          <th className="text-right">Popup</th>
                          <th className="text-right">Redirected</th>
                          <th className="text-right">Blocked</th>
                        </tr>
                      </thead>
                      <tbody>
                        {visitsData.length > 0 ? (
                          visitsData.map((item: any) => (
                            <tr key={item.id}>
                              <td>
                                <div className="dashboard-entity-cell">
                                  <img
                                    src={`https://flagcdn.com/w40/${item.code.toLowerCase()}.png`}
                                    srcSet={`https://flagcdn.com/w80/${item.code.toLowerCase()}.png 2x`}
                                    width="24"
                                    height="16"
                                    alt={item.country}
                                    loading="lazy"
                                    decoding="async"
                                  />
                                  <span>{item.country}</span>
                                </div>
                              </td>
                              <td className="text-right"><span className="dashboard-count">{item.visitors}</span></td>
                              <td className="text-right"><span className="dashboard-count">{item.popup}</span></td>
                              <td className="text-right"><span className="dashboard-count">{item.redirected}</span></td>
                              <td className="text-right"><span className="dashboard-count">{item.blocked}</span></td>
                            </tr>
                          ))
                        ) : (
                          <tr>
                            <td colSpan={5}>
                              <div className="dashboard-empty">No traffic data yet</div>
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </Card>
            </div>

            <div className="dashboard-side-stack">
              <div className="dashboard-card-frame">
                <Card padding="0">
                  <div className="dashboard-panel">
                    <div className="dashboard-panel-header">
                      <BlockStack gap="100">
                        <Text as="h3" variant="headingMd">Blocked Traffic</Text>
                        <Text as="p" variant="bodySm" tone="subdued">Visitors blocked by rule or country.</Text>
                      </BlockStack>
                      <div className="dashboard-header-badge">
                        <Badge tone={totalBlockedActions > 0 ? "attention" : undefined}>{totalBlockedActions.toLocaleString()}</Badge>
                      </div>
                    </div>
                    <div className={`dashboard-table-scroll-short${blocksData.length > 0 ? "" : " is-empty"}`}>
                      <table className="dashboard-table">
                        <thead>
                          <tr>
                            <th>Block</th>
                            <th className="text-right">Count</th>
                          </tr>
                        </thead>
                        <tbody>
                          {blocksData.length > 0 ? (
                            blocksData.map((item: any) => (
                              <tr key={item.id}>
                                <td>
                                  <div className="dashboard-entity-cell">
                                    {String(item.id).length === 2 && (
                                      <img
                                        src={`https://flagcdn.com/w40/${String(item.id).toLowerCase()}.png`}
                                        width="24"
                                        height="16"
                                        alt={item.block}
                                        loading="lazy"
                                        decoding="async"
                                      />
                                    )}
                                    <span>{item.block}</span>
                                  </div>
                                </td>
                                <td className="text-right"><span className="dashboard-count">{item.blocked}</span></td>
                              </tr>
                            ))
                          ) : (
                            <tr>
                              <td colSpan={2}>
                                <div className="dashboard-empty">No blocks found</div>
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </Card>
              </div>

              <div className="dashboard-card-frame">
                <Card padding="0">
                  <div className="dashboard-panel">
                    <div className="dashboard-panel-header">
                      <BlockStack gap="100">
                        <Text as="h3" variant="headingMd">Instant Redirects</Text>
                        <Text as="p" variant="bodySm" tone="subdued">Auto-redirects in the last 30 days.</Text>
                      </BlockStack>
                      <div className="dashboard-header-badge">
                        <Badge tone={totalAutoRedirected > 0 ? "success" : undefined}>{totalAutoRedirected.toLocaleString()}</Badge>
                      </div>
                    </div>
                    <div className={`dashboard-table-scroll-short${autoRedirectsData.length > 0 ? "" : " is-empty"}`}>
                      <table className="dashboard-table">
                        <thead>
                          <tr>
                            <th>Rule</th>
                            <th className="text-right">Redirected</th>
                          </tr>
                        </thead>
                        <tbody>
                          {autoRedirectsData.length > 0 ? (
                            autoRedirectsData.map((item: any) => (
                              <tr key={item.id}>
                                <td>
                                  <div className="dashboard-entity-cell">
                                    <span>{item.rule}</span>
                                  </div>
                                </td>
                                <td className="text-right"><span className="dashboard-count">{item.autoRedirected}</span></td>
                              </tr>
                            ))
                          ) : (
                            <tr>
                              <td colSpan={2}>
                                <div className="dashboard-empty">No auto-redirect data</div>
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </Card>
              </div>
            </div>
          </div>

          <Card padding="0">
            <div className="dashboard-panel">
              <div className="dashboard-panel-header">
                <BlockStack gap="100">
                  <Text as="h3" variant="headingMd">Banners and Popups</Text>
                  <Text as="p" variant="bodySm" tone="subdued">Popup interactions in the last 30 days.</Text>
                </BlockStack>
                <div className="dashboard-header-badge">
                  <Badge tone={totalPopupSeen > 0 ? "info" : undefined}>{`${totalPopupSeen.toLocaleString()} seen`}</Badge>
                </div>
              </div>
              <div className="dashboard-table-scroll">
                <table className="dashboard-table">
                  <thead>
                    <tr>
                      <th>Rule</th>
                      <th className="text-right">Seen</th>
                      <th className="text-right">Clicked Yes</th>
                      <th className="text-right">Clicked No</th>
                      <th className="text-right">Dismissed</th>
                      <th className="text-right">Rate</th>
                    </tr>
                  </thead>
                  <tbody>
                    {popupsData.length > 0 ? (
                      popupsData.map((item: any) => (
                        <tr key={item.id}>
                          <td>
                            <div className="dashboard-entity-cell">
                              <span>{item.rule}</span>
                            </div>
                          </td>
                          <td className="text-right"><span className="dashboard-count">{item.seen}</span></td>
                          <td className="text-right"><span className="dashboard-count">{item.clickedYes}</span></td>
                          <td className="text-right"><span className="dashboard-count">{item.clickedNo}</span></td>
                          <td className="text-right"><span className="dashboard-count">{item.dismissed}</span></td>
                          <td className="text-right"><span className="dashboard-count" style={{ color: item.seen > 0 ? 'var(--p-color-text-success, #1a7346)' : undefined }}>{item.seen > 0 ? `${Math.round((item.clickedYes / item.seen) * 100)}%` : '—'}</span></td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={6}>
                          <div className="dashboard-empty">No popup data</div>
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </Card>
        </div>
        <div aria-hidden="true" style={{ height: '8px' }} />
      </BlockStack>
      </div>
    </Page>
  );
}

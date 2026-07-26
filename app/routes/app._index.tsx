import { useEffect, useRef, useState } from "react";
import type { FormEvent, ReactNode } from "react";
import type { LoaderFunctionArgs } from "react-router";
import {
  Await,
  Link,
  data as responseData,
  useLoaderData,
  useNavigate,
  useRevalidator,
} from "react-router";
import {
  Badge,
  Banner,
  Button,
  Card,
  Icon,
  Page,
  ProgressBar,
  Text,
} from "@shopify/polaris";
import {
  ArrowRightIcon,
  ChartLineIcon,
  CheckCircleIcon,
  GlobeIcon,
  PersonIcon,
  PlusIcon,
  QuestionCircleIcon,
  SearchIcon,
  SettingsIcon,
  ShieldCheckMarkIcon,
} from "@shopify/polaris-icons";
import { TitleBar } from "@shopify/app-bridge-react";
import { Suspense } from "react";
import {
  CUSTOM_PLAN,
  FREE_PLAN,
  PLUS_PLAN,
  PREMIUM_PLAN,
  getPlanLimit,
  hasMonthlyUnlimitedReward,
  hasUnlimitedUsage,
} from "../billing.config";
import prisma from "../db.server";
import { authenticate } from "../shopify.server";
import { getUsagePeriodForShop } from "../utils/billing-period.server";
import { isBillingTestMode } from "../utils/billing-mode.server";
import { checkBillingWithFallback } from "../utils/billing.server";
import { COUNTRY_MAP } from "../utils/countries";
import {
  getStableShopifyPlanFromBillingCheck,
  resolveEffectivePlan,
} from "../utils/effective-plan.server";
import { shopifyBoundaryHeaders } from "../utils/shopify-boundary.server";
import { invalidateStorefrontConfigCache } from "../utils/storefront-config-cache.server";
import { getThemeAppEmbedStatus } from "../utils/theme-app-embed.server";

export { shopifyBoundaryHeaders as headers };

const STANDARD_PLAN_UPGRADES: Record<string, { label: string; actionContent: string }> = {
  [FREE_PLAN]: { label: "Premium", actionContent: "Upgrade to Premium" },
  [PREMIUM_PLAN]: { label: "Plus", actionContent: "Upgrade to Plus" },
  [PLUS_PLAN]: { label: "Elite", actionContent: "Upgrade to Elite" },
};

const CUSTOM_PLAN_REQUEST_ACTION = {
  content: "Request custom plan",
  url: "/app/pricing",
};

function formatPlanLabel(planName: string) {
  if (!planName) return "Current";
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

function dateKey(date: Date) {
  return date.toISOString().slice(0, 10);
}

function buildLastSevenDays() {
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);

  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date(today);
    date.setUTCDate(today.getUTCDate() - (6 - index));
    return date;
  });
}

async function loadDashboardAnalytics(shop: string, thirtyDaysAgo: Date) {
  const [countryStats, ruleStats, dailyStats, recentRules] = await Promise.all([
    prisma.analyticsCountry.groupBy({
      by: ["countryCode"],
      where: {
        shop,
        date: { gte: thirtyDaysAgo },
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
      by: ["ruleName", "ruleId"],
      where: {
        shop,
        date: { gte: thirtyDaysAgo },
      },
      _sum: {
        seen: true,
        clickedYes: true,
        clickedNo: true,
        dismissed: true,
        autoRedirected: true,
        blocked: true,
      },
    }),
    prisma.analyticsCountry.groupBy({
      by: ["date"],
      where: {
        shop,
        date: { gte: thirtyDaysAgo },
      },
      _sum: {
        visitors: true,
        redirected: true,
        blocked: true,
      },
      orderBy: {
        date: "asc",
      },
    }),
    prisma.redirectRule.findMany({
      where: { shop },
      orderBy: { updatedAt: "desc" },
      take: 5,
      select: {
        id: true,
        name: true,
        isActive: true,
        ruleType: true,
        redirectMode: true,
        matchType: true,
        countryCodes: true,
        stateCodes: true,
        ipAddresses: true,
        updatedAt: true,
      },
    }),
  ]);

  const totals = countryStats.reduce(
    (result, item) => ({
      visitors: result.visitors + (item._sum.visitors || 0),
      redirects: result.redirects + (item._sum.redirected || 0),
      blocked: result.blocked + (item._sum.blocked || 0),
    }),
    { visitors: 0, redirects: 0, blocked: 0 },
  );

  const topCountries = countryStats.slice(0, 6).map((item) => ({
    code: item.countryCode,
    country: COUNTRY_MAP[item.countryCode] || item.countryCode,
    visitors: item._sum.visitors || 0,
    share: totals.visitors > 0
      ? Math.round(((item._sum.visitors || 0) / totals.visitors) * 1000) / 10
      : 0,
  }));

  const dailyByDate = new Map(
    dailyStats.map((item) => [
      dateKey(item.date),
      {
        visitors: item._sum.visitors || 0,
        redirects: item._sum.redirected || 0,
        blocked: item._sum.blocked || 0,
      },
    ]),
  );

  const dailySeries = buildLastSevenDays().map((date) => ({
    date: dateKey(date),
    label: new Intl.DateTimeFormat("en", {
      weekday: "short",
      timeZone: "UTC",
    }).format(date),
    ...(dailyByDate.get(dateKey(date)) || {
      visitors: 0,
      redirects: 0,
      blocked: 0,
    }),
  }));

  const totalRuleActions = ruleStats.reduce(
    (sum, item) =>
      sum +
      (item._sum.clickedYes || 0) +
      (item._sum.autoRedirected || 0) +
      (item._sum.blocked || 0),
    0,
  );

  const topRules = ruleStats
    .map((item) => {
      const redirects =
        (item._sum.clickedYes || 0) + (item._sum.autoRedirected || 0);
      const blocked = item._sum.blocked || 0;
      const actions = redirects + blocked;

      return {
        id: item.ruleId,
        name: item.ruleName || "Unknown rule",
        type: blocked > redirects ? "Block" : "Redirect",
        actions,
        share: totalRuleActions > 0
          ? Math.round((actions / totalRuleActions) * 1000) / 10
          : 0,
      };
    })
    .sort((left, right) => right.actions - left.actions)
    .slice(0, 5);

  const actionsByRule = new Map(
    ruleStats.map((item) => [
      item.ruleId,
      (item._sum.clickedYes || 0) +
        (item._sum.autoRedirected || 0) +
        (item._sum.blocked || 0),
    ]),
  );

  return {
    totalCountries: countryStats.length,
    totals,
    topCountries,
    dailySeries,
    topRules,
    recentRules: recentRules.map((rule) => ({
      ...rule,
      updatedAt: rule.updatedAt.toISOString(),
      actions: actionsByRule.get(rule.id) || 0,
    })),
  };
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
    getThemeAppEmbedStatus({
      shop,
      accessToken,
      scopeString: session.scope,
    }),
  ]);

  const analytics = loadDashboardAnalytics(shop, thirtyDaysAgo);
  const settingsAndBillingPromise = Promise.all([
    prisma.settings.upsert({
      where: { shop },
      update: {},
      create: { shop },
    }),
    checkBillingWithFallback(billing, isBillingTestMode()),
  ]);

  const planAndUsagePromise = settingsAndBillingPromise.then(
    async ([settings, billingConfig]) => {
      const shopifyPlan = getStableShopifyPlanFromBillingCheck(
        billingConfig,
        settings.currentPlan,
      );
      const { effectivePlan: currentPlan, isBillingOverridden } =
        resolveEffectivePlan({
          settings,
          shopifyPlan,
        });
      const usagePeriod = await getUsagePeriodForShop({
        shop,
        currentPlan,
        settings,
      });
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
    },
  );

  const [
    [rulesCount, activeRulesCount, latestVisitorLog, appEmbedStatus],
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
  const planDisplayName =
    currentPlan === CUSTOM_PLAN ? settings.customPlanName : currentPlan;
  const currentUsage = monthlyUsage?.totalVisitors || 0;
  const chargedVisitors = monthlyUsage?.chargedVisitors || 0;
  const isUnlimitedUsage =
    hasUnlimitedUsage(currentPlan, settings) ||
    hasMonthlyUnlimitedReward(currentPlan, chargedVisitors);

  const settingsSyncData =
    shopifyPlan === FREE_PLAN || hasUnlimitedUsage(shopifyPlan, settings)
      ? {
          currentPlan: shopifyPlan,
          blockVpn:
            shopifyPlan === FREE_PLAN && !isBillingOverridden
              ? false
              : settings.blockVpn,
          billingPlanName: null,
          billingPeriodKey: null,
          billingPeriodStart: null,
          billingPeriodEnd: null,
          billingSubscriptionId: null,
          billingUsageLineItemId: null,
        }
      : { currentPlan: shopifyPlan };

  prisma.settings
    .upsert({
      where: { shop },
      update: settingsSyncData,
      create: { shop, currentPlan: shopifyPlan },
    })
    .then(() => {
      invalidateStorefrontConfigCache(shop);
    })
    .catch((error) => {
      console.error("[Settings] Failed to sync currentPlan:", error);
    });

  const hasVisitorLogs = Boolean(latestVisitorLog);

  return responseData(
    {
      shop,
      currentPlan,
      planDisplayName,
      planLimit,
      isUnlimitedUsage,
      currentUsage,
      usagePeriod: {
        source: usagePeriod.source,
        billingPeriodEnd:
          usagePeriod.billingPeriodEnd?.toISOString() || null,
      },
      stats: {
        totalRules: rulesCount,
        activeRules: activeRulesCount,
        hasVisitorLogs,
        mode: settings.mode || "disabled",
        isEnabled: settings.isEnabled !== false,
      },
      appEmbedStatus,
      analytics,
    },
    {
      headers: {
        "Server-Timing": `geo-home;dur=${(
          performance.now() - loaderStartedAt
        ).toFixed(1)}`,
      },
    },
  );
};

type MetricCardProps = {
  icon: typeof GlobeIcon;
  tone: "blue" | "green" | "purple" | "orange";
  label: string;
  value: string;
  detail: string;
  link?: { label: string; url: string };
};

function MetricCard({
  icon,
  tone,
  label,
  value,
  detail,
  link,
}: MetricCardProps) {
  return (
    <Card padding="0">
      <div className="geo-metric">
        <span className={`geo-metric-icon is-${tone}`} aria-hidden="true">
          <Icon source={icon} />
        </span>
        <div className="geo-metric-copy">
          <Text as="p" variant="bodySm" tone="subdued">
            {label}
          </Text>
          <Text as="p" variant="headingXl">
            {value}
          </Text>
          {link ? (
            <Button
              variant="plain"
              size="slim"
              url={link.url}
              icon={ArrowRightIcon}
            >
              {link.label}
            </Button>
          ) : (
            <Text as="p" variant="bodySm" tone="subdued">
              {detail}
            </Text>
          )}
        </div>
      </div>
    </Card>
  );
}

function Panel({
  title,
  action,
  children,
  className = "",
}: {
  title: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <Card padding="0">
      <section className={`geo-panel ${className}`}>
        <header className="geo-panel-header">
          <Text as="h2" variant="headingSm">
            {title}
          </Text>
          {action && <div className="geo-panel-action">{action}</div>}
        </header>
        <div className="geo-panel-body">{children}</div>
      </section>
    </Card>
  );
}

function TrafficChart({
  points,
}: {
  points: Array<{
    date: string;
    label: string;
    redirects: number;
    blocked: number;
  }>;
}) {
  const width = 720;
  const height = 238;
  const left = 42;
  const right = 14;
  const top = 18;
  const bottom = 34;
  const plotWidth = width - left - right;
  const plotHeight = height - top - bottom;
  const maxValue = Math.max(
    1,
    ...points.flatMap((point) => [point.redirects, point.blocked]),
  );
  const niceMax = Math.max(5, Math.ceil(maxValue / 5) * 5);
  const toPoints = (key: "redirects" | "blocked") =>
    points
      .map((point, index) => {
        const x =
          left +
          (points.length <= 1 ? plotWidth / 2 : (index / (points.length - 1)) * plotWidth);
        const y = top + plotHeight - (point[key] / niceMax) * plotHeight;
        return `${x},${y}`;
      })
      .join(" ");

  return (
    <div className="geo-chart">
      <div className="geo-chart-legend" aria-hidden="true">
        <span><i className="is-blue" />Redirects</span>
        <span><i className="is-orange" />Blocked visits</span>
      </div>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label="Redirects and blocked visits over the last seven days"
      >
        {[0, 1, 2, 3, 4].map((step) => {
          const y = top + (plotHeight / 4) * step;
          const label = Math.round(niceMax - (niceMax / 4) * step);

          return (
            <g key={step}>
              <line
                x1={left}
                x2={width - right}
                y1={y}
                y2={y}
                className="geo-chart-grid"
              />
              <text x={left - 8} y={y + 4} className="geo-chart-axis" textAnchor="end">
                {label.toLocaleString()}
              </text>
            </g>
          );
        })}
        <polyline
          points={toPoints("redirects")}
          className="geo-chart-line is-blue"
        />
        <polyline
          points={toPoints("blocked")}
          className="geo-chart-line is-orange"
        />
        {points.map((point, index) => {
          const x =
            left +
            (points.length <= 1
              ? plotWidth / 2
              : (index / (points.length - 1)) * plotWidth);
          const redirectY =
            top + plotHeight - (point.redirects / niceMax) * plotHeight;
          const blockedY =
            top + plotHeight - (point.blocked / niceMax) * plotHeight;

          return (
            <g key={point.date}>
              <circle cx={x} cy={redirectY} r="3.5" className="geo-chart-dot is-blue">
                <title>{`${point.label}: ${point.redirects.toLocaleString()} redirects`}</title>
              </circle>
              <circle cx={x} cy={blockedY} r="3.5" className="geo-chart-dot is-orange">
                <title>{`${point.label}: ${point.blocked.toLocaleString()} blocked`}</title>
              </circle>
              <text
                x={x}
                y={height - 10}
                textAnchor="middle"
                className="geo-chart-axis"
              >
                {point.label}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

function DashboardPending() {
  return (
    <div className="geo-dashboard-pending" aria-label="Loading dashboard analytics">
      <div className="geo-metrics-grid">
        {Array.from({ length: 4 }).map((_, index) => (
          <div key={index} className="geo-skeleton geo-skeleton-metric" />
        ))}
      </div>
      <div className="geo-analytics-grid">
        <div className="geo-skeleton geo-skeleton-panel" />
        <div className="geo-skeleton geo-skeleton-panel" />
      </div>
    </div>
  );
}

export default function Index() {
  const {
    shop,
    currentPlan,
    planDisplayName,
    planLimit,
    isUnlimitedUsage,
    currentUsage,
    usagePeriod,
    stats,
    appEmbedStatus,
    analytics,
  } = useLoaderData<typeof loader>();
  const navigate = useNavigate();
  const revalidator = useRevalidator();
  const lastPermissionRefreshAt = useRef(0);
  const [searchQuery, setSearchQuery] = useState("");

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
      if (document.visibilityState === "visible") refreshPermissionStatus();
    };

    const timer = window.setTimeout(refreshPermissionStatus, 2_500);
    window.addEventListener("focus", refreshPermissionStatus);
    window.addEventListener("pageshow", refreshPermissionStatus);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("focus", refreshPermissionStatus);
      window.removeEventListener("pageshow", refreshPermissionStatus);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [appEmbedStatus.state, revalidator]);

  const isUnlimitedPlan = isUnlimitedUsage;
  const usagePercent = isUnlimitedPlan
    ? 100
    : Math.min(100, Math.round((currentUsage / Math.max(1, planLimit)) * 100));
  const isNearLimit = !isUnlimitedPlan && usagePercent >= 80;
  const isAtLimit = !isUnlimitedPlan && currentUsage >= planLimit;
  const isAppActive = stats.isEnabled && stats.mode !== "disabled";
  const billingPeriodEndLabel = formatUsagePeriodEnd(
    usagePeriod.billingPeriodEnd,
  );
  const upgradeTarget = STANDARD_PLAN_UPGRADES[currentPlan];
  const canRequestCustomPlan =
    currentPlan !== FREE_PLAN &&
    currentPlan !== CUSTOM_PLAN &&
    !isUnlimitedPlan;
  const usageBannerAction = upgradeTarget
    ? { content: upgradeTarget.actionContent, url: "/app/pricing" }
    : canRequestCustomPlan
      ? CUSTOM_PLAN_REQUEST_ACTION
      : { content: "View pricing", url: "/app/pricing" };
  const remainingVisitors = isUnlimitedPlan
    ? null
    : Math.max(0, planLimit - currentUsage);
  const shopName = shop.replace(".myshopify.com", "");

  const handleOpenThemeEditor = () => {
    window.open(
      `https://admin.shopify.com/store/${shopName}/themes/current/editor?context=apps`,
      "_blank",
    );
  };

  const handleSearch = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const query = searchQuery.trim();
    navigate(query ? `/app/logs?q=${encodeURIComponent(query)}` : "/app/logs");
  };

  const quickSteps = [
    {
      label: "Enable the storefront app embed",
      detail: "Allow rules to run on your live theme",
      completed: appEmbedStatus.state === "enabled",
      url: "",
    },
    {
      label: "Create your first geolocation rule",
      detail: "Redirect, block, or show a location popup",
      completed: stats.totalRules > 0,
      url: "/app/rules",
    },
    {
      label: "Keep at least one rule active",
      detail: "Active rules can protect and localize traffic",
      completed: stats.activeRules > 0,
      url: "/app/rules",
    },
    {
      label: "Review visitor logs",
      detail: "Verify recent redirects and blocked visits",
      completed: stats.hasVisitorLogs,
      url: "/app/logs",
    },
    {
      label: "Review app settings",
      detail: "Confirm mode, messaging, and visitor controls",
      completed: isAppActive,
      url: "/app/settings",
    },
  ];
  const completedQuickSteps = quickSteps.filter((step) => step.completed).length;

  return (
    <Page fullWidth>
      <TitleBar title="Home" />
      <style>{`
        .geo-home {
          display: grid;
          gap: 16px;
          padding-bottom: 32px;
          min-width: 0;
        }
        .geo-home,
        .geo-home * {
          box-sizing: border-box;
        }
        .geo-home .Polaris-ShadowBevel {
          --pc-shadow-bevel-border-radius-xs: 10px !important;
          border: 1px solid var(--p-color-border-secondary, #e3e3e3);
          border-radius: 10px !important;
          box-shadow: none !important;
          overflow: hidden;
        }
        .geo-home .Polaris-ShadowBevel::before {
          box-shadow: none !important;
        }
        .geo-home .Polaris-ShadowBevel > .Polaris-Box {
          border-radius: inherit !important;
        }
        .geo-home-header {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 20px;
          padding: 2px 2px 0;
        }
        .geo-home-heading {
          display: grid;
          gap: 3px;
          min-width: 0;
        }
        .geo-home-actions {
          display: flex;
          align-items: center;
          justify-content: flex-end;
          gap: 8px;
          min-width: 0;
        }
        .geo-home-search {
          position: relative;
          width: min(330px, 34vw);
          min-width: 220px;
        }
        .geo-home-search .Polaris-Icon {
          position: absolute;
          top: 50%;
          left: 10px;
          width: 16px;
          height: 16px;
          transform: translateY(-50%);
          pointer-events: none;
        }
        .geo-home-search input {
          width: 100%;
          height: 34px;
          padding: 6px 34px;
          border: 1px solid var(--p-color-border, #8a8a8a);
          border-radius: 8px;
          background: var(--p-color-bg-surface, #ffffff);
          color: var(--p-color-text, #303030);
          font: inherit;
          font-size: 13px;
          outline: none;
        }
        .geo-home-search input:focus {
          border-color: var(--p-color-border-focus, #005bd3);
          box-shadow: 0 0 0 1px var(--p-color-border-focus, #005bd3);
        }
        .geo-alerts {
          display: grid;
          gap: 8px;
        }
        .geo-metrics-grid {
          display: grid;
          grid-template-columns: repeat(4, minmax(0, 1fr));
          gap: 12px;
        }
        .geo-metric {
          display: flex;
          align-items: flex-start;
          gap: 12px;
          min-height: 122px;
          padding: 16px;
        }
        .geo-metric-icon {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          flex: 0 0 auto;
          width: 42px;
          height: 42px;
          border-radius: 50%;
        }
        .geo-metric-icon .Polaris-Icon {
          width: 22px;
          height: 22px;
        }
        .geo-metric-icon.is-blue {
          background: #e8f0ff;
          color: #1769e0;
        }
        .geo-metric-icon.is-green {
          background: #e6f5eb;
          color: #16834b;
        }
        .geo-metric-icon.is-purple {
          background: #f0e9ff;
          color: #7047eb;
        }
        .geo-metric-icon.is-orange {
          background: #fff0e6;
          color: #d85b00;
        }
        .geo-metric-icon .Polaris-Icon__Svg {
          fill: currentColor;
        }
        .geo-metric-copy {
          display: grid;
          gap: 4px;
          min-width: 0;
        }
        .geo-metric-copy .Polaris-Button {
          justify-self: start;
          min-height: 20px;
        }
        .geo-usage-strip {
          display: grid;
          grid-template-columns: minmax(210px, auto) minmax(240px, 1fr) auto;
          align-items: center;
          gap: 20px;
          padding: 13px 16px;
        }
        .geo-usage-title {
          display: flex;
          align-items: center;
          gap: 8px;
          min-width: 0;
        }
        .geo-usage-progress {
          display: grid;
          gap: 6px;
          min-width: 0;
        }
        .geo-usage-numbers {
          display: flex;
          justify-content: space-between;
          gap: 12px;
          font-size: 12px;
          color: var(--p-color-text-secondary, #616161);
        }
        .geo-analytics-grid {
          display: grid;
          grid-template-columns: minmax(0, 0.9fr) minmax(0, 1.1fr);
          gap: 12px;
          align-items: stretch;
        }
        .geo-lower-grid {
          display: grid;
          grid-template-columns: minmax(0, 1fr) minmax(0, 1fr) minmax(270px, 0.9fr);
          gap: 12px;
          align-items: stretch;
        }
        .geo-analytics-grid > .Polaris-ShadowBevel,
        .geo-lower-grid > .Polaris-ShadowBevel {
          height: 100%;
        }
        .geo-panel {
          display: flex;
          flex-direction: column;
          min-width: 0;
          height: 100%;
        }
        .geo-panel-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          min-height: 48px;
          gap: 12px;
          padding: 12px 14px;
          border-bottom: 1px solid var(--p-color-border-secondary, #ebebeb);
        }
        .geo-panel-action {
          display: flex;
          align-items: center;
          flex: 0 0 auto;
        }
        .geo-panel-body {
          flex: 1;
          min-width: 0;
        }
        .geo-country-list {
          display: grid;
          gap: 0;
          padding: 4px 0;
        }
        .geo-country-row {
          display: grid;
          grid-template-columns: minmax(120px, 1fr) minmax(90px, 1.2fr) 48px;
          align-items: center;
          gap: 10px;
          min-height: 43px;
          padding: 6px 14px;
        }
        .geo-country-row + .geo-country-row {
          border-top: 1px solid var(--p-color-border-secondary, #f0f0f0);
        }
        .geo-country-name {
          display: flex;
          align-items: center;
          gap: 8px;
          min-width: 0;
        }
        .geo-country-name img {
          width: 22px;
          height: 15px;
          border-radius: 2px;
          object-fit: cover;
          box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.08);
        }
        .geo-country-name span {
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          font-size: 13px;
        }
        .geo-country-bar {
          height: 6px;
          overflow: hidden;
          border-radius: 999px;
          background: var(--p-color-bg-surface-secondary, #f1f1f1);
        }
        .geo-country-bar span {
          display: block;
          height: 100%;
          min-width: 2px;
          border-radius: inherit;
          background: #1769e0;
        }
        .geo-country-share {
          text-align: right;
          font-size: 12px;
          color: var(--p-color-text-secondary, #616161);
          font-variant-numeric: tabular-nums;
        }
        .geo-empty {
          display: grid;
          place-items: center;
          min-height: 180px;
          padding: 28px 16px;
          color: var(--p-color-text-secondary, #616161);
          text-align: center;
        }
        .geo-chart {
          display: grid;
          gap: 4px;
          padding: 10px 12px 6px;
          min-width: 0;
        }
        .geo-chart-legend {
          display: flex;
          align-items: center;
          gap: 16px;
          padding: 0 2px;
          font-size: 12px;
          color: var(--p-color-text-secondary, #616161);
        }
        .geo-chart-legend span {
          display: inline-flex;
          align-items: center;
          gap: 6px;
        }
        .geo-chart-legend i {
          width: 8px;
          height: 8px;
          border-radius: 50%;
        }
        .geo-chart-legend .is-blue {
          background: #1769e0;
        }
        .geo-chart-legend .is-orange {
          background: #ef6c00;
        }
        .geo-chart svg {
          display: block;
          width: 100%;
          height: auto;
          min-height: 210px;
          overflow: visible;
        }
        .geo-chart-grid {
          stroke: #e7e7e7;
          stroke-width: 1;
          stroke-dasharray: 3 3;
        }
        .geo-chart-axis {
          fill: #767676;
          font-size: 11px;
        }
        .geo-chart-line {
          fill: none;
          stroke-width: 2.5;
          stroke-linecap: round;
          stroke-linejoin: round;
        }
        .geo-chart-line.is-blue {
          stroke: #1769e0;
        }
        .geo-chart-line.is-orange {
          stroke: #ef6c00;
        }
        .geo-chart-dot {
          stroke: #ffffff;
          stroke-width: 2;
        }
        .geo-chart-dot.is-blue {
          fill: #1769e0;
        }
        .geo-chart-dot.is-orange {
          fill: #ef6c00;
        }
        .geo-list {
          display: grid;
        }
        .geo-list-row {
          display: grid;
          align-items: center;
          gap: 10px;
          min-height: 49px;
          padding: 7px 12px;
        }
        .geo-list-row + .geo-list-row {
          border-top: 1px solid var(--p-color-border-secondary, #eeeeee);
        }
        .geo-recent-row {
          grid-template-columns: 30px minmax(0, 1fr) auto auto;
        }
        .geo-rule-avatar {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 28px;
          height: 28px;
          border-radius: 7px;
          background: #e8f0ff;
          color: #1769e0;
        }
        .geo-rule-avatar.is-block {
          background: #fff0e6;
          color: #d85b00;
        }
        .geo-rule-avatar .Polaris-Icon {
          width: 16px;
          height: 16px;
        }
        .geo-rule-name {
          display: grid;
          gap: 1px;
          min-width: 0;
        }
        .geo-rule-name strong,
        .geo-rule-name span {
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .geo-rule-name strong {
          font-size: 13px;
          font-weight: 600;
        }
        .geo-rule-name span {
          font-size: 11px;
          color: var(--p-color-text-secondary, #616161);
        }
        .geo-rule-actions {
          min-width: 56px;
          text-align: right;
          font-size: 12px;
          font-variant-numeric: tabular-nums;
        }
        .geo-top-table {
          width: 100%;
          border-collapse: collapse;
          font-size: 12px;
        }
        .geo-top-table th,
        .geo-top-table td {
          padding: 9px 12px;
          border-bottom: 1px solid var(--p-color-border-secondary, #eeeeee);
          text-align: left;
          vertical-align: middle;
        }
        .geo-top-table th {
          color: var(--p-color-text-secondary, #616161);
          font-weight: 500;
          background: var(--p-color-bg-surface-secondary, #fafafa);
        }
        .geo-top-table th:last-child,
        .geo-top-table td:last-child {
          text-align: right;
        }
        .geo-top-table tbody tr:last-child td {
          border-bottom: 0;
        }
        .geo-top-rule-name {
          display: block;
          max-width: 160px;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          font-weight: 600;
        }
        .geo-quick-start {
          display: grid;
          padding: 5px 0;
        }
        .geo-quick-progress {
          width: 120px;
        }
        .geo-quick-step {
          display: grid;
          grid-template-columns: 20px minmax(0, 1fr);
          gap: 8px;
          padding: 7px 12px;
          color: inherit;
          font: inherit;
          text-decoration: none;
        }
        .geo-quick-step:hover {
          background: var(--p-color-bg-surface-hover, #f7f7f7);
        }
        .geo-quick-marker {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 18px;
          height: 18px;
          margin-top: 1px;
          border-radius: 50%;
          background: var(--p-color-bg-fill-secondary, #8a8a8a);
          color: #ffffff;
          font-size: 10px;
          font-weight: 700;
        }
        .geo-quick-marker.is-complete {
          background: var(--p-color-bg-fill-success, #29845a);
        }
        .geo-quick-marker .Polaris-Icon {
          width: 12px;
          height: 12px;
        }
        .geo-quick-marker .Polaris-Icon__Svg {
          fill: #ffffff;
        }
        .geo-quick-copy {
          display: grid;
          gap: 1px;
        }
        .geo-quick-copy strong {
          font-size: 12px;
          font-weight: 600;
        }
        .geo-quick-copy span {
          font-size: 11px;
          color: var(--p-color-text-secondary, #616161);
        }
        .geo-footer {
          display: grid;
          grid-template-columns: 1fr auto 1fr;
          align-items: center;
          gap: 18px;
          min-height: 64px;
          padding: 10px 14px;
        }
        .geo-footer-status,
        .geo-footer-help {
          display: flex;
          align-items: center;
          gap: 10px;
          min-width: 0;
        }
        .geo-footer-help {
          justify-content: flex-end;
        }
        .geo-footer-icon {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 34px;
          height: 34px;
          border-radius: 8px;
          background: #e6f5eb;
          color: #16834b;
        }
        .geo-footer-icon .Polaris-Icon {
          width: 20px;
          height: 20px;
        }
        .geo-footer-divider {
          width: 1px;
          height: 34px;
          background: var(--p-color-border-secondary, #e3e3e3);
        }
        .geo-footer-copy {
          display: grid;
          gap: 1px;
          min-width: 0;
        }
        .geo-footer-copy strong,
        .geo-footer-copy span {
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .geo-footer-copy strong {
          font-size: 12px;
        }
        .geo-footer-copy span {
          font-size: 11px;
          color: var(--p-color-text-secondary, #616161);
        }
        .geo-dashboard-pending {
          display: grid;
          gap: 12px;
        }
        .geo-skeleton {
          position: relative;
          overflow: hidden;
          border: 1px solid var(--p-color-border-secondary, #e3e3e3);
          border-radius: 10px;
          background: #f3f3f3;
        }
        .geo-skeleton::after {
          content: "";
          position: absolute;
          inset: 0;
          transform: translateX(-100%);
          background: linear-gradient(90deg, transparent, rgba(255,255,255,.75), transparent);
          animation: geo-shimmer 1.3s infinite;
        }
        .geo-skeleton-metric {
          min-height: 122px;
        }
        .geo-skeleton-panel {
          min-height: 310px;
        }
        @keyframes geo-shimmer {
          to { transform: translateX(100%); }
        }
        @media (max-width: 72em) {
          .geo-metrics-grid {
            grid-template-columns: repeat(2, minmax(0, 1fr));
          }
          .geo-lower-grid {
            grid-template-columns: repeat(2, minmax(0, 1fr));
          }
          .geo-lower-grid > :last-child {
            grid-column: 1 / -1;
          }
        }
        @media (max-width: 56em) {
          .geo-home-header {
            align-items: stretch;
            flex-direction: column;
          }
          .geo-home-actions {
            justify-content: flex-start;
          }
          .geo-home-search {
            flex: 1;
            width: auto;
          }
          .geo-analytics-grid {
            grid-template-columns: 1fr;
          }
          .geo-usage-strip {
            grid-template-columns: 1fr auto;
          }
          .geo-usage-progress {
            grid-column: 1 / -1;
            grid-row: 2;
          }
        }
        @media (max-width: 40em) {
          .geo-home {
            gap: 12px;
          }
          .geo-home-actions {
            display: grid;
            grid-template-columns: minmax(0, 1fr) auto auto;
          }
          .geo-home-search {
            min-width: 0;
          }
          .geo-metrics-grid,
          .geo-lower-grid {
            grid-template-columns: 1fr;
          }
          .geo-lower-grid > :last-child {
            grid-column: auto;
          }
          .geo-metric {
            min-height: 104px;
          }
          .geo-country-row {
            grid-template-columns: minmax(110px, 1fr) minmax(68px, 1fr) 42px;
            gap: 7px;
          }
          .geo-recent-row {
            grid-template-columns: 28px minmax(0, 1fr) auto;
          }
          .geo-recent-row .geo-rule-actions {
            display: none;
          }
          .geo-chart {
            overflow-x: auto;
          }
          .geo-chart svg {
            width: 620px;
          }
          .geo-footer {
            grid-template-columns: 1fr;
          }
          .geo-footer-divider {
            width: 100%;
            height: 1px;
          }
          .geo-footer-help {
            justify-content: space-between;
          }
        }
        @media (prefers-reduced-motion: reduce) {
          .geo-skeleton::after {
            animation: none;
          }
        }
      `}</style>

      <div className="geo-home">
        <header className="geo-home-header">
          <div className="geo-home-heading">
            <Text as="h1" variant="headingLg">Home</Text>
            <Text as="p" variant="bodySm" tone="subdued">
              Overview of your geolocation redirects, protection, and traffic.
            </Text>
          </div>
          <div className="geo-home-actions">
            <form className="geo-home-search" onSubmit={handleSearch}>
              <Icon source={SearchIcon} tone="subdued" />
              <input
                type="search"
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.currentTarget.value)}
                placeholder="Search visitors, IPs, rules..."
                aria-label="Search visitor logs"
              />
            </form>
            <Button
              variant="tertiary"
              icon={QuestionCircleIcon}
              url="/app/support"
              accessibilityLabel="Open support"
            />
            <Button variant="primary" icon={PlusIcon} url="/app/rules">
              Create rule
            </Button>
          </div>
        </header>

        <div className="geo-alerts">
          {!isAppActive && (
            <Banner
              tone="warning"
              action={{ content: "Open settings", url: "/app/settings" }}
            >
              The app is paused. Enable it so redirects, popups, and blocks can run.
            </Banner>
          )}
          {appEmbedStatus.state !== "enabled" && (
            <Banner
              tone="warning"
              action={{
                content: "Enable app embed",
                onAction: handleOpenThemeEditor,
              }}
            >
              The storefront app embed is not enabled in your live theme.
            </Banner>
          )}
          {(isNearLimit || isAtLimit) && (
            <Banner tone="warning" action={usageBannerAction}>
              {isAtLimit
                ? `You have reached the ${formatPlanLabel(planDisplayName || currentPlan)} plan limit.`
                : `You have used ${usagePercent}% of the ${formatPlanLabel(planDisplayName || currentPlan)} plan limit.`}
            </Banner>
          )}
        </div>

        <Suspense fallback={<DashboardPending />}>
          <Await
            resolve={analytics}
            errorElement={
              <Banner tone="warning">
                Traffic analytics could not be loaded. App status and usage are still available.
              </Banner>
            }
          >
            {({
              totals,
              topCountries,
              dailySeries,
              topRules,
              recentRules,
              totalCountries,
            }) => (
              <>
                <div className="geo-metrics-grid">
                  <MetricCard
                    icon={GlobeIcon}
                    tone="blue"
                    label="Active geolocation rules"
                    value={stats.activeRules.toLocaleString()}
                    detail={`${stats.totalRules.toLocaleString()} rules total`}
                    link={{ label: "View all rules", url: "/app/rules" }}
                  />
                  <MetricCard
                    icon={PersonIcon}
                    tone="green"
                    label="Visitors tracked"
                    value={totals.visitors.toLocaleString()}
                    detail={`Across ${totalCountries.toLocaleString()} countries in 30 days`}
                  />
                  <MetricCard
                    icon={ChartLineIcon}
                    tone="purple"
                    label="Redirects"
                    value={totals.redirects.toLocaleString()}
                    detail="Completed in the last 30 days"
                  />
                  <MetricCard
                    icon={ShieldCheckMarkIcon}
                    tone="orange"
                    label="Traffic blocked"
                    value={totals.blocked.toLocaleString()}
                    detail="Blocked visits in the last 30 days"
                  />
                </div>

                <Card padding="0">
                  <div className="geo-usage-strip">
                    <div className="geo-usage-title">
                      <Badge tone={isNearLimit ? "warning" : "success"}>
                        {formatPlanLabel(planDisplayName || currentPlan)}
                      </Badge>
                      <div>
                        <Text as="p" variant="bodySm" fontWeight="semibold">
                          Plan usage
                        </Text>
                        <Text as="p" variant="bodySm" tone="subdued">
                          {billingPeriodEndLabel
                            ? `Resets ${billingPeriodEndLabel}`
                            : "Current billing period"}
                        </Text>
                      </div>
                    </div>
                    <div className="geo-usage-progress">
                      <div className="geo-usage-numbers">
                        <span>
                          {currentUsage.toLocaleString()} / {isUnlimitedPlan
                            ? "Unlimited"
                            : planLimit.toLocaleString()} visitors
                        </span>
                        <span>{isUnlimitedPlan ? "Unlimited" : `${usagePercent}%`}</span>
                      </div>
                      <ProgressBar
                        progress={Math.min(100, usagePercent)}
                        tone={isAtLimit ? "highlight" : undefined}
                        size="small"
                      />
                    </div>
                    <Text as="p" variant="bodySm" tone={isNearLimit ? "caution" : "subdued"}>
                      {remainingVisitors === null
                        ? "No monthly limit"
                        : `${remainingVisitors.toLocaleString()} remaining`}
                    </Text>
                  </div>
                </Card>

                <div className="geo-analytics-grid">
                  <Panel
                    title="Traffic by country"
                    action={<Badge>{`${totalCountries} countries`}</Badge>}
                  >
                    {topCountries.length > 0 ? (
                      <div className="geo-country-list">
                        {topCountries.map((item) => (
                          <div className="geo-country-row" key={item.code}>
                            <div className="geo-country-name">
                              <img
                                src={`https://flagcdn.com/w40/${item.code.toLowerCase()}.png`}
                                srcSet={`https://flagcdn.com/w80/${item.code.toLowerCase()}.png 2x`}
                                width="22"
                                height="15"
                                alt=""
                                loading="lazy"
                                decoding="async"
                              />
                              <span>{item.country}</span>
                            </div>
                            <div className="geo-country-bar" aria-hidden="true">
                              <span style={{ width: `${Math.max(2, item.share)}%` }} />
                            </div>
                            <span className="geo-country-share">{item.share}%</span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="geo-empty">No country traffic yet</div>
                    )}
                  </Panel>

                  <Panel
                    title="Redirects vs blocked visits"
                    action={<Badge>Last 7 days</Badge>}
                  >
                    <TrafficChart points={dailySeries} />
                  </Panel>
                </div>

                <div className="geo-lower-grid">
                  <Panel
                    title="Recent rules"
                    action={
                      <Button variant="plain" size="slim" url="/app/rules">
                        View all
                      </Button>
                    }
                  >
                    {recentRules.length > 0 ? (
                      <div className="geo-list">
                        {recentRules.map((rule) => {
                          const isBlock = rule.ruleType === "block";
                          const target =
                            rule.matchType === "ip"
                              ? rule.ipAddresses
                              : rule.matchType === "state"
                                ? rule.stateCodes
                                : rule.countryCodes;

                          return (
                            <div className="geo-list-row geo-recent-row" key={rule.id}>
                              <span
                                className={`geo-rule-avatar${isBlock ? " is-block" : ""}`}
                                aria-hidden="true"
                              >
                                <Icon source={isBlock ? ShieldCheckMarkIcon : GlobeIcon} />
                              </span>
                              <div className="geo-rule-name">
                                <strong>{rule.name}</strong>
                                <span>
                                  {isBlock
                                    ? "Blocks targeted traffic"
                                    : rule.redirectMode === "auto_redirect"
                                      ? "Automatic redirect"
                                      : "Redirect popup"}
                                  {target ? ` · ${target}` : ""}
                                </span>
                              </div>
                              <Badge tone={rule.isActive ? "success" : "attention"}>
                                {rule.isActive ? "Active" : "Inactive"}
                              </Badge>
                              <span className="geo-rule-actions">
                                {rule.actions.toLocaleString()}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="geo-empty">No rules created yet</div>
                    )}
                  </Panel>

                  <Panel
                    title="Top rules by performance"
                    action={<Badge>Last 30 days</Badge>}
                  >
                    {topRules.length > 0 ? (
                      <table className="geo-top-table">
                        <thead>
                          <tr>
                            <th>Rule</th>
                            <th>Type</th>
                            <th>Actions</th>
                          </tr>
                        </thead>
                        <tbody>
                          {topRules.map((rule) => (
                            <tr key={rule.id}>
                              <td>
                                <span className="geo-top-rule-name">{rule.name}</span>
                              </td>
                              <td>
                                <Badge tone={rule.type === "Block" ? "attention" : "info"}>
                                  {rule.type}
                                </Badge>
                              </td>
                              <td>
                                {rule.actions.toLocaleString()}
                                <span style={{ color: "#767676", marginLeft: 5 }}>
                                  {rule.share}%
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    ) : (
                      <div className="geo-empty">No rule performance data yet</div>
                    )}
                  </Panel>

                  <Panel
                    title="Quick start"
                    action={
                      <div className="geo-quick-progress">
                        <ProgressBar
                          progress={(completedQuickSteps / quickSteps.length) * 100}
                          size="small"
                        />
                      </div>
                    }
                  >
                    <div className="geo-quick-start">
                      {quickSteps.map((step, index) => {
                        const content = (
                          <>
                            <span
                              className={`geo-quick-marker${step.completed ? " is-complete" : ""}`}
                              aria-hidden="true"
                            >
                              {step.completed ? (
                                <Icon source={CheckCircleIcon} />
                              ) : (
                                index + 1
                              )}
                            </span>
                            <span className="geo-quick-copy">
                              <strong>{step.label}</strong>
                              <span>{step.detail}</span>
                            </span>
                          </>
                        );

                        if (step.completed) {
                          return (
                            <div className="geo-quick-step" key={step.label}>
                              {content}
                            </div>
                          );
                        }

                        if (!step.url) {
                          return (
                            <button
                              type="button"
                              className="geo-quick-step"
                              key={step.label}
                              onClick={handleOpenThemeEditor}
                              style={{ border: 0, background: "transparent", textAlign: "left", width: "100%", cursor: "pointer" }}
                            >
                              {content}
                            </button>
                          );
                        }

                        return (
                          <Link className="geo-quick-step" to={step.url} key={step.label}>
                            {content}
                          </Link>
                        );
                      })}
                    </div>
                  </Panel>
                </div>
              </>
            )}
          </Await>
        </Suspense>

        <Card padding="0">
          <footer className="geo-footer">
            <div className="geo-footer-status">
              <span className="geo-footer-icon" aria-hidden="true">
                <Icon source={ShieldCheckMarkIcon} />
              </span>
              <span className="geo-footer-copy">
                <strong>
                  {isAppActive && appEmbedStatus.state === "enabled"
                    ? "Your store is protected"
                    : "Storefront protection needs attention"}
                </strong>
                <span>
                  {isAppActive && appEmbedStatus.state === "enabled"
                    ? "Geo: Redirect is active on your live storefront."
                    : "Complete Quick start to activate storefront protection."}
                </span>
              </span>
            </div>
            <span className="geo-footer-divider" aria-hidden="true" />
            <div className="geo-footer-help">
              <span className="geo-footer-copy">
                <strong>Need help?</strong>
                <span>Our support team is here for you.</span>
              </span>
              <Button icon={SettingsIcon} url="/app/support">
                Contact support
              </Button>
            </div>
          </footer>
        </Card>
      </div>
    </Page>
  );
}

import { lazy, Suspense, useMemo, useState } from "react";
import type { CSSProperties } from "react";
import type { LoaderFunctionArgs } from "react-router";
import {
  data as responseData,
  useLoaderData,
  useNavigate,
  useNavigation,
  useSearchParams,
} from "react-router";
import {
  Badge,
  Button,
  Card,
  Icon,
  Page,
  Select,
  Text,
  TextField,
} from "@shopify/polaris";
import {
  ChatIcon,
  ChartLineIcon,
  ExportIcon,
  GlobeIcon,
  PersonIcon,
  PlusIcon,
  SearchIcon,
  ShieldCheckMarkIcon,
} from "@shopify/polaris-icons";
import { TitleBar } from "@shopify/app-bridge-react";

import prisma from "../db.server";
import { authenticate } from "../shopify.server";
import { COUNTRY_MAP } from "../utils/countries";
import { createExpiringAsyncCache } from "../utils/expiring-async-cache.server";
import { shopifyBoundaryHeaders } from "../utils/shopify-boundary.server";
import { SimpleLoadingSkeleton } from "../components/simple-loading-skeleton";

export { shopifyBoundaryHeaders as headers };

const AnalyticsTrendChart = lazy(() =>
  import("../components/analytics-dashboard-charts").then((module) => ({
    default: module.AnalyticsTrendChart,
  })),
);
const AnalyticsBreakdownChart = lazy(() =>
  import("../components/analytics-dashboard-charts").then((module) => ({
    default: module.AnalyticsBreakdownChart,
  })),
);

const analyticsCache = createExpiringAsyncCache<
  Awaited<ReturnType<typeof loadAnalytics>>
>();

function normalizePeriod(value: string | null): 7 | 30 {
  return value === "7" ? 7 : 30;
}

function getPeriodStart(days: number) {
  const start = new Date();
  start.setUTCHours(0, 0, 0, 0);
  start.setUTCDate(start.getUTCDate() - (days - 1));
  return start;
}

function dateKey(date: Date) {
  return date.toISOString().slice(0, 10);
}

function buildPeriodDates(days: 7 | 30) {
  const start = getPeriodStart(days);

  return Array.from({ length: days }, (_, index) => {
    const date = new Date(start);
    date.setUTCDate(start.getUTCDate() + index);
    return date;
  });
}

async function loadAnalytics(shop: string, days: 7 | 30) {
  const periodStart = getPeriodStart(days);
  const previousPeriodStart = getPeriodStart(days * 2);
  const [countryStats, ruleStats, dailyStats, rules, activityLogs] =
    await Promise.all([
    prisma.analyticsCountry.groupBy({
      by: ["countryCode"],
      where: {
        shop,
        date: { gte: periodStart },
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
        date: { gte: periodStart },
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
        date: { gte: previousPeriodStart },
      },
      _sum: {
        visitors: true,
        popupShown: true,
        redirected: true,
        blocked: true,
      },
      orderBy: { date: "asc" },
    }),
    prisma.redirectRule.findMany({
      where: { shop },
      select: {
        id: true,
        name: true,
        ruleType: true,
        redirectMode: true,
      },
    }),
    prisma.$queryRaw<
      Array<{ day: number; hour: number; count: bigint }>
    >`
      SELECT
        (EXTRACT(ISODOW FROM "timestamp")::int - 1) AS "day",
        EXTRACT(HOUR FROM "timestamp")::int AS "hour",
        COUNT(*)::bigint AS "count"
      FROM "VisitorLog"
      WHERE "shop" = ${shop}
        AND "timestamp" >= ${periodStart}
      GROUP BY 1, 2
    `,
  ]);

  const ruleDetails = new Map(rules.map((rule) => [rule.id, rule]));

  const countries = countryStats.map((item) => ({
    id: item.countryCode,
    code: item.countryCode,
    country: COUNTRY_MAP[item.countryCode] || item.countryCode,
    visitors: item._sum.visitors || 0,
    popup: item._sum.popupShown || 0,
    redirected: item._sum.redirected || 0,
    blocked: item._sum.blocked || 0,
  }));

  const popupRules = ruleStats
    .map((item) => ({
      id: item.ruleId,
      rule: item.ruleName || "Unknown rule",
      seen: item._sum.seen || 0,
      clickedYes: item._sum.clickedYes || 0,
      clickedNo: item._sum.clickedNo || 0,
      dismissed: item._sum.dismissed || 0,
    }))
    .filter(
      (item) =>
        item.seen > 0 ||
        item.clickedYes > 0 ||
        item.clickedNo > 0 ||
        item.dismissed > 0,
    )
    .sort((left, right) => right.seen - left.seen);

  const instantRedirects = ruleStats
    .map((item) => ({
      id: item.ruleId,
      rule: item.ruleName || "Unknown rule",
      redirected: item._sum.autoRedirected || 0,
    }))
    .filter((item) => item.redirected > 0)
    .sort((left, right) => right.redirected - left.redirected);

  const rulePerformance = ruleStats
    .map((item) => {
      const details = ruleDetails.get(item.ruleId);
      const redirects =
        (item._sum.clickedYes || 0) + (item._sum.autoRedirected || 0);
      const blocked = item._sum.blocked || 0;
      const actions = redirects + blocked;
      const triggers = item._sum.seen || actions;
      const type =
        details?.ruleType === "block" || blocked > redirects
          ? "Block"
          : "Redirect";

      return {
        id: item.ruleId,
        rule: details?.name || item.ruleName || "Unknown rule",
        type,
        method: details?.redirectMode || "popup",
        triggers,
        actions,
        rate: triggers > 0 ? Math.min(100, (actions / triggers) * 100) : 0,
      };
    })
    .filter((item) => item.triggers > 0 || item.actions > 0)
    .sort((left, right) => right.actions - left.actions);

  const blockedCountries = countries
    .filter((item) => item.blocked > 0)
    .sort((left, right) => right.blocked - left.blocked);

  const totals = countries.reduce(
    (result, item) => ({
      visitors: result.visitors + item.visitors,
      popup: result.popup + item.popup,
      redirected: result.redirected + item.redirected,
      blocked: result.blocked + item.blocked,
    }),
    { visitors: 0, popup: 0, redirected: 0, blocked: 0 },
  );

  const previousTotals = dailyStats
    .filter((item) => item.date < periodStart)
    .reduce(
      (result, item) => ({
        visitors: result.visitors + (item._sum.visitors || 0),
        popup: result.popup + (item._sum.popupShown || 0),
        redirected: result.redirected + (item._sum.redirected || 0),
        blocked: result.blocked + (item._sum.blocked || 0),
      }),
      { visitors: 0, popup: 0, redirected: 0, blocked: 0 },
    );

  const currentDailyStats = new Map(
    dailyStats
      .filter((item) => item.date >= periodStart)
      .map((item) => [
        dateKey(item.date),
        {
          visitors: item._sum.visitors || 0,
          redirects: item._sum.redirected || 0,
          blocked: item._sum.blocked || 0,
        },
      ]),
  );
  const dailySeries = buildPeriodDates(days).map((date) => ({
    date: dateKey(date),
    ...(currentDailyStats.get(dateKey(date)) || {
      visitors: 0,
      redirects: 0,
      blocked: 0,
    }),
  }));

  const declined = ruleStats.reduce(
    (sum, item) =>
      sum + (item._sum.clickedNo || 0) + (item._sum.dismissed || 0),
    0,
  );
  const actionBreakdown = [
    { name: "Popup shown", value: totals.popup, color: "#16a3b6" },
    { name: "Redirected", value: totals.redirected, color: "#7c3aed" },
    { name: "Blocked", value: totals.blocked, color: "#f97316" },
    { name: "Declined", value: declined, color: "#2563eb" },
  ].filter((item) => item.value > 0);

  const hourlyActivity = Array.from({ length: 7 }, () =>
    Array.from({ length: 24 }, () => 0),
  );
  for (const item of activityLogs) {
    const day = Number(item.day);
    const hour = Number(item.hour);
    if (day < 0 || day > 6 || hour < 0 || hour > 23) continue;
    hourlyActivity[day][hour] = Number(item.count);
  }

  return {
    countries,
    popupRules,
    instantRedirects,
    blockedCountries,
    rulePerformance,
    dailySeries,
    actionBreakdown,
    hourlyActivity,
    totals,
    previousTotals,
  };
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const startedAt = performance.now();
  const { session } = await authenticate.admin(request);
  const url = new URL(request.url);
  const period = normalizePeriod(url.searchParams.get("period"));
  const analytics = await analyticsCache.get(
    `${session.shop}:${period}`,
    () => loadAnalytics(session.shop, period),
    10_000,
  );

  return responseData(
    {
      period,
      ...analytics,
    },
    {
      headers: {
        "Server-Timing": `geo-analytics;dur=${(
          performance.now() - startedAt
        ).toFixed(1)}`,
      },
    },
  );
};

type MetricProps = {
  icon: typeof GlobeIcon;
  tone: "blue" | "green" | "purple" | "orange";
  label: string;
  value: number | string;
  detail: string;
};

function Metric({ icon, tone, label, value, detail }: MetricProps) {
  return (
    <Card>
      <div className="analytics-metric">
        <span className={`analytics-metric-icon is-${tone}`}>
          <Icon source={icon} />
        </span>
        <div className="analytics-metric-copy">
          <Text as="span" variant="bodySm" tone="subdued">
            {label}
          </Text>
          <Text as="strong" variant="headingXl">
            {typeof value === "number" ? value.toLocaleString() : value}
          </Text>
          <Text as="span" variant="bodySm" tone="subdued">
            {detail}
          </Text>
        </div>
      </div>
    </Card>
  );
}

function CountryIdentity({
  code,
  country,
}: {
  code: string;
  country: string;
}) {
  return (
    <div className="analytics-entity">
      {code.length === 2 ? (
        <img
          src={`https://flagcdn.com/w40/${code.toLowerCase()}.png`}
          srcSet={`https://flagcdn.com/w80/${code.toLowerCase()}.png 2x`}
          width="22"
          height="15"
          alt=""
          loading="lazy"
          decoding="async"
        />
      ) : (
        <span className="analytics-country-fallback" aria-hidden="true">
          <Icon source={GlobeIcon} />
        </span>
      )}
      <span>{country}</span>
    </div>
  );
}

function EmptyTableRow({
  colSpan,
  children,
}: {
  colSpan: number;
  children: string;
}) {
  return (
    <tr>
      <td colSpan={colSpan}>
        <div className="analytics-empty">{children}</div>
      </td>
    </tr>
  );
}

function formatComparison(current: number, previous: number) {
  if (previous <= 0) {
    return current > 0 ? "New activity" : "No change";
  }

  const change = ((current - previous) / previous) * 100;
  const sign = change > 0 ? "+" : "";
  return `${sign}${change.toFixed(1)}% vs previous period`;
}

function downloadCsv(
  countries: Array<{
    country: string;
    code: string;
    visitors: number;
    popup: number;
    redirected: number;
    blocked: number;
  }>,
  period: number,
) {
  const escapeCell = (value: string | number) =>
    `"${String(value).replaceAll('"', '""')}"`;
  const rows = [
    ["Country", "Code", "Visits", "Popup", "Redirected", "Blocked"],
    ...countries.map((item) => [
      item.country,
      item.code,
      item.visitors,
      item.popup,
      item.redirected,
      item.blocked,
    ]),
  ];
  const csv = rows
    .map((row) => row.map((cell) => escapeCell(cell)).join(","))
    .join("\r\n");
  const url = URL.createObjectURL(
    new Blob([csv], { type: "text/csv;charset=utf-8" }),
  );
  const link = document.createElement("a");
  link.href = url;
  link.download = `geo-analytics-${period}-days.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

export default function AnalyticsPage() {
  const {
    period,
    countries,
    popupRules,
    instantRedirects,
    blockedCountries,
    rulePerformance,
    dailySeries,
    actionBreakdown,
    hourlyActivity,
    totals,
    previousTotals,
  } = useLoaderData<typeof loader>();
  const navigate = useNavigate();
  const navigation = useNavigation();
  const [searchParams, setSearchParams] = useSearchParams();
  const [searchQuery, setSearchQuery] = useState("");
  const [countryFilter, setCountryFilter] = useState("all");
  const [ruleTypeFilter, setRuleTypeFilter] = useState("all");
  const isUpdating =
    navigation.state !== "idle" &&
    navigation.location?.pathname === "/app/analytics";
  const normalizedQuery = searchQuery.trim().toLocaleLowerCase();

  const filteredCountries = useMemo(
    () =>
      countries.filter(
        (item) =>
          (countryFilter === "all" || item.code === countryFilter) &&
          (!normalizedQuery ||
            item.country.toLocaleLowerCase().includes(normalizedQuery) ||
            item.code.toLocaleLowerCase().includes(normalizedQuery)),
      ),
    [countries, countryFilter, normalizedQuery],
  );
  const filteredRules = useMemo(
    () =>
      rulePerformance.filter(
        (item) =>
          (ruleTypeFilter === "all" ||
            item.type.toLocaleLowerCase() === ruleTypeFilter) &&
          (!normalizedQuery ||
            item.rule.toLocaleLowerCase().includes(normalizedQuery)),
      ),
    [normalizedQuery, rulePerformance, ruleTypeFilter],
  );
  const filteredBlockedCountries = useMemo(
    () =>
      ruleTypeFilter === "redirect"
        ? []
        : blockedCountries.filter(
            (item) =>
              (countryFilter === "all" || item.code === countryFilter) &&
              (!normalizedQuery ||
                item.country.toLocaleLowerCase().includes(normalizedQuery) ||
                item.code.toLocaleLowerCase().includes(normalizedQuery)),
          ),
    [blockedCountries, countryFilter, normalizedQuery, ruleTypeFilter],
  );
  const filteredInstantRedirects = useMemo(
    () =>
      ruleTypeFilter === "block"
        ? []
        : instantRedirects.filter(
            (item) =>
              !normalizedQuery ||
              item.rule.toLocaleLowerCase().includes(normalizedQuery),
          ),
    [instantRedirects, normalizedQuery, ruleTypeFilter],
  );
  const filteredPopupRules = useMemo(
    () =>
      ruleTypeFilter === "block"
        ? []
        : popupRules.filter(
            (item) =>
              !normalizedQuery ||
              item.rule.toLocaleLowerCase().includes(normalizedQuery),
          ),
    [normalizedQuery, popupRules, ruleTypeFilter],
  );
  const topCountries = filteredCountries.slice(0, 5);
  const topRules = filteredRules.slice(0, 5);
  const totalInstantRedirects = filteredInstantRedirects.reduce(
    (sum, item) => sum + item.redirected,
    0,
  );
  const totalPopupSeen = filteredPopupRules.reduce(
    (sum, item) => sum + item.seen,
    0,
  );
  const totalActions = actionBreakdown.reduce(
    (sum, item) => sum + item.value,
    0,
  );
  const conversionRate =
    totals.visitors > 0 ? (totals.redirected / totals.visitors) * 100 : 0;
  const previousConversionRate =
    previousTotals.visitors > 0
      ? (previousTotals.redirected / previousTotals.visitors) * 100
      : 0;
  const maxHourlyActivity = Math.max(
    1,
    ...hourlyActivity.flatMap((row) => row),
  );
  const busiestCountry = countries[0] || null;
  const topRule = rulePerformance[0] || null;
  const blockedChange =
    previousTotals.blocked > 0
      ? ((totals.blocked - previousTotals.blocked) /
          previousTotals.blocked) *
        100
      : 0;

  const handlePeriodChange = (value: string) => {
    const nextParams = new URLSearchParams(searchParams);
    nextParams.set("period", value);
    setSearchParams(nextParams);
  };

  const countryOptions = [
    { label: "All countries", value: "all" },
    ...countries.map((item) => ({
      label: item.country,
      value: item.code,
    })),
  ];

  return (
    <Page fullWidth>
      <TitleBar title="Analytics" />
      <style>
        {`
          .analytics-v2,
          .analytics-v2 * {
            box-sizing: border-box;
          }
          .analytics-v2 {
            display: grid;
            gap: 12px;
            padding: 4px 0 32px;
          }
          .analytics-v2-header {
            display: flex;
            align-items: flex-end;
            justify-content: space-between;
            gap: 20px;
          }
          .analytics-v2-heading {
            display: grid;
            min-width: 0;
            gap: 3px;
          }
          .analytics-v2-actions {
            display: flex;
            align-items: center;
            justify-content: flex-end;
            gap: 8px;
          }
          .analytics-v2-search {
            width: min(330px, 34vw);
          }
          .analytics-v2-filters {
            display: flex;
            align-items: flex-end;
            gap: 10px;
            padding: 10px;
            border: 1px solid var(--p-color-border-secondary, #e3e3e3);
            border-radius: 12px;
            background: var(--p-color-bg-surface, #fff);
          }
          .analytics-v2-filter {
            width: 170px;
          }
          .analytics-v2-filter.is-country {
            width: 210px;
          }
          .analytics-v2-export {
            margin-left: auto;
          }
          .analytics-v2-metrics {
            display: grid;
            grid-template-columns: repeat(4, minmax(0, 1fr));
            gap: 10px;
          }
          .analytics-v2-metrics > .Polaris-ShadowBevel {
            height: 100%;
          }
          .analytics-v2 .analytics-metric {
            display: flex;
            align-items: flex-start;
            gap: 12px;
            min-height: 92px;
          }
          .analytics-v2 .analytics-metric-icon {
            display: grid;
            flex: 0 0 40px;
            width: 40px;
            height: 40px;
            place-items: center;
            border-radius: 12px;
          }
          .analytics-v2 .analytics-metric-icon .Polaris-Icon {
            width: 20px;
            height: 20px;
          }
          .analytics-v2 .analytics-metric-icon.is-blue {
            color: #005bd3;
            background: #eaf3ff;
          }
          .analytics-v2 .analytics-metric-icon.is-green {
            color: #0c6b3e;
            background: #e8f7ee;
          }
          .analytics-v2 .analytics-metric-icon.is-purple {
            color: #6d3fd1;
            background: #f1ebff;
          }
          .analytics-v2 .analytics-metric-icon.is-orange {
            color: #b35300;
            background: #fff1e6;
          }
          .analytics-v2 .analytics-metric-copy {
            display: grid;
            min-width: 0;
            gap: 2px;
          }
          .analytics-v2 .analytics-metric-copy strong {
            font-variant-numeric: tabular-nums;
          }
          .analytics-v2-chart-grid {
            display: grid;
            grid-template-columns: minmax(0, 1.45fr) minmax(330px, 0.85fr);
            gap: 12px;
          }
          .analytics-v2-chart-grid > .Polaris-ShadowBevel,
          .analytics-v2-detail-grid > .Polaris-ShadowBevel {
            height: 100%;
          }
          .analytics-v2-panel {
            display: flex;
            height: 100%;
            min-height: 0;
            flex-direction: column;
          }
          .analytics-v2-panel-header {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 12px;
            min-height: 48px;
            padding: 10px 12px;
            border-bottom: 1px solid var(--p-color-border-secondary, #e3e3e3);
          }
          .analytics-v2-panel-title {
            display: flex;
            align-items: center;
            gap: 6px;
          }
          .analytics-v2-info {
            display: inline-grid;
            width: 15px;
            height: 15px;
            place-items: center;
            border: 1px solid var(--p-color-border, #c9cccf);
            border-radius: 50%;
            color: var(--p-color-text-secondary, #616161);
            font-size: 10px;
            line-height: 1;
          }
          .analytics-v2-chart {
            height: 290px;
            min-height: 0;
            padding: 6px 8px 4px;
          }
          .analytics-v2-chart--trend {
            padding: 22px 24px 18px;
          }
          .analytics-v2-chart--donut {
            display: flex;
            align-items: center;
          }
          .analytics-v2-donut {
            width: 100%;
            height: 210px;
          }
          .analytics-v2-detail-grid {
            display: grid;
            grid-template-columns:
              minmax(240px, 0.8fr)
              minmax(360px, 1.2fr)
              minmax(280px, 0.8fr);
            align-items: stretch;
            gap: 12px;
          }
          .analytics-v2-table-wrap {
            width: 100%;
            min-height: 0;
            overflow: auto;
          }
          .analytics-v2-table-wrap.is-full {
            max-height: 360px;
            scrollbar-width: thin;
            scrollbar-color: #c7c7c7 transparent;
          }
          .analytics-v2-table-wrap.is-full::-webkit-scrollbar {
            width: 8px;
            height: 8px;
          }
          .analytics-v2-table-wrap.is-full::-webkit-scrollbar-track {
            background: transparent;
          }
          .analytics-v2-table-wrap.is-full::-webkit-scrollbar-thumb {
            border: 2px solid transparent;
            border-radius: 999px;
            background: #c7c7c7;
            background-clip: padding-box;
          }
          .analytics-v2-table-wrap.is-full::-webkit-scrollbar-thumb:hover {
            background: #9e9e9e;
            background-clip: padding-box;
          }
          .analytics-v2-table-wrap.is-full::-webkit-scrollbar-corner {
            background: transparent;
          }
          .analytics-v2-table-wrap.is-full .analytics-v2-table th {
            position: sticky;
            z-index: 1;
            top: 0;
          }
          .analytics-v2-table {
            width: 100%;
            border-collapse: collapse;
            color: var(--p-color-text, #303030);
            font-size: 12px;
          }
          .analytics-v2-table th,
          .analytics-v2-table td {
            height: 38px;
            padding: 7px 10px;
            border-bottom: 1px solid var(--p-color-border-secondary, #e3e3e3);
            text-align: left;
            white-space: nowrap;
          }
          .analytics-v2-table th {
            color: var(--p-color-text-secondary, #616161);
            background: var(--p-color-bg-surface-secondary, #f7f7f7);
            font-size: 11px;
            font-weight: 600;
          }
          .analytics-v2-table tbody tr:last-child td {
            border-bottom: 0;
          }
          .analytics-v2-data-grid {
            display: grid;
            grid-template-columns: minmax(0, 1.8fr) minmax(280px, 0.7fr);
            gap: 12px;
          }
          .analytics-v2-data-grid > :nth-child(1) {
            grid-column: 1;
            grid-row: 1;
          }
          .analytics-v2-data-grid > :nth-child(2) {
            grid-column: 2;
            grid-row: 1;
          }
          .analytics-v2-data-grid > :nth-child(3) {
            grid-column: 2;
            grid-row: 2;
          }
          .analytics-v2-data-grid > :nth-child(4) {
            grid-column: 1;
            grid-row: 2;
          }
          .analytics-v2 .analytics-v2-data-grid .analytics-empty {
            min-height: 80px;
          }
          .analytics-v2 .analytics-empty {
            display: grid;
            width: 100%;
            min-height: 180px;
            place-items: center;
            color: var(--p-color-text-secondary, #616161);
          }
          .analytics-v2-table .is-number {
            text-align: right;
            font-variant-numeric: tabular-nums;
          }
          .analytics-v2-entity,
          .analytics-v2 .analytics-entity {
            display: flex;
            min-width: 0;
            align-items: center;
            gap: 8px;
          }
          .analytics-v2-entity img,
          .analytics-v2 .analytics-entity img {
            flex: 0 0 auto;
            border-radius: 2px;
            object-fit: cover;
          }
          .analytics-v2 .analytics-country-fallback {
            display: inline-flex;
            width: 22px;
            flex: 0 0 22px;
            color: var(--p-color-icon-secondary, #8a8a8a);
          }
          .analytics-v2 .analytics-country-fallback .Polaris-Icon {
            width: 16px;
            height: 16px;
          }
          .analytics-v2-rule-type {
            display: inline-flex;
            padding: 2px 7px;
            border-radius: 999px;
            color: #00527c;
            background: #d9efff;
            font-size: 11px;
          }
          .analytics-v2-rule-type.is-block {
            color: #8e1f0b;
            background: #ffe5df;
          }
          .analytics-v2-insights {
            display: grid;
          }
          .analytics-v2-insight {
            display: grid;
            grid-template-columns: 28px minmax(0, 1fr);
            gap: 9px;
            padding: 12px;
            border-bottom: 1px solid var(--p-color-border-secondary, #e3e3e3);
          }
          .analytics-v2-insight:last-child {
            border-bottom: 0;
          }
          .analytics-v2-insight-icon {
            display: grid;
            width: 28px;
            height: 28px;
            place-items: center;
            border-radius: 50%;
            color: #005bd3;
            background: #eaf3ff;
          }
          .analytics-v2-insight-icon.is-green {
            color: #0c6b3e;
            background: #e8f7ee;
          }
          .analytics-v2-insight-icon.is-orange {
            color: #b35300;
            background: #fff1e6;
          }
          .analytics-v2-insight-icon .Polaris-Icon {
            width: 15px;
            height: 15px;
          }
          .analytics-v2-insight-copy {
            display: grid;
            gap: 2px;
          }
          .analytics-v2-heatmap {
            display: grid;
            grid-template-columns: 28px repeat(24, minmax(8px, 1fr));
            gap: 3px;
            padding: 12px;
            overflow-x: auto;
          }
          .analytics-v2-heatmap-hours {
            display: contents;
          }
          .analytics-v2-hour {
            color: var(--p-color-text-secondary, #616161);
            font-size: 10px;
            text-align: center;
          }
          .analytics-v2-day {
            display: flex;
            align-items: center;
            color: var(--p-color-text-secondary, #616161);
            font-size: 10px;
          }
          .analytics-v2-heat-cell {
            min-width: 10px;
            height: 13px;
            border-radius: 2px;
            background: color-mix(
              in srgb,
              #1769e0 var(--heat),
              #edf3ff
            );
          }
          .analytics-v2-heat-legend {
            display: flex;
            align-items: center;
            gap: 8px;
            padding: 0 12px 12px;
            color: var(--p-color-text-secondary, #616161);
            font-size: 11px;
          }
          .analytics-v2-heat-gradient {
            width: 120px;
            height: 7px;
            border-radius: 999px;
            background: linear-gradient(90deg, #edf3ff, #1769e0);
          }
          .analytics-v2-footer {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 16px;
            min-height: 58px;
            padding: 10px 12px;
            border: 1px solid var(--p-color-border-secondary, #e3e3e3);
            border-radius: 12px;
            background: var(--p-color-bg-surface, #fff);
          }
          .analytics-v2-footer-copy {
            display: flex;
            align-items: center;
            gap: 9px;
          }
          .analytics-v2-footer-icon {
            display: grid;
            width: 32px;
            height: 32px;
            place-items: center;
            border-radius: 9px;
            color: #0c6b3e;
            background: #e8f7ee;
          }
          .analytics-v2-footer-icon .Polaris-Icon {
            width: 17px;
            height: 17px;
          }
          .analytics-v2.is-updating {
            cursor: progress;
          }
          .analytics-v2.is-updating .analytics-v2-filters {
            opacity: 0.7;
          }
          @media (max-width: 72em) {
            .analytics-v2-metrics {
              grid-template-columns: repeat(2, minmax(0, 1fr));
            }
            .analytics-v2-detail-grid {
              grid-template-columns: repeat(2, minmax(0, 1fr));
            }
            .analytics-v2-detail-grid > :last-child {
              grid-column: 1 / -1;
            }
          }
          @media (max-width: 56em) {
            .analytics-v2-header {
              align-items: stretch;
              flex-direction: column;
            }
            .analytics-v2-actions {
              justify-content: flex-start;
            }
            .analytics-v2-search {
              width: min(100%, 420px);
              flex: 1;
            }
            .analytics-v2-filters {
              flex-wrap: wrap;
            }
            .analytics-v2-export {
              margin-left: 0;
            }
            .analytics-v2-chart-grid,
            .analytics-v2-detail-grid,
            .analytics-v2-data-grid {
              grid-template-columns: 1fr;
            }
            .analytics-v2-data-grid > :nth-child(n) {
              grid-column: auto;
              grid-row: auto;
            }
            .analytics-v2-detail-grid > :last-child {
              grid-column: auto;
            }
          }
          @media (max-width: 47.9975em) {
            .analytics-v2 {
              gap: 10px;
            }
            .analytics-v2-actions {
              align-items: stretch;
              flex-wrap: wrap;
            }
            .analytics-v2-search {
              flex-basis: 100%;
            }
            .analytics-v2-filters {
              display: grid;
              grid-template-columns: repeat(2, minmax(0, 1fr));
            }
            .analytics-v2-filter,
            .analytics-v2-filter.is-country {
              width: auto;
            }
            .analytics-v2-export {
              grid-column: 1 / -1;
            }
            .analytics-v2-metrics {
              grid-template-columns: 1fr;
            }
            .analytics-v2-chart {
              height: 260px;
            }
            .analytics-v2-footer {
              align-items: flex-start;
              flex-direction: column;
            }
          }
        `}
      </style>

      <div className={`analytics-v2${isUpdating ? " is-updating" : ""}`}>
        <header className="analytics-v2-header">
          <div className="analytics-v2-heading">
            <Text as="h1" variant="headingLg">
              Analytics
            </Text>
            <Text as="p" variant="bodySm" tone="subdued">
              Monitor traffic, redirects, blocked visits, and rule performance.
            </Text>
          </div>
          <div className="analytics-v2-actions">
            <div className="analytics-v2-search">
              <TextField
                label="Search analytics"
                labelHidden
                prefix={<Icon source={SearchIcon} />}
                placeholder="Search countries or rules..."
                value={searchQuery}
                onChange={setSearchQuery}
                autoComplete="off"
                clearButton
                onClearButtonClick={() => setSearchQuery("")}
              />
            </div>
            <Button
              icon={ShieldCheckMarkIcon}
              onClick={() => navigate("/app/order-risk")}
            >
              Order risk
            </Button>
            <Button
              variant="primary"
              icon={PlusIcon}
              onClick={() => navigate("/app/rules")}
            >
              Create rule
            </Button>
          </div>
        </header>

        <div className="analytics-v2-filters">
          <div className="analytics-v2-filter">
            <Select
              label="Date range"
              value={String(period)}
              options={[
                { label: "Last 7 days", value: "7" },
                { label: "Last 30 days", value: "30" },
              ]}
              onChange={handlePeriodChange}
              disabled={isUpdating}
            />
          </div>
          <div className="analytics-v2-filter is-country">
            <Select
              label="Country / Region"
              value={countryFilter}
              options={countryOptions}
              onChange={setCountryFilter}
            />
          </div>
          <div className="analytics-v2-filter">
            <Select
              label="Rule type"
              value={ruleTypeFilter}
              options={[
                { label: "All types", value: "all" },
                { label: "Redirect", value: "redirect" },
                { label: "Block", value: "block" },
              ]}
              onChange={setRuleTypeFilter}
            />
          </div>
          <div className="analytics-v2-export">
            <Button
              icon={ExportIcon}
              onClick={() => downloadCsv(filteredCountries, period)}
            >
              Export CSV
            </Button>
          </div>
        </div>

        <div className="analytics-v2-metrics">
          <Metric
            icon={PersonIcon}
            tone="blue"
            label="Total visits"
            value={totals.visitors}
            detail={formatComparison(
              totals.visitors,
              previousTotals.visitors,
            )}
          />
          <Metric
            icon={ChartLineIcon}
            tone="purple"
            label="Redirects"
            value={totals.redirected}
            detail={formatComparison(
              totals.redirected,
              previousTotals.redirected,
            )}
          />
          <Metric
            icon={ShieldCheckMarkIcon}
            tone="orange"
            label="Blocked visits"
            value={totals.blocked}
            detail={formatComparison(
              totals.blocked,
              previousTotals.blocked,
            )}
          />
          <Metric
            icon={ChartLineIcon}
            tone="green"
            label="Conversion / redirect rate"
            value={`${conversionRate.toFixed(1)}%`}
            detail={formatComparison(
              conversionRate,
              previousConversionRate,
            )}
          />
        </div>

        <div className="analytics-v2-chart-grid">
          <Card padding="0">
            <section className="analytics-v2-panel">
              <header className="analytics-v2-panel-header">
                <div className="analytics-v2-panel-title">
                  <Text as="h2" variant="headingSm">
                    Traffic & actions trend
                  </Text>
                  <span className="analytics-v2-info" title="Daily activity">
                    i
                  </span>
                </div>
                <Badge>{`Last ${period} days`}</Badge>
              </header>
              <div className="analytics-v2-chart analytics-v2-chart--trend">
                <Suspense
                  fallback={
                    <SimpleLoadingSkeleton
                      label="Loading traffic chart"
                      minHeight={250}
                      rows={2}
                    />
                  }
                >
                  <AnalyticsTrendChart points={dailySeries} />
                </Suspense>
              </div>
            </section>
          </Card>

          <Card padding="0">
            <section className="analytics-v2-panel">
              <header className="analytics-v2-panel-header">
                <div className="analytics-v2-panel-title">
                  <Text as="h2" variant="headingSm">
                    Actions breakdown
                  </Text>
                  <span
                    className="analytics-v2-info"
                    title="Tracked storefront actions"
                  >
                    i
                  </span>
                </div>
                <Badge>{`${totalActions.toLocaleString()} actions`}</Badge>
              </header>
              <div className="analytics-v2-chart analytics-v2-chart--donut">
                {actionBreakdown.length > 0 ? (
                  <Suspense
                    fallback={
                      <SimpleLoadingSkeleton
                        label="Loading action breakdown"
                        minHeight={250}
                        rows={2}
                      />
                    }
                  >
                    <div className="analytics-v2-donut">
                      <AnalyticsBreakdownChart items={actionBreakdown} />
                    </div>
                  </Suspense>
                ) : (
                  <div className="analytics-empty">No action data yet</div>
                )}
              </div>
            </section>
          </Card>
        </div>

        <div className="analytics-v2-detail-grid">
          <Card padding="0">
            <section className="analytics-v2-panel">
              <header className="analytics-v2-panel-header">
                <div className="analytics-v2-panel-title">
                  <Text as="h2" variant="headingSm">
                    Top countries
                  </Text>
                </div>
                <Badge>{`Last ${period} days`}</Badge>
              </header>
              <div className="analytics-v2-table-wrap">
                <table className="analytics-v2-table">
                  <thead>
                    <tr>
                      <th>Country</th>
                      <th className="is-number">Visits</th>
                      <th className="is-number">Redirects</th>
                      <th className="is-number">Block rate</th>
                    </tr>
                  </thead>
                  <tbody>
                    {topCountries.length > 0 ? (
                      topCountries.map((item) => (
                        <tr key={item.id}>
                          <td>
                            <div className="analytics-v2-entity">
                              <img
                                src={`https://flagcdn.com/w40/${item.code.toLowerCase()}.png`}
                                width="20"
                                height="14"
                                alt=""
                                loading="lazy"
                              />
                              <span>{item.country}</span>
                            </div>
                          </td>
                          <td className="is-number">
                            {item.visitors.toLocaleString()}
                          </td>
                          <td className="is-number">
                            {item.redirected.toLocaleString()}
                          </td>
                          <td className="is-number">
                            {item.visitors > 0
                              ? `${((item.blocked / item.visitors) * 100).toFixed(1)}%`
                              : "—"}
                          </td>
                        </tr>
                      ))
                    ) : (
                      <EmptyTableRow colSpan={4}>
                        No matching countries
                      </EmptyTableRow>
                    )}
                  </tbody>
                </table>
              </div>
            </section>
          </Card>

          <Card padding="0">
            <section className="analytics-v2-panel">
              <header className="analytics-v2-panel-header">
                <div className="analytics-v2-panel-title">
                  <Text as="h2" variant="headingSm">
                    Top rules performance
                  </Text>
                </div>
                <Badge>{`Last ${period} days`}</Badge>
              </header>
              <div className="analytics-v2-table-wrap">
                <table className="analytics-v2-table">
                  <thead>
                    <tr>
                      <th>Rule</th>
                      <th>Type</th>
                      <th className="is-number">Triggers</th>
                      <th className="is-number">Rate</th>
                    </tr>
                  </thead>
                  <tbody>
                    {topRules.length > 0 ? (
                      topRules.map((item) => (
                        <tr key={item.id}>
                          <td>{item.rule}</td>
                          <td>
                            <span
                              className={`analytics-v2-rule-type${
                                item.type === "Block" ? " is-block" : ""
                              }`}
                            >
                              {item.type}
                            </span>
                          </td>
                          <td className="is-number">
                            {item.triggers.toLocaleString()}
                          </td>
                          <td className="is-number">
                            {`${item.rate.toFixed(1)}%`}
                          </td>
                        </tr>
                      ))
                    ) : (
                      <EmptyTableRow colSpan={4}>
                        No matching rules
                      </EmptyTableRow>
                    )}
                  </tbody>
                </table>
              </div>
            </section>
          </Card>

          <Card padding="0">
            <section className="analytics-v2-panel">
              <header className="analytics-v2-panel-header">
                <div className="analytics-v2-panel-title">
                  <Text as="h2" variant="headingSm">
                    Analytics insights
                  </Text>
                </div>
              </header>
              <div className="analytics-v2-insights">
                <div className="analytics-v2-insight">
                  <span className="analytics-v2-insight-icon">
                    <Icon source={GlobeIcon} />
                  </span>
                  <div className="analytics-v2-insight-copy">
                    <Text as="strong" variant="bodySm">
                      Busiest country
                    </Text>
                    <Text as="span" variant="bodySm" tone="subdued">
                      {busiestCountry
                        ? `${busiestCountry.country} generated ${busiestCountry.visitors.toLocaleString()} visits.`
                        : "No country traffic recorded yet."}
                    </Text>
                  </div>
                </div>
                <div className="analytics-v2-insight">
                  <span className="analytics-v2-insight-icon is-green">
                    <Icon source={ChartLineIcon} />
                  </span>
                  <div className="analytics-v2-insight-copy">
                    <Text as="strong" variant="bodySm">
                      Top performing rule
                    </Text>
                    <Text as="span" variant="bodySm" tone="subdued">
                      {topRule
                        ? `${topRule.rule} recorded ${topRule.actions.toLocaleString()} actions.`
                        : "No rule activity recorded yet."}
                    </Text>
                  </div>
                </div>
                <div className="analytics-v2-insight">
                  <span className="analytics-v2-insight-icon is-orange">
                    <Icon source={ShieldCheckMarkIcon} />
                  </span>
                  <div className="analytics-v2-insight-copy">
                    <Text as="strong" variant="bodySm">
                      Blocked traffic trend
                    </Text>
                    <Text as="span" variant="bodySm" tone="subdued">
                      {previousTotals.blocked > 0
                        ? `Blocked visits changed ${blockedChange >= 0 ? "+" : ""}${blockedChange.toFixed(1)}% from the previous period.`
                        : "More history is needed to calculate a trend."}
                    </Text>
                  </div>
                </div>
              </div>
            </section>
          </Card>
        </div>

        <Card padding="0">
          <section className="analytics-v2-panel">
            <header className="analytics-v2-panel-header">
              <div className="analytics-v2-panel-title">
                <Text as="h2" variant="headingSm">
                  Hourly activity (UTC)
                </Text>
                <span
                  className="analytics-v2-info"
                  title="Rule actions recorded in visitor logs"
                >
                  i
                </span>
              </div>
              <Badge>{`Last ${period} days`}</Badge>
            </header>
            <div className="analytics-v2-heatmap">
              <span />
              {Array.from({ length: 24 }, (_, hour) => (
                <span className="analytics-v2-hour" key={hour}>
                  {hour % 4 === 0 ? `${hour}:00` : ""}
                </span>
              ))}
              {hourlyActivity.map((row, dayIndex) => (
                <div className="analytics-v2-heatmap-hours" key={dayIndex}>
                  <span className="analytics-v2-day">
                    {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"][
                      dayIndex
                    ]}
                  </span>
                  {row.map((value, hour) => (
                    <span
                      className="analytics-v2-heat-cell"
                      key={hour}
                      title={`${value.toLocaleString()} actions`}
                      style={
                        {
                          "--heat": `${
                            value > 0
                              ? Math.max(
                                  12,
                                  (value / maxHourlyActivity) * 100,
                                )
                              : 0
                          }%`,
                        } as CSSProperties
                      }
                    />
                  ))}
                </div>
              ))}
            </div>
            <div className="analytics-v2-heat-legend">
              <span>Less active</span>
              <span className="analytics-v2-heat-gradient" />
              <span>More active</span>
            </div>
          </section>
        </Card>

        <div className="analytics-v2-data-grid">
        <Card padding="0">
          <section className="analytics-v2-panel">
            <header className="analytics-v2-panel-header">
              <div className="analytics-v2-panel-title">
                <Text as="h2" variant="headingSm">
                  Country performance
                </Text>
                <span
                  className="analytics-v2-info"
                  title="All visits and actions grouped by country"
                >
                  i
                </span>
              </div>
              <Badge>{`${filteredCountries.length} countries`}</Badge>
            </header>
            <div className="analytics-v2-table-wrap is-full">
              <table className="analytics-v2-table">
                <thead>
                  <tr>
                    <th>Country</th>
                    <th className="is-number">Visits</th>
                    <th className="is-number">Popup shown</th>
                    <th className="is-number">Redirected</th>
                    <th className="is-number">Blocked</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredCountries.length > 0 ? (
                    filteredCountries.map((item) => (
                      <tr key={item.id}>
                        <td>
                          <CountryIdentity
                            code={item.code}
                            country={item.country}
                          />
                        </td>
                        <td className="is-number">
                          {item.visitors.toLocaleString()}
                        </td>
                        <td className="is-number">
                          {item.popup.toLocaleString()}
                        </td>
                        <td className="is-number">
                          {item.redirected.toLocaleString()}
                        </td>
                        <td className="is-number">
                          {item.blocked.toLocaleString()}
                        </td>
                      </tr>
                    ))
                  ) : (
                    <EmptyTableRow colSpan={5}>
                      No matching country data
                    </EmptyTableRow>
                  )}
                </tbody>
              </table>
            </div>
            </section>
          </Card>

          <Card padding="0">
            <section className="analytics-v2-panel">
              <header className="analytics-v2-panel-header">
                <div className="analytics-v2-panel-title">
                  <Text as="h2" variant="headingSm">
                    Blocked traffic
                  </Text>
                </div>
                <Badge
                  tone={
                    filteredBlockedCountries.length > 0
                      ? "attention"
                      : undefined
                  }
                >
                  {filteredBlockedCountries
                    .reduce((sum, item) => sum + item.blocked, 0)
                    .toLocaleString()}
                </Badge>
              </header>
              <div className="analytics-v2-table-wrap is-full">
                <table className="analytics-v2-table">
                  <thead>
                    <tr>
                      <th>Country</th>
                      <th className="is-number">Blocked</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredBlockedCountries.length > 0 ? (
                      filteredBlockedCountries.map((item) => (
                        <tr key={item.id}>
                          <td>
                            <CountryIdentity
                              code={item.code}
                              country={item.country}
                            />
                          </td>
                          <td className="is-number">
                            {item.blocked.toLocaleString()}
                          </td>
                        </tr>
                      ))
                    ) : (
                      <EmptyTableRow colSpan={2}>
                        No matching blocked traffic
                      </EmptyTableRow>
                    )}
                  </tbody>
                </table>
              </div>
            </section>
          </Card>

          <Card padding="0">
            <section className="analytics-v2-panel">
              <header className="analytics-v2-panel-header">
                <div className="analytics-v2-panel-title">
                  <Text as="h2" variant="headingSm">
                    Instant redirects
                  </Text>
                </div>
                <Badge tone={totalInstantRedirects > 0 ? "success" : undefined}>
                  {totalInstantRedirects.toLocaleString()}
                </Badge>
              </header>
              <div className="analytics-v2-table-wrap is-full">
                <table className="analytics-v2-table">
                  <thead>
                    <tr>
                      <th>Rule</th>
                      <th className="is-number">Redirected</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredInstantRedirects.length > 0 ? (
                      filteredInstantRedirects.map((item) => (
                        <tr key={item.id}>
                          <td>{item.rule}</td>
                          <td className="is-number">
                            {item.redirected.toLocaleString()}
                          </td>
                        </tr>
                      ))
                    ) : (
                      <EmptyTableRow colSpan={2}>
                        No matching instant redirects
                      </EmptyTableRow>
                    )}
                  </tbody>
                </table>
              </div>
            </section>
          </Card>

          <Card padding="0">
            <section className="analytics-v2-panel">
            <header className="analytics-v2-panel-header">
              <div className="analytics-v2-panel-title">
                <Text as="h2" variant="headingSm">
                  Popup interactions
                </Text>
                <span
                  className="analytics-v2-info"
                  title="Popup responses grouped by rule"
                >
                  i
                </span>
              </div>
              <Badge tone={totalPopupSeen > 0 ? "info" : undefined}>
                {`${totalPopupSeen.toLocaleString()} shown`}
              </Badge>
            </header>
            <div className="analytics-v2-table-wrap is-full">
              <table className="analytics-v2-table">
                <thead>
                  <tr>
                    <th>Rule</th>
                    <th className="is-number">Shown</th>
                    <th className="is-number">Accepted</th>
                    <th className="is-number">Declined</th>
                    <th className="is-number">Dismissed</th>
                    <th className="is-number">Acceptance rate</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredPopupRules.length > 0 ? (
                    filteredPopupRules.map((item) => {
                      const rate =
                        item.seen > 0
                          ? (item.clickedYes / item.seen) * 100
                          : 0;

                      return (
                        <tr key={item.id}>
                          <td>{item.rule}</td>
                          <td className="is-number">
                            {item.seen.toLocaleString()}
                          </td>
                          <td className="is-number">
                            {item.clickedYes.toLocaleString()}
                          </td>
                          <td className="is-number">
                            {item.clickedNo.toLocaleString()}
                          </td>
                          <td className="is-number">
                            {item.dismissed.toLocaleString()}
                          </td>
                          <td className="is-number">
                            {item.seen > 0 ? `${rate.toFixed(1)}%` : "—"}
                          </td>
                        </tr>
                      );
                    })
                  ) : (
                    <EmptyTableRow colSpan={6}>
                      No matching popup interactions
                    </EmptyTableRow>
                  )}
                </tbody>
              </table>
            </div>
            </section>
          </Card>
        </div>

        <footer className="analytics-v2-footer">
          <div className="analytics-v2-footer-copy">
            <span className="analytics-v2-footer-icon">
              <Icon source={ShieldCheckMarkIcon} />
            </span>
            <div>
              <Text as="p" variant="bodySm" fontWeight="semibold">
                Analytics are up to date
              </Text>
              <Text as="p" variant="bodySm" tone="subdued">
                Storefront activity is aggregated for the selected period.
              </Text>
            </div>
          </div>
          <Button onClick={() => navigate("/app/support")}>
            Contact support
          </Button>
        </footer>
      </div>
    </Page>
  );
}

function LegacyAnalyticsPage() {
  const {
    period,
    countries,
    popupRules,
    instantRedirects,
    blockedCountries,
    totals,
  } = useLoaderData<typeof loader>();
  const navigation = useNavigation();
  const [searchParams, setSearchParams] = useSearchParams();
  const isUpdating =
    navigation.state !== "idle" &&
    navigation.location?.pathname === "/app/analytics";
  const totalPopupSeen = popupRules.reduce(
    (sum, item) => sum + item.seen,
    0,
  );
  const totalInstantRedirects = instantRedirects.reduce(
    (sum, item) => sum + item.redirected,
    0,
  );

  const handlePeriodChange = (value: string) => {
    const nextParams = new URLSearchParams(searchParams);
    nextParams.set("period", value);
    setSearchParams(nextParams);
  };

  return (
    <Page
      title="Analytics"
      subtitle="Review visitor traffic and storefront rule performance."
      fullWidth
    >
      <TitleBar title="Analytics" />
      <style>
        {`
          .analytics-page,
          .analytics-page * {
            box-sizing: border-box;
          }
          .analytics-page {
            display: grid;
            gap: 16px;
            padding-bottom: 32px;
          }
          .analytics-toolbar {
            display: flex;
            align-items: center;
            justify-content: flex-end;
            min-height: 32px;
          }
          .analytics-period {
            width: 150px;
          }
          .analytics-metrics {
            display: grid;
            grid-template-columns: repeat(4, minmax(0, 1fr));
            gap: 12px;
          }
          .analytics-metrics > .Polaris-ShadowBevel {
            height: 100%;
          }
          .analytics-metric {
            display: flex;
            align-items: flex-start;
            gap: 12px;
            min-height: 96px;
          }
          .analytics-metric-icon {
            display: grid;
            flex: 0 0 40px;
            width: 40px;
            height: 40px;
            place-items: center;
            border-radius: 12px;
          }
          .analytics-metric-icon .Polaris-Icon {
            width: 20px;
            height: 20px;
          }
          .analytics-metric-icon.is-blue {
            color: #005bd3;
            background: #eaf3ff;
          }
          .analytics-metric-icon.is-green {
            color: #0c6b3e;
            background: #e8f7ee;
          }
          .analytics-metric-icon.is-purple {
            color: #6d3fd1;
            background: #f1ebff;
          }
          .analytics-metric-icon.is-orange {
            color: #b35300;
            background: #fff1e6;
          }
          .analytics-metric-copy {
            display: grid;
            min-width: 0;
            gap: 2px;
          }
          .analytics-content-grid {
            display: grid;
            grid-template-columns: minmax(0, 1.7fr) minmax(280px, 0.8fr);
            align-items: stretch;
            gap: 16px;
          }
          .analytics-content-grid > .Polaris-ShadowBevel {
            height: 100%;
          }
          .analytics-side-stack {
            display: grid;
            grid-template-rows: repeat(2, minmax(0, 1fr));
            gap: 16px;
          }
          .analytics-side-stack > .Polaris-ShadowBevel {
            height: 100%;
          }
          .analytics-panel {
            display: flex;
            min-height: 0;
            height: 100%;
            flex-direction: column;
          }
          .analytics-panel-header {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 12px;
            min-height: 58px;
            padding: 12px 14px;
            border-bottom: 1px solid var(--p-color-border-secondary, #e3e3e3);
          }
          .analytics-panel-title {
            display: grid;
            min-width: 0;
            gap: 2px;
          }
          .analytics-table-wrap {
            width: 100%;
            min-height: 0;
            overflow: auto;
          }
          .analytics-table-wrap.is-main {
            max-height: 520px;
          }
          .analytics-table-wrap.is-side {
            max-height: 220px;
          }
          .analytics-table {
            width: 100%;
            border-collapse: collapse;
            color: var(--p-color-text, #303030);
            font-size: 13px;
          }
          .analytics-table th,
          .analytics-table td {
            height: 42px;
            padding: 8px 12px;
            border-bottom: 1px solid var(--p-color-border-secondary, #e3e3e3);
            text-align: left;
            white-space: nowrap;
          }
          .analytics-table th {
            position: sticky;
            z-index: 1;
            top: 0;
            color: var(--p-color-text-secondary, #616161);
            background: var(--p-color-bg-surface-secondary, #f7f7f7);
            font-size: 12px;
            font-weight: 600;
          }
          .analytics-table tbody tr:last-child td {
            border-bottom: 0;
          }
          .analytics-table .is-numeric {
            text-align: right;
            font-variant-numeric: tabular-nums;
          }
          .analytics-entity {
            display: flex;
            min-width: 0;
            align-items: center;
            gap: 8px;
          }
          .analytics-entity img {
            flex: 0 0 auto;
            border-radius: 2px;
            object-fit: cover;
          }
          .analytics-country-fallback {
            display: inline-flex;
            width: 22px;
            color: var(--p-color-icon-secondary, #8a8a8a);
          }
          .analytics-country-fallback .Polaris-Icon {
            width: 16px;
            height: 16px;
          }
          .analytics-count {
            font-weight: 550;
          }
          .analytics-rate {
            color: var(--p-color-text-success, #29845a);
            font-weight: 600;
          }
          .analytics-empty {
            display: grid;
            min-height: 112px;
            place-items: center;
            color: var(--p-color-text-secondary, #616161);
            white-space: normal;
          }
          .analytics-page.is-updating {
            cursor: progress;
          }
          .analytics-page.is-updating .analytics-period {
            opacity: 0.65;
          }
          @media (max-width: 68em) {
            .analytics-metrics {
              grid-template-columns: repeat(2, minmax(0, 1fr));
            }
            .analytics-content-grid {
              grid-template-columns: 1fr;
            }
            .analytics-side-stack {
              grid-template-columns: repeat(2, minmax(0, 1fr));
              grid-template-rows: auto;
            }
          }
          @media (max-width: 47.9975em) {
            .analytics-page {
              gap: 12px;
            }
            .analytics-toolbar {
              justify-content: flex-start;
            }
            .analytics-period {
              width: 140px;
            }
            .analytics-metrics,
            .analytics-side-stack {
              grid-template-columns: 1fr;
            }
            .analytics-metric {
              min-height: 76px;
            }
            .analytics-panel-header {
              align-items: flex-start;
            }
            .analytics-table-wrap.is-main,
            .analytics-table-wrap.is-side {
              max-height: 420px;
            }
          }
        `}
      </style>

      <div className={`analytics-page${isUpdating ? " is-updating" : ""}`}>
        <div className="analytics-toolbar">
          <div className="analytics-period">
            <Select
              label="Reporting period"
              labelHidden
              value={String(period)}
              options={[
                { label: "Last 7 days", value: "7" },
                { label: "Last 30 days", value: "30" },
              ]}
              onChange={handlePeriodChange}
              disabled={isUpdating}
            />
          </div>
        </div>

        <div className="analytics-metrics">
          <Metric
            icon={PersonIcon}
            tone="green"
            label="Visitors tracked"
            value={totals.visitors}
            detail={`Across ${countries.length.toLocaleString()} countries`}
          />
          <Metric
            icon={ChatIcon}
            tone="blue"
            label="Popup impressions"
            value={totals.popup}
            detail={`Last ${period} days`}
          />
          <Metric
            icon={ChartLineIcon}
            tone="purple"
            label="Redirects"
            value={totals.redirected}
            detail={`${totalInstantRedirects.toLocaleString()} automatic`}
          />
          <Metric
            icon={ShieldCheckMarkIcon}
            tone="orange"
            label="Traffic blocked"
            value={totals.blocked}
            detail={`Last ${period} days`}
          />
        </div>

        <div className="analytics-content-grid">
          <Card padding="0">
            <section className="analytics-panel">
              <header className="analytics-panel-header">
                <div className="analytics-panel-title">
                  <Text as="h2" variant="headingSm">
                    Traffic overview
                  </Text>
                  <Text as="p" variant="bodySm" tone="subdued">
                    Visits and actions by country.
                  </Text>
                </div>
                <Badge>{`${countries.length} countries`}</Badge>
              </header>
              <div className="analytics-table-wrap is-main">
                <table className="analytics-table">
                  <thead>
                    <tr>
                      <th>Country</th>
                      <th className="is-numeric">Visits</th>
                      <th className="is-numeric">Popup</th>
                      <th className="is-numeric">Redirected</th>
                      <th className="is-numeric">Blocked</th>
                    </tr>
                  </thead>
                  <tbody>
                    {countries.length > 0 ? (
                      countries.map((item) => (
                        <tr key={item.id}>
                          <td>
                            <CountryIdentity
                              code={item.code}
                              country={item.country}
                            />
                          </td>
                          <td className="is-numeric">
                            <span className="analytics-count">
                              {item.visitors.toLocaleString()}
                            </span>
                          </td>
                          <td className="is-numeric">
                            <span className="analytics-count">
                              {item.popup.toLocaleString()}
                            </span>
                          </td>
                          <td className="is-numeric">
                            <span className="analytics-count">
                              {item.redirected.toLocaleString()}
                            </span>
                          </td>
                          <td className="is-numeric">
                            <span className="analytics-count">
                              {item.blocked.toLocaleString()}
                            </span>
                          </td>
                        </tr>
                      ))
                    ) : (
                      <EmptyTableRow colSpan={5}>
                        No traffic data yet
                      </EmptyTableRow>
                    )}
                  </tbody>
                </table>
              </div>
            </section>
          </Card>

          <div className="analytics-side-stack">
            <Card padding="0">
              <section className="analytics-panel">
                <header className="analytics-panel-header">
                  <div className="analytics-panel-title">
                    <Text as="h2" variant="headingSm">
                      Blocked traffic
                    </Text>
                    <Text as="p" variant="bodySm" tone="subdued">
                      Countries blocked by active rules.
                    </Text>
                  </div>
                  <Badge tone={totals.blocked > 0 ? "attention" : undefined}>
                    {totals.blocked.toLocaleString()}
                  </Badge>
                </header>
                <div className="analytics-table-wrap is-side">
                  <table className="analytics-table">
                    <thead>
                      <tr>
                        <th>Country</th>
                        <th className="is-numeric">Count</th>
                      </tr>
                    </thead>
                    <tbody>
                      {blockedCountries.length > 0 ? (
                        blockedCountries.map((item) => (
                          <tr key={item.id}>
                            <td>
                              <CountryIdentity
                                code={item.code}
                                country={item.country}
                              />
                            </td>
                            <td className="is-numeric">
                              <span className="analytics-count">
                                {item.blocked.toLocaleString()}
                              </span>
                            </td>
                          </tr>
                        ))
                      ) : (
                        <EmptyTableRow colSpan={2}>
                          No blocked traffic
                        </EmptyTableRow>
                      )}
                    </tbody>
                  </table>
                </div>
              </section>
            </Card>

            <Card padding="0">
              <section className="analytics-panel">
                <header className="analytics-panel-header">
                  <div className="analytics-panel-title">
                    <Text as="h2" variant="headingSm">
                      Instant redirects
                    </Text>
                    <Text as="p" variant="bodySm" tone="subdued">
                      Automatic redirects by rule.
                    </Text>
                  </div>
                  <Badge
                    tone={totalInstantRedirects > 0 ? "success" : undefined}
                  >
                    {totalInstantRedirects.toLocaleString()}
                  </Badge>
                </header>
                <div className="analytics-table-wrap is-side">
                  <table className="analytics-table">
                    <thead>
                      <tr>
                        <th>Rule</th>
                        <th className="is-numeric">Redirected</th>
                      </tr>
                    </thead>
                    <tbody>
                      {instantRedirects.length > 0 ? (
                        instantRedirects.map((item) => (
                          <tr key={item.id}>
                            <td>{item.rule}</td>
                            <td className="is-numeric">
                              <span className="analytics-count">
                                {item.redirected.toLocaleString()}
                              </span>
                            </td>
                          </tr>
                        ))
                      ) : (
                        <EmptyTableRow colSpan={2}>
                          No instant redirects
                        </EmptyTableRow>
                      )}
                    </tbody>
                  </table>
                </div>
              </section>
            </Card>
          </div>
        </div>

        <Card padding="0">
          <section className="analytics-panel">
            <header className="analytics-panel-header">
              <div className="analytics-panel-title">
                <Text as="h2" variant="headingSm">
                  Banners and popups
                </Text>
                <Text as="p" variant="bodySm" tone="subdued">
                  Popup interactions by rule.
                </Text>
              </div>
              <Badge tone={totalPopupSeen > 0 ? "info" : undefined}>
                {`${totalPopupSeen.toLocaleString()} seen`}
              </Badge>
            </header>
            <div className="analytics-table-wrap is-main">
              <table className="analytics-table">
                <thead>
                  <tr>
                    <th>Rule</th>
                    <th className="is-numeric">Seen</th>
                    <th className="is-numeric">Clicked yes</th>
                    <th className="is-numeric">Clicked no</th>
                    <th className="is-numeric">Dismissed</th>
                    <th className="is-numeric">Rate</th>
                  </tr>
                </thead>
                <tbody>
                  {popupRules.length > 0 ? (
                    popupRules.map((item) => {
                      const rate =
                        item.seen > 0
                          ? Math.round((item.clickedYes / item.seen) * 100)
                          : 0;

                      return (
                        <tr key={item.id}>
                          <td>{item.rule}</td>
                          <td className="is-numeric">
                            <span className="analytics-count">
                              {item.seen.toLocaleString()}
                            </span>
                          </td>
                          <td className="is-numeric">
                            <span className="analytics-count">
                              {item.clickedYes.toLocaleString()}
                            </span>
                          </td>
                          <td className="is-numeric">
                            <span className="analytics-count">
                              {item.clickedNo.toLocaleString()}
                            </span>
                          </td>
                          <td className="is-numeric">
                            <span className="analytics-count">
                              {item.dismissed.toLocaleString()}
                            </span>
                          </td>
                          <td className="is-numeric">
                            <span className="analytics-rate">
                              {item.seen > 0 ? `${rate}%` : "—"}
                            </span>
                          </td>
                        </tr>
                      );
                    })
                  ) : (
                    <EmptyTableRow colSpan={6}>
                      No popup data
                    </EmptyTableRow>
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </Card>
      </div>
    </Page>
  );
}

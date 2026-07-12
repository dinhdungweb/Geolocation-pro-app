import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData } from "@remix-run/react";
import { Gem, Store, TrendingUp } from "lucide-react";
import prisma from "../db.server";
import { requireAdminAuth } from "../utils/admin.session.server";

type CountryDistribution = {
  code: string;
  visitors: number;
  redirects: number;
};

type AdminDashboardLoaderData = {
  stats: {
    totalShops: number;
    activeRules: number;
    totalVisitors: number;
    subscriptionRevenue: number;
    overageRevenue: number;
    totalRevenue: number;
  };
  countries: CountryDistribution[];
  distributions: {
    plans: Record<string, number>;
    modes: Record<string, number>;
  };
  trends: {
    yearMonth: string;
    _sum: {
      totalVisitors: number;
      redirected: number;
    };
  }[];
};

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await requireAdminAuth(request);

  try {
    const now = new Date();
    const yearMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    const yearStart = new Date(now.getFullYear(), 0, 1);

    const [totalShops, activeRules, totalVisitors, countryStats, settings, trendRows] =
      await Promise.all([
        prisma.settings.count({ where: { NOT: { shop: "GLOBAL" } } }),
        prisma.redirectRule.count({ where: { isActive: true } }),
        prisma.analyticsCountry.aggregate({ _sum: { visitors: true } }),
        prisma.analyticsCountry.groupBy({
          by: ["countryCode"],
          _sum: { visitors: true, redirected: true },
          orderBy: { _sum: { visitors: "desc" } },
          take: 5,
        }),
        prisma.settings.findMany({
          where: { NOT: { shop: "GLOBAL" } },
          select: {
            shop: true,
            currentPlan: true,
            mode: true,
            customPlanPrice: true,
            billingPeriodKey: true,
          },
        }),
        prisma.analyticsCountry.findMany({
          where: { date: { gte: yearStart } },
          select: { date: true, visitors: true, redirected: true },
        }),
      ]);

    const trendMap = new Map<string, { totalVisitors: number; redirected: number }>();

    (trendRows as any[]).forEach((row) => {
      const rowMonth = `${row.date.getFullYear()}-${String(row.date.getMonth() + 1).padStart(2, "0")}`;
      const current = trendMap.get(rowMonth) || { totalVisitors: 0, redirected: 0 };
      current.totalVisitors += row.visitors || 0;
      current.redirected += row.redirected || 0;
      trendMap.set(rowMonth, current);
    });

    const monthlyTrends = Array.from(trendMap.entries())
      .map(([trendMonth, sums]) => ({
        yearMonth: trendMonth,
        _sum: {
          totalVisitors: sums.totalVisitors,
          redirected: sums.redirected,
        },
      }))
      .sort((a, b) => a.yearMonth.localeCompare(b.yearMonth));

    const currentPeriodKeys = settings.map((setting: any) => setting.billingPeriodKey || `calendar:${yearMonth}`);
    const currentPeriodUsage = await prisma.monthlyUsage.findMany({
      where: { billingPeriodKey: { in: currentPeriodKeys } },
    });

    const planPrices: Record<string, number> = {
      ELITE: 14.99,
      PLUS: 7.99,
      PREMIUM: 4.99,
      FREE: 0,
    };
    const overageRate = 100 / 50000;

    const subscriptionRevenue = settings.reduce((sum, setting) => {
      const planKey = (setting.currentPlan || "FREE").toUpperCase();
      if (planKey === "CUSTOM") return sum + Number(setting.customPlanPrice || 0);
      return sum + (planPrices[planKey] || 0);
    }, 0);

    const usageMap = new Map(
      (currentPeriodUsage as any[]).map((usage) => [`${usage.shop}:${usage.billingPeriodKey}`, usage]),
    );

    const overageRevenue = settings.reduce((sum, setting) => {
      const planKey = (setting.currentPlan || "FREE").toUpperCase();
      if (planKey === "FREE") return sum;

      const usage = usageMap.get(`${setting.shop}:${(setting as any).billingPeriodKey || `calendar:${yearMonth}`}`);
      if (!usage) return sum;

      return sum + (usage.chargedVisitors || 0) * overageRate;
    }, 0);

    const plans = settings.reduce(
      (acc: Record<string, number>, setting) => {
        const planKey = (setting.currentPlan || "FREE").toUpperCase();
        acc[planKey] = (acc[planKey] || 0) + 1;
        return acc;
      },
      { FREE: 0, PREMIUM: 0, PLUS: 0, ELITE: 0, CUSTOM: 0 },
    );

    const modes = settings.reduce((acc: Record<string, number>, setting) => {
      const modeKey = setting.mode || "popup";
      acc[modeKey] = (acc[modeKey] || 0) + 1;
      return acc;
    }, {});

    const countries = countryStats.reduce<CountryDistribution[]>((items, country) => {
      if (!country.countryCode) return items;

      items.push({
        code: country.countryCode,
        visitors: country._sum.visitors || 0,
        redirects: country._sum.redirected || 0,
      });
      return items;
    }, []);

    return json<AdminDashboardLoaderData>({
      stats: {
        totalShops,
        activeRules,
        totalVisitors: totalVisitors._sum.visitors || 0,
        subscriptionRevenue,
        overageRevenue,
        totalRevenue: subscriptionRevenue + overageRevenue,
      },
      countries,
      distributions: { plans, modes },
      trends: monthlyTrends,
    });
  } catch (error) {
    console.error("Dashboard Loader Error:", error);
    return json<AdminDashboardLoaderData>({
      stats: {
        totalShops: 0,
        activeRules: 0,
        totalVisitors: 0,
        subscriptionRevenue: 0,
        overageRevenue: 0,
        totalRevenue: 0,
      },
      countries: [],
      distributions: { plans: {}, modes: {} },
      trends: [],
    });
  }
};

function getFullYearTrends(monthlyTrends: any[]) {
  const currentYear = new Date().getFullYear();
  const fullYear: any[] = [];

  for (let month = 1; month <= 12; month++) {
    const yearMonth = `${currentYear}-${String(month).padStart(2, "0")}`;
    const existing = monthlyTrends.find((trend) => trend.yearMonth === yearMonth);

    fullYear.push(
      existing || {
        yearMonth,
        _sum: { totalVisitors: 0, redirected: 0 },
      },
    );
  }

  return fullYear;
}

export default function AdminDashboard() {
  const { stats, countries, distributions, trends } = useLoaderData<AdminDashboardLoaderData>();
  const fullYearTrends = getFullYearTrends(trends);
  const maxTrendVisitors =
    Math.max(...fullYearTrends.map((trend) => trend._sum?.totalVisitors || 0)) || 1;

  const cards = [
    {
      label: "Total Installations",
      value: stats.totalShops.toLocaleString(),
      note: "All active merchant records",
      delta: "Stores",
      tone: "primary",
      icon: <Store size={18} />,
    },
    {
      label: "Global Traffic",
      value: stats.totalVisitors.toLocaleString(),
      note: "Aggregated visitor events",
      delta: "Visitors",
      tone: "secondary",
      icon: <TrendingUp size={18} />,
    },
    {
      label: "Active Rules",
      value: stats.activeRules.toLocaleString(),
      note: "Redirect and block rules",
      delta: "Policies",
      tone: "tertiary",
      icon: <Store size={18} />,
    },
    {
      label: "Total Revenue",
      value: `$${stats.totalRevenue.toFixed(2)}`,
      note: `Subs $${stats.subscriptionRevenue.toFixed(2)} / Overage $${stats.overageRevenue.toFixed(2)}`,
      delta: "MRR estimate",
      tone: "inverse",
      icon: <Gem size={18} />,
    },
  ];

  return (
    <section className="ed-dashboard">
      <header className="ed-dashboard-head">
        <div className="ed-dashboard-title">
          <span>Operational snapshot</span>
          <h1>System Overview</h1>
          <p>Monitor merchant installs, traffic, rules, revenue, and market concentration.</p>
        </div>
        <div className="ed-dashboard-actions" aria-label="Dashboard status">
          <span>Current year</span>
          <strong>{new Date().getFullYear()}</strong>
        </div>
      </header>

      <div className="ed-metric-grid">
        {cards.map((card) => (
          <article className={`ed-metric-card ${card.tone}`} key={card.label}>
            <div className="ed-metric-head">
              <span className="ed-metric-icon">{card.icon}</span>
              <span>{card.label}</span>
            </div>
            <strong>{card.value}</strong>
            <div className="ed-metric-foot">
              <small>{card.note}</small>
              <span>{card.delta}</span>
            </div>
          </article>
        ))}
      </div>

      <div className="ed-dashboard-grid">
        <article className="ed-panel">
          <div className="ed-panel-head ed-panel-head-split">
            <div>
              <h2>Traffic Growth Trend</h2>
              <p>Monthly visitor volume across the current year.</p>
            </div>
            <span className="ed-panel-chip">Visitors</span>
          </div>

          <div className="ed-trend-chart" aria-label="Traffic growth by month">
            {fullYearTrends.map((trend) => {
              const visitors = trend._sum?.totalVisitors || 0;
              const percentage = visitors > 0 ? Math.max((visitors / maxTrendVisitors) * 100, 4) : 0;

              return (
                <div className="ed-trend-column" key={trend.yearMonth}>
                  <span>{visitors > 1000 ? `${(visitors / 1000).toFixed(1)}k` : visitors || ""}</span>
                  <div
                    className="ed-trend-bar"
                    style={{ height: `${(percentage / 100) * 180}px` }}
                    title={`${trend.yearMonth}: ${visitors.toLocaleString()} visitors`}
                  />
                  <small>{trend.yearMonth.split("-")[1]}</small>
                </div>
              );
            })}
          </div>
        </article>

        <div className="ed-side-stack">
          <article className="ed-panel">
            <div className="ed-panel-head">
              <h2>Market Distribution</h2>
              <p>Top countries by visitor share.</p>
            </div>

            <div className="ed-list">
              {countries.length === 0 ? (
                <div className="ed-empty">No country data available.</div>
              ) : (
                countries.map((country) => {
                  const share =
                    stats.totalVisitors > 0 ? (country.visitors / stats.totalVisitors) * 100 : 0;

                  return (
                    <div className="ed-list-row" key={country.code}>
                      <div className="ed-country">
                        <img
                          src={`https://flagcdn.com/w40/${country.code.toLowerCase()}.png`}
                          width="20"
                          alt=""
                        />
                        <strong>{country.code}</strong>
                      </div>
                      <div className="ed-progress" aria-hidden="true">
                        <span style={{ width: `${share}%` }} />
                      </div>
                      <span>{share.toFixed(1)}%</span>
                    </div>
                  );
                })
              )}
            </div>
          </article>

          <article className="ed-panel">
            <div className="ed-panel-head">
              <h2>Plan Distribution</h2>
              <p>Merchant count grouped by plan.</p>
            </div>

            <div className="ed-plan-grid">
              {Object.entries(distributions.plans).map(([plan, count]: [string, any]) => (
                <div className="ed-plan-cell" key={plan}>
                  <span>{plan}</span>
                  <strong>{count}</strong>
                </div>
              ))}
            </div>
          </article>
        </div>
      </div>

      <style>{`
        .ed-dashboard {
          width: 100%;
          min-width: 0;
          display: grid;
          gap: var(--ed-space-8);
        }

        .ed-dashboard-head {
          min-width: 0;
          display: flex;
          align-items: end;
          justify-content: space-between;
          gap: var(--ed-space-8);
          padding: var(--ed-space-8);
          border: 1px solid var(--ed-color-border-soft);
          border-radius: var(--ed-radius-md);
          background: var(--ed-color-surface-muted);
          box-shadow: var(--ed-shadow-2);
        }

        .ed-dashboard-title {
          min-width: 0;
          display: grid;
          gap: var(--ed-space-1);
        }

        .ed-dashboard-title span {
          color: var(--ed-color-text-inverse);
          font-size: var(--ed-font-size-xs);
          font-weight: 800;
          letter-spacing: 0.04em;
          line-height: 16px;
          text-transform: uppercase;
        }

        .ed-dashboard-title h1 {
          margin: 0;
          color: var(--ed-color-text-primary);
          font-size: var(--ed-font-size-3xl);
          font-weight: 800;
          line-height: 32px;
        }

        .ed-dashboard-title p {
          max-width: 640px;
          margin: 0;
          color: var(--ed-color-text-tertiary);
          font-size: var(--ed-font-size-sm);
          line-height: 20px;
        }

        .ed-dashboard-actions {
          min-width: 128px;
          display: grid;
          justify-items: end;
          gap: var(--ed-space-1);
          padding-left: var(--ed-space-5);
          border-left: 1px solid var(--ed-color-border-soft);
        }

        .ed-dashboard-actions span {
          color: var(--ed-color-text-tertiary);
          font-size: var(--ed-font-size-xs);
          font-weight: 700;
          line-height: 16px;
        }

        .ed-dashboard-actions strong {
          color: var(--ed-color-text-primary);
          font-size: var(--ed-font-size-3xl);
          line-height: 26px;
          font-variant-numeric: tabular-nums;
        }

        .ed-metric-grid {
          min-width: 0;
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(min(100%, 240px), 1fr));
          gap: var(--ed-space-8);
        }

        .ed-metric-card,
        .ed-panel {
          min-width: 0;
          border: 1px solid var(--ed-color-border-soft);
          border-radius: var(--ed-radius-md);
          background: var(--ed-color-surface-muted);
        }

        .ed-metric-card {
          position: relative;
          overflow: hidden;
          display: grid;
          grid-template-columns: 52px minmax(0, 1fr);
          column-gap: var(--ed-space-7);
          row-gap: var(--ed-space-2);
          align-items: start;
          padding: var(--ed-space-8);
        }

        .ed-metric-card::after {
          content: "";
          position: absolute;
          inset: 0 auto 0 0;
          width: 3px;
          background: var(--ed-card-accent, var(--ed-color-border-muted));
        }

        .ed-metric-card.primary {
          --ed-card-accent: var(--ed-color-text-inverse);
          --ed-card-icon-bg: var(--ed-color-accent-soft);
          --ed-card-icon-color: var(--ed-color-text-inverse);
        }

        .ed-metric-card.secondary {
          --ed-card-accent: var(--ed-color-primary);
          --ed-card-icon-bg: var(--ed-color-primary-soft);
          --ed-card-icon-color: var(--ed-color-primary);
        }

        .ed-metric-card.tertiary {
          --ed-card-accent: var(--ed-color-info);
          --ed-card-icon-bg: var(--ed-color-info-soft);
          --ed-card-icon-color: var(--ed-color-info);
        }

        .ed-metric-card.inverse {
          --ed-card-accent: var(--ed-color-success);
          --ed-card-icon-bg: var(--ed-color-success-soft);
          --ed-card-icon-color: var(--ed-color-success);
        }

        .ed-metric-head {
          display: contents;
          color: var(--ed-color-text-tertiary);
          font-size: var(--ed-font-size-sm);
          font-weight: 500;
        }

        .ed-metric-head > span:last-child {
          grid-column: 2;
          align-self: end;
          min-width: 0;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .ed-metric-icon {
          grid-row: 1 / 3;
          width: 52px;
          height: 52px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          border-radius: var(--ed-radius-sm);
          background: var(--ed-card-icon-bg, var(--ed-color-surface-strong));
          color: var(--ed-card-icon-color, var(--ed-color-text-inverse));
        }

        .ed-metric-icon svg {
          width: 22px;
          height: 22px;
        }

        .ed-metric-card strong {
          grid-column: 2;
          min-width: 0;
          overflow-wrap: anywhere;
          color: var(--ed-color-text-primary);
          font-size: var(--ed-font-size-3xl);
          line-height: 28px;
          font-variant-numeric: tabular-nums;
        }

        .ed-metric-foot {
          grid-column: 2;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: var(--ed-space-3);
          min-width: 0;
        }

        .ed-metric-card small {
          min-width: 0;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          color: var(--ed-color-text-tertiary);
          font-size: var(--ed-font-size-xs);
          line-height: 16px;
        }

        .ed-metric-foot span {
          flex: 0 0 auto;
          padding: 3px 7px;
          border-radius: var(--ed-radius-md);
          background: var(--ed-color-surface-strong);
          color: var(--ed-color-text-primary);
          font-size: var(--ed-font-size-xs);
          font-weight: 800;
          line-height: 14px;
        }

        .ed-dashboard-grid {
          min-width: 0;
          display: grid;
          grid-template-columns: minmax(0, 2fr) minmax(min(100%, 320px), 1fr);
          gap: var(--ed-space-8);
          align-items: start;
        }

        .ed-panel {
          padding: var(--ed-space-8);
        }

        .ed-panel-head {
          display: grid;
          gap: var(--ed-space-1);
          margin-bottom: var(--ed-space-8);
        }

        .ed-panel-head-split {
          display: flex;
          align-items: start;
          justify-content: space-between;
          gap: var(--ed-space-4);
        }

        .ed-panel-head h2 {
          margin: 0;
          color: var(--ed-color-text-primary);
          font-size: var(--ed-font-size-md);
          line-height: var(--ed-line-height-base);
        }

        .ed-panel-head p {
          margin: 0;
          color: var(--ed-color-text-tertiary);
          font-size: var(--ed-font-size-sm);
          line-height: 20px;
        }

        .ed-panel-chip {
          flex: 0 0 auto;
          padding: 4px 8px;
          border: 1px solid var(--ed-color-border-soft);
          border-radius: var(--ed-radius-md);
          background: var(--ed-color-surface-strong);
          color: var(--ed-color-text-inverse);
          font-size: var(--ed-font-size-xs);
          font-weight: 800;
          line-height: 16px;
        }

        .ed-trend-chart {
          width: 100%;
          max-width: 100%;
          min-height: 240px;
          display: flex;
          align-items: flex-end;
          gap: var(--ed-space-2);
          padding: var(--ed-space-4) var(--ed-space-2) 0;
          border-bottom: 1px solid var(--ed-color-border-soft);
          background-image: repeating-linear-gradient(
            to top,
            transparent 0,
            transparent 43px,
            var(--ed-color-border-soft) 44px
          );
          overflow-x: auto;
          overflow-y: hidden;
          -webkit-overflow-scrolling: touch;
        }

        .ed-trend-column {
          min-width: 42px;
          flex: 1;
          display: grid;
          justify-items: center;
          align-items: end;
          gap: 6px;
        }

        .ed-trend-column span {
          min-height: 16px;
          color: var(--ed-color-border-muted);
          font-size: var(--ed-font-size-xs);
          font-weight: 700;
          line-height: 16px;
        }

        .ed-trend-bar {
          width: 72%;
          min-height: 0;
          border-radius: var(--ed-radius-md) var(--ed-radius-md) 0 0;
          background: linear-gradient(180deg, var(--ed-color-primary), var(--ed-color-text-inverse));
          box-shadow: var(--ed-shadow-2);
        }

        .ed-trend-column small {
          color: var(--ed-color-text-tertiary);
          font-size: var(--ed-font-size-xs);
          font-weight: 500;
        }

        .ed-side-stack {
          min-width: 0;
          display: grid;
          gap: var(--ed-space-8);
        }

        .ed-list {
          display: grid;
          gap: var(--ed-space-7);
        }

        .ed-list-row {
          display: grid;
          grid-template-columns: minmax(64px, auto) minmax(0, 1fr) auto;
          align-items: center;
          gap: var(--ed-space-7);
          color: var(--ed-color-text-tertiary);
          font-size: var(--ed-font-size-sm);
        }

        .ed-country {
          display: flex;
          align-items: center;
          min-width: 0;
          gap: 8px;
        }

        .ed-country strong {
          min-width: 0;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .ed-country img {
          border: 1px solid var(--ed-color-border-soft);
        }

        .ed-country strong {
          color: var(--ed-color-text-primary);
          font-size: var(--ed-font-size-sm);
        }

        .ed-progress {
          min-width: 72px;
          height: 8px;
          overflow: hidden;
          border-radius: var(--ed-radius-sm);
          background: var(--ed-color-surface-strong);
        }

        .ed-progress span {
          display: block;
          height: 100%;
          min-width: 2px;
          background: var(--ed-color-info);
        }

        .ed-plan-grid {
          min-width: 0;
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: var(--ed-space-6);
        }

        .ed-plan-cell {
          display: grid;
          gap: var(--ed-space-1);
          padding: var(--ed-space-7);
          border: 1px solid var(--ed-color-border-soft);
          border-radius: var(--ed-radius-md);
          background: var(--ed-color-surface-muted);
        }

        .ed-plan-cell span {
          color: var(--ed-color-text-tertiary);
          font-size: var(--ed-font-size-xs);
          font-weight: 700;
          letter-spacing: 0.04em;
          text-transform: uppercase;
        }

        .ed-plan-cell strong {
          color: var(--ed-color-text-primary);
          font-size: 22px;
          line-height: 28px;
          font-variant-numeric: tabular-nums;
        }

        .ed-empty {
          padding: var(--ed-space-2);
          border: 1px dashed var(--ed-color-border-soft);
          border-radius: var(--ed-radius-md);
          color: var(--ed-color-text-tertiary);
          text-align: center;
        }

        @media (max-width: 1180px) {
          .ed-dashboard-grid {
            grid-template-columns: 1fr;
          }
        }

        @media (max-width: 640px) {
          .ed-dashboard,
          .ed-dashboard-grid,
          .ed-side-stack,
          .ed-metric-grid {
            gap: var(--ed-space-4);
          }

          .ed-dashboard-head {
            display: grid;
            align-items: start;
            padding: var(--ed-space-4);
          }

          .ed-dashboard-title h1 {
            font-size: var(--ed-font-size-3xl);
            line-height: 28px;
          }

          .ed-dashboard-actions {
            width: 100%;
            min-width: 0;
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding: var(--ed-space-3) 0 0;
            border-top: 1px solid var(--ed-color-border-soft);
            border-left: 0;
          }

          .ed-metric-grid,
          .ed-plan-grid {
            grid-template-columns: repeat(2, minmax(0, 1fr));
          }

          .ed-panel,
          .ed-metric-card {
            padding: var(--ed-space-7);
          }

          .ed-panel-head-split {
            display: grid;
          }

          .ed-metric-card {
            grid-template-columns: 42px minmax(0, 1fr);
            column-gap: 8px;
            row-gap: 2px;
          }

          .ed-metric-head {
            font-size: var(--ed-font-size-xs);
            line-height: 16px;
          }

          .ed-metric-head > span:last-child {
            white-space: normal;
          }

          .ed-metric-icon {
            width: 42px;
            height: 42px;
            border-radius: var(--ed-radius-sm);
          }

          .ed-metric-icon svg {
            width: 18px;
            height: 18px;
          }

          .ed-metric-card strong {
            font-size: 20px;
            line-height: 24px;
          }

          .ed-metric-card small {
            display: -webkit-box;
            overflow: hidden;
            -webkit-box-orient: vertical;
            -webkit-line-clamp: 2;
            white-space: normal;
          }

          .ed-metric-foot {
            display: grid;
            justify-content: stretch;
            gap: var(--ed-space-2);
          }

          .ed-panel-head {
            margin-bottom: 10px;
          }

          .ed-plan-grid,
          .ed-list {
            gap: 8px;
          }

          .ed-plan-cell {
            padding: 10px;
          }

          .ed-plan-cell strong {
            font-size: 18px;
            line-height: 22px;
          }

          .ed-trend-chart {
            min-height: 210px;
            margin-inline: calc(var(--ed-card-padding-mobile) * -1);
            width: calc(100% + (var(--ed-card-padding-mobile) * 2));
            padding-inline: var(--ed-card-padding-mobile);
          }
        }

        @media (max-width: 420px) {
          .ed-list-row {
            grid-template-columns: 1fr auto;
          }

          .ed-progress {
            grid-column: 1 / -1;
            min-width: 0;
            order: 3;
          }
        }

        @media (max-width: 360px) {
          .ed-metric-grid,
          .ed-plan-grid {
            grid-template-columns: 1fr;
          }
        }
      `}</style>
    </section>
  );
}

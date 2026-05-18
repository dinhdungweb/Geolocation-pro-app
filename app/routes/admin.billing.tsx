import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData } from "@remix-run/react";
import { useMemo, useState } from "react";
import { AlertTriangle, Clock, DollarSign, Search, Users, X } from "lucide-react";
import {
  FREE_PLAN,
  OVERAGE_RATE,
  getBillableOverageVisitors,
  getPlanLimit,
  getUnchargedBillableOverageVisitors,
  hasMonthlyUnlimitedReward,
  hasUnlimitedUsage,
} from "../billing.config";
import prisma from "../db.server";
import { requireAdminAuth } from "../utils/admin.session.server";

function formatBillingPeriodEnd(value: string | Date | null | undefined) {
  if (!value) return null;

  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;

  return new Intl.DateTimeFormat("en", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(date);
}

function getYearMonth(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function getBillingWindowMonths(periodEnd: Date | string | null | undefined) {
  if (!periodEnd) return [];

  const end = periodEnd instanceof Date ? periodEnd : new Date(periodEnd);
  if (Number.isNaN(end.getTime())) return [];

  const start = new Date(end.getTime() - 30 * 24 * 60 * 60 * 1000);
  const months: string[] = [];
  const cursor = new Date(start.getFullYear(), start.getMonth(), 1);
  const endMonth = new Date(end.getFullYear(), end.getMonth(), 1);

  while (cursor <= endMonth) {
    months.push(getYearMonth(cursor));
    cursor.setMonth(cursor.getMonth() + 1);
  }

  return months;
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await requireAdminAuth(request);

  const now = new Date();
  const calendarYearMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const prevDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const prevYearMonth = `${prevDate.getFullYear()}-${String(prevDate.getMonth() + 1).padStart(2, "0")}`;
  const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const prevMonthStart = new Date(prevDate.getFullYear(), prevDate.getMonth(), 1);

  const allSettings = await prisma.settings.findMany({ where: { NOT: { shop: "GLOBAL" } } });
  const currentPeriodKeys = allSettings.map((setting: any) => setting.billingPeriodKey || `calendar:${calendarYearMonth}`);
  const shopsWithSettings = allSettings.map((setting: any) => setting.shop);
  const legacyMonthsToCheck = Array.from(
    new Set([
      calendarYearMonth,
      prevYearMonth,
      ...allSettings.flatMap((setting: any) => getBillingWindowMonths(setting.billingPeriodEnd)),
    ]),
  );

  const [currentUsage, prevUsage, legacyCalendarUsage] = await Promise.all([
    prisma.monthlyUsage.findMany({
      where: {
        billingPeriodKey: { in: currentPeriodKeys },
      },
    }),
    prisma.analyticsCountry.groupBy({
      by: ["shop"],
      where: {
        shop: { in: shopsWithSettings },
        date: {
          gte: prevMonthStart,
          lt: currentMonthStart,
        },
      },
      _sum: { visitors: true },
    }),
    prisma.monthlyUsage.findMany({
      where: {
        shop: { in: shopsWithSettings },
        yearMonth: { in: legacyMonthsToCheck },
        billingPeriodKey: { startsWith: "calendar:" },
      },
      select: {
        shop: true,
        yearMonth: true,
      },
    }),
  ]);

  const usageMap = new Map((currentUsage as any[]).map((usage) => [`${usage.shop}:${usage.billingPeriodKey}`, usage]));
  const legacyCalendarMap = new Set((legacyCalendarUsage as any[]).map((usage) => `${usage.shop}:${usage.yearMonth}`));
  const prevUsageMap = new Map<string, number>();

  (prevUsage as any[]).forEach((usage) => {
    prevUsageMap.set(usage.shop, usage._sum?.visitors || 0);
  });

  const shops = allSettings.map((setting: any) => {
    const plan = setting.currentPlan || FREE_PLAN;
    const limit = getPlanLimit(plan, setting);
    const billingPeriodKey = setting.billingPeriodKey || `calendar:${calendarYearMonth}`;
    const usage = usageMap.get(`${setting.shop}:${billingPeriodKey}`);
    const totalVisitors = usage?.totalVisitors || 0;
    const chargedVisitors = usage?.chargedVisitors || 0;
    const hasLegacyCalendarOverlap = Boolean(
      setting.billingPeriodEnd &&
        getBillingWindowMonths(setting.billingPeriodEnd).some((month) =>
          legacyCalendarMap.has(`${setting.shop}:${month}`),
        ),
    );
    const planUnlimitedUsage = hasUnlimitedUsage(plan, setting);
    const monthlyUnlimitedReward = hasMonthlyUnlimitedReward(plan, chargedVisitors);
    const unlimitedUsage = planUnlimitedUsage || monthlyUnlimitedReward;
    const billableOverage = planUnlimitedUsage
      ? 0
      : getBillableOverageVisitors(plan, totalVisitors, limit);
    const overage = planUnlimitedUsage ? 0 : billableOverage;
    const uncharged = unlimitedUsage
      ? 0
      : getUnchargedBillableOverageVisitors(plan, totalVisitors, limit, chargedVisitors);
    const chargedAmount = Number((chargedVisitors * OVERAGE_RATE).toFixed(2));
    const unchargedAmount = Number((uncharged * OVERAGE_RATE).toFixed(2));
    const prevTotal = prevUsageMap.get(setting.shop) || 0;
    const actualOverage = planUnlimitedUsage ? 0 : billableOverage;
    const overcharged = chargedVisitors > actualOverage ? chargedVisitors - actualOverage : 0;
    const needsLegacyReview = overcharged > 0 && hasLegacyCalendarOverlap;
    const overchargedAmount = needsLegacyReview ? 0 : Number((overcharged * OVERAGE_RATE).toFixed(2));
    const chargeReviewAmount = needsLegacyReview ? Number((overcharged * OVERAGE_RATE).toFixed(2)) : 0;

    let status: "ok" | "pending" | "waiting" | "overcharged" | "charge_review" | "free_exceeded" =
      "ok";
    if (needsLegacyReview) status = "charge_review";
    else if (overcharged > 0) status = "overcharged";
    else if (plan === FREE_PLAN && totalVisitors > limit) status = "free_exceeded";
    else if (uncharged > 0 && unchargedAmount >= 1.0) status = "pending";
    else if (uncharged > 0 && unchargedAmount < 1.0) status = "waiting";

    return {
      shop: setting.shop,
      plan,
      billingPeriodKey,
      billingPeriodEnd: setting.billingPeriodEnd,
      limit,
      unlimitedUsage,
      monthlyUnlimitedReward,
      totalVisitors,
      chargedVisitors,
      overage,
      uncharged,
      chargedAmount,
      unchargedAmount,
      overcharged,
      overchargedAmount,
      chargeReviewAmount,
      hasLegacyCalendarOverlap,
      prevTotal,
      status,
    };
  });

  shops.sort((a: any, b: any) => {
    const priority: Record<string, number> = {
      overcharged: 0,
      charge_review: 1,
      pending: 2,
      free_exceeded: 3,
      waiting: 4,
      ok: 5,
    };
    const diff = (priority[a.status] ?? 5) - (priority[b.status] ?? 5);
    if (diff !== 0) return diff;
    return b.totalVisitors - a.totalVisitors;
  });

  const totalRevenue = shops.reduce((sum: number, shop: any) => sum + shop.chargedAmount, 0);
  const totalPending = shops.reduce(
    (sum: number, shop: any) => sum + (shop.status === "pending" ? shop.unchargedAmount : 0),
    0,
  );
  const totalOvercharged = shops.reduce((sum: number, shop: any) => sum + shop.overchargedAmount, 0);
  const paidShops = shops.filter((shop: any) => shop.plan !== FREE_PLAN).length;
  const issueCount = shops.filter((shop: any) =>
    ["overcharged", "pending", "charge_review"].includes(shop.status),
  ).length;

  return json({
    shops,
    yearMonth: "current Shopify billing periods",
    summary: {
      totalRevenue: totalRevenue.toFixed(2),
      totalPending: totalPending.toFixed(2),
      totalOvercharged: totalOvercharged.toFixed(2),
      paidShops,
      issueCount,
      totalShops: shops.length,
    },
  });
};

const statusLabel: Record<string, string> = {
  ok: "OK",
  waiting: "Waiting (< $1)",
  pending: "Pending Charge",
  overcharged: "Overcharged",
  charge_review: "Review Legacy",
  free_exceeded: "Free Exceeded",
};

function planClass(plan: string) {
  return `is-${(plan || FREE_PLAN).toLowerCase()}`;
}

export default function AdminBilling() {
  const { shops, yearMonth, summary } = useLoaderData<typeof loader>();
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [planFilter, setPlanFilter] = useState("all");

  const filtered = useMemo(() => {
    return (shops as any[]).filter((shop) => {
      const matchSearch = shop.shop.toLowerCase().includes(searchQuery.toLowerCase());
      const matchStatus = statusFilter === "all" || shop.status === statusFilter;
      const matchPlan = planFilter === "all" || shop.plan?.toLowerCase() === planFilter;
      return matchSearch && matchStatus && matchPlan;
    });
  }, [shops, searchQuery, statusFilter, planFilter]);

  const clearFilters = () => {
    setSearchQuery("");
    setStatusFilter("all");
    setPlanFilter("all");
  };

  const summaryCards = [
    {
      label: "Overage Revenue",
      value: `$${summary.totalRevenue}`,
      icon: <DollarSign size={18} />,
      tone: "success",
    },
    {
      label: "Pending Charges",
      value: `$${summary.totalPending}`,
      icon: <Clock size={18} />,
      tone: "warning",
    },
    {
      label: "Overcharged",
      value: `$${summary.totalOvercharged}`,
      icon: <AlertTriangle size={18} />,
      tone: "danger",
    },
    {
      label: "Paid Shops",
      value: summary.paidShops.toLocaleString(),
      icon: <Users size={18} />,
      tone: "neutral",
    },
    {
      label: "Issues",
      value: summary.issueCount.toLocaleString(),
      icon: <AlertTriangle size={18} />,
      tone: "danger",
    },
  ];

  return (
    <section className="ed-billing">
      <div className="ed-period-label">
        <Clock size={16} />
        Billing Period: {yearMonth}
      </div>

      <div className="ed-billing-cards">
        {summaryCards.map((card) => (
          <article className={`ed-billing-stat ${card.tone}`} key={card.label}>
            <span className="ed-billing-icon">{card.icon}</span>
            <div>
              <span>{card.label}</span>
              <strong>{card.value}</strong>
            </div>
          </article>
        ))}
      </div>

      <div className="ed-billing-toolbar">
        <label className="ed-billing-search">
          <Search size={18} />
          <input
            type="search"
            placeholder="Search shop"
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
          />
        </label>

        <select
          className="ed-billing-select"
          value={statusFilter}
          onChange={(event) => setStatusFilter(event.target.value)}
          aria-label="Filter by billing status"
        >
          <option value="all">All Status</option>
          <option value="ok">OK</option>
          <option value="waiting">Waiting (&lt; $1)</option>
          <option value="pending">Pending Charge</option>
          <option value="overcharged">Overcharged</option>
          <option value="charge_review">Review Legacy</option>
          <option value="free_exceeded">Free Exceeded</option>
        </select>

        <select
          className="ed-billing-select"
          value={planFilter}
          onChange={(event) => setPlanFilter(event.target.value)}
          aria-label="Filter by plan"
        >
          <option value="all">All Plans</option>
          <option value="free">Free</option>
          <option value="premium">Premium</option>
          <option value="plus">Plus</option>
          <option value="elite">Elite</option>
          <option value="custom">Custom</option>
          <option value="unlimited">Unlimited</option>
        </select>

        {(searchQuery || statusFilter !== "all" || planFilter !== "all") && (
          <button className="ed-billing-clear" type="button" onClick={clearFilters}>
            <X size={14} /> Clear
          </button>
        )}
      </div>

      <div className="ed-billing-count">
        {filtered.length} / {(shops as any[]).length} shops
      </div>

      <div className="ed-billing-table-card">
        <div className="ed-billing-table-scroll">
          <table>
            <thead>
              <tr>
                <th>Shop</th>
                <th>Plan</th>
                <th>Period Ends</th>
                <th>Limit</th>
                <th>Visitors</th>
                <th>Overage</th>
                <th>Charged</th>
                <th>Uncharged</th>
                <th>Revenue</th>
                <th>Usage</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={11}>
                    <div className="ed-billing-empty">No shops match the filter.</div>
                  </td>
                </tr>
              ) : (
                (filtered as any[]).map((shop) => {
                  const isUnlimited = shop.unlimitedUsage || shop.limit >= Number.MAX_SAFE_INTEGER;
                  const usagePercent = isUnlimited
                    ? 100
                    : Math.min(100, Math.round((shop.totalVisitors / shop.limit) * 100));
                  const periodEndLabel = formatBillingPeriodEnd(shop.billingPeriodEnd);

                  return (
                    <tr key={shop.shop}>
                      <td>
                        <strong>{shop.shop.replace(".myshopify.com", "")}</strong>
                        <small>.myshopify.com</small>
                      </td>
                      <td>
                        <span className={`ed-plan-badge ${planClass(shop.plan)}`}>{shop.plan}</span>
                      </td>
                      <td title={shop.billingPeriodKey}>
                        <strong>{periodEndLabel || (shop.plan === FREE_PLAN ? "Calendar month" : "Sync pending")}</strong>
                        <small>{periodEndLabel ? "Shopify period" : shop.billingPeriodKey}</small>
                      </td>
                      <td className="ed-number">{isUnlimited ? "Unlimited" : shop.limit.toLocaleString()}</td>
                      <td className="ed-number">
                        <strong>{shop.totalVisitors.toLocaleString()}</strong>
                        {shop.prevTotal > 0 ? <small>prev: {shop.prevTotal.toLocaleString()}</small> : null}
                      </td>
                      <td className="ed-number">
                        {shop.overage > 0 ? <span className="ed-danger">+{shop.overage.toLocaleString()}</span> : "0"}
                      </td>
                      <td className="ed-number">{shop.chargedVisitors.toLocaleString()}</td>
                      <td className="ed-number">
                        {shop.uncharged > 0 ? <span className="ed-warning">{shop.uncharged.toLocaleString()}</span> : "0"}
                      </td>
                      <td className="ed-number">
                        <strong>${shop.chargedAmount.toFixed(2)}</strong>
                        {shop.overchargedAmount > 0 ? (
                          <small className="ed-danger">+${shop.overchargedAmount.toFixed(2)} excess</small>
                        ) : null}
                        {shop.chargeReviewAmount > 0 ? (
                          <small className="ed-review">legacy review</small>
                        ) : null}
                      </td>
                      <td>
                        <span className="ed-usage-label">{isUnlimited ? "Unlimited" : `${usagePercent}%`}</span>
                        <span className="ed-usage-bar">
                          <span
                            className={isUnlimited ? "is-unlimited" : usagePercent >= 100 ? "is-danger" : usagePercent >= 80 ? "is-warning" : ""}
                            style={{ width: `${usagePercent}%` }}
                          />
                        </span>
                      </td>
                      <td>
                        <span className={`ed-status ${shop.status}`}>{statusLabel[shop.status]}</span>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      <style>{`
        .ed-billing {
          display: grid;
          gap: var(--ed-space-2);
        }

        .ed-period-label {
          width: fit-content;
          display: inline-flex;
          align-items: center;
          gap: 8px;
          min-height: 38px;
          padding: 0 12px;
          border: 1px solid var(--ed-color-surface-muted);
          border-radius: var(--ed-radius-xl);
          background: var(--ed-color-surface-strong);
          color: var(--ed-color-text-primary);
          font-size: var(--ed-font-size-sm);
          font-weight: 700;
        }

        .ed-billing-cards {
          display: grid;
          grid-template-columns: repeat(5, minmax(0, 1fr));
          gap: var(--ed-space-2);
        }

        .ed-billing-stat {
          display: grid;
          grid-template-columns: 38px minmax(0, 1fr);
          align-items: center;
          gap: 10px;
          padding: var(--ed-space-2);
          border: 1px solid var(--ed-color-surface-muted);
          border-radius: var(--ed-radius-xl);
          background: var(--ed-color-surface-strong);
        }

        .ed-billing-icon {
          width: 38px;
          height: 38px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          border-radius: var(--ed-radius-xl);
          background: #f2f8ee;
          color: var(--ed-color-border-muted);
        }

        .ed-billing-stat.warning .ed-billing-icon {
          background: #fff8e8;
          color: #f59e0b;
        }

        .ed-billing-stat.danger .ed-billing-icon {
          background: #fff2f2;
          color: #ef4444;
        }

        .ed-billing-stat span:not(.ed-billing-icon) {
          display: block;
          color: var(--ed-color-text-tertiary);
          font-size: var(--ed-font-size-xs);
          font-weight: 700;
          letter-spacing: 0.04em;
          line-height: 16px;
          text-transform: uppercase;
        }

        .ed-billing-stat strong {
          display: block;
          margin-top: var(--ed-space-1);
          color: var(--ed-color-text-primary);
          font-size: 22px;
          line-height: 28px;
          font-variant-numeric: tabular-nums;
        }

        .ed-billing-toolbar {
          display: grid;
          grid-template-columns: minmax(280px, 1fr) auto auto auto;
          align-items: center;
          gap: 10px;
        }

        .ed-billing-search,
        .ed-billing-select,
        .ed-billing-clear {
          min-height: 42px;
          border: 1px solid var(--ed-color-surface-muted);
          border-radius: var(--ed-radius-xl);
          background: var(--ed-color-surface-strong);
          color: var(--ed-color-text-primary);
          font-size: var(--ed-font-size-sm);
        }

        .ed-billing-search {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 0 12px;
          color: var(--ed-color-text-tertiary);
        }

        .ed-billing-search:focus-within {
          outline: 2px solid var(--ed-color-border-muted);
          outline-offset: 2px;
          border-color: var(--ed-color-border-muted);
        }

        .ed-billing-search input {
          width: 100%;
          min-width: 0;
          border: 0 !important;
          outline: 0 !important;
          background: transparent !important;
        }

        .ed-billing-select {
          min-width: 150px;
          padding: 0 12px;
          font-weight: 500;
        }

        .ed-billing-clear {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 7px;
          padding: 0 12px;
          font-weight: 500;
        }

        .ed-billing-clear:hover {
          border-color: var(--ed-color-border-muted);
          color: var(--ed-color-border-muted);
        }

        .ed-billing-count {
          color: var(--ed-color-text-tertiary);
          font-size: var(--ed-font-size-sm);
          text-align: right;
        }

        .ed-billing-table-card {
          overflow: hidden;
          border: 1px solid var(--ed-color-surface-muted);
          border-radius: var(--ed-radius-xl);
          background: var(--ed-color-surface-strong);
        }

        .ed-billing-table-scroll {
          overflow-x: auto;
          -webkit-overflow-scrolling: touch;
        }

        .ed-billing-table-card table {
          min-width: 1180px;
        }

        .ed-billing-table-card td strong {
          display: block;
          color: var(--ed-color-text-primary);
          font-weight: 700;
          line-height: 18px;
        }

        .ed-billing-table-card td small {
          display: block;
          color: var(--ed-color-text-tertiary);
          font-size: var(--ed-font-size-xs);
          line-height: 16px;
        }

        .ed-number {
          text-align: right;
          font-variant-numeric: tabular-nums;
        }

        .ed-danger {
          color: #ef4444 !important;
          font-weight: 700;
        }

        .ed-warning {
          color: #f59e0b !important;
          font-weight: 700;
        }

        .ed-review {
          color: #5b3b9b !important;
          font-weight: 700;
        }

        .ed-usage-label {
          display: block;
          margin-bottom: 5px;
          color: var(--ed-color-text-primary);
          font-size: var(--ed-font-size-xs);
          font-weight: 700;
        }

        .ed-usage-bar {
          display: block;
          width: 96px;
          height: 7px;
          overflow: hidden;
          border-radius: var(--ed-radius-xl);
          background: #eef1ef;
        }

        .ed-usage-bar span {
          display: block;
          height: 100%;
          min-width: 2px;
          background: var(--ed-color-border-muted);
        }

        .ed-usage-bar span.is-warning {
          background: #f59e0b;
        }

        .ed-usage-bar span.is-danger {
          background: #ef4444;
        }

        .ed-usage-bar span.is-unlimited {
          background: #10b981;
        }

        .ed-status {
          display: inline-flex;
          align-items: center;
          min-height: 26px;
          padding: 0 9px;
          border: 1px solid var(--ed-color-surface-muted);
          border-radius: var(--ed-radius-xl);
          background: #f6f8f5;
          color: var(--ed-color-text-primary);
          font-size: var(--ed-font-size-xs);
          font-weight: 700;
          white-space: nowrap;
        }

        .ed-status.ok {
          border-color: #d9e9cd;
          background: #f2f8ee;
          color: #10b981;
        }

        .ed-status.waiting,
        .ed-status.pending {
          border-color: #f4d49f;
          background: #fff8e8;
          color: #f59e0b;
        }

        .ed-status.overcharged,
        .ed-status.free_exceeded {
          border-color: #efc8c8;
          background: #fff2f2;
          color: #ef4444;
        }

        .ed-status.charge_review {
          border-color: #ddd4ef;
          background: #f8f5ff;
          color: #5b3b9b;
        }

        .ed-billing-empty {
          padding: 60px 20px;
          color: var(--ed-color-text-tertiary);
          text-align: center;
        }

        @media (max-width: 1180px) {
          .ed-billing-cards {
            grid-template-columns: repeat(2, minmax(0, 1fr));
          }

          .ed-billing-toolbar {
            grid-template-columns: 1fr 1fr;
          }

          .ed-billing-search {
            grid-column: 1 / -1;
          }
        }

        @media (max-width: 640px) {
          .ed-period-label,
          .ed-billing-count {
            width: 100%;
            text-align: left;
          }

          .ed-billing-cards,
          .ed-billing-toolbar {
            grid-template-columns: 1fr;
          }

          .ed-billing-stat {
            padding: 14px;
          }

          .ed-billing-select,
          .ed-billing-clear {
            width: 100%;
          }
        }
      `}</style>
    </section>
  );
}

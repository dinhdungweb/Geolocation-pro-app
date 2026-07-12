import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { Link, useLoaderData } from "@remix-run/react";
import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, ChevronLeft, ChevronRight, Clock, DollarSign, Search, Users, X } from "lucide-react";
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
import { resolveEffectivePlan } from "../utils/effective-plan.server";

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
  const currentPeriodKeys = allSettings.map((setting: any) => {
    const shopifyPlan = setting.currentPlan || FREE_PLAN;
    const { effectivePlan } = resolveEffectivePlan({ settings: setting, shopifyPlan });
    return effectivePlan === FREE_PLAN || hasUnlimitedUsage(effectivePlan, setting)
      ? `calendar:${calendarYearMonth}`
      : setting.billingPeriodKey || `calendar:${calendarYearMonth}`;
  });
  const shopsWithSettings = allSettings.map((setting: any) => setting.shop);
  const legacyMonthsToCheck = Array.from(
    new Set([
      calendarYearMonth,
      prevYearMonth,
      ...allSettings.flatMap((setting: any) => getBillingWindowMonths(setting.billingPeriodEnd)),
    ]),
  );

  const [currentUsage, prevUsage, legacyCalendarUsage, chargeAttempts] = await Promise.all([
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
    prisma.usageChargeAttempt.findMany({
      orderBy: { createdAt: "desc" },
      take: 100,
    }),
  ]);

  const usageMap = new Map((currentUsage as any[]).map((usage) => [`${usage.shop}:${usage.billingPeriodKey}`, usage]));
  const legacyCalendarMap = new Set((legacyCalendarUsage as any[]).map((usage) => `${usage.shop}:${usage.yearMonth}`));
  const prevUsageMap = new Map<string, number>();

  (prevUsage as any[]).forEach((usage) => {
    prevUsageMap.set(usage.shop, usage._sum?.visitors || 0);
  });

  const shops = allSettings.map((setting: any) => {
    const shopifyPlan = setting.currentPlan || FREE_PLAN;
    const { effectivePlan: plan, isBillingOverridden } = resolveEffectivePlan({
      settings: setting,
      shopifyPlan,
    });
    const limit = getPlanLimit(plan, setting);
    const billingPeriodKey = plan === FREE_PLAN || hasUnlimitedUsage(plan, setting)
      ? `calendar:${calendarYearMonth}`
      : setting.billingPeriodKey || `calendar:${calendarYearMonth}`;
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
      shopifyPlan,
      isBillingOverridden,
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
    chargeAttempts: chargeAttempts.map((c: any) => ({
      ...c,
      amount: c.amount.toString(),
      createdAt: c.createdAt.toISOString(),
    })),
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

const Pagination = ({ currentPage, totalPages, onPageChange, totalItems, itemsPerPage }: any) => {
  if (totalPages <= 1) return null;

  const startItem = (currentPage - 1) * itemsPerPage + 1;
  const endItem = Math.min(currentPage * itemsPerPage, totalItems);

  const getPageNumbers = () => {
    const pages: (number | string)[] = [];
    if (totalPages <= 5) {
      for (let i = 1; i <= totalPages; i++) {
        pages.push(i);
      }
      return pages;
    }

    pages.push(1);

    const start = Math.max(2, currentPage - 1);
    const end = Math.min(totalPages - 1, currentPage + 1);

    if (start > 2) {
      pages.push("...");
    }

    for (let i = start; i <= end; i++) {
      pages.push(i);
    }

    if (end < totalPages - 1) {
      pages.push("...");
    }

    pages.push(totalPages);
    return pages;
  };

  const pages = getPageNumbers();

  return (
    <div className="ed-pagination">
      <div className="ed-pagination-info">
        Showing <b>{startItem}</b> to <b>{endItem}</b> of <b>{totalItems}</b> entries
      </div>
      <div className="ed-pagination-buttons">
        <button
          type="button"
          disabled={currentPage === 1}
          onClick={() => onPageChange(currentPage - 1)}
          className="ed-pagination-btn"
          aria-label="Previous page"
        >
          <ChevronLeft size={16} />
        </button>
        {pages.map((page, index) => {
          if (page === "...") {
            return (
              <span key={`ellipsis-${index}`} className="ed-pagination-ellipsis">
                ...
              </span>
            );
          }
          return (
            <button
              key={page}
              type="button"
              onClick={() => onPageChange(Number(page))}
              className={`ed-pagination-btn ${currentPage === page ? "active" : ""}`}
            >
              {page}
            </button>
          );
        })}
        <button
          type="button"
          disabled={currentPage === totalPages}
          onClick={() => onPageChange(currentPage + 1)}
          className="ed-pagination-btn"
          aria-label="Next page"
        >
          <ChevronRight size={16} />
        </button>
      </div>
    </div>
  );
};

export default function AdminBilling() {
  const { shops, yearMonth, summary, chargeAttempts } = useLoaderData<typeof loader>();
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [planFilter, setPlanFilter] = useState("all");

  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 20;

  const [attemptsPage, setAttemptsPage] = useState(1);
  const attemptsPerPage = 20;

  const filtered = useMemo(() => {
    return (shops as any[]).filter((shop) => {
      const matchSearch = shop.shop.toLowerCase().includes(searchQuery.toLowerCase());
      const matchStatus = statusFilter === "all" || shop.status === statusFilter;
      const matchPlan = planFilter === "all" || shop.plan?.toLowerCase() === planFilter;
      return matchSearch && matchStatus && matchPlan;
    });
  }, [shops, searchQuery, statusFilter, planFilter]);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, statusFilter, planFilter]);

  const totalPages = Math.ceil(filtered.length / itemsPerPage);
  const paginatedShops = useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage;
    return filtered.slice(startIndex, startIndex + itemsPerPage);
  }, [filtered, currentPage, itemsPerPage]);

  const totalAttemptsPages = Math.ceil(chargeAttempts.length / attemptsPerPage);
  const paginatedAttempts = useMemo(() => {
    const startIndex = (attemptsPage - 1) * attemptsPerPage;
    return (chargeAttempts as any[]).slice(startIndex, startIndex + attemptsPerPage);
  }, [chargeAttempts, attemptsPage, attemptsPerPage]);

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

        <div className="ed-billing-filter-row">
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
                (paginatedShops as any[]).map((shop) => {
                  const isUnlimited = shop.unlimitedUsage || shop.limit >= Number.MAX_SAFE_INTEGER;
                  const usagePercent = isUnlimited
                    ? 100
                    : Math.min(100, Math.round((shop.totalVisitors / shop.limit) * 100));
                  const periodEndLabel = formatBillingPeriodEnd(shop.billingPeriodEnd);

                  return (
                    <tr key={shop.shop}>
                      <td>
                        <Link to={`/admin/shops/${shop.shop}`} className="ed-billing-shop-link">
                          <strong>{shop.shop.replace(".myshopify.com", "")}</strong>
                          <small>.myshopify.com</small>
                        </Link>
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
        <Pagination
          currentPage={currentPage}
          totalPages={totalPages}
          onPageChange={setCurrentPage}
          totalItems={filtered.length}
          itemsPerPage={itemsPerPage}
        />
      </div>

      <div className="ed-attempts-table-card" style={{ marginBottom: "32px", marginTop: "24px" }}>
        <div className="ed-attempts-table-card-head">
          <DollarSign size={18} color="var(--ed-color-text-inverse)" />
          Recent Overage Charge Attempts
        </div>
        <div className="ed-billing-table-scroll">
          <table>
            <thead>
              <tr>
                <th>Shop</th>
                <th>Created At</th>
                <th>Billing Period</th>
                <th>Overage Visitors</th>
                <th>Amount</th>
                <th>Shopify Record ID</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {chargeAttempts.length === 0 ? (
                <tr>
                  <td colSpan={7}>
                    <div className="ed-billing-empty">No billing attempts recorded.</div>
                  </td>
                </tr>
              ) : (
                (paginatedAttempts as any[]).map((attempt: any) => {
                  const createdAtLabel = new Date(attempt.createdAt).toLocaleString("en-GB", {
                    day: "2-digit",
                    month: "short",
                    year: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                  });
                  
                  const getAttemptStatusClass = (status: string) => {
                    if (status === "success" || status === "succeeded") return "ok";
                    if (status === "failed") return "overcharged";
                    return "waiting";
                  };

                  return (
                    <tr key={attempt.id}>
                      <td>
                        <Link to={`/admin/shops/${attempt.shop}`} className="ed-billing-shop-link">
                          <strong>{attempt.shop.replace(".myshopify.com", "")}</strong>
                          <small>.myshopify.com</small>
                        </Link>
                      </td>
                      <td>{createdAtLabel}</td>
                      <td>
                        <span style={{ fontWeight: 600, color: "var(--ed-color-text-primary)" }} title={attempt.billingPeriodKey}>
                          {attempt.billingPeriodKey && attempt.billingPeriodKey.includes(":") 
                            ? attempt.billingPeriodKey.split(":").pop() 
                            : attempt.billingPeriodKey}
                        </span>
                      </td>
                      <td className="ed-number"><strong>+{attempt.overageVisitors.toLocaleString()}</strong></td>
                      <td className="ed-number">
                        <strong>${Number(attempt.amount).toFixed(2)}</strong>
                      </td>
                      <td>
                        {attempt.shopifyUsageRecordId ? (
                          <span style={{ fontWeight: 500, color: "var(--ed-color-text-primary)" }} title={attempt.shopifyUsageRecordId}>
                            {attempt.shopifyUsageRecordId.replace("gid://shopify/AppUsageRecord/", "")}
                          </span>
                        ) : (
                          <span style={{ color: "var(--ed-color-text-tertiary)" }}>-</span>
                        )}
                      </td>
                      <td>
                        <span className={`ed-status ${getAttemptStatusClass(attempt.status)}`}>
                          {attempt.status.toUpperCase()}
                        </span>
                        {attempt.error && (
                          <div style={{ color: "var(--ed-color-danger)", fontSize: "var(--ed-font-size-xs)", marginTop: "var(--ed-space-2)", maxWidth: "250px", overflow: "hidden", textOverflow: "ellipsis" }} title={attempt.error}>
                            {attempt.error}
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
        <Pagination
          currentPage={attemptsPage}
          totalPages={totalAttemptsPages}
          onPageChange={setAttemptsPage}
          totalItems={chargeAttempts.length}
          itemsPerPage={attemptsPerPage}
        />
      </div>

      <style>{`
        .ed-billing {
          display: grid;
          gap: var(--ed-space-7);
        }

        .ed-period-label {
          width: fit-content;
          display: inline-flex;
          align-items: center;
          gap: var(--ed-space-5);
          min-height: 34px;
          padding: 0 var(--ed-space-7);
          border: 1px solid var(--ed-color-border-soft);
          border-radius: var(--ed-radius-sm);
          background: var(--ed-color-surface-muted);
          color: var(--ed-color-text-primary);
          font-size: var(--ed-font-size-sm);
          font-weight: 700;
        }

        .ed-billing-cards {
          display: grid;
          grid-template-columns: repeat(5, minmax(0, 1fr));
          gap: var(--ed-space-7);
        }

        .ed-billing-stat {
          display: grid;
          grid-template-columns: 42px minmax(0, 1fr);
          align-items: start;
          gap: var(--ed-space-7);
          padding: var(--ed-space-7);
          border: 1px solid var(--ed-color-border-soft);
          border-radius: var(--ed-radius-md);
          background: var(--ed-color-surface-muted);
        }

        .ed-billing-icon {
          width: 42px;
          height: 42px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          border-radius: var(--ed-radius-sm);
          background: var(--ed-color-surface-strong);
          color: var(--ed-color-text-inverse);
        }

        .ed-billing-stat.warning .ed-billing-icon {
          background: var(--ed-color-surface-strong);
          color: var(--ed-color-warning);
        }

        .ed-billing-stat.danger .ed-billing-icon {
          background: var(--ed-color-surface-strong);
          color: var(--ed-color-danger);
        }

        .ed-billing-icon svg {
          width: 22px;
          height: 22px;
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
          font-size: var(--ed-font-size-3xl);
          line-height: 26px;
          font-variant-numeric: tabular-nums;
        }

        .ed-billing-toolbar {
          display: grid;
          grid-template-columns: minmax(280px, 1fr) auto;
          align-items: center;
          gap: var(--ed-space-7);
        }

        .ed-billing-filter-row {
          display: flex;
          align-items: center;
          gap: var(--ed-space-7);
        }

        .ed-billing-search,
        .ed-billing-select,
        .ed-billing-clear {
          min-height: 42px;
          border: 1px solid var(--ed-color-border-soft);
          border-radius: var(--ed-radius-sm);
          background: var(--ed-color-surface-muted);
          color: var(--ed-color-text-primary);
          font-size: var(--ed-font-size-sm);
        }

        .ed-billing-search {
          display: flex;
          align-items: center;
          gap: var(--ed-space-6);
          padding: 0 var(--ed-space-7);
          color: var(--ed-color-text-tertiary);
        }

        .ed-billing-search:focus-within {
          outline: 2px solid var(--ed-color-text-inverse);
          outline-offset: 2px;
          border-color: var(--ed-color-text-inverse);
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
          padding: 0 var(--ed-space-7);
          font-weight: 500;
        }

        .ed-billing-clear {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: var(--ed-space-5);
          padding: 0 var(--ed-space-7);
          font-weight: 500;
        }

        .ed-billing-clear:hover {
          border-color: var(--ed-color-text-inverse);
          color: var(--ed-color-text-inverse);
        }

        .ed-billing-count {
          color: var(--ed-color-text-tertiary);
          font-size: var(--ed-font-size-sm);
          text-align: right;
          white-space: nowrap;
        }

        .ed-billing-table-card {
          overflow: hidden;
          border: 1px solid var(--ed-color-border-soft);
          border-radius: var(--ed-radius-md);
          background: var(--ed-color-surface-muted);
        }

        .ed-billing-table-scroll {
          overflow-x: auto;
          -webkit-overflow-scrolling: touch;
        }

        .ed-billing-table-card table {
          min-width: 1180px;
        }

        .ed-billing-shop-link {
          text-decoration: none;
          color: inherit;
          display: block;
        }

        .ed-billing-shop-link strong {
          display: block;
          color: var(--ed-color-text-inverse) !important;
          font-weight: 700;
          line-height: 18px;
          transition: color var(--ed-motion-instant) ease;
        }

        .ed-billing-shop-link:hover strong {
          text-decoration: underline;
          color: var(--ed-color-text-primary) !important;
        }

        .ed-billing-shop-link small {
          display: block;
          color: var(--ed-color-text-tertiary);
          font-size: var(--ed-font-size-xs);
          line-height: 16px;
        }

        .ed-billing-table-card td strong,
        .ed-attempts-table-card td strong {
          display: block;
          color: var(--ed-color-text-primary);
          font-weight: 700;
          line-height: 18px;
        }

        .ed-billing-table-card td small,
        .ed-attempts-table-card td small {
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
          color: var(--ed-color-danger) !important;
          font-weight: 700;
        }

        .ed-warning {
          color: var(--ed-color-warning) !important;
          font-weight: 700;
        }

        .ed-review {
          color: var(--ed-color-text-inverse) !important;
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
          border-radius: var(--ed-radius-xs);
          background: var(--ed-color-surface-strong);
        }

        .ed-usage-bar span {
          display: block;
          height: 100%;
          min-width: 2px;
          background: var(--ed-color-text-inverse);
        }

        .ed-usage-bar span.is-warning {
          background: var(--ed-color-warning);
        }

        .ed-usage-bar span.is-danger {
          background: var(--ed-color-danger);
        }

        .ed-usage-bar span.is-unlimited {
          background: var(--ed-color-text-inverse);
        }

        .ed-status {
          display: inline-flex;
          align-items: center;
          min-height: 26px;
          padding: 0 var(--ed-space-6);
          border: 1px solid var(--ed-color-border-soft);
          border-radius: var(--ed-radius-sm);
          background: var(--ed-color-surface-strong);
          color: var(--ed-color-text-primary);
          font-size: var(--ed-font-size-xs);
          font-weight: 700;
          white-space: nowrap;
        }

        .ed-status.ok {
          border-color: var(--ed-color-border-soft);
          background: var(--ed-color-surface-strong);
          color: var(--ed-color-text-inverse);
        }

        .ed-status.waiting,
        .ed-status.pending {
          border-color: var(--ed-color-warning);
          background: var(--ed-color-surface-strong);
          color: var(--ed-color-warning);
        }

        .ed-status.overcharged,
        .ed-status.free_exceeded {
          border-color: var(--ed-color-danger);
          background: var(--ed-color-surface-strong);
          color: var(--ed-color-danger);
        }

        .ed-status.charge_review {
          border-color: var(--ed-color-text-inverse);
          background: var(--ed-color-surface-strong);
          color: var(--ed-color-text-inverse);
        }

        .ed-billing-empty {
          padding: 60px 20px;
          color: var(--ed-color-text-tertiary);
          text-align: center;
        }

        .ed-attempts-table-card {
          overflow: hidden;
          border: 1px solid var(--ed-color-border-soft);
          border-radius: var(--ed-radius-md);
          background: var(--ed-color-surface-muted);
          box-shadow: var(--ed-shadow-2);
          transition: border-color var(--ed-motion-instant) ease;
        }

        .ed-attempts-table-card:hover {
          border-color: var(--ed-color-text-inverse);
        }

        .ed-attempts-table-card-head {
          padding: var(--ed-space-8);
          border-bottom: 1px solid var(--ed-color-border-soft);
          background: var(--ed-color-surface-strong);
          font-weight: 700;
          font-size: var(--ed-font-size-md);
          color: var(--ed-color-text-primary);
          display: flex;
          align-items: center;
          gap: var(--ed-space-6);
        }

        .ed-attempts-table-card table {
          width: 100%;
          border-collapse: separate;
          border-spacing: 0;
          min-width: 960px;
        }

        .ed-attempts-table-card th:nth-child(4),
        .ed-attempts-table-card th:nth-child(5),
        .ed-attempts-table-card td:nth-child(4),
        .ed-attempts-table-card td:nth-child(5) {
          text-align: right !important;
        }

        .ed-attempts-table-card th:nth-child(6),
        .ed-attempts-table-card th:nth-child(7),
        .ed-attempts-table-card td:nth-child(6),
        .ed-attempts-table-card td:nth-child(7) {
          text-align: left !important;
        }

        .ed-pagination {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: var(--ed-space-8);
          border-top: 1px solid var(--ed-color-border-soft);
          background: var(--ed-color-surface-muted);
          font-size: var(--ed-font-size-sm);
          color: var(--ed-color-text-tertiary);
        }

        @media (max-width: 640px) {
          .ed-pagination {
            flex-direction: column;
            gap: var(--ed-space-7);
            align-items: center;
            justify-content: center;
            text-align: center;
            padding: var(--ed-space-7) var(--ed-space-8);
          }
          .ed-pagination-info {
            margin-bottom: 4px;
          }
        }

        .ed-pagination-info b {
          color: var(--ed-color-text-primary);
        }

        .ed-pagination-buttons {
          display: inline-flex;
          align-items: center;
          border: 1px solid var(--ed-color-border-soft);
          border-radius: var(--ed-radius-sm);
          background: var(--ed-color-surface-muted);
          overflow: hidden;
          gap: 0;
        }

        .ed-pagination-btn,
        .ed-pagination-ellipsis {
          height: 34px;
          min-width: 34px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          font-size: var(--ed-font-size-sm);
          font-weight: 600;
          border: none;
          background: transparent;
          color: var(--ed-color-text-inverse);
          border-right: 1px solid var(--ed-color-border-soft);
          border-radius: 0 !important;
          margin: 0;
          padding: 0 var(--ed-space-6);
          transition: background-color var(--ed-motion-instant) ease, color var(--ed-motion-instant) ease;
          cursor: pointer;
          box-sizing: border-box;
          line-height: 1;
        }

        .ed-pagination-ellipsis {
          cursor: default;
          user-select: none;
          color: var(--ed-color-text-secondary);
        }

        .ed-pagination-buttons > button:last-child {
          border-right: none;
        }

        .ed-pagination-btn:hover:not(:disabled) {
          background: var(--ed-color-surface-strong);
          color: var(--ed-color-text-primary);
        }

        .ed-pagination-btn.active {
          background: var(--ed-color-text-inverse);
          color: var(--ed-text-inverse);
          font-weight: 700;
        }

        .ed-pagination-btn:disabled {
          opacity: 0.35;
          cursor: not-allowed;
          background: var(--ed-color-surface-strong);
        }

        @media (max-width: 1180px) {
          .ed-billing-cards {
            grid-template-columns: repeat(2, minmax(0, 1fr));
          }

          .ed-billing-toolbar {
            grid-template-columns: minmax(0, 1fr) auto;
            gap: var(--ed-space-5);
          }

          .ed-billing-search {
            grid-column: 1 / -1;
            min-height: 38px;
          }

          .ed-billing-filter-row {
            display: grid;
            grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
            gap: var(--ed-space-5);
          }

          .ed-billing-filter-row:has(.ed-billing-clear) {
            grid-column: 1 / -1;
          }

          .ed-billing-select,
          .ed-billing-clear {
            width: 100%;
            min-width: 0;
            min-height: 38px;
          }

          .ed-billing-clear {
            grid-column: 1 / -1;
          }

          .ed-billing-count {
            justify-self: end;
            font-size: var(--ed-font-size-xs);
          }
        }

        @media (max-width: 640px) {
          .ed-period-label,
          .ed-billing-count {
            width: 100%;
            text-align: left;
          }

          .ed-period-label {
            min-height: 34px;
            padding-inline: var(--ed-space-6);
            font-size: var(--ed-font-size-xs);
            white-space: nowrap;
            overflow: hidden;
          }

          .ed-period-label svg {
            flex: 0 0 auto;
          }

          .ed-billing-cards {
            grid-template-columns: repeat(2, minmax(0, 1fr));
          }

          .ed-billing-toolbar {
            grid-template-columns: 1fr;
          }

          .ed-billing-filter-row,
          .ed-billing-filter-row:has(.ed-billing-clear) {
            width: 100%;
            grid-column: auto;
            grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
          }

          .ed-billing-count {
            justify-self: start;
          }

          .ed-billing-stat {
            grid-template-columns: 42px minmax(0, 1fr);
            gap: var(--ed-space-5);
            padding: var(--ed-space-6);
          }

          .ed-billing-icon {
            width: 42px;
            height: 42px;
            border-radius: var(--ed-radius-sm);
          }

          .ed-billing-icon svg {
            width: 18px;
            height: 18px;
          }

          .ed-billing-stat span:not(.ed-billing-icon) {
            font-size: var(--ed-font-size-xs);
            line-height: 13px;
          }

          .ed-billing-stat strong {
            margin-top: 2px;
            font-size: 18px;
            line-height: 22px;
          }
        }

        @media (max-width: 360px) {
          .ed-billing-cards,
          .ed-billing-toolbar,
          .ed-billing-filter-row,
          .ed-billing-filter-row:has(.ed-billing-clear) {
            grid-template-columns: 1fr;
          }
        }
      `}</style>
    </section>
  );
}

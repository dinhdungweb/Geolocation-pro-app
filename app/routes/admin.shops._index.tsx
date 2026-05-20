import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { Link, useLoaderData } from "@remix-run/react";
import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, ExternalLink, Search, X } from "lucide-react";
import { FREE_PLAN, hasUnlimitedUsage } from "../billing.config";
import prisma from "../db.server";
import { requireAdminAuth } from "../utils/admin.session.server";
import { resolveEffectivePlan } from "../utils/effective-plan.server";

function getYearMonth(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await requireAdminAuth(request);

  const [shops, ruleCounts] = await Promise.all([
    prisma.settings.findMany({
      where: { NOT: { shop: "GLOBAL" } },
      orderBy: { createdAt: "desc" },
    }),
    prisma.redirectRule.groupBy({
      by: ["shop"],
      _count: { id: true },
    }),
  ]);

  const currentCalendarKey = `calendar:${getYearMonth()}`;
  const usagePeriodKeys = Array.from(
    new Set(shops.map((shop: any) => {
      const { effectivePlan } = resolveEffectivePlan({
        settings: shop,
        shopifyPlan: shop.currentPlan,
      });
      return effectivePlan === FREE_PLAN || hasUnlimitedUsage(effectivePlan, shop)
        ? currentCalendarKey
        : shop.billingPeriodKey || currentCalendarKey;
    })),
  );
  const usage =
    usagePeriodKeys.length > 0
      ? await prisma.monthlyUsage.findMany({
          where: {
            shop: { in: shops.map((shop: any) => shop.shop) },
            billingPeriodKey: { in: usagePeriodKeys },
          },
        })
      : [];

  const rulesMap = new Map(ruleCounts.map((rule: any) => [rule.shop, rule._count.id]));
  const usageMap = new Map((usage as any[]).map((row: any) => [`${row.shop}:${row.billingPeriodKey}`, row]));

  return json({
    shops: shops.map((shop: any) => {
      const { effectivePlan, isBillingOverridden } = resolveEffectivePlan({
        settings: shop,
        shopifyPlan: shop.currentPlan,
      });
      const usagePeriodKey = effectivePlan === FREE_PLAN || hasUnlimitedUsage(effectivePlan, shop)
        ? currentCalendarKey
        : shop.billingPeriodKey || currentCalendarKey;

      return {
        ...shop,
        currentPlan: effectivePlan,
        shopifyPlan: shop.currentPlan,
        isBillingOverridden,
        createdAt: shop.createdAt.toISOString(),
        ruleCount: rulesMap.get(shop.shop) || 0,
        latestUsage: usageMap.get(`${shop.shop}:${usagePeriodKey}`),
      };
    }),
  });
};

function planClass(plan?: string | null) {
  const normalized = (plan || "free").toLowerCase();
  if (normalized === "elite") return "is-elite";
  if (normalized === "plus") return "is-plus";
  if (normalized === "premium") return "is-premium";
  if (normalized === "custom") return "is-custom";
  if (normalized === "unlimited") return "is-custom";
  return "is-free";
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

export default function AdminShops() {
  const { shops } = useLoaderData<typeof loader>();
  const [searchQuery, setSearchQuery] = useState("");
  const [planFilter, setPlanFilter] = useState("all");
  const [modeFilter, setModeFilter] = useState("all");

  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 20;

  const uniquePlans = useMemo(() => {
    const plans = new Set(shops.map((shop: any) => shop.currentPlan?.toLowerCase()).filter(Boolean));
    return Array.from(plans).sort();
  }, [shops]);

  const filteredShops = useMemo(() => {
    return shops.filter((shop: any) => {
      const shopMode = shop.mode || "popup";
      const matchesSearch = shop.shop.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesPlan =
        planFilter === "all" || shop.currentPlan?.toLowerCase() === planFilter.toLowerCase();
      const matchesMode = modeFilter === "all" || shopMode === modeFilter;
      return matchesSearch && matchesPlan && matchesMode;
    });
  }, [shops, searchQuery, planFilter, modeFilter]);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, planFilter, modeFilter]);

  const totalPages = Math.ceil(filteredShops.length / itemsPerPage);
  const paginatedShops = useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage;
    return filteredShops.slice(startIndex, startIndex + itemsPerPage);
  }, [filteredShops, currentPage, itemsPerPage]);

  const clearFilters = () => {
    setSearchQuery("");
    setPlanFilter("all");
    setModeFilter("all");
  };

  return (
    <section className="ed-shops">
      <div className="ed-shops-toolbar">
        <label className="ed-search-field">
          <Search size={18} />
          <input
            type="search"
            placeholder="Search shops by domain"
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
          />
        </label>

        <div className="ed-filter-row">
          <select
            className="ed-select"
            value={planFilter}
            onChange={(event) => setPlanFilter(event.target.value)}
            aria-label="Filter by plan"
          >
            <option value="all">All Plans</option>
            {uniquePlans.map((plan: string) => (
              <option key={plan} value={plan}>
                {plan.toUpperCase()} Plan
              </option>
            ))}
          </select>

          <select
            className="ed-select"
            value={modeFilter}
            onChange={(event) => setModeFilter(event.target.value)}
            aria-label="Filter by mode"
          >
            <option value="all">All Modes</option>
            <option value="popup">Popup</option>
            <option value="auto_redirect">Auto Redirect</option>
          </select>

          {(searchQuery || planFilter !== "all" || modeFilter !== "all") && (
            <button className="ed-clear-button" type="button" onClick={clearFilters}>
              <X size={14} />
              Clear
            </button>
          )}
        </div>


      </div>

      <div className="ed-table-card">
        <div className="ed-table-scroll">
          <table>
            <thead>
              <tr>
                <th>Shop Domain</th>
                <th>Plan</th>
                <th>Active Mode</th>
                <th>Rules</th>
                <th>Traffic (Current Period)</th>
                <th>Installed</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredShops.length === 0 ? (
                <tr>
                  <td colSpan={7}>
                    <div className="ed-empty-state">
                      <Search size={34} />
                      <strong>No merchants found</strong>
                      <span>Try adjusting your search or filters.</span>
                    </div>
                  </td>
                </tr>
              ) : (
                (paginatedShops as any[]).map((shop: any) => {
                  const mode = shop.mode || "popup";
                  const periodActions = shop.latestUsage?.redirected || 0;

                  return (
                    <tr key={shop.id}>
                      <td>
                        <Link to={`/admin/shops/${shop.shop}`} className="ed-shop-link">
                          {shop.shop}
                        </Link>
                      </td>
                      <td>
                        <span className={`ed-plan-badge ${planClass(shop.currentPlan)}`}>
                          {(shop.currentPlan || "free").toUpperCase()}
                        </span>
                      </td>
                      <td>
                        <span className="ed-mode">
                          <span className={mode === "auto_redirect" ? "ed-mode-dot is-auto" : "ed-mode-dot"} />
                          {mode.replace("_", " ").toUpperCase()}
                        </span>
                      </td>
                      <td>
                        <strong>{shop.ruleCount}</strong> active
                      </td>
                      <td>
                        <strong>{shop.latestUsage?.totalVisitors?.toLocaleString() || 0}</strong>
                        <small>{periodActions.toLocaleString()} actions</small>
                      </td>
                      <td>{new Date(shop.createdAt).toLocaleDateString("en-GB")}</td>
                      <td>
                        <Link to={`/admin/shops/${shop.shop}`} className="ed-manage-link">
                          Manage <ExternalLink size={14} />
                        </Link>
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
          totalItems={filteredShops.length}
          itemsPerPage={itemsPerPage}
        />
      </div>

      <style>{`
        .ed-shops {
          display: grid;
          gap: var(--ed-space-2);
        }

        .ed-shops-toolbar {
          display: grid;
          grid-template-columns: minmax(280px, 1fr) auto;
          align-items: center;
          gap: 12px;
        }

        .ed-search-field {
          min-height: 42px;
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 0 12px;
          border: 1px solid var(--ed-color-surface-muted);
          border-radius: var(--ed-radius-xl);
          background: var(--ed-color-surface-strong);
          color: var(--ed-color-text-tertiary);
        }

        .ed-search-field:focus-within {
          outline: 2px solid var(--ed-color-border-muted);
          outline-offset: 2px;
          border-color: var(--ed-color-border-muted);
        }

        .ed-search-field input {
          width: 100%;
          min-width: 0;
          border: 0 !important;
          outline: 0 !important;
          background: transparent !important;
          font-size: var(--ed-font-size-sm);
        }

        .ed-filter-row {
          display: flex;
          align-items: center;
          gap: 10px;
        }

        .ed-select,
        .ed-clear-button,
        .ed-manage-link {
          min-height: 42px;
          border: 1px solid var(--ed-color-surface-muted);
          border-radius: var(--ed-radius-xl);
          background: var(--ed-color-surface-strong);
          color: var(--ed-color-text-primary);
          font-size: var(--ed-font-size-sm);
          font-weight: 500;
        }

        .ed-select {
          min-width: 150px;
          padding: 0 12px;
        }

        .ed-clear-button,
        .ed-manage-link {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 7px;
          padding: 0 12px;
          text-decoration: none;
        }

        .ed-clear-button:hover,
        .ed-manage-link:hover {
          border-color: var(--ed-color-border-muted);
          color: var(--ed-color-border-muted);
        }

        .ed-result-count {
          color: var(--ed-color-text-tertiary);
          font-size: var(--ed-font-size-sm);
          white-space: nowrap;
        }

        .ed-result-count strong {
          color: var(--ed-color-text-primary);
        }

        .ed-table-card {
          overflow: hidden;
          border: 1px solid var(--ed-color-surface-muted);
          border-radius: var(--ed-radius-xl);
          background: var(--ed-color-surface-strong);
        }

        .ed-table-scroll {
          width: 100%;
          overflow-x: auto;
          -webkit-overflow-scrolling: touch;
        }

        .ed-table-card table {
          min-width: 940px;
        }

        .ed-shop-link {
          color: var(--ed-text-link);
          font-weight: 700;
          text-decoration: none;
        }

        .ed-shop-link:hover {
          text-decoration: underline;
        }

        .ed-plan-badge {
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
          letter-spacing: 0.03em;
        }

        .ed-plan-badge.is-plus,
        .ed-plan-badge.is-elite,
        .ed-plan-badge.is-custom,
        .ed-plan-badge.is-premium {
          border-color: #b2e5e2;
          background: #e8fbfa;
          color: #0a9f98;
        }

        .ed-mode {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          color: var(--ed-color-text-primary);
          font-size: var(--ed-font-size-xs);
          font-weight: 700;
        }

        .ed-mode-dot {
          width: 8px;
          height: 8px;
          border-radius: 999px;
          background: #43b9b2;
        }

        .ed-mode-dot.is-auto {
          background: var(--ed-color-border-muted);
        }

        .ed-table-card td small {
          display: block;
          color: var(--ed-color-text-tertiary);
          font-size: var(--ed-font-size-xs);
          line-height: 16px;
        }

        .ed-empty-state {
          min-height: 220px;
          display: grid;
          place-items: center;
          align-content: center;
          gap: 8px;
          color: var(--ed-color-text-tertiary);
          text-align: center;
        }

        .ed-empty-state strong {
          color: var(--ed-color-text-primary);
        }

        @media (max-width: 980px) {
          .ed-shops-toolbar {
            grid-template-columns: minmax(0, 1fr) auto;
            gap: 8px;
            align-items: center;
          }

          .ed-search-field {
            grid-column: 1 / -1;
            min-height: 38px;
          }

          .ed-filter-row {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 8px;
          }

          .ed-select,
          .ed-clear-button {
            min-height: 38px;
          }

          .ed-filter-row:has(.ed-clear-button) {
            grid-column: 1 / -1;
            grid-template-columns: 1fr 1fr auto;
          }

          .ed-filter-row:has(.ed-clear-button) .ed-clear-button {
            grid-column: 1 / -1;
          }

          .ed-result-count {
            justify-self: end;
            white-space: nowrap;
          }
        }

        @media (max-width: 520px) {
          .ed-shops-toolbar {
            grid-template-columns: 1fr;
          }

          .ed-filter-row {
            width: 100%;
            grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
          }

          .ed-filter-row:has(.ed-clear-button) {
            grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
          }

          .ed-select {
            width: 100%;
            min-width: 0;
          }

          .ed-result-count {
            justify-self: start;
            font-size: var(--ed-font-size-xs);
          }
        }

        @media (max-width: 360px) {
          .ed-filter-row,
          .ed-filter-row:has(.ed-clear-button) {
            grid-template-columns: 1fr;
          }
        }

        .ed-pagination {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 16px 20px;
          border-top: 1px solid var(--ed-color-surface-muted);
          background: var(--ed-color-surface-strong);
          font-size: var(--ed-font-size-sm);
          color: var(--ed-color-text-tertiary);
        }

        @media (max-width: 640px) {
          .ed-pagination {
            flex-direction: column;
            gap: 12px;
            align-items: center;
            justify-content: center;
            text-align: center;
            padding: 12px 16px;
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
          border: 1px solid #b2e5e2;
          border-radius: 8px;
          background: white;
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
          font-size: 13px;
          font-weight: 600;
          border: none;
          background: transparent;
          color: #43b9b2;
          border-right: 1px solid #b2e5e2;
          border-radius: 0 !important;
          margin: 0;
          padding: 0 10px;
          transition: all 0.15s ease;
          cursor: pointer;
          box-sizing: border-box;
          line-height: 1;
        }

        .ed-pagination-btn:last-child {
          border-right: none;
        }

        .ed-pagination-btn:hover:not(:disabled) {
          background: #e8fbfa;
          color: #0a9f98;
        }

        .ed-pagination-btn.active {
          background: #e8fbfa;
          color: #0a9f98;
        }

        .ed-pagination-btn:disabled {
          color: var(--ed-color-text-disabled, #cbd5e1);
          cursor: not-allowed;
          background: #f8fafc;
        }

        .ed-pagination-ellipsis {
          color: #74cdc8;
          cursor: default;
        }
      `}</style>
    </section>
  );
}

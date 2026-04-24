import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData } from "@remix-run/react";
import { requireAdminAuth } from "../utils/admin.session.server";
import prisma from "../db.server";
import { PLAN_LIMITS, FREE_PLAN, OVERAGE_RATE } from "../billing.config";
import { useState, useMemo } from "react";
import { Search, X, DollarSign, AlertTriangle, Users, TrendingUp, CheckCircle, Clock } from "lucide-react";

export const loader = async ({ request }: LoaderFunctionArgs) => {
    await requireAdminAuth(request);

    const now = new Date();
    const yearMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

    // Previous month for comparison
    const prevDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const prevYearMonth = `${prevDate.getFullYear()}-${String(prevDate.getMonth() + 1).padStart(2, '0')}`;

    const [allSettings, currentUsage, prevUsage] = await Promise.all([
        prisma.settings.findMany({ where: { NOT: { shop: 'GLOBAL' } } }),
        (prisma as any).monthlyUsage.findMany({ where: { yearMonth } }),
        (prisma as any).monthlyUsage.findMany({ where: { yearMonth: prevYearMonth } }),
    ]);

    const usageMap = new Map((currentUsage as any[]).map((u) => [u.shop, u]));
    const prevUsageMap = new Map((prevUsage as any[]).map((u) => [u.shop, u]));

    const shops = allSettings.map((s: any) => {
        const plan = s.currentPlan || FREE_PLAN;
        const limit = PLAN_LIMITS[plan as keyof typeof PLAN_LIMITS] || PLAN_LIMITS[FREE_PLAN];
        const usage = usageMap.get(s.shop);
        const prev = prevUsageMap.get(s.shop);

        const totalVisitors = usage?.totalVisitors || 0;
        const chargedVisitors = usage?.chargedVisitors || 0;
        const overage = Math.max(0, totalVisitors - limit);
        const uncharged = Math.max(0, totalVisitors - limit - chargedVisitors);
        const chargedAmount = Number((chargedVisitors * OVERAGE_RATE).toFixed(2));
        const unchargedAmount = Number((uncharged * OVERAGE_RATE).toFixed(2));
        const prevTotal = prev?.totalVisitors || 0;

        // Detect overcharge: chargedVisitors > actual overage
        const actualOverage = Math.max(0, totalVisitors - limit);
        const overcharged = chargedVisitors > actualOverage ? chargedVisitors - actualOverage : 0;
        const overchargedAmount = Number((overcharged * OVERAGE_RATE).toFixed(2));

        let status: 'ok' | 'pending' | 'waiting' | 'overcharged' | 'free_exceeded' = 'ok';
        if (overcharged > 0) status = 'overcharged';
        else if (plan === FREE_PLAN && totalVisitors > limit) status = 'free_exceeded';
        else if (uncharged > 0 && unchargedAmount >= 1.00) status = 'pending';
        else if (uncharged > 0 && unchargedAmount < 1.00) status = 'waiting';

        return {
            shop: s.shop,
            plan,
            limit,
            totalVisitors,
            chargedVisitors,
            overage,
            uncharged,
            chargedAmount,
            unchargedAmount,
            overcharged,
            overchargedAmount,
            prevTotal,
            status,
        };
    });

    // Sort: issues first, then by totalVisitors desc
    shops.sort((a: any, b: any) => {
        const priority: Record<string, number> = { overcharged: 0, pending: 1, free_exceeded: 2, waiting: 3, ok: 4 };
        const diff = (priority[a.status] || 4) - (priority[b.status] || 4);
        if (diff !== 0) return diff;
        return b.totalVisitors - a.totalVisitors;
    });

    // Summary stats
    const totalRevenue = shops.reduce((s: number, x: any) => s + x.chargedAmount, 0);
    const totalPending = shops.reduce((s: number, x: any) => s + (x.status === 'pending' ? x.unchargedAmount : 0), 0);
    const totalOvercharged = shops.reduce((s: number, x: any) => s + x.overchargedAmount, 0);
    const paidShops = shops.filter((x: any) => x.plan !== FREE_PLAN).length;
    const issueCount = shops.filter((x: any) => x.status === 'overcharged' || x.status === 'pending').length;

    return json({
        shops,
        yearMonth,
        prevYearMonth,
        summary: {
            totalRevenue: totalRevenue.toFixed(2),
            totalPending: totalPending.toFixed(2),
            totalOvercharged: totalOvercharged.toFixed(2),
            paidShops,
            issueCount,
            totalShops: shops.length,
        }
    });
};

export default function AdminBilling() {
    const { shops, yearMonth, summary } = useLoaderData<typeof loader>();
    const [searchQuery, setSearchQuery] = useState("");
    const [statusFilter, setStatusFilter] = useState("all");
    const [planFilter, setPlanFilter] = useState("all");

    const filtered = useMemo(() => {
        return (shops as any[]).filter((s) => {
            const matchSearch = s.shop.toLowerCase().includes(searchQuery.toLowerCase());
            const matchStatus = statusFilter === "all" || s.status === statusFilter;
            const matchPlan = planFilter === "all" || s.plan === planFilter;
            return matchSearch && matchStatus && matchPlan;
        });
    }, [shops, searchQuery, statusFilter, planFilter]);

    const statusConfig: Record<string, { label: string; color: string; bg: string; border: string }> = {
        ok: { label: 'OK', color: '#10b981', bg: '#ecfdf5', border: '#a7f3d0' },
        waiting: { label: 'Waiting (< $1)', color: '#f59e0b', bg: '#fffbeb', border: '#fde68a' },
        pending: { label: 'Pending Charge', color: '#ef4444', bg: '#fef2f2', border: '#fecaca' },
        overcharged: { label: 'Overcharged', color: '#dc2626', bg: '#fef2f2', border: '#fca5a5' },
        free_exceeded: { label: 'Free Exceeded', color: '#6b7280', bg: '#f9fafb', border: '#e5e7eb' },
    };

    return (
        <div>
            <style>{`
                .billing-cards {
                    display: grid;
                    grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
                    gap: 20px;
                    margin-bottom: 32px;
                }
                .stat-card {
                    background: white;
                    border: 1px solid var(--border);
                    border-radius: 20px;
                    padding: 24px;
                    position: relative;
                    overflow: hidden;
                }
                .stat-card::before {
                    content: '';
                    position: absolute;
                    top: 0; left: 0; right: 0;
                    height: 4px;
                }
                .stat-card.revenue::before { background: linear-gradient(90deg, #10b981, #34d399); }
                .stat-card.pending::before { background: linear-gradient(90deg, #f59e0b, #fbbf24); }
                .stat-card.overcharged::before { background: linear-gradient(90deg, #ef4444, #f87171); }
                .stat-card.shops::before { background: linear-gradient(90deg, #6366f1, #8b5cf6); }
                .stat-card.issues::before { background: linear-gradient(90deg, #ec4899, #f472b6); }

                .stat-icon {
                    width: 44px; height: 44px;
                    border-radius: 14px;
                    display: flex; align-items: center; justify-content: center;
                    margin-bottom: 16px;
                }
                .stat-label { font-size: 12px; font-weight: 700; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 8px; }
                .stat-value { font-size: 28px; font-weight: 800; color: var(--text); letter-spacing: -0.02em; }

                .billing-toolbar {
                    display: grid;
                    grid-template-columns: 1fr auto auto auto;
                    gap: 12px;
                    margin-bottom: 24px;
                    align-items: center;
                }
                .billing-search {
                    background: white; border: 1px solid var(--border); border-radius: 12px;
                    padding: 12px 20px; display: flex; align-items: center; gap: 12px;
                    transition: all 0.2s;
                }
                .billing-search:focus-within { border-color: var(--primary); box-shadow: 0 0 0 2px rgba(99, 102, 241, 0.1); }
                .billing-search input { border: none; outline: none; width: 100%; font-size: 14px; font-family: inherit; }

                .b-filter {
                    appearance: none; background: white; border: 1px solid var(--border);
                    border-radius: 12px; padding: 12px 36px 12px 16px; font-size: 13px; font-weight: 600;
                    cursor: pointer; color: var(--text); min-width: 140px;
                    background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' stroke='%2364748b' stroke-width='2'%3E%3Cpath stroke-linecap='round' stroke-linejoin='round' d='M19 9l-7 7-7-7'%3E%3C/path%3E%3C/svg%3E");
                    background-repeat: no-repeat; background-position: right 12px center; background-size: 14px;
                }
                .b-filter:focus { outline: none; border-color: var(--primary); }

                .b-clear {
                    display: flex; align-items: center; gap: 6px;
                    color: #ec4899; background: #fdf2f8; border: 1px solid #fbcfe8;
                    padding: 11px 14px; border-radius: 10px; font-size: 13px; font-weight: 600;
                    cursor: pointer; transition: all 0.2s;
                }
                .b-clear:hover { background: #fce7f3; }

                .billing-table-card {
                    background: white; border-radius: 24px; border: 1px solid var(--border);
                    overflow: hidden; box-shadow: 0 4px 20px rgba(0,0,0,0.03);
                }
                .billing-table-wrap { width: 100%; overflow-x: auto; }
                .billing-table { width: 100%; border-collapse: collapse; min-width: 1100px; }
                .billing-table th {
                    padding: 16px 20px; background: #f8fafc;
                    font-size: 11px; font-weight: 700; color: var(--text-muted);
                    text-transform: uppercase; letter-spacing: 0.06em;
                    border-bottom: 1px solid var(--border);
                    text-align: left;
                }
                .billing-table th.text-right { text-align: right; }
                .billing-table td { padding: 16px 20px; border-bottom: 1px solid var(--border); font-size: 14px; }
                .billing-table tr:last-child td { border-bottom: none; }
                .billing-table tr:hover td { background: #f9fafb; }

                .plan-tag {
                    padding: 4px 10px; border-radius: 6px; font-size: 11px; font-weight: 800;
                    text-transform: uppercase; letter-spacing: 0.02em; display: inline-block;
                }
                .plan-tag.free { background: #f1f5f9; color: #64748b; }
                .plan-tag.premium { background: #eef2ff; color: #6366f1; }
                .plan-tag.plus { background: #ecfdf5; color: #10b981; }
                .plan-tag.elite { background: #faf5ff; color: #a855f7; }

                .status-tag {
                    padding: 4px 10px; border-radius: 6px; font-size: 11px; font-weight: 700;
                    display: inline-block;
                    white-space: nowrap;
                }

                .mono { font-family: 'SF Mono', 'Fira Code', monospace; font-size: 13px; }
                .text-right { text-align: right; }
                .text-green { color: #10b981; }
                .text-red { color: #ef4444; }
                .text-amber { color: #f59e0b; }
                .text-muted { color: var(--text-muted); }

                .progress-bar {
                    height: 6px; background: #f1f5f9; border-radius: 3px; overflow: hidden; margin-top: 6px;
                }
                .progress-fill { height: 100%; border-radius: 3px; transition: width 0.3s; }

                .month-badge {
                    display: inline-flex; align-items: center; gap: 8px;
                    background: #f8fafc; border: 1px solid var(--border);
                    padding: 8px 16px; border-radius: 10px; font-size: 14px; font-weight: 700;
                    color: var(--text); margin-bottom: 24px;
                }

                @media (max-width: 1024px) {
                    .billing-toolbar {
                        grid-template-columns: 1fr 1fr;
                    }
                    .billing-search { grid-column: span 2; }
                }

                @media (max-width: 768px) {
                    .billing-cards { grid-template-columns: repeat(2, 1fr); }
                    .billing-toolbar { 
                        grid-template-columns: 1fr;
                    }
                    .billing-search { grid-column: span 1; }
                    .shops-count { text-align: left !important; margin-top: 8px; }
                }
            `}</style>

            <div className="month-badge">
                <Clock size={16} />
                Billing Period: {yearMonth}
            </div>

            {/* Summary Cards */}
            <div className="billing-cards">
                <div className="stat-card revenue">
                    <div className="stat-icon" style={{ background: '#ecfdf5', color: '#10b981' }}>
                        <DollarSign size={22} />
                    </div>
                    <div className="stat-label">Overage Revenue</div>
                    <div className="stat-value text-green">${summary.totalRevenue}</div>
                </div>
                <div className="stat-card pending">
                    <div className="stat-icon" style={{ background: '#fffbeb', color: '#f59e0b' }}>
                        <Clock size={22} />
                    </div>
                    <div className="stat-label">Pending Charges</div>
                    <div className="stat-value text-amber">${summary.totalPending}</div>
                </div>
                <div className="stat-card overcharged">
                    <div className="stat-icon" style={{ background: '#fef2f2', color: '#ef4444' }}>
                        <AlertTriangle size={22} />
                    </div>
                    <div className="stat-label">Overcharged</div>
                    <div className="stat-value text-red">${summary.totalOvercharged}</div>
                </div>
                <div className="stat-card shops">
                    <div className="stat-icon" style={{ background: '#eef2ff', color: '#6366f1' }}>
                        <Users size={22} />
                    </div>
                    <div className="stat-label">Paid Shops</div>
                    <div className="stat-value">{summary.paidShops}</div>
                </div>
                <div className="stat-card issues">
                    <div className="stat-icon" style={{ background: '#fdf2f8', color: '#ec4899' }}>
                        <AlertTriangle size={22} />
                    </div>
                    <div className="stat-label">Issues</div>
                    <div className="stat-value">{summary.issueCount}</div>
                </div>
            </div>

            {/* Toolbar */}
            <div className="billing-toolbar">
                <div className="billing-search">
                    <Search size={18} color="var(--text-muted)" />
                    <input
                        type="text"
                        placeholder="Search shop..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                    />
                </div>
                <select className="b-filter" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
                    <option value="all">All Status</option>
                    <option value="ok">OK</option>
                    <option value="waiting">Waiting (&lt; $1)</option>
                    <option value="pending">Pending Charge</option>
                    <option value="overcharged">Overcharged</option>
                    <option value="free_exceeded">Free Exceeded</option>
                </select>
                <select className="b-filter" value={planFilter} onChange={(e) => setPlanFilter(e.target.value)}>
                    <option value="all">All Plans</option>
                    <option value="free">Free</option>
                    <option value="premium">Premium</option>
                    <option value="plus">Plus</option>
                    <option value="elite">Elite</option>
                </select>
                {(searchQuery || statusFilter !== "all" || planFilter !== "all") && (
                    <button className="b-clear" onClick={() => { setSearchQuery(""); setStatusFilter("all"); setPlanFilter("all"); }}>
                        <X size={14} /> Clear
                    </button>
                )}
            </div>
            <div className="shops-count" style={{ color: 'var(--text-muted)', fontSize: '13px', fontWeight: 600, marginBottom: '16px', textAlign: 'right' }}>
                {filtered.length} / {(shops as any[]).length} shops
            </div>

            {/* Table */}
            <div className="billing-table-card">
                <div className="billing-table-wrap">
                    <table className="billing-table">
                        <thead>
                            <tr>
                                <th>Shop</th>
                                <th>Plan</th>
                                <th className="text-right">Limit</th>
                                <th className="text-right">Visitors</th>
                                <th className="text-right">Overage</th>
                                <th className="text-right">Charged</th>
                                <th className="text-right">Uncharged</th>
                                <th className="text-right">Revenue</th>
                                <th>Usage</th>
                                <th>Status</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filtered.length === 0 ? (
                                <tr>
                                    <td colSpan={10} style={{ textAlign: 'center', padding: '60px', color: 'var(--text-muted)' }}>
                                        No shops match the filter
                                    </td>
                                </tr>
                            ) : (
                                (filtered as any[]).map((s) => {
                                    const sc = statusConfig[s.status] || statusConfig.ok;
                                    const usagePercent = Math.min(100, Math.round((s.totalVisitors / s.limit) * 100));
                                    const barColor = usagePercent >= 100 ? '#ef4444' : usagePercent >= 80 ? '#f59e0b' : '#10b981';

                                    return (
                                        <tr key={s.shop}>
                                            <td>
                                                <div style={{ fontWeight: 600, fontSize: '13px' }}>{s.shop.replace('.myshopify.com', '')}</div>
                                                <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>.myshopify.com</div>
                                            </td>
                                            <td>
                                                <span className={`plan-tag ${s.plan}`}>{s.plan}</span>
                                            </td>
                                            <td className="mono text-right">{s.limit.toLocaleString()}</td>
                                            <td className="mono text-right">
                                                <b>{s.totalVisitors.toLocaleString()}</b>
                                                {s.prevTotal > 0 && (
                                                    <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                                                        prev: {s.prevTotal.toLocaleString()}
                                                    </div>
                                                )}
                                            </td>
                                            <td className="mono text-right">
                                                {s.overage > 0 ? (
                                                    <span style={{ color: '#ef4444', fontWeight: 600 }}>+{s.overage.toLocaleString()}</span>
                                                ) : (
                                                    <span className="text-muted">0</span>
                                                )}
                                            </td>
                                            <td className="mono text-right">
                                                {s.chargedVisitors > 0 ? s.chargedVisitors.toLocaleString() : <span className="text-muted">0</span>}
                                            </td>
                                            <td className="mono text-right">
                                                {s.uncharged > 0 ? (
                                                    <span style={{ color: '#f59e0b', fontWeight: 600 }}>{s.uncharged.toLocaleString()}</span>
                                                ) : (
                                                    <span className="text-muted">0</span>
                                                )}
                                            </td>
                                            <td className="mono text-right">
                                                {s.chargedAmount > 0 ? (
                                                    <span className="text-green" style={{ fontWeight: 700 }}>${s.chargedAmount.toFixed(2)}</span>
                                                ) : (
                                                    <span className="text-muted">$0.00</span>
                                                )}
                                                {s.overchargedAmount > 0 && (
                                                    <div style={{ fontSize: '11px', color: '#ef4444', fontWeight: 600 }}>
                                                        +${s.overchargedAmount.toFixed(2)} excess
                                                    </div>
                                                )}
                                            </td>
                                            <td style={{ minWidth: '100px' }}>
                                                <div style={{ fontSize: '11px', fontWeight: 700, color: barColor }}>{usagePercent}%</div>
                                                <div className="progress-bar">
                                                    <div className="progress-fill" style={{ width: `${usagePercent}%`, background: barColor }} />
                                                </div>
                                            </td>
                                            <td>
                                                <span
                                                    className="status-tag"
                                                    style={{ background: sc.bg, color: sc.color, border: `1px solid ${sc.border}` }}
                                                >
                                                    {sc.label}
                                                </span>
                                            </td>
                                        </tr>
                                    );
                                })
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}

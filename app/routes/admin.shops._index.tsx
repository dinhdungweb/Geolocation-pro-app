import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData, Link } from "@remix-run/react";
import prisma from "../db.server";
import { requireAdminAuth } from "../utils/admin.session.server";
import { useState, useMemo } from "react";
import { Search, ExternalLink, Filter, X } from "lucide-react";

export const loader = async ({ request }: LoaderFunctionArgs) => {
    await requireAdminAuth(request);
    
    const [shops, ruleCounts, usage] = await Promise.all([
        prisma.settings.findMany({
            orderBy: { createdAt: "desc" },
        }),
        prisma.redirectRule.groupBy({
            by: ['shop'],
            _count: { id: true }
        }),
        prisma.monthlyUsage.findMany({
            orderBy: { yearMonth: "desc" }
        })
    ]);

    const rulesMap = new Map(ruleCounts.map((r: any) => [r.shop, r._count.id]));
    
    // Create usage map - since usage is ordered by yearMonth DESC, 
    // we want the FIRST occurrence for each shop (the latest month)
    const usageMap = new Map();
    usage.forEach((u: any) => {
        if (!usageMap.has(u.shop)) {
            usageMap.set(u.shop, u);
        }
    });

    return json({ 
        shops: shops.map((s: any) => ({
            ...s,
            createdAt: s.createdAt.toISOString(),
            ruleCount: rulesMap.get(s.shop) || 0,
            latestUsage: usageMap.get(s.shop)
        }))
    });
};

export default function AdminShops() {
    const { shops } = useLoaderData<typeof loader>();
    
    const [searchQuery, setSearchQuery] = useState("");
    const [planFilter, setPlanFilter] = useState("all");
    const [modeFilter, setModeFilter] = useState("all");

    // Dynamic plans list from actual data
    const uniquePlans = useMemo(() => {
        const plans = new Set(shops.map((s: any) => s.currentPlan?.toLowerCase()).filter(Boolean));
        return Array.from(plans).sort();
    }, [shops]);

    const filteredShops = useMemo(() => {
        return shops.filter((shop: any) => {
            const matchesSearch = shop.shop.toLowerCase().includes(searchQuery.toLowerCase());
            const matchesPlan = planFilter === "all" || shop.currentPlan?.toLowerCase() === planFilter.toLowerCase();
            const matchesMode = modeFilter === "all" || shop.mode === modeFilter;
            return matchesSearch && matchesPlan && matchesMode;
        });
    }, [shops, searchQuery, planFilter, modeFilter]);

    const clearFilters = () => {
        setSearchQuery("");
        setPlanFilter("all");
        setModeFilter("all");
    };

    return (
        <div className="shops-view">
            <style>{`
                .shops-header {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    margin-bottom: 32px;
                    gap: 16px;
                    flex-wrap: wrap;
                }
                .header-left { display: flex; gap: 12px; flex: 1; min-width: 300px; }
                .search-box {
                    background: white;
                    border: 1px solid var(--border);
                    padding: 12px 20px;
                    border-radius: 12px;
                    display: flex;
                    align-items: center;
                    gap: 12px;
                    flex: 1;
                    transition: all 0.2s;
                }
                .search-box:focus-within { border-color: var(--primary); box-shadow: 0 0 0 2px rgba(99, 102, 241, 0.1); }
                .search-box input {
                    border: none;
                    outline: none;
                    width: 100%;
                    font-size: 14px;
                    font-family: inherit;
                }

                .filters-row { display: flex; gap: 12px; align-items: center; }
                .filter-select {
                    appearance: none;
                    background: white; border: 1px solid var(--border);
                    border-radius: 12px; padding: 12px 36px 12px 16px;
                    font-size: 13px; font-weight: 600; color: var(--text);
                    cursor: pointer; transition: all 0.2s;
                    background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' stroke='%2364748b' stroke-width='2'%3E%3Cpath stroke-linecap='round' stroke-linejoin='round' d='M19 9l-7 7-7-7'%3E%3C/path%3E%3C/svg%3E");
                    background-repeat: no-repeat; background-position: right 12px center; background-size: 14px;
                }
                .filter-select:hover { border-color: #cbd5e1; }
                .filter-select:focus { outline: none; border-color: var(--primary); }

                .btn-clear {
                    display: flex; align-items: center; gap: 6px;
                    color: #ec4899; background: #fdf2f8; border: 1px solid #fbcfe8;
                    padding: 11px 14px; border-radius: 10px; font-size: 13px; font-weight: 600;
                    cursor: pointer; transition: all 0.2s;
                }
                .btn-clear:hover { background: #fce7f3; transform: translateY(-1px); }
                
                .shops-table-card {
                    background: white;
                    border-radius: 24px;
                    border: 1px solid var(--border);
                    overflow: hidden;
                    box-shadow: 0 4px 20px rgba(0,0,0,0.03);
                }
                
                .table-container { width: 100%; overflow-x: auto; }
                table { width: 100%; border-collapse: collapse; min-width: 900px; }
                th { 
                    text-align: left; padding: 18px 24px; background: #f8fafc;
                    font-size: 12px; font-weight: 700; color: var(--text-muted);
                    text-transform: uppercase; letter-spacing: 0.05em;
                    border-bottom: 1px solid var(--border);
                }
                td { padding: 20px 24px; border-bottom: 1px solid var(--border); font-size: 14px; vertical-align: middle; }
                tr:last-child td { border-bottom: none; }
                tr:hover td { background: #f9fafb; }
 
                .shop-link { color: var(--primary); text-decoration: none; font-weight: 600; }
                .shop-link:hover { text-decoration: underline; }

                .plan-badge {
                    padding: 6px 12px;
                    border-radius: 8px;
                    font-size: 11px;
                    font-weight: 800;
                    text-transform: uppercase;
                    letter-spacing: 0.02em;
                }
                .plan-free { background: #f1f5f9; color: #64748b; border: 1px solid #e2e8f0; }
                .plan-premium { background: #eef2ff; color: #6366f1; border: 1px solid #c7d2fe; }
                .plan-plus { background: #ecfdf5; color: #10b981; border: 1px solid #a7f3d0; }
                .plan-elite { 
                    background: linear-gradient(135deg, #faf5ff 0%, #f3e8ff 100%); 
                    color: #a855f7; 
                    border: 1px solid #e9d5ff;
                    box-shadow: 0 2px 4px rgba(168, 85, 247, 0.1);
                }

                .mode-tag {
                    display: inline-flex;
                    align-items: center;
                    gap: 6px;
                    font-size: 12px;
                    font-weight: 600;
                    color: #475569;
                }
                .mode-dot { width: 8px; height: 8px; border-radius: 50%; }

                .action-btn {
                    padding: 8px 16px;
                    background: white;
                    border: 1px solid #e2e8f0;
                    border-radius: 10px;
                    text-decoration: none;
                    color: var(--text);
                    font-size: 13px;
                    font-weight: 600;
                    transition: all 0.2s;
                    display: flex; align-items: center; gap: 8px;
                    width: fit-content;
                    white-space: nowrap;
                }
                .action-btn:hover { border-color: var(--primary); color: var(--primary); box-shadow: 0 4px 12px rgba(99, 102, 241, 0.1); }

                .empty-search { padding: 80px 0; text-align: center; color: var(--text-muted); }

                @media (max-width: 768px) {
                    .shops-header { 
                        flex-direction: column; 
                        align-items: stretch; 
                        margin-bottom: 24px; 
                        gap: 12px;
                    }
                    .header-left { 
                        min-width: 100%; 
                        flex-direction: column; 
                        gap: 12px;
                    }
                    .filters-row { 
                        flex-wrap: wrap; 
                        gap: 12px;
                    }
                    .filter-select {
                        flex: 1;
                        min-width: 120px;
                    }
                    .btn-clear {
                        width: 100%;
                        justify-content: center;
                    }
                    .shops-table-card { border-radius: 16px; }
                    td, th { padding: 16px; }
                    
                    div[style*="var(--text-muted)"] {
                        text-align: center;
                        border-top: 1px solid var(--border);
                        padding-top: 12px;
                        margin-top: 4px;
                    }
                }
            `}</style>

            <div className="shops-header">
                <div className="header-left">
                    <div className="search-box">
                        <Search size={18} color="var(--text-muted)" />
                        <input 
                            type="text" 
                            placeholder="Search shops by domain..." 
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                        />
                    </div>
                    <div className="filters-row">
                        <select 
                            className="filter-select"
                            value={planFilter}
                            onChange={(e) => setPlanFilter(e.target.value)}
                        >
                            <option value="all">All Plans</option>
                            {uniquePlans.map((plan: string) => (
                                <option key={plan} value={plan}>
                                    {plan.toUpperCase()} Plan
                                </option>
                            ))}
                        </select>
                        <select 
                            className="filter-select"
                            value={modeFilter}
                            onChange={(e) => setModeFilter(e.target.value)}
                        >
                            <option value="all">All Modes</option>
                            <option value="popup">Popup</option>
                            <option value="auto_redirect">Auto Redirect</option>
                        </select>
                        {(searchQuery || planFilter !== "all" || modeFilter !== "all") && (
                            <button className="btn-clear" onClick={clearFilters}>
                                <X size={14} /> Clear
                            </button>
                        )}
                    </div>
                </div>
                <div style={{ color: 'var(--text-muted)', fontSize: '14px', fontWeight: 600 }}>
                    Showing <b>{filteredShops.length}</b> / {shops.length} merchants
                </div>
            </div>

            <div className="shops-table-card">
                <div className="table-container">
                    <table>
                        <thead>
                            <tr>
                                <th>Shop Domain</th>
                                <th>Plan</th>
                                <th>Active Mode</th>
                                <th>Rules</th>
                                <th>Traffic (Last Month)</th>
                                <th>Installed</th>
                                <th>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filteredShops.length === 0 ? (
                                <tr>
                                    <td colSpan={7} className="empty-search">
                                        <Search size={40} strokeWidth={1.5} style={{ marginBottom: '12px', opacity: 0.5 }} />
                                        <div style={{ fontSize: '16px', fontWeight: 600 }}>No merchants found</div>
                                        <div style={{ fontSize: '13px', opacity: 0.7 }}>Try adjusting your search or filters</div>
                                    </td>
                                </tr>
                            ) : (
                                filteredShops.map((shop: any) => (
                                    <tr key={shop.id}>
                                        <td>
                                            <Link to={`/admin/shops/${shop.shop}`} className="shop-link">
                                                {shop.shop}
                                            </Link>
                                        </td>
                                        <td>
                                            {(() => {
                                                const plan = (shop.currentPlan || 'FREE').toUpperCase();
                                                let badgeClass = 'plan-free';
                                                if (plan === 'PREMIUM') badgeClass = 'plan-premium';
                                                if (plan === 'PLUS') badgeClass = 'plan-plus';
                                                if (plan === 'ELITE') badgeClass = 'plan-elite';
                                                
                                                return (
                                                    <span className={`plan-badge ${badgeClass}`}>
                                                        {plan}
                                                    </span>
                                                );
                                            })()}
                                        </td>
                                        <td>
                                            <div className="mode-tag">
                                                <div className="mode-dot" style={{ background: shop.mode === 'auto_redirect' ? '#10b981' : '#6366f1' }} />
                                                {shop.mode.replace('_', ' ').toUpperCase()}
                                            </div>
                                        </td>
                                        <td><b>{shop.ruleCount}</b> active</td>
                                        <td>
                                            <div style={{ fontWeight: 600 }}>{shop.latestUsage?.totalVisitors?.toLocaleString() || 0}</div>
                                            <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{shop.latestUsage?.redirected || 0} actions</div>
                                        </td>
                                        <td style={{ color: 'var(--text-muted)', fontSize: '13px' }}>
                                            {new Date(shop.createdAt).toLocaleDateString('en-GB')}
                                        </td>
                                        <td>
                                            <Link to={`/admin/shops/${shop.shop}`} className="action-btn">
                                                Manage <ExternalLink size={14} />
                                            </Link>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}

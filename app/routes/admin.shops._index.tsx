import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData, Link } from "@remix-run/react";
import prisma from "../db.server";
import { requireAdminAuth } from "../utils/admin.session.server";

import { Search, ExternalLink } from "lucide-react";

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

    const rulesMap = new Map(ruleCounts.map(r => [r.shop, r._count.id]));
    const usageMap = new Map(usage.map(u => [u.shop, u]));

    return json({ 
        shops: shops.map(s => ({
            ...s,
            createdAt: s.createdAt.toISOString(),
            ruleCount: rulesMap.get(s.shop) || 0,
            latestUsage: usageMap.get(s.shop)
        }))
    });
};

export default function AdminShops() {
    const { shops } = useLoaderData<typeof loader>();

    return (
        <div className="shops-view">
            <style>{`
                .shops-header {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    margin-bottom: 32px;
                }
                .search-box {
                    background: white;
                    border: 1px solid var(--border);
                    padding: 12px 20px;
                    border-radius: 12px;
                    display: flex;
                    align-items: center;
                    gap: 12px;
                    width: 400px;
                }
                .search-box input {
                    border: none;
                    outline: none;
                    width: 100%;
                    font-size: 14px;
                    font-family: inherit;
                }
                
                .shops-table-card {
                    background: white;
                    border-radius: 24px;
                    border: 1px solid var(--border);
                    overflow: hidden;
                    box-shadow: 0 4px 20px rgba(0,0,0,0.03);
                }
                
                table { width: 100%; border-collapse: collapse; }
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
                    font-size: 12px;
                    font-weight: 700;
                    text-transform: uppercase;
                }
                .plan-free { background: #f1f5f9; color: #64748b; }
                .plan-pro { background: #eef2ff; color: #6366f1; }

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
            `}</style>

            <div className="shops-header">
                <div className="search-box">
                    <Search size={18} color="var(--text-muted)" />
                    <input type="text" placeholder="Search shops by domain..." />
                </div>
                <div style={{ color: 'var(--text-muted)', fontSize: '14px' }}>
                    Total: <b>{shops.length}</b> merchants
                </div>
            </div>

            <div className="shops-table-card">
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
                        {shops.map(shop => (
                            <tr key={shop.id}>
                                <td>
                                    <Link to={`/admin/shops/${shop.shop}`} className="shop-link">
                                        {shop.shop}
                                    </Link>
                                </td>
                                <td>
                                    <span className={`plan-badge ${shop.currentPlan === 'FREE' ? 'plan-free' : 'plan-pro'}`}>
                                        {shop.currentPlan}
                                    </span>
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
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}

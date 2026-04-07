import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { Form, Link, useLoaderData } from "@remix-run/react";
import { requireAdminAuth } from "../utils/admin.session.server";
import prisma from "../db.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
    await requireAdminAuth(request);

    const now = new Date();
    const yearMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

    // Get ALL unique shops + their latest access token from Session table
    const allSessions = await prisma.session.findMany({
        select: { shop: true, accessToken: true },
        // Get one representative session per shop (latest non-online session for API calls)
        where: { isOnline: false, accessToken: { not: "" } },
        distinct: ["shop"],
    });
    // Fallback: also grab online sessions for shops without offline token
    const allShopDomains = [...new Set(allSessions.map((s: any) => s.shop))];
    const tokenMap = new Map<string, string>(allSessions.map((s: any) => [s.shop, s.accessToken]));

    const [
        allSettings,
        rulesAgg,
        monthlyAgg,
        totalRules,
    ] = await Promise.all([
        prisma.settings.findMany({
            where: { shop: { in: allShopDomains } },
            select: { shop: true, mode: true, createdAt: true, updatedAt: true },
        }),
        prisma.redirectRule.groupBy({
            by: ["shop"],
            _count: { id: true },
            where: { isActive: true },
        }),
        (prisma as any).monthlyUsage.findMany({
            where: { yearMonth },
            select: { shop: true, totalVisitors: true, redirected: true, blocked: true, popupShown: true },
        }),
        prisma.redirectRule.count({ where: { isActive: true } }),
    ]);

    // Fetch plan info from Shopify API for each shop (parallel, 3s timeout each)
    const SHOPIFY_API_VERSION = "2024-10";
    const BILLING_QUERY = `{
        currentAppInstallation {
            activeSubscriptions {
                name
                status
                lineItems {
                    plan {
                        pricingDetails {
                            ... on AppRecurringPricing {
                                price { amount currencyCode }
                                interval
                            }
                        }
                    }
                }
            }
        }
    }`;

    const fetchShopPlan = async (shop: string): Promise<{ plan: string; price: string }> => {
        const token = tokenMap.get(shop);
        if (!token) return { plan: "unknown", price: "" };
        try {
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 3000);
            const res = await fetch(`https://${shop}/admin/api/${SHOPIFY_API_VERSION}/graphql.json`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "X-Shopify-Access-Token": token,
                },
                body: JSON.stringify({ query: BILLING_QUERY }),
                signal: controller.signal,
            });
            clearTimeout(timeout);
            if (!res.ok) return { plan: "unknown", price: "" };
            const data = await res.json();
            const subs = data?.data?.currentAppInstallation?.activeSubscriptions ?? [];
            if (subs.length === 0) return { plan: "free", price: "$0" };
            const sub = subs[0];
            const pricing = sub.lineItems?.[0]?.plan?.pricingDetails;
            const price = pricing?.price ? `$${parseFloat(pricing.price.amount).toFixed(0)}` : "";
            return { plan: sub.name ?? "paid", price };
        } catch {
            return { plan: "unknown", price: "" };
        }
    };

    // Fetch all plans in parallel
    const planResults = await Promise.all(allShopDomains.map(fetchShopPlan));
    const planMap = new Map<string, { plan: string; price: string }>(
        allShopDomains.map((shop, i) => [shop, planResults[i]])
    );

    // Build lookup maps
    const settingsMap = new Map<string, any>(allSettings.map((s: any) => [s.shop, s]));
    const rulesMap = new Map<string, number>(rulesAgg.map((r: any) => [r.shop, r._count.id]));
    const usageMap = new Map<string, any>(monthlyAgg.map((u: any) => [u.shop, u]));

    // Merge: all sessions + settings (LEFT JOIN)
    const shops = allShopDomains.map((shop) => {
        const s = settingsMap.get(shop);
        const p = planMap.get(shop) ?? { plan: "unknown", price: "" };
        return {
            shop,
            mode: s?.mode ?? "not_configured",
            hasSettings: !!s,
            plan: p.plan,
            price: p.price,
            activeRules: rulesMap.get(shop) ?? 0,
            visitors: usageMap.get(shop)?.totalVisitors ?? 0,
            popups: usageMap.get(shop)?.popupShown ?? 0,
            redirected: usageMap.get(shop)?.redirected ?? 0,
            blocked: usageMap.get(shop)?.blocked ?? 0,
            installedAt: s?.createdAt?.toISOString() ?? null,
            lastActive: s?.updatedAt?.toISOString() ?? null,
        };
    }).sort((a, b) => {
        if (a.hasSettings && !b.hasSettings) return -1;
        if (!a.hasSettings && b.hasSettings) return 1;
        if (a.lastActive && b.lastActive) return b.lastActive.localeCompare(a.lastActive);
        return 0;
    });

    const totalShops = shops.length;
    const activeShops = shops.filter((s) => s.mode !== "disabled" && s.mode !== "not_configured").length;
    const totalVisitors = shops.reduce((sum, s) => sum + s.visitors, 0);

    return json({ shops, totalShops, activeShops, totalVisitors, totalRules, yearMonth });
};




export default function AdminDashboard() {
    const { shops, totalShops, activeShops, totalVisitors, totalRules, yearMonth } = useLoaderData<typeof loader>();

    const modeColor = (mode: string) => {
        if (mode === "popup") return "#6366f1";
        if (mode === "auto_redirect") return "#10b981";
        if (mode === "not_configured") return "#f59e0b";
        return "#64748b";
    };

    const planColor = (plan: string) => {
        if (plan === "free" || plan === "$0") return { bg: "#f1f5f9", text: "#64748b" };
        if (plan === "unknown") return { bg: "#fef2f2", text: "#ef4444" };
        return { bg: "#ecfdf5", text: "#10b981" };
    };

    const formatDate = (iso: string | null) => {
        if (!iso) return "—";
        return new Date(iso).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
    };

    return (
        <div className="dashboard-view">
            <style>{`
                .stats-grid { 
                    display: grid; 
                    grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); 
                    gap: 24px; 
                    margin-bottom: 32px; 
                }
                .stat-card {
                    background: var(--surface);
                    border: 1px solid var(--border);
                    border-radius: 16px;
                    padding: 24px;
                    display: flex;
                    flex-direction: column;
                }
                .stat-label { font-size: 13px; color: var(--text-muted); font-weight: 500; margin-bottom: 12px; }
                .stat-value { font-size: 32px; font-weight: 700; color: var(--text); }
                .stat-sub { font-size: 13px; margin-top: 8px; font-weight: 500; }

                .content-section {
                    background: var(--surface);
                    border: 1px solid var(--border);
                    border-radius: 16px;
                    overflow: hidden;
                }
                .section-header {
                    padding: 20px 24px;
                    border-bottom: 1px solid var(--border);
                    display: flex; align-items: center; justify-content: space-between;
                }
                .section-header h3 { font-size: 16px; font-weight: 600; }

                table { width: 100%; border-collapse: collapse; }
                th {
                    text-align: left; padding: 12px 24px;
                    font-size: 11px; font-weight: 600; color: var(--text-muted);
                    background: #f8fafc; border-bottom: 1px solid var(--border);
                    text-transform: uppercase; letter-spacing: 0.05em;
                }
                td { padding: 14px 24px; font-size: 14px; border-bottom: 1px solid var(--border); }
                tr:last-child td { border-bottom: none; }
                tr:hover td { background: #f9fafb; }

                .shop-link { color: var(--primary); text-decoration: none; font-weight: 600; }
                .shop-link:hover { text-decoration: underline; }

                .badge-flat {
                    padding: 4px 10px; border-radius: 6px; font-size: 12px; font-weight: 600;
                    display: inline-flex; align-items: center; gap: 6px;
                }
                .dot { width: 6px; height: 6px; border-radius: 50%; }
                
                .btn-view {
                    padding: 6px 12px; border-radius: 8px; border: 1px solid var(--border);
                    color: var(--text); text-decoration: none; font-size: 13px; font-weight: 500;
                    transition: all 0.2s;
                }
                .btn-view:hover { background: #f1f5f9; border-color: #cbd5e1; }
            `}</style>

            <div className="stats-grid">
                <div className="stat-card">
                    <div className="stat-label">Total Installations</div>
                    <div className="stat-value">{totalShops}</div>
                    <div className="stat-sub" style={{ color: '#10b981' }}>{activeShops} active now</div>
                </div>
                <div className="stat-card">
                    <div className="stat-label">Monthly Visitors</div>
                    <div className="stat-value">{totalVisitors.toLocaleString()}</div>
                    <div className="stat-sub" style={{ color: 'var(--primary)' }}>Across all partners</div>
                </div>
                <div className="stat-card">
                    <div className="stat-label">Active Rules</div>
                    <div className="stat-value">{totalRules}</div>
                    <div className="stat-sub" style={{ color: '#f59e0b' }}>Redirects & Popups</div>
                </div>
            </div>

            <div className="content-section">
                <div className="section-header">
                    <h3>Managed Shops</h3>
                    <div className="badge-flat" style={{ background: '#f1f5f9', color: '#64748b' }}>
                        {yearMonth}
                    </div>
                </div>
                <div style={{ overflowX: 'auto' }}>
                    <table>
                        <thead>
                            <tr>
                                <th>Shop Domain</th>
                                <th>Plan</th>
                                <th>App Mode</th>
                                <th>Rules</th>
                                <th>Traffic</th>
                                <th>Installed</th>
                                <th>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {shops.map((s) => (
                                <tr key={s.shop}>
                                    <td>
                                        <Link to={`/admin/shops/${encodeURIComponent(s.shop)}`} className="shop-link">
                                            {s.shop}
                                        </Link>
                                    </td>
                                    <td>
                                        {(() => {
                                            const pc = planColor(s.plan);
                                            return (
                                                <span className="badge-flat" style={{ background: pc.bg, color: pc.text }}>
                                                    {s.plan.toUpperCase()} {s.price}
                                                </span>
                                            );
                                        })()}
                                    </td>
                                    <td>
                                        <span className="badge-flat" style={{ background: `${modeColor(s.mode)}15`, color: modeColor(s.mode) }}>
                                            <span className="dot" style={{ background: modeColor(s.mode) }} />
                                            {s.mode.replace("_", " ").toUpperCase()}
                                        </span>
                                    </td>
                                    <td><strong>{s.activeRules}</strong></td>
                                    <td>
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                                            <span style={{ fontWeight: 600 }}>{s.visitors.toLocaleString()}</span>
                                            <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{s.redirected} redirs</span>
                                        </div>
                                    </td>
                                    <td><span style={{ color: 'var(--text-muted)', fontSize: '13px' }}>{formatDate(s.installedAt)}</span></td>
                                    <td>
                                        <Link to={`/admin/shops/${encodeURIComponent(s.shop)}`} className="btn-view">
                                            Manage →
                                        </Link>
                                    </td>
                                </tr>
                            ))}
                            {shops.length === 0 && (
                                <tr>
                                    <td colSpan={7} style={{ textAlign: "center", color: "var(--text-muted)", padding: "64px" }}>
                                        No shops registered yet.
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}


import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { Form, Link, useLoaderData } from "@remix-run/react";
import { requireAdminAuth } from "../utils/admin.session.server";
import prisma from "../db.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
    await requireAdminAuth(request);

    const now = new Date();
    const yearMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

    // Aggregate: get all unique shops from Settings
    const [
        allSettings,
        rulesAgg,
        monthlyAgg,
        totalRules,
    ] = await Promise.all([
        prisma.settings.findMany({
            orderBy: { createdAt: "desc" },
            select: {
                shop: true,
                mode: true,
                createdAt: true,
                updatedAt: true,
            },
        }),
        // Rules count per shop
        prisma.redirectRule.groupBy({
            by: ["shop"],
            _count: { id: true },
            where: { isActive: true },
        }),
        // Monthly usage per shop — current month
        (prisma as any).monthlyUsage.findMany({
            where: { yearMonth },
            select: { shop: true, totalVisitors: true, redirected: true, blocked: true },
        }),
        prisma.redirectRule.count({ where: { isActive: true } }),
    ]);

    // Build lookup maps
    const rulesMap = new Map<string, number>(
        rulesAgg.map((r: any) => [r.shop, r._count.id])
    );
    const usageMap = new Map<string, any>(
        monthlyAgg.map((u: any) => [u.shop, u])
    );

    const shops = allSettings.map((s) => ({
        shop: s.shop,
        mode: s.mode,
        activeRules: rulesMap.get(s.shop) ?? 0,
        visitors: usageMap.get(s.shop)?.totalVisitors ?? 0,
        redirected: usageMap.get(s.shop)?.redirected ?? 0,
        blocked: usageMap.get(s.shop)?.blocked ?? 0,
        installedAt: s.createdAt.toISOString(),
        lastActive: s.updatedAt.toISOString(),
    }));

    const totalShops = shops.length;
    const activeShops = shops.filter((s) => s.mode !== "disabled").length;
    const totalVisitors = shops.reduce((sum, s) => sum + s.visitors, 0);

    return json({ shops, totalShops, activeShops, totalVisitors, totalRules, yearMonth });
};

export default function AdminDashboard() {
    const { shops, totalShops, activeShops, totalVisitors, totalRules, yearMonth } = useLoaderData<typeof loader>();

    const modeColor = (mode: string) => {
        if (mode === "popup") return "#22d3ee";
        if (mode === "auto_redirect") return "#a78bfa";
        return "#64748b";
    };
    const formatDate = (iso: string) =>
        new Date(iso).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });

    return (
        <html lang="en">
            <head>
                <meta charSet="utf-8" />
                <meta name="viewport" content="width=device-width, initial-scale=1" />
                <title>Admin Dashboard — Geo App</title>
                <style>{`
                    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
                    body {
                        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
                        background: #0a0a0f;
                        color: #e2e8f0;
                        min-height: 100vh;
                    }
                    /* NAV */
                    .nav {
                        background: #13131a;
                        border-bottom: 1px solid #1e1e2e;
                        padding: 0 28px;
                        display: flex;
                        align-items: center;
                        justify-content: space-between;
                        height: 60px;
                        position: sticky; top: 0; z-index: 100;
                    }
                    .nav-brand { display: flex; align-items: center; gap: 10px; font-weight: 700; font-size: 16px; }
                    .nav-brand span { 
                        width: 32px; height: 32px;
                        background: linear-gradient(135deg, #6366f1, #8b5cf6);
                        border-radius: 8px;
                        display: flex; align-items: center; justify-content: center;
                        font-size: 16px;
                    }
                    .nav-right { display: flex; align-items: center; gap: 16px; }
                    .badge-month {
                        background: rgba(99,102,241,0.15);
                        border: 1px solid rgba(99,102,241,0.3);
                        color: #818cf8;
                        padding: 4px 12px;
                        border-radius: 20px;
                        font-size: 12px;
                        font-weight: 500;
                    }
                    .btn-logout {
                        background: rgba(239,68,68,0.1);
                        border: 1px solid rgba(239,68,68,0.2);
                        color: #f87171;
                        padding: 6px 14px;
                        border-radius: 6px;
                        font-size: 13px;
                        cursor: pointer;
                        transition: background 0.2s;
                    }
                    .btn-logout:hover { background: rgba(239,68,68,0.2); }
                    /* MAIN */
                    .main { max-width: 1200px; margin: 0 auto; padding: 32px 24px; }
                    h2 { font-size: 22px; font-weight: 700; color: #f1f5f9; margin-bottom: 24px; }
                    /* CARDS */
                    .stats-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 16px; margin-bottom: 32px; }
                    .stat-card {
                        background: #13131a;
                        border: 1px solid #1e1e2e;
                        border-radius: 12px;
                        padding: 20px 24px;
                    }
                    .stat-label { font-size: 12px; color: #64748b; font-weight: 500; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 8px; }
                    .stat-value { font-size: 32px; font-weight: 700; color: #f1f5f9; }
                    .stat-sub { font-size: 12px; color: #475569; margin-top: 4px; }
                    /* TABLE */
                    .table-wrap {
                        background: #13131a;
                        border: 1px solid #1e1e2e;
                        border-radius: 12px;
                        overflow: hidden;
                    }
                    .table-header {
                        padding: 16px 24px;
                        border-bottom: 1px solid #1e1e2e;
                        display: flex;
                        align-items: center;
                        justify-content: space-between;
                    }
                    .table-header h3 { font-size: 15px; font-weight: 600; }
                    table { width: 100%; border-collapse: collapse; }
                    th {
                        text-align: left;
                        padding: 12px 20px;
                        font-size: 11px;
                        font-weight: 600;
                        color: #64748b;
                        text-transform: uppercase;
                        letter-spacing: 0.5px;
                        border-bottom: 1px solid #1e1e2e;
                        background: #0f0f16;
                    }
                    td { padding: 14px 20px; font-size: 13px; border-bottom: 1px solid #0f0f16; }
                    tr:last-child td { border-bottom: none; }
                    tr:hover td { background: rgba(255,255,255,0.02); }
                    .shop-link { color: #818cf8; text-decoration: none; font-weight: 500; }
                    .shop-link:hover { color: #a5b4fc; }
                    .mode-badge {
                        display: inline-flex;
                        align-items: center;
                        gap: 5px;
                        padding: 3px 10px;
                        border-radius: 20px;
                        font-size: 11px;
                        font-weight: 600;
                        text-transform: uppercase;
                        letter-spacing: 0.3px;
                    }
                    .dot { width: 6px; height: 6px; border-radius: 50%; }
                    .num { font-weight: 600; }
                    .text-sub { color: #475569; font-size: 12px; }
                `}</style>
            </head>
            <body>
                <nav className="nav">
                    <div className="nav-brand">
                        <span>🌍</span>
                        Geo App Admin
                    </div>
                    <div className="nav-right">
                        <span className="badge-month">📅 {yearMonth}</span>
                        <Form method="post" action="/admin/logout">
                            <button type="submit" className="btn-logout">Logout</button>
                        </Form>
                    </div>
                </nav>

                <main className="main">
                    <h2>Dashboard Overview</h2>

                    {/* Stats Cards */}
                    <div className="stats-grid">
                        <div className="stat-card">
                            <div className="stat-label">Total Shops</div>
                            <div className="stat-value">{totalShops}</div>
                            <div className="stat-sub">{activeShops} active</div>
                        </div>
                        <div className="stat-card">
                            <div className="stat-label">Active Shops</div>
                            <div className="stat-value" style={{ color: "#4ade80" }}>{activeShops}</div>
                            <div className="stat-sub">{totalShops - activeShops} disabled</div>
                        </div>
                        <div className="stat-card">
                            <div className="stat-label">Visitors This Month</div>
                            <div className="stat-value" style={{ color: "#818cf8" }}>{totalVisitors.toLocaleString()}</div>
                            <div className="stat-sub">across all shops</div>
                        </div>
                        <div className="stat-card">
                            <div className="stat-label">Active Rules</div>
                            <div className="stat-value" style={{ color: "#f59e0b" }}>{totalRules}</div>
                            <div className="stat-sub">all shops combined</div>
                        </div>
                    </div>

                    {/* Table */}
                    <div className="table-wrap">
                        <div className="table-header">
                            <h3>All Installed Shops ({totalShops})</h3>
                        </div>
                        <table>
                            <thead>
                                <tr>
                                    <th>Shop</th>
                                    <th>Mode</th>
                                    <th>Rules</th>
                                    <th>Visitors</th>
                                    <th>Redirected</th>
                                    <th>Blocked</th>
                                    <th>Installed</th>
                                    <th>Last Active</th>
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
                                            <span className="mode-badge" style={{
                                                background: `${modeColor(s.mode)}15`,
                                                border: `1px solid ${modeColor(s.mode)}40`,
                                                color: modeColor(s.mode),
                                            }}>
                                                <span className="dot" style={{ background: modeColor(s.mode) }} />
                                                {s.mode.replace("_", " ")}
                                            </span>
                                        </td>
                                        <td><span className="num">{s.activeRules}</span></td>
                                        <td><span className="num">{s.visitors.toLocaleString()}</span></td>
                                        <td><span className="num" style={{ color: "#a78bfa" }}>{s.redirected.toLocaleString()}</span></td>
                                        <td><span className="num" style={{ color: "#f87171" }}>{s.blocked.toLocaleString()}</span></td>
                                        <td><span className="text-sub">{formatDate(s.installedAt)}</span></td>
                                        <td><span className="text-sub">{formatDate(s.lastActive)}</span></td>
                                        <td>
                                            <Link to={`/admin/shops/${encodeURIComponent(s.shop)}`} style={{
                                                color: "#818cf8", fontSize: "12px", textDecoration: "none",
                                                padding: "4px 10px",
                                                border: "1px solid rgba(129,140,248,0.3)",
                                                borderRadius: "6px",
                                            }}>
                                                View →
                                            </Link>
                                        </td>
                                    </tr>
                                ))}
                                {shops.length === 0 && (
                                    <tr>
                                        <td colSpan={9} style={{ textAlign: "center", color: "#475569", padding: "48px" }}>
                                            No shops installed yet.
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </main>
            </body>
        </html>
    );
}

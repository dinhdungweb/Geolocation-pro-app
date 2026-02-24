import type { LoaderFunctionArgs } from "@remix-run/node";
import { json, redirect } from "@remix-run/node";
import { Form, Link, useLoaderData } from "@remix-run/react";
import { requireAdminAuth } from "../utils/admin.session.server";
import prisma from "../db.server";

export const loader = async ({ request, params }: LoaderFunctionArgs) => {
    await requireAdminAuth(request);
    const shop = decodeURIComponent(params.shop ?? "");
    if (!shop) throw redirect("/admin");

    const [settings, rules, logs, monthlyUsage] = await Promise.all([
        prisma.settings.findUnique({ where: { shop } }),
        prisma.redirectRule.findMany({
            where: { shop },
            orderBy: { priority: "desc" },
            select: {
                id: true, name: true, matchType: true, ruleType: true,
                isActive: true, priority: true, countryCodes: true,
                scheduleEnabled: true, createdAt: true,
            },
        }),
        (prisma as any).visitorLog.findMany({
            where: { shop },
            orderBy: { timestamp: "desc" },
            take: 100,
            select: {
                id: true, ipAddress: true, countryCode: true, action: true,
                ruleName: true, targetUrl: true, timestamp: true,
            },
        }),
        (prisma as any).monthlyUsage.findMany({
            where: { shop },
            orderBy: { yearMonth: "desc" },
            take: 6,
        }),
    ]);

    const totalVisitors = monthlyUsage.reduce((s: number, u: any) => s + u.totalVisitors, 0);
    const totalRedirected = monthlyUsage.reduce((s: number, u: any) => s + u.redirected, 0);
    const totalBlocked = monthlyUsage.reduce((s: number, u: any) => s + u.blocked, 0);
    const activeRules = rules.filter((r: any) => r.isActive).length;

    return json({
        shop,
        hasSettings: !!settings,
        settings: settings ? {
            mode: settings.mode,
            template: settings.template,
            excludeBots: settings.excludeBots,
            cookieDuration: settings.cookieDuration,
            createdAt: settings.createdAt.toISOString(),
            updatedAt: settings.updatedAt.toISOString(),
        } : null,
        rules: rules.map((r: any) => ({ ...r, createdAt: r.createdAt.toISOString() })),
        logs: logs.map((l: any) => ({ ...l, timestamp: l.timestamp.toISOString() })),
        monthlyUsage,
        stats: { totalVisitors, totalRedirected, totalBlocked, activeRules, totalRules: rules.length },
    });
};

export default function AdminShopDetail() {
    const { shop, settings, hasSettings, rules, logs, monthlyUsage, stats } = useLoaderData<typeof loader>();

    const formatDate = (iso: string) =>
        new Date(iso).toLocaleString("en-GB", {
            day: "2-digit", month: "short", year: "numeric",
            hour: "2-digit", minute: "2-digit",
        });
    const formatDateShort = (iso: string) =>
        new Date(iso).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });

    const modeColor = (mode: string) => {
        if (mode === "popup") return "#22d3ee";
        if (mode === "auto_redirect") return "#a78bfa";
        return "#64748b";
    };
    const actionColor = (action: string) => {
        const m: Record<string, string> = {
            visit: "#64748b", redirected: "#818cf8", blocked: "#f87171",
            auto_redirect: "#a78bfa", ip_blocked: "#ef4444", ip_redirected: "#f59e0b",
        };
        return m[action] ?? "#64748b";
    };

    return (
        <html lang="en">
            <head>
                <meta charSet="utf-8" />
                <meta name="viewport" content="width=device-width, initial-scale=1" />
                <title>{shop} — Admin</title>
                <style>{`
                    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
                    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif; background: #0a0a0f; color: #e2e8f0; min-height: 100vh; }

                    /* NAV */
                    .nav { background: #13131a; border-bottom: 1px solid #1e1e2e; padding: 0 28px; display: flex; align-items: center; justify-content: space-between; height: 60px; position: sticky; top: 0; z-index: 100; }
                    .nav-left { display: flex; align-items: center; gap: 10px; }
                    .back-link { color: #818cf8; text-decoration: none; font-size: 13px; display: flex; align-items: center; gap: 4px; }
                    .back-link:hover { color: #a5b4fc; }
                    .breadcrumb-sep { color: #1e1e2e; }
                    .nav-shop { font-size: 14px; font-weight: 600; color: #e2e8f0; }
                    .btn-logout { background: rgba(239,68,68,0.1); border: 1px solid rgba(239,68,68,0.2); color: #f87171; padding: 6px 14px; border-radius: 6px; font-size: 12px; cursor: pointer; }

                    /* LAYOUT */
                    .main { max-width: 1400px; margin: 0 auto; padding: 28px 24px; display: flex; flex-direction: column; gap: 20px; }

                    /* STAT MINI CARDS */
                    .stats-row { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; }
                    .stat-mini { background: #13131a; border: 1px solid #1e1e2e; border-radius: 10px; padding: 16px 20px; }
                    .stat-mini-label { font-size: 11px; color: #64748b; font-weight: 600; text-transform: uppercase; letter-spacing: 0.4px; margin-bottom: 8px; }
                    .stat-mini-value { font-size: 28px; font-weight: 700; color: #f1f5f9; }
                    .stat-mini-sub { font-size: 11px; color: #475569; margin-top: 3px; }

                    /* TWO COL */
                    .two-col { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }

                    /* CARD */
                    .card { background: #13131a; border: 1px solid #1e1e2e; border-radius: 12px; }
                    .card-head { padding: 14px 20px; border-bottom: 1px solid #1e1e2e; display: flex; align-items: center; justify-content: space-between; }
                    .card-title { font-size: 13px; font-weight: 600; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.4px; }
                    .card-count { font-size: 12px; color: #475569; }
                    .card-body { padding: 16px 20px; }

                    /* INFO ROWS */
                    .info-row { display: flex; justify-content: space-between; align-items: center; padding: 9px 0; border-bottom: 1px solid #0f0f16; }
                    .info-row:last-child { border-bottom: none; }
                    .info-label { font-size: 12px; color: #64748b; }
                    .info-value { font-size: 12px; color: #cbd5e1; font-weight: 500; }

                    /* BADGE */
                    .badge { display: inline-flex; align-items: center; gap: 4px; padding: 2px 9px; border-radius: 20px; font-size: 10px; font-weight: 700; text-transform: uppercase; }
                    .dot { width: 5px; height: 5px; border-radius: 50%; }

                    /* MONTHLY GRID */
                    .month-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; }
                    .month-card { background: #0f0f16; border: 1px solid #1e1e2e; border-radius: 8px; padding: 10px 14px; }
                    .month-label { font-size: 10px; color: #64748b; font-weight: 600; text-transform: uppercase; margin-bottom: 6px; }
                    .month-val { font-size: 18px; font-weight: 700; color: #818cf8; }
                    .month-sub { font-size: 10px; color: #475569; margin-top: 2px; }

                    /* TABLE */
                    .table-wrap { background: #13131a; border: 1px solid #1e1e2e; border-radius: 12px; overflow: hidden; }
                    table { width: 100%; border-collapse: collapse; }
                    th { text-align: left; padding: 9px 14px; font-size: 10px; font-weight: 600; color: #64748b; text-transform: uppercase; letter-spacing: 0.4px; border-bottom: 1px solid #1e1e2e; background: #0f0f16; white-space: nowrap; }
                    td { padding: 10px 14px; font-size: 12px; border-bottom: 1px solid #0f0f16; white-space: nowrap; }
                    tr:last-child td { border-bottom: none; }
                    tr:hover td { background: rgba(255,255,255,0.015); }
                    .action-chip { display: inline-block; padding: 2px 7px; border-radius: 4px; font-size: 10px; font-weight: 700; text-transform: uppercase; }
                    .type-chip { display: inline-block; padding: 2px 7px; border-radius: 4px; font-size: 10px; font-weight: 600; }
                    .empty { text-align: center; color: #475569; padding: 32px; }
                    .truncate-cell {
                        max-width: 220px;
                        overflow: hidden;
                        text-overflow: ellipsis;
                        white-space: nowrap;
                        cursor: help;
                        transition: max-width 0.2s ease-in-out;
                    }
                    .truncate-cell:hover {
                        max-width: 600px;
                        white-space: normal;
                        word-break: break-all;
                        background: rgba(255,255,255,0.03);
                        position: relative;
                        z-index: 10;
                    }
                `}</style>
            </head>
            <body>
                {/* NAV */}
                <nav className="nav">
                    <div className="nav-left">
                        <Link to="/admin" className="back-link">← Dashboard</Link>
                        <span className="breadcrumb-sep">/</span>
                        <span className="nav-shop">{shop}</span>
                    </div>
                    <Form method="post" action="/admin/logout">
                        <button type="submit" className="btn-logout">Logout</button>
                    </Form>
                </nav>

                <main className="main">

                    {/* 1. OVERVIEW STATS */}
                    <div className="stats-row">
                        <div className="stat-mini">
                            <div className="stat-mini-label">Total Visitors (all time)</div>
                            <div className="stat-mini-value" style={{ color: "#818cf8" }}>{stats.totalVisitors.toLocaleString()}</div>
                        </div>
                        <div className="stat-mini">
                            <div className="stat-mini-label">Redirected</div>
                            <div className="stat-mini-value" style={{ color: "#a78bfa" }}>{stats.totalRedirected.toLocaleString()}</div>
                        </div>
                        <div className="stat-mini">
                            <div className="stat-mini-label">Blocked</div>
                            <div className="stat-mini-value" style={{ color: "#f87171" }}>{stats.totalBlocked.toLocaleString()}</div>
                        </div>
                        <div className="stat-mini">
                            <div className="stat-mini-label">Active Rules</div>
                            <div className="stat-mini-value" style={{ color: "#4ade80" }}>{stats.activeRules}</div>
                            <div className="stat-mini-sub">{stats.totalRules} total rules</div>
                        </div>
                    </div>

                    {/* 2. SETTINGS + MONTHLY USAGE side by side */}
                    <div className="two-col">
                        {/* Settings */}
                        <div className="card">
                            <div className="card-head">
                                <span className="card-title">Settings</span>
                                {settings && (
                                    <span style={{ fontSize: "11px", color: "#475569" }}>
                                        Updated {formatDateShort(settings.updatedAt)}
                                    </span>
                                )}
                            </div>
                            <div className="card-body">
                                {!hasSettings ? (
                                    <p style={{ color: "#f59e0b", fontSize: "13px" }}>⚠️ This shop has not configured the app yet.</p>
                                ) : (
                                    <>
                                        <div className="info-row">
                                            <span className="info-label">Mode</span>
                                            <span className="badge" style={{
                                                background: `${modeColor(settings!.mode)}15`,
                                                border: `1px solid ${modeColor(settings!.mode)}35`,
                                                color: modeColor(settings!.mode),
                                            }}>
                                                <span className="dot" style={{ background: modeColor(settings!.mode) }} />
                                                {settings!.mode.replace("_", " ")}
                                            </span>
                                        </div>
                                        <div className="info-row">
                                            <span className="info-label">Template</span>
                                            <span className="info-value">{settings!.template}</span>
                                        </div>
                                        <div className="info-row">
                                            <span className="info-label">Exclude Bots</span>
                                            <span className="info-value">{settings!.excludeBots ? "✅ Yes" : "❌ No"}</span>
                                        </div>
                                        <div className="info-row">
                                            <span className="info-label">Cookie Duration</span>
                                            <span className="info-value">{settings!.cookieDuration} days</span>
                                        </div>
                                        <div className="info-row">
                                            <span className="info-label">Installed</span>
                                            <span className="info-value">{formatDateShort(settings!.createdAt)}</span>
                                        </div>
                                    </>
                                )}
                            </div>
                        </div>

                        {/* Monthly Usage */}
                        <div className="card">
                            <div className="card-head">
                                <span className="card-title">Monthly Usage</span>
                                <span className="card-count">Last 6 months</span>
                            </div>
                            <div className="card-body">
                                {monthlyUsage.length === 0 ? (
                                    <p style={{ color: "#475569", fontSize: "12px" }}>No usage data yet.</p>
                                ) : (
                                    <div className="month-grid">
                                        {monthlyUsage.map((u: any) => (
                                            <div key={u.yearMonth} className="month-card">
                                                <div className="month-label">{u.yearMonth}</div>
                                                <div className="month-val">{u.totalVisitors.toLocaleString()}</div>
                                                <div className="month-sub">↗ {u.redirected.toLocaleString()} redirected</div>
                                                <div className="month-sub">🚫 {u.blocked.toLocaleString()} blocked</div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* 3. RULES TABLE */}
                    <div className="table-wrap">
                        <div className="card-head">
                            <span className="card-title">Rules</span>
                            <span className="card-count">{rules.length} total · {stats.activeRules} active</span>
                        </div>
                        <table>
                            <thead>
                                <tr>
                                    <th>Name</th>
                                    <th>Match Type</th>
                                    <th>Action</th>
                                    <th>Status</th>
                                    <th>Schedule</th>
                                    <th>Countries / IPs</th>
                                    <th>Priority</th>
                                    <th>Created</th>
                                </tr>
                            </thead>
                            <tbody>
                                {rules.map((r: any) => (
                                    <tr key={r.id}>
                                        <td style={{ fontWeight: 600, color: "#e2e8f0" }}>{r.name}</td>
                                        <td style={{ color: "#94a3b8" }}>{r.matchType}</td>
                                        <td>
                                            <span className="type-chip" style={{
                                                background: r.ruleType === "block" ? "rgba(239,68,68,0.12)" : "rgba(129,140,248,0.12)",
                                                color: r.ruleType === "block" ? "#f87171" : "#818cf8",
                                            }}>{r.ruleType}</span>
                                        </td>
                                        <td>
                                            <span style={{ color: r.isActive ? "#4ade80" : "#475569", fontSize: "12px" }}>
                                                {r.isActive ? "● Active" : "○ Inactive"}
                                            </span>
                                        </td>
                                        <td style={{ color: r.scheduleEnabled ? "#f59e0b" : "#475569" }}>
                                            {r.scheduleEnabled ? "⏰ Enabled" : "—"}
                                        </td>
                                        <td className="truncate-cell" title={r.countryCodes || ""}>
                                            {r.countryCodes || "—"}
                                        </td>
                                        <td style={{ color: "#475569" }}>{r.priority}</td>
                                        <td style={{ color: "#475569" }}>{formatDateShort(r.createdAt)}</td>
                                    </tr>
                                ))}
                                {rules.length === 0 && <tr><td colSpan={8} className="empty">No rules.</td></tr>}
                            </tbody>
                        </table>
                    </div>

                    {/* 4. VISITOR LOGS */}
                    <div className="table-wrap">
                        <div className="card-head">
                            <span className="card-title">Visitor Logs</span>
                            <span className="card-count">Last 100 entries</span>
                        </div>
                        <table>
                            <thead>
                                <tr>
                                    <th>Time</th>
                                    <th>IP Address</th>
                                    <th>Country</th>
                                    <th>Action</th>
                                    <th>Rule Triggered</th>
                                    <th>Target URL</th>
                                </tr>
                            </thead>
                            <tbody>
                                {logs.map((l: any) => (
                                    <tr key={l.id}>
                                        <td style={{ color: "#475569" }}>{formatDate(l.timestamp)}</td>
                                        <td style={{ fontFamily: "monospace", fontSize: "11px", color: "#94a3b8" }}>{l.ipAddress}</td>
                                        <td style={{ color: "#e2e8f0", fontWeight: 500 }}>{l.countryCode || "—"}</td>
                                        <td>
                                            <span className="action-chip" style={{
                                                background: `${actionColor(l.action)}18`,
                                                color: actionColor(l.action),
                                            }}>{l.action}</span>
                                        </td>
                                        <td style={{ color: "#94a3b8" }}>{l.ruleName || "—"}</td>
                                        <td className="truncate-cell" title={l.targetUrl || ""} style={{ color: "#475569", fontSize: "11px" }}>
                                            {l.targetUrl || "—"}
                                        </td>
                                    </tr>
                                ))}
                                {logs.length === 0 && <tr><td colSpan={6} className="empty">No logs yet.</td></tr>}
                            </tbody>
                        </table>
                    </div>

                </main>
            </body>
        </html>
    );
}

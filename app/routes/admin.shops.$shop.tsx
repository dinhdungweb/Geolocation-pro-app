import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json, redirect } from "@remix-run/node";
import { Form, Link, useLoaderData, useNavigation } from "@remix-run/react";
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
            select: { id: true, name: true, matchType: true, ruleType: true, isActive: true, priority: true, countryCodes: true, createdAt: true },
        }),
        (prisma as any).visitorLog.findMany({
            where: { shop },
            orderBy: { timestamp: "desc" },
            take: 50,
            select: { id: true, ipAddress: true, countryCode: true, action: true, ruleName: true, targetUrl: true, timestamp: true },
        }),
        (prisma as any).monthlyUsage.findMany({
            where: { shop },
            orderBy: { yearMonth: "desc" },
            take: 6,
        }),
    ]);

    if (!settings) {
        throw new Response("Shop not found", { status: 404 });
    }

    return json({
        shop,
        settings: {
            mode: settings.mode,
            template: settings.template,
            excludeBots: settings.excludeBots,
            cookieDuration: settings.cookieDuration,
            createdAt: settings.createdAt.toISOString(),
            updatedAt: settings.updatedAt.toISOString(),
        },
        rules: rules.map(r => ({
            ...r,
            createdAt: r.createdAt.toISOString(),
        })),
        logs: logs.map((l: any) => ({
            ...l,
            timestamp: l.timestamp.toISOString(),
        })),
        monthlyUsage,
    });
};

export const action = async ({ request, params }: ActionFunctionArgs) => {
    await requireAdminAuth(request);
    const shop = decodeURIComponent(params.shop ?? "");
    const formData = await request.formData();
    const intent = formData.get("intent")?.toString();

    if (intent === "disable") {
        await prisma.settings.update({ where: { shop }, data: { mode: "disabled" } });
    } else if (intent === "enable") {
        await prisma.settings.update({ where: { shop }, data: { mode: "popup" } });
    } else if (intent === "delete_rules") {
        await prisma.redirectRule.deleteMany({ where: { shop } });
    }

    return redirect(`/admin/shops/${encodeURIComponent(shop)}`);
};

export default function AdminShopDetail() {
    const { shop, settings, rules, logs, monthlyUsage } = useLoaderData<typeof loader>();
    const navigation = useNavigation();
    const isSubmitting = navigation.state === "submitting";

    const actionColor = (action: string) => {
        const colors: Record<string, string> = {
            visit: "#64748b", redirected: "#818cf8", blocked: "#f87171",
            auto_redirected: "#a78bfa", popup_shown: "#22d3ee",
            ip_blocked: "#ef4444", ip_redirected: "#f59e0b",
            clicked_no: "#475569", dismissed: "#475569",
        };
        return colors[action] ?? "#64748b";
    };

    const formatDate = (iso: string) =>
        new Date(iso).toLocaleString("en-GB", {
            day: "2-digit", month: "short", year: "numeric",
            hour: "2-digit", minute: "2-digit",
        });

    const modeColor = (mode: string) => {
        if (mode === "popup") return "#22d3ee";
        if (mode === "auto_redirect") return "#a78bfa";
        return "#64748b";
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
                    .nav { background: #13131a; border-bottom: 1px solid #1e1e2e; padding: 0 28px; display: flex; align-items: center; justify-content: space-between; height: 60px; }
                    .nav-left { display: flex; align-items: center; gap: 12px; }
                    .back-link { color: #818cf8; text-decoration: none; font-size: 14px; }
                    .back-link:hover { color: #a5b4fc; }
                    .separator { color: #1e1e2e; font-size: 18px; }
                    .shop-name { font-size: 15px; font-weight: 600; color: #e2e8f0; }
                    .btn-logout { background: rgba(239,68,68,0.1); border: 1px solid rgba(239,68,68,0.2); color: #f87171; padding: 6px 14px; border-radius: 6px; font-size: 13px; cursor: pointer; }
                    .main { max-width: 1100px; margin: 0 auto; padding: 32px 24px; display: grid; gap: 24px; }
                    /* Top row */
                    .top-row { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
                    .card { background: #13131a; border: 1px solid #1e1e2e; border-radius: 12px; padding: 24px; }
                    .card-title { font-size: 13px; font-weight: 600; color: #64748b; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 16px; }
                    .info-row { display: flex; justify-content: space-between; align-items: center; padding: 8px 0; border-bottom: 1px solid #0f0f16; }
                    .info-row:last-child { border-bottom: none; }
                    .info-label { font-size: 13px; color: #64748b; }
                    .info-value { font-size: 13px; color: #e2e8f0; font-weight: 500; }
                    .mode-badge { display: inline-flex; align-items: center; gap: 5px; padding: 3px 10px; border-radius: 20px; font-size: 11px; font-weight: 600; text-transform: uppercase; }
                    .dot { width: 6px; height: 6px; border-radius: 50%; }
                    /* Actions */
                    .actions { display: flex; flex-direction: column; gap: 12px; }
                    .btn { padding: 10px 16px; border-radius: 8px; font-size: 13px; font-weight: 600; cursor: pointer; border: none; width: 100%; text-align: left; transition: opacity 0.2s; }
                    .btn:hover { opacity: 0.85; }
                    .btn:disabled { opacity: 0.4; cursor: not-allowed; }
                    .btn-disable { background: rgba(239,68,68,0.1); border: 1px solid rgba(239,68,68,0.25); color: #f87171; }
                    .btn-enable { background: rgba(74,222,128,0.1); border: 1px solid rgba(74,222,128,0.25); color: #4ade80; }
                    .btn-danger { background: rgba(245,158,11,0.1); border: 1px solid rgba(245,158,11,0.25); color: #fbbf24; }
                    /* Monthly usage */
                    .usage-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(130px, 1fr)); gap: 10px; }
                    .usage-card { background: #0f0f16; border: 1px solid #1e1e2e; border-radius: 8px; padding: 12px 16px; }
                    .usage-month { font-size: 11px; color: #64748b; margin-bottom: 8px; font-weight: 600; text-transform: uppercase; }
                    .usage-num { font-size: 22px; font-weight: 700; color: #818cf8; }
                    .usage-sub { font-size: 11px; color: #475569; margin-top: 2px; }
                    /* Table */
                    .table-wrap { background: #13131a; border: 1px solid #1e1e2e; border-radius: 12px; overflow: hidden; }
                    .table-header { padding: 16px 24px; border-bottom: 1px solid #1e1e2e; }
                    .table-header h3 { font-size: 15px; font-weight: 600; }
                    table { width: 100%; border-collapse: collapse; }
                    th { text-align: left; padding: 10px 16px; font-size: 11px; font-weight: 600; color: #64748b; text-transform: uppercase; border-bottom: 1px solid #1e1e2e; background: #0f0f16; }
                    td { padding: 12px 16px; font-size: 12px; border-bottom: 1px solid #0f0f16; }
                    tr:last-child td { border-bottom: none; }
                    tr:hover td { background: rgba(255,255,255,0.02); }
                    .action-tag { display: inline-block; padding: 2px 8px; border-radius: 4px; font-size: 11px; font-weight: 600; text-transform: uppercase; }
                    .confirm-msg { font-size: 12px; color: #64748b; margin-top: 4px; }
                `}</style>
            </head>
            <body>
                <nav className="nav">
                    <div className="nav-left">
                        <Link to="/admin" className="back-link">← Dashboard</Link>
                        <span className="separator">/</span>
                        <span className="shop-name">{shop}</span>
                    </div>
                    <Form method="post" action="/admin/logout">
                        <button type="submit" className="btn-logout">Logout</button>
                    </Form>
                </nav>

                <main className="main">
                    {/* Top: Settings + Actions */}
                    <div className="top-row">
                        {/* Settings Info */}
                        <div className="card">
                            <div className="card-title">Shop Settings</div>
                            <div className="info-row">
                                <span className="info-label">Mode</span>
                                <span className="mode-badge" style={{
                                    background: `${modeColor(settings.mode)}15`,
                                    border: `1px solid ${modeColor(settings.mode)}40`,
                                    color: modeColor(settings.mode),
                                }}>
                                    <span className="dot" style={{ background: modeColor(settings.mode) }} />
                                    {settings.mode.replace("_", " ")}
                                </span>
                            </div>
                            <div className="info-row">
                                <span className="info-label">Template</span>
                                <span className="info-value">{settings.template}</span>
                            </div>
                            <div className="info-row">
                                <span className="info-label">Exclude Bots</span>
                                <span className="info-value">{settings.excludeBots ? "✅ Yes" : "❌ No"}</span>
                            </div>
                            <div className="info-row">
                                <span className="info-label">Cookie Duration</span>
                                <span className="info-value">{settings.cookieDuration} days</span>
                            </div>
                            <div className="info-row">
                                <span className="info-label">Installed</span>
                                <span className="info-value">{formatDate(settings.createdAt)}</span>
                            </div>
                            <div className="info-row">
                                <span className="info-label">Last Updated</span>
                                <span className="info-value">{formatDate(settings.updatedAt)}</span>
                            </div>
                        </div>

                        {/* Admin Actions */}
                        <div className="card">
                            <div className="card-title">Admin Actions</div>
                            <div className="actions">
                                {settings.mode !== "disabled" ? (
                                    <Form method="post">
                                        <input type="hidden" name="intent" value="disable" />
                                        <button
                                            type="submit"
                                            className="btn btn-disable"
                                            disabled={isSubmitting}
                                            onClick={(e) => { if (!confirm(`Force DISABLE ${shop}? This will stop all redirects.`)) e.preventDefault(); }}
                                        >
                                            🔴 Force Disable Shop
                                        </button>
                                        <p className="confirm-msg">Stops redirects immediately by setting mode to "disabled"</p>
                                    </Form>
                                ) : (
                                    <Form method="post">
                                        <input type="hidden" name="intent" value="enable" />
                                        <button type="submit" className="btn btn-enable" disabled={isSubmitting}>
                                            🟢 Re-enable Shop (set to popup mode)
                                        </button>
                                    </Form>
                                )}
                                <Form method="post">
                                    <input type="hidden" name="intent" value="delete_rules" />
                                    <button
                                        type="submit"
                                        className="btn btn-danger"
                                        disabled={isSubmitting}
                                        onClick={(e) => { if (!confirm(`Delete ALL ${rules.length} rules for ${shop}? This cannot be undone.`)) e.preventDefault(); }}
                                    >
                                        🗑 Delete All Rules ({rules.length})
                                    </button>
                                    <p className="confirm-msg">Permanently removes all redirect/block rules for this shop</p>
                                </Form>
                            </div>
                        </div>
                    </div>

                    {/* Monthly Usage */}
                    <div className="card">
                        <div className="card-title">Monthly Usage (last 6 months)</div>
                        <div className="usage-grid">
                            {monthlyUsage.length === 0 && (
                                <p style={{ color: "#475569", fontSize: "13px" }}>No usage data yet.</p>
                            )}
                            {monthlyUsage.map((u: any) => (
                                <div key={u.yearMonth} className="usage-card">
                                    <div className="usage-month">{u.yearMonth}</div>
                                    <div className="usage-num">{u.totalVisitors.toLocaleString()}</div>
                                    <div className="usage-sub">↗ {u.redirected} redirected</div>
                                    <div className="usage-sub">🚫 {u.blocked} blocked</div>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Rules Table */}
                    <div className="table-wrap">
                        <div className="table-header">
                            <h3>Rules ({rules.length})</h3>
                        </div>
                        <table>
                            <thead>
                                <tr>
                                    <th>Name</th>
                                    <th>Type</th>
                                    <th>Action</th>
                                    <th>Status</th>
                                    <th>Countries / IPs</th>
                                    <th>Created</th>
                                </tr>
                            </thead>
                            <tbody>
                                {rules.map((r: any) => (
                                    <tr key={r.id}>
                                        <td style={{ fontWeight: 500, color: "#e2e8f0" }}>{r.name}</td>
                                        <td style={{ color: "#94a3b8" }}>{r.matchType}</td>
                                        <td>
                                            <span className="action-tag" style={{
                                                background: r.ruleType === "block" ? "rgba(239,68,68,0.1)" : "rgba(129,140,248,0.1)",
                                                color: r.ruleType === "block" ? "#f87171" : "#818cf8",
                                            }}>
                                                {r.ruleType}
                                            </span>
                                        </td>
                                        <td>
                                            <span style={{ color: r.isActive ? "#4ade80" : "#475569", fontSize: "12px" }}>
                                                {r.isActive ? "● Active" : "○ Inactive"}
                                            </span>
                                        </td>
                                        <td style={{ color: "#94a3b8", maxWidth: "200px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                            {r.countryCodes || "—"}
                                        </td>
                                        <td style={{ color: "#475569" }}>{formatDate(r.createdAt)}</td>
                                    </tr>
                                ))}
                                {rules.length === 0 && (
                                    <tr><td colSpan={6} style={{ textAlign: "center", color: "#475569", padding: "32px" }}>No rules.</td></tr>
                                )}
                            </tbody>
                        </table>
                    </div>

                    {/* Recent Logs */}
                    <div className="table-wrap">
                        <div className="table-header">
                            <h3>Recent Visitor Logs (last 50)</h3>
                        </div>
                        <table>
                            <thead>
                                <tr>
                                    <th>Time</th>
                                    <th>IP</th>
                                    <th>Country</th>
                                    <th>Action</th>
                                    <th>Rule</th>
                                    <th>Target URL</th>
                                </tr>
                            </thead>
                            <tbody>
                                {logs.map((l: any) => (
                                    <tr key={l.id}>
                                        <td style={{ color: "#475569", whiteSpace: "nowrap" }}>{formatDate(l.timestamp)}</td>
                                        <td style={{ fontFamily: "monospace", fontSize: "12px", color: "#94a3b8" }}>{l.ipAddress}</td>
                                        <td style={{ color: "#e2e8f0" }}>{l.countryCode || "—"}</td>
                                        <td>
                                            <span className="action-tag" style={{
                                                background: `${actionColor(l.action)}18`,
                                                color: actionColor(l.action),
                                            }}>
                                                {l.action}
                                            </span>
                                        </td>
                                        <td style={{ color: "#94a3b8", fontSize: "12px" }}>{l.ruleName || "—"}</td>
                                        <td style={{ color: "#475569", fontSize: "11px", maxWidth: "150px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                            {l.targetUrl || "—"}
                                        </td>
                                    </tr>
                                ))}
                                {logs.length === 0 && (
                                    <tr><td colSpan={6} style={{ textAlign: "center", color: "#475569", padding: "32px" }}>No logs yet.</td></tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </main>
            </body>
        </html>
    );
}

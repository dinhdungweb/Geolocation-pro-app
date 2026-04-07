import type { LoaderFunctionArgs } from "@remix-run/node";
import { json, redirect } from "@remix-run/node";
import { Form, Link, useLoaderData } from "@remix-run/react";
import { requireAdminAuth } from "../utils/admin.session.server";
import prisma from "../db.server";
import { FREE_PLAN } from "../billing.config";

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

    const currentPlan = settings?.currentPlan || FREE_PLAN;
    const hasProPlan = currentPlan !== FREE_PLAN;

    const totalVisitors = monthlyUsage.reduce((s: number, u: any) => s + u.totalVisitors, 0);
    const totalRedirected = monthlyUsage.reduce((s: number, u: any) => s + u.redirected, 0);
    const totalBlocked = monthlyUsage.reduce((s: number, u: any) => s + u.blocked, 0);
    const totalPopups = monthlyUsage.reduce((s: number, u: any) => s + (u.popupShown || 0), 0);

    const effectiveActiveRules = rules.filter((r: any) => {
        if (!r.isActive) return false;
        if (!hasProPlan) {
            if (r.matchType === "ip") return false;
            if (r.ruleType === "block") return false;
        }
        return true;
    }).length;

    return json({
        shop,
        hasSettings: !!settings,
        hasProPlan,
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
        stats: { totalVisitors, totalRedirected, totalBlocked, totalPopups, activeRules: effectiveActiveRules, totalRules: rules.length },
    });
};


export default function AdminShopDetail() {
    const { shop, settings, hasSettings, rules, logs, monthlyUsage, stats, hasProPlan } = useLoaderData<typeof loader>();

    const formatDate = (iso: string) =>
        new Date(iso).toLocaleString("en-GB", {
            day: "2-digit", month: "short", year: "numeric",
            hour: "2-digit", minute: "2-digit",
        });
    const formatDateShort = (iso: string) =>
        new Date(iso).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });

    const modeColor = (mode: string) => {
        if (mode === "popup") return "#6366f1";
        if (mode === "auto_redirect") return "#10b981";
        return "#64748b";
    };

    const actionColor = (action: string) => {
        const m: Record<string, string> = {
            visit: "#64748b", redirected: "#6366f1", blocked: "#ef4444",
            auto_redirect: "#10b981", popup_show: "#6366f1",
        };
        return m[action] ?? "#64748b";
    };

    return (
        <div className="shop-detail-view">
            <style>{`
                .back-bar { margin-bottom: 24px; }
                .back-btn { 
                    display: inline-flex; align-items: center; gap: 8px; 
                    text-decoration: none; color: var(--text-muted); font-size: 14px; font-weight: 500;
                    transition: color 0.2s;
                }
                .back-btn:hover { color: var(--primary); }

                .shop-header { 
                    margin-bottom: 32px; 
                    display: flex; 
                    align-items: flex-end; 
                    justify-content: space-between;
                    gap: 16px; 
                }
                .shop-header h1 { font-size: 28px; font-weight: 700; color: var(--text); word-break: break-all; }
                .shop-header .domain { font-size: 14px; color: var(--text-muted); margin-bottom: 6px; }

                .stats-grid-small { 
                    display: grid; 
                    grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); 
                    gap: 16px; 
                    margin-bottom: 32px; 
                }
                
                .section-grid { 
                    display: grid; 
                    grid-template-columns: repeat(auto-fit, minmax(340px, 1fr)); 
                    gap: 24px; 
                    margin-bottom: 32px; 
                }
                
                .card-v3 {
                    background: var(--surface); border: 1px solid var(--border); border-radius: 16px; 
                    display: flex; flex-direction: column; overflow: hidden;
                }
                .card-v3-header { padding: 16px 20px; border-bottom: 1px solid var(--border); background: #f8fafc; font-weight: 600; font-size: 14px; }
                .card-v3-body { padding: 20px; flex: 1; }

                .info-item { display: flex; justify-content: space-between; padding: 12px 0; border-bottom: 1px solid #f1f5f9; }
                .info-item:last-child { border-bottom: none; }
                .info-item .label { color: var(--text-muted); font-size: 13px; }
                .info-item .value { font-weight: 600; font-size: 13px; text-align: right; }

                .monthly-list { display: flex; flex-direction: column; gap: 12px; }
                .month-row { display: flex; align-items: center; justify-content: space-between; padding: 12px; background: #f8fafc; border-radius: 10px; }
                .month-name { font-weight: 700; font-size: 14px; color: var(--primary); }
                .month-stats { display: flex; gap: 16px; font-size: 12px; color: var(--text-muted); }

                .table-container { width: 100%; overflow-x: auto; }
                table { width: 100%; border-collapse: collapse; min-width: 600px; }
                th { text-align: left; padding: 12px 20px; font-size: 11px; font-weight: 600; color: var(--text-muted); text-transform: uppercase; border-bottom: 1px solid var(--border); background: #f8fafc; }
                td { padding: 14px 20px; border-bottom: 1px solid var(--border); font-size: 13px; }
                .badge-v3 { padding: 4px 8px; border-radius: 6px; font-size: 11px; font-weight: 600; }

                @media (max-width: 768px) {
                    .shop-header { flex-direction: column; align-items: flex-start; gap: 12px; }
                    .shop-header h1 { font-size: 24px; }
                    .stats-grid-small { grid-template-columns: 1fr 1fr; gap: 12px; }
                    .stats-grid-small .flat-card div:last-child { font-size: 20px !important; }
                    .section-grid { grid-template-columns: 1fr; gap: 16px; }
                    .card-v3-header { padding: 12px 16px; }
                    .card-v3-body { padding: 16px; }
                    .month-stats { flex-direction: column; gap: 4px; align-items: flex-end; }
                }

                @media (max-width: 480px) {
                    .stats-grid-small { grid-template-columns: 1fr; }
                }
            `}</style>

            <div className="back-bar">
                <Link to="/admin/shops" className="back-btn">← Back to Shops List</Link>
            </div>

            <div className="shop-header">
                <div style={{ flex: 1 }}>
                    <div className="domain">Managed Shop</div>
                    <h1>{shop}</h1>
                </div>
                <div style={{ padding: '8px 16px', background: hasProPlan ? '#ecfdf5' : '#f1f5f9', color: hasProPlan ? '#10b981' : '#64748b', borderRadius: '10px', fontSize: '12px', fontWeight: 700 }}>
                    {hasProPlan ? 'PRO PLAN' : 'FREE PLAN'}
                </div>
            </div>

            <div className="stats-grid-small">
                <div className="flat-card">
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase' }}>Total Views</div>
                    <div style={{ fontSize: '24px', fontWeight: 700 }}>{stats.totalVisitors.toLocaleString()}</div>
                </div>
                <div className="flat-card">
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase' }}>Redirects</div>
                    <div style={{ fontSize: '24px', fontWeight: 700, color: 'var(--primary)' }}>{stats.totalRedirected.toLocaleString()}</div>
                </div>
                <div className="flat-card">
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase' }}>Blocked</div>
                    <div style={{ fontSize: '24px', fontWeight: 700, color: '#ef4444' }}>{stats.totalBlocked.toLocaleString()}</div>
                </div>
                <div className="flat-card">
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase' }}>Active Rules</div>
                    <div style={{ fontSize: '24px', fontWeight: 700, color: '#10b981' }}>{stats.activeRules}</div>
                </div>
            </div>

            <div className="section-grid">
                <div className="card-v3">
                    <div className="card-v3-header">App Configurations</div>
                    <div className="card-v3-body">
                        {!hasSettings ? (
                            <div style={{ padding: '24px', textAlign: 'center', color: '#f59e0b' }}>No settings found.</div>
                        ) : (
                            <>
                                <div className="info-item">
                                    <span className="label">Operation Mode</span>
                                    <span className="value" style={{ color: modeColor(settings!.mode) }}>{settings!.mode.toUpperCase()}</span>
                                </div>
                                <div className="info-item">
                                    <span className="label">Popup Template</span>
                                    <span className="value">{settings!.template}</span>
                                </div>
                                <div className="info-item">
                                    <span className="label">Exclude Bots</span>
                                    <span className="value">{settings!.excludeBots ? 'YES' : 'NO'}</span>
                                </div>
                                <div className="info-item">
                                    <span className="label">Cookie TTL</span>
                                    <span className="value">{settings!.cookieDuration} Days</span>
                                </div>
                                <div className="info-item">
                                    <span className="label">Installed On</span>
                                    <span className="value">{formatDateShort(settings!.createdAt)}</span>
                                </div>
                            </>
                        )}
                    </div>
                </div>

                <div className="card-v3">
                    <div className="card-v3-header">Monthly Usage History</div>
                    <div className="card-v3-body">
                        <div className="monthly-list">
                            {monthlyUsage.length === 0 ? (
                                <div style={{ color: 'var(--text-muted)', fontSize: '13px' }}>No usage data recorded.</div>
                            ) : (
                                monthlyUsage.map((u: any) => (
                                    <div className="month-row" key={u.yearMonth}>
                                        <div className="month-name">{u.yearMonth}</div>
                                        <div className="month-stats">
                                            <span><b>{u.totalVisitors.toLocaleString()}</b> views</span>
                                            <span><b>{u.redirected}</b> redirs</span>
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>
                </div>
            </div>

            <div className="card-v3" style={{ marginBottom: '32px' }}>
                <div className="card-v3-header">Redirect & Block Rules</div>
                <div className="table-container">
                    <table>
                        <thead>
                            <tr>
                                <th>Rule Name</th>
                                <th>Match</th>
                                <th>Action</th>
                                <th>Status</th>
                                <th>Priority</th>
                            </tr>
                        </thead>
                        <tbody>
                            {rules.map((r: any) => (
                                <tr key={r.id}>
                                    <td><strong>{r.name}</strong></td>
                                    <td>
                                        <div style={{ fontSize: '11px', color: 'var(--text-muted)', lineHeight: '1.4' }}>
                                            <div style={{ fontWeight: 700, color: 'var(--text)', marginBottom: '2px' }}>{r.matchType.toUpperCase()}</div>
                                            <div style={{ maxWidth: '200px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={r.countryCodes || 'All'}>
                                                {(() => {
                                                    if (!r.countryCodes || r.countryCodes === '*') return 'All Countries';
                                                    const codes = r.countryCodes.split(',');
                                                    if (codes.length <= 3) return r.countryCodes;
                                                    return `${codes.slice(0, 3).join(', ')} ... +${codes.length - 3} more`;
                                                })()}
                                            </div>
                                        </div>
                                    </td>
                                    <td><span className="badge-v3" style={{ background: r.ruleType === 'block' ? '#fef2f2' : '#eef2ff', color: r.ruleType === 'block' ? '#ef4444' : '#6366f1' }}>{r.ruleType.toUpperCase()}</span></td>
                                    <td>{r.isActive ? <span style={{ color: '#10b981' }}>● Active</span> : <span style={{ color: '#94a3b8' }}>○ Inactive</span>}</td>
                                    <td>{r.priority}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>

            <div className="card-v3">
                <div className="card-v3-header">Live Interaction Logs</div>
                <div className="table-container">
                    <table>
                        <thead>
                            <tr>
                                <th>Time</th>
                                <th>Visitor IP</th>
                                <th>Action</th>
                                <th>Rule</th>
                            </tr>
                        </thead>
                        <tbody>
                            {logs.map((l: any) => (
                                <tr key={l.id}>
                                    <td style={{ color: 'var(--text-muted)', fontSize: '12px' }}>{formatDate(l.timestamp)}</td>
                                    <td>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                            {l.countryCode && <img src={`https://flagcdn.com/w40/${l.countryCode.toLowerCase()}.png`} width="16" alt={l.countryCode} />}
                                            <span style={{ fontFamily: 'monospace' }}>{l.ipAddress}</span>
                                        </div>
                                    </td>
                                    <td><span className="badge-v3" style={{ background: `${actionColor(l.action)}15`, color: actionColor(l.action) }}>{l.action.toUpperCase()}</span></td>
                                    <td style={{ color: 'var(--text-muted)' }}>{l.ruleName || '—'}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}


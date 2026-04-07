import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData } from "@remix-run/react";
import prisma from "../db.server";
import { requireAdminAuth } from "../utils/admin.session.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
    await requireAdminAuth(request);

    // Aggregate AnalyticsRule data
    const ruleStats = await prisma.analyticsRule.groupBy({
        by: ['ruleName', 'ruleId'],
        _sum: {
            seen: true,
            clickedYes: true,
            clickedNo: true,
            dismissed: true,
            autoRedirected: true,
        },
    });

    // Top Countries for Marketing
    const countryStats = await prisma.analyticsCountry.groupBy({
        by: ['countryCode'],
        _sum: {
            visitors: true,
            popupShown: true,
            redirected: true,
        },
        orderBy: {
            _sum: {
                visitors: 'desc',
            },
        },
        take: 10,
    });

    return json({ 
        campaigns: ruleStats.map((r: any) => ({
            ...r,
            name: r.ruleName,
            id: r.ruleId,
            seen: r._sum.seen || 0,
            conversions: r._sum.clickedYes || 0,
            auto: r._sum.autoRedirected || 0,
            cr: r._sum.seen > 0 ? ((r._sum.clickedYes / r._sum.seen) * 100).toFixed(1) : '0'
        })),
        reach: countryStats.map((c: any) => ({
            code: c.countryCode,
            visitors: c._sum.visitors || 0,
            engaged: (c._sum.popupShown || 0) + (c._sum.redirected || 0)
        }))
    });
};

export default function AdminMarketing() {
    const { campaigns, reach } = useLoaderData<typeof loader>();

    return (
        <div className="marketing-view">
            <style>{`
                .grid-2 { display: grid; grid-template-columns: repeat(auto-fit, minmax(400px, 1fr)); gap: 24px; margin-bottom: 32px; }
                .campaign-card {
                    background: var(--surface); border: 1px solid var(--border); border-radius: 16px; overflow: hidden;
                }
                .header-flex { display: flex; align-items: center; justify-content: space-between; padding: 20px 24px; border-bottom: 1px solid var(--border); }
                .metric-box { padding: 16px; background: #f8fafc; border-radius: 12px; text-align: center; flex: 1; }
                .metric-label { font-size: 11px; color: var(--text-muted); font-weight: 600; text-transform: uppercase; margin-bottom: 4px; }
                .metric-val { font-size: 20px; font-weight: 700; color: var(--text); }
                
                table { width: 100%; border-collapse: collapse; }
                th { text-align: left; padding: 12px 24px; background: #f8fafc; font-size: 11px; color: var(--text-muted); border-bottom: 1px solid var(--border); }
                td { padding: 14px 24px; border-bottom: 1px solid var(--border); font-size: 14px; }
            `}</style>

            <div className="grid-2">
                <div className="campaign-card">
                    <div className="header-flex">
                        <h3 style={{ fontSize: '16px', fontWeight: 600 }}>Campaign Performance</h3>
                        <span className="badge-primary badge">Active Rules</span>
                    </div>
                    <div style={{ overflowX: 'auto' }}>
                        <table>
                            <thead>
                                <tr>
                                    <th>Campaign / Rule</th>
                                    <th>Reach</th>
                                    <th>Conversions</th>
                                    <th>CR %</th>
                                </tr>
                            </thead>
                            <tbody>
                                {campaigns.map((c: any) => (
                                    <tr key={c.id}>
                                        <td>
                                            <div style={{ fontWeight: 600 }}>{c.name}</div>
                                            <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{c.auto > 0 ? 'Auto-Redirect' : 'Popup Campaign'}</div>
                                        </td>
                                        <td>{c.seen.toLocaleString()}</td>
                                        <td>{c.conversions.toLocaleString()}</td>
                                        <td>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                <strong>{c.cr}%</strong>
                                                <div style={{ width: '60px', height: '6px', background: '#e2e8f0', borderRadius: '3px', position: 'relative' }}>
                                                    <div style={{ position: 'absolute', top: 0, left: 0, height: '100%', width: `${Math.min(parseFloat(c.cr), 100)}%`, background: 'var(--primary)', borderRadius: '3px' }} />
                                                </div>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>

                <div className="campaign-card">
                    <div className="header-flex">
                        <h3 style={{ fontSize: '16px', fontWeight: 600 }}>Market Reach (Top 10)</h3>
                    </div>
                    <table>
                        <thead>
                            <tr>
                                <th>Market (Country)</th>
                                <th>Total Visitors</th>
                                <th>Engagement</th>
                            </tr>
                        </thead>
                        <tbody>
                            {reach.map((r: any) => (
                                <tr key={r.code}>
                                    <td>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                            <img src={`https://flagcdn.com/w40/${r.code.toLowerCase()}.png`} width="20" alt={r.code} />
                                            <strong>{r.code}</strong>
                                        </div>
                                    </td>
                                    <td>{r.visitors.toLocaleString()}</td>
                                    <td>
                                        <div style={{ color: '#10b981', fontWeight: 600 }}>
                                            {r.engaged.toLocaleString()}
                                            <span style={{ fontSize: '11px', color: 'var(--text-muted)', marginLeft: '4px', fontWeight: 400 }}>actions</span>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>

            <div className="flat-card" style={{ display: 'flex', gap: '24px' }}>
                <div className="metric-box" style={{ background: '#eef2ff' }}>
                    <div className="metric-label" style={{ color: '#6366f1' }}>Avg. Conversion</div>
                    <div className="metric-val">
                        {campaigns.length > 0 
                            ? (campaigns.reduce((a: any, b: any) => a + parseFloat(b.cr), 0) / campaigns.length).toFixed(1)
                            : 0}%
                    </div>
                </div>
                <div className="metric-box" style={{ background: '#ecfdf5' }}>
                    <div className="metric-label" style={{ color: '#10b981' }}>Total Reach</div>
                    <div className="metric-val">{campaigns.reduce((a: any, b: any) => a + b.seen, 0).toLocaleString()}</div>
                </div>
                <div className="metric-box" style={{ background: '#fef2f2' }}>
                    <div className="metric-label" style={{ color: '#ef4444' }}>Auto-Redirects</div>
                    <div className="metric-val">{campaigns.reduce((a: any, b: any) => a + b.auto, 0).toLocaleString()}</div>
                </div>
            </div>
        </div>
    );
}

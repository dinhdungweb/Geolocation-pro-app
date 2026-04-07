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

export default function AdminCampaigns() {
    const { campaigns, reach } = useLoaderData<typeof loader>();

    return (
        <div className="marketing-view">
            <style>{`
                .grid-2 { 
                    display: grid; 
                    grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); 
                    gap: 24px; 
                    margin-bottom: 32px; 
                }
                .campaign-card {
                    background: var(--surface); border: 1px solid var(--border); border-radius: 16px; overflow: hidden;
                    display: flex; flex-direction: column;
                }
                .header-flex { display: flex; align-items: center; justify-content: space-between; padding: 20px 24px; border-bottom: 1px solid var(--border); gap: 12px; }
                
                .metrics-row {
                    display: flex;
                    gap: 24px;
                    flex-wrap: wrap;
                    margin-bottom: 32px;
                }
                .metric-box { 
                    padding: 20px; 
                    background: #f8fafc; 
                    border-radius: 16px; 
                    text-align: center; 
                    flex: 1; 
                    min-width: 150px;
                    border: 1px solid var(--border);
                }
                .metric-label { font-size: 11px; color: var(--text-muted); font-weight: 600; text-transform: uppercase; margin-bottom: 6px; letter-spacing: 0.05em; }
                .metric-val { font-size: 24px; font-weight: 700; color: var(--text); }
                
                .table-container { width: 100%; overflow-x: auto; }
                table { width: 100%; border-collapse: collapse; min-width: 500px; }
                th { text-align: left; padding: 12px 24px; background: #f8fafc; font-size: 11px; color: var(--text-muted); border-bottom: 1px solid var(--border); text-transform: uppercase; }
                td { padding: 16px 24px; border-bottom: 1px solid var(--border); font-size: 14px; }

                @media (max-width: 600px) {
                    .header-flex { flex-direction: column; align-items: flex-start; padding: 16px; }
                    .metrics-row { gap: 12px; }
                    .metric-box { padding: 16px; min-width: 120px; }
                    .metric-val { font-size: 20px; }
                    td, th { padding: 12px 16px; }
                }
            `}</style>

            <div className="metrics-row">
                <div className="metric-box" style={{ background: '#f5f7ff', borderColor: '#e0e7ff' }}>
                    <div className="metric-label" style={{ color: '#6366f1' }}>Avg. Conversion</div>
                    <div className="metric-val">
                        {campaigns.length > 0 
                            ? (campaigns.reduce((a: any, b: any) => a + parseFloat(b.cr), 0) / campaigns.length).toFixed(1)
                            : 0}%
                    </div>
                </div>
                <div className="metric-box" style={{ background: '#f0fdf4', borderColor: '#dcfce7' }}>
                    <div className="metric-label" style={{ color: '#10b981' }}>Total Reach</div>
                    <div className="metric-val">{campaigns.reduce((a: any, b: any) => a + b.seen, 0).toLocaleString()}</div>
                </div>
                <div className="metric-box" style={{ background: '#fef2f2', borderColor: '#fee2e2' }}>
                    <div className="metric-label" style={{ color: '#ef4444' }}>Auto-Redirects</div>
                    <div className="metric-val">{campaigns.reduce((a: any, b: any) => a + b.auto, 0).toLocaleString()}</div>
                </div>
            </div>

            <div className="grid-2">
                <div className="campaign-card">
                    <div className="header-flex">
                        <h3 style={{ fontSize: '16px', fontWeight: 600 }}>Campaign Performance</h3>
                        <span className="badge-primary badge">Active Rules</span>
                    </div>
                    <div className="table-container">
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
                    <div className="table-container">
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
            </div>
        </div>
    );
}

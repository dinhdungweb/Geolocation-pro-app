import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData } from "@remix-run/react";
import prisma from "../db.server";
import { requireAdminAuth } from "../utils/admin.session.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
    await requireAdminAuth(request);
    
    // Fetch latest 100 visitor logs
    const logs = await prisma.visitorLog.findMany({
        take: 100,
        orderBy: { timestamp: "desc" },
    });

    // Simple interaction stats
    const totalInteractions = await prisma.visitorLog.count();
    const uniqueIPs = await prisma.visitorLog.groupBy({
        by: ['ipAddress'],
        _count: true,
    });

    return json({ 
        logs: JSON.parse(JSON.stringify(logs)), 
        stats: {
            total: totalInteractions,
            unique: uniqueIPs.length
        }
    });
};

export default function AdminCRM() {
    const { logs, stats } = useLoaderData<typeof loader>();

    const getActionBadge = (action: string) => {
        const colors: Record<string, string> = {
            'redirect': '#10b981',
            'popup_show': '#6366f1',
            'block': '#ef4444',
            'dismiss': '#64748b'
        };
        const color = colors[action] || '#64748b';
        return (
            <span style={{ 
                background: `${color}15`, 
                color: color, 
                padding: '4px 10px', 
                borderRadius: '6px', 
                fontSize: '11px', 
                fontWeight: 600,
                textTransform: 'uppercase'
            }}>
                {action.replace('_', ' ')}
            </span>
        );
    };

    return (
        <div className="crm-view">
            <style>{`
                .stats-bar { 
                    display: grid; 
                    grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); 
                    gap: 24px; 
                    margin-bottom: 32px; 
                }
                .crm-table-container {
                    background: var(--surface);
                    border: 1px solid var(--border);
                    border-radius: 16px;
                    overflow: hidden;
                }
                .table-header { padding: 24px; border-bottom: 1px solid var(--border); }
                .table-scroll { overflow-x: auto; width: 100%; }
                table { width: 100%; border-collapse: collapse; min-width: 800px; }
                th { 
                    text-align: left; padding: 12px 24px; background: #f8fafc;
                    font-size: 11px; text-transform: uppercase; color: var(--text-muted);
                    font-weight: 600; border-bottom: 1px solid var(--border);
                }
                td { padding: 14px 24px; border-bottom: 1px solid var(--border); font-size: 14px; }
                tr:hover td { background: #f9fafb; }
                .country-info { display: flex; align-items: center; gap: 8px; }
                .flag { width: 20px; border-radius: 2px; }
                .time { color: var(--text-muted); font-size: 12px; }
                .ip-text { font-family: monospace; color: var(--text-muted); font-size: 13px; }

                @media (max-width: 768px) {
                    .stats-bar { gap: 16px; }
                    .table-header { padding: 16px; }
                    td, th { padding: 12px 16px; }
                    .stats-bar .flat-card div:nth-child(2) { font-size: 22px !important; }
                }
            `}</style>

            <div className="stats-bar">
                <div className="flat-card">
                    <div style={{ color: 'var(--text-muted)', fontSize: '13px', marginBottom: '8px' }}>Total Interactions</div>
                    <div style={{ fontSize: '28px', fontWeight: 700 }}>{stats.total.toLocaleString()}</div>
                </div>
                <div className="flat-card">
                    <div style={{ color: 'var(--text-muted)', fontSize: '13px', marginBottom: '8px' }}>Identified Visitors (IPs)</div>
                    <div style={{ fontSize: '28px', fontWeight: 700 }}>{stats.unique.toLocaleString()}</div>
                </div>
            </div>

            <div className="crm-table-container">
                <div className="table-header">
                    <h3 style={{ fontSize: '16px', fontWeight: 600 }}>Recent Customer Interactions</h3>
                    <p style={{ color: 'var(--text-muted)', fontSize: '13px', marginTop: '4px' }}>Real-time monitoring of how customers interact with your geolocation rules.</p>
                </div>
                <div style={{ overflowX: 'auto' }}>
                <div className="table-scroll">
                    <table>
                        <thead>
                            <tr>
                                <th>Customer (IP)</th>
                                <th>Location</th>
                                <th>Action Taken</th>
                                <th>Triggered Rule</th>
                                <th>Time</th>
                            </tr>
                        </thead>
                        <tbody>
                            {logs.map((log: any) => (
                                <tr key={log.id}>
                                    <td>
                                        <div className="ip-text">{log.ipAddress}</div>
                                        <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '2px', maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                            {log.userAgent}
                                        </div>
                                    </td>
                                    <td>
                                        <div className="country-info">
                                            {log.countryCode && (
                                                <img 
                                                    className="flag" 
                                                    src={`https://flagcdn.com/w40/${log.countryCode.toLowerCase()}.png`} 
                                                    alt={log.countryCode} 
                                                />
                                            )}
                                            <span>{log.city ? `${log.city}, ` : ''}{log.countryCode}</span>
                                        </div>
                                    </td>
                                    <td>{getActionBadge(log.action)}</td>
                                    <td>
                                        <div style={{ fontWeight: 500 }}>{log.ruleName || 'Global Settings'}</div>
                                        {log.targetUrl && <div style={{ fontSize: '11px', color: 'var(--primary)' }}>→ {log.targetUrl}</div>}
                                    </td>
                                    <td className="time">
                                        {new Date(log.timestamp).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
                                        <div style={{ fontSize: '10px' }}>{new Date(log.timestamp).toLocaleDateString('en-GB')}</div>
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

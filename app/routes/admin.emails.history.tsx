import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData } from "@remix-run/react";
import prisma from "../db.server";
import { requireAdminAuth } from "../utils/admin.session.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
    await requireAdminAuth(request);

    const logs = await (prisma as any).adminEmailLog.findMany({
        orderBy: { createdAt: 'desc' },
        take: 100 // Fetch up to 100 recent logs
    });

    return json({ logs });
};

export default function EmailHistory() {
    const { logs } = useLoaderData<typeof loader>();

    return (
        <div className="history-container">
            <style>{`
                .history-container {
                    padding: 40px;
                    max-width: 1400px;
                    margin: 0 auto;
                }
                
                .modern-card {
                    background: white;
                    border-radius: 24px;
                    border: 1px solid rgba(0,0,0,0.05);
                    box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.05);
                    overflow: hidden;
                    animation: slideUp 0.5s ease-out;
                }

                @keyframes slideUp {
                    from { opacity: 0; transform: translateY(20px); }
                    to { opacity: 1; transform: translateY(0); }
                }
                
                .history-header {
                    padding: 32px 40px;
                    background: #f8fafc;
                    border-bottom: 1px solid rgba(0,0,0,0.05);
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                }
                .history-header h2 { 
                    font-size: 20px; 
                    font-weight: 800; 
                    color: #0f172a;
                    letter-spacing: -0.02em;
                }
                
                .table-shell {
                    width: 100%;
                    overflow-x: auto;
                }
                
                .history-table {
                    width: 100%;
                    border-collapse: collapse;
                    min-width: 900px;
                }
                
                .history-table th {
                    text-align: left;
                    padding: 20px 40px;
                    background: #ffffff;
                    font-size: 11px;
                    font-weight: 800;
                    color: #94a3b8;
                    text-transform: uppercase;
                    letter-spacing: 0.1em;
                    border-bottom: 1px solid #f1f5f9;
                }
                
                .history-table td {
                    padding: 20px 40px;
                    border-bottom: 1px solid #f1f5f9;
                    font-size: 14px;
                    color: #475569;
                    vertical-align: middle;
                }
                
                .history-table tr:last-child td { border-bottom: none; }
                .history-table tr:hover td { background: #f8fafc; }
                
                .shop-cell {
                    display: flex;
                    align-items: center;
                    gap: 12px;
                }
                
                .shop-avatar {
                    width: 36px;
                    height: 36px;
                    border-radius: 10px;
                    background: #6366f1;
                    color: white;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    font-size: 12px;
                    font-weight: 800;
                    flex-shrink: 0;
                    box-shadow: 0 4px 6px -1px rgba(99, 102, 241, 0.2);
                }

                .badge-modern {
                    padding: 6px 12px;
                    border-radius: 8px;
                    font-size: 11px;
                    font-weight: 800;
                    text-transform: uppercase;
                    letter-spacing: 0.05em;
                }
                .badge-sent { background: #f0fdf4; color: #16a34a; border: 1px solid #bbf7d0; }
                .badge-simulated { background: #f5f3ff; color: #7c3aed; border: 1px solid #ddd6fe; }
                .badge-failed { background: #fef2f2; color: #dc2626; border: 1px solid #fecaca; }
                
                .type-pill {
                    font-size: 11px;
                    font-weight: 700;
                    background: #f1f5f9;
                    color: #64748b;
                    padding: 4px 10px;
                    border-radius: 6px;
                }

                .empty-state {
                    padding: 100px 40px;
                    text-align: center;
                    background: white;
                }
                .empty-state h3 { font-size: 18px; font-weight: 700; color: #0f172a; margin: 16px 0 8px; }
                .empty-state p { color: #94a3b8; font-size: 14px; }
            `}</style>
            
            <div className="modern-card">
                <div className="history-header">
                    <div>
                        <h2>Transmission Logs</h2>
                        <p style={{ fontSize: '13px', color: '#94a3b8', marginTop: '4px', fontWeight: 500 }}>Comprehensive history of all dispatch operations.</p>
                    </div>
                </div>
                
                {logs.length > 0 ? (
                    <div className="table-shell">
                        <table className="history-table">
                            <thead>
                                <tr>
                                    <th>Recipient Shop</th>
                                    <th>Subject</th>
                                    <th>Type</th>
                                    <th>Transmission Status</th>
                                    <th>Executed On</th>
                                </tr>
                            </thead>
                            <tbody>
                                {logs.map((log: any) => (
                                    <tr key={log.id}>
                                        <td>
                                            <div className="shop-cell">
                                                <div className="shop-avatar" style={{ background: log.status === 'failed' ? '#ef4444' : '#6366f1' }}>
                                                    {log.shop.slice(0, 2).toUpperCase()}
                                                </div>
                                                <div>
                                                    <div style={{ fontWeight: 700, color: '#1e293b' }}>{log.shop}</div>
                                                    <div style={{ fontSize: '11px', color: '#94a3b8' }}>Session Active</div>
                                                </div>
                                            </div>
                                        </td>
                                        <td style={{ maxWidth: '300px' }}>
                                            <div style={{ fontWeight: 600, color: '#475569', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                {log.subject || '—'}
                                            </div>
                                        </td>
                                        <td>
                                            <span className="type-pill">{log.type}</span>
                                        </td>
                                        <td>
                                            <span className={`badge-modern badge-${log.status === 'failed' ? 'failed' : 
                                                                    log.status === 'simulated' ? 'simulated' : 'sent'}`}>
                                                ● {log.status}
                                            </span>
                                            {log.error && (
                                                <div style={{ fontSize: '11px', color: '#ef4444', marginTop: '6px', maxWidth: '250px' }}>
                                                    {log.error}
                                                </div>
                                            )}
                                        </td>
                                        <td style={{ fontSize: '13px', fontWeight: 600, color: '#64748b' }}>
                                            {new Date(log.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                ) : (
                    <div className="empty-state">
                        <div style={{ opacity: 0.2 }}>
                            <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>
                        </div>
                        <h3>No activity detected</h3>
                        <p>Detailed logs will occupy this space once campaigns begin.</p>
                    </div>
                )}
            </div>
        </div>
    );
}

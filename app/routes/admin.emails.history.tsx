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
        <div style={{ padding: '32px', maxWidth: '1200px', margin: '0 auto' }}>
            <style>{`
                .history-card {
                    background: white;
                    border: 1px solid var(--border);
                    border-radius: 12px;
                    overflow: hidden;
                    box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);
                }
                
                .history-header {
                    padding: 24px;
                    border-bottom: 1px solid var(--border);
                }
                .history-header h2 { font-size: 18px; font-weight: 700; color: var(--text); }
                .history-header p { font-size: 14px; color: var(--text-muted); margin-top: 4px; }
                
                .table-responsive {
                    width: 100%;
                    overflow-x: auto;
                }
                
                .history-table {
                    width: 100%;
                    border-collapse: collapse;
                    min-width: 800px;
                }
                
                .history-table th {
                    text-align: left;
                    padding: 16px 24px;
                    background: #f8fafc;
                    font-size: 12px;
                    font-weight: 600;
                    color: var(--text-muted);
                    text-transform: uppercase;
                    letter-spacing: 0.05em;
                    border-bottom: 1px solid var(--border);
                }
                
                .history-table td {
                    padding: 16px 24px;
                    border-bottom: 1px solid var(--border);
                    font-size: 14px;
                    vertical-align: top;
                }
                
                .history-table tr:hover td {
                    background: #f8fafc;
                }
                
                .status-badge {
                    display: inline-block;
                    padding: 4px 10px;
                    border-radius: 20px;
                    font-size: 12px;
                    font-weight: 700;
                    text-transform: uppercase;
                }
                .status-sent { background: #dcfce7; color: #16a34a; }
                .status-simulated { background: #e0e7ff; color: #4f46e5; }
                .status-failed { background: #fee2e2; color: #dc2626; }
                
                .empty-state {
                    padding: 60px 20px;
                    text-align: center;
                    color: var(--text-muted);
                }
            `}</style>
            
            <div className="history-card">
                <div className="history-header">
                    <h2>Send Logs</h2>
                    <p>Track the delivery status of all automated and manual emails sent from GeoPro.</p>
                </div>
                
                {logs.length > 0 ? (
                    <div className="table-responsive">
                        <table className="history-table">
                            <thead>
                                <tr>
                                    <th>Date</th>
                                    <th>Shop</th>
                                    <th>Type</th>
                                    <th>Subject</th>
                                    <th>Status</th>
                                </tr>
                            </thead>
                            <tbody>
                                {logs.map((log: any) => (
                                    <tr key={log.id}>
                                        <td style={{ whiteSpace: 'nowrap', color: 'var(--text-muted)', fontSize: '13px' }}>
                                            {new Date(log.createdAt).toLocaleString()}
                                        </td>
                                        <td style={{ fontWeight: 500 }}>{log.shop}</td>
                                        <td>
                                            <span style={{ 
                                                fontSize: '12px', 
                                                color: '#64748b', 
                                                background: '#f1f5f9', 
                                                padding: '2px 8px', 
                                                borderRadius: '4px' 
                                            }}>
                                                {log.type}
                                            </span>
                                        </td>
                                        <td>{log.subject || '-'}</td>
                                        <td>
                                            <span className={`status-badge status-${log.status === 'failed' ? 'failed' : 
                                                                    log.status === 'simulated' ? 'simulated' : 'sent'}`}>
                                                {log.status}
                                            </span>
                                            {log.error && (
                                                <div style={{ fontSize: '12px', color: '#dc2626', marginTop: '6px', maxWidth: '300px', wordBreak: 'break-word' }}>
                                                    {log.error}
                                                </div>
                                            )}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                ) : (
                    <div className="empty-state">
                        <div style={{ marginBottom: '16px' }}>
                            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#cbd5e1" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>
                        </div>
                        <h3 style={{ fontSize: '16px', fontWeight: 600, color: 'var(--text)', marginBottom: '8px' }}>No logs found</h3>
                        <p>Emails sent via the system will appear here.</p>
                    </div>
                )}
            </div>
        </div>
    );
}

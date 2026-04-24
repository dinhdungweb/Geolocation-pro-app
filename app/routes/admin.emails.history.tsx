import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData } from "@remix-run/react";
import prisma from "../db.server";
import { requireAdminAuth } from "../utils/admin.session.server";
import { 
    Search, 
    Eye, 
    X, 
    Filter, 
    ChevronRight,
    Mail,
    AlertCircle,
    CheckCircle2,
    Calendar,
    ArrowUpDown
} from "lucide-react";
import { useState } from "react";

export const loader = async ({ request }: LoaderFunctionArgs) => {
    await requireAdminAuth(request);

    try {
        const logs = await prisma.adminEmailLog.findMany({
            orderBy: { createdAt: 'desc' },
            take: 100
        });
        return json({ logs });
    } catch (e) {
        console.error("Error loading email logs:", e);
        return json({ logs: [] });
    }
};

export default function EmailHistory() {
    const { logs } = useLoaderData<typeof loader>();
    const [searchTerm, setSearchTerm] = useState("");
    const [statusFilter, setStatusFilter] = useState("all");
    const [viewingHtml, setViewingHtml] = useState<string | null>(null);

    const filteredLogs = logs.filter((log: any) => {
        const matchesSearch = log.shop.toLowerCase().includes(searchTerm.toLowerCase()) || 
                             (log.subject && log.subject.toLowerCase().includes(searchTerm.toLowerCase()));
        const matchesStatus = statusFilter === 'all' || log.status === statusFilter;
        return matchesSearch && matchesStatus;
    });

    return (
        <div className="history-page">
            <style>{`
                .history-page { font-family: 'Outfit', sans-serif; padding: 0; }
                
                .header-flex { display: flex; justify-content: space-between; align-items: flex-end; margin-bottom: 32px; }
                .header-flex h2 { font-size: 24px; font-weight: 700; color: #1e293b; letter-spacing: -0.02em; }
                .header-flex p { color: #64748b; font-size: 14px; margin-top: 4px; }

                .filters-bar { display: flex; gap: 16px; margin-bottom: 24px; align-items: center; }
                .search-pill { flex: 1; position: relative; }
                .search-pill input { width: 100%; padding: 12px 16px 12px 42px; border-radius: 12px; border: 1px solid #e2e8f0; border-radius: 14px; outline: none; transition: all 0.2s; background: white; }
                .search-pill input:focus { border-color: #6366f1; box-shadow: 0 0 0 4px rgba(99, 102, 241, 0.1); }
                .search-pill svg { position: absolute; left: 14px; top: 12px; color: #94a3b8; }
                
                .filter-select { padding: 10px 16px; border-radius: 14px; border: 1px solid #e2e8f0; background: white; font-size: 14px; font-weight: 600; color: #475569; outline: none; cursor: pointer; }

                .log-table { background: white; border-radius: 20px; border: 1px solid #e2e8f0; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.02); }
                .t-head { background: #f8fafc; display: grid; grid-template-columns: 2fr 1.5fr 1fr 1fr 100px; padding: 16px 24px; border-bottom: 1px solid #e2e8f0; }
                .t-head div { font-size: 11px; font-weight: 800; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.05em; display: flex; align-items: center; gap: 6px; }
                
                .t-row { display: grid; grid-template-columns: 2fr 1.5fr 1fr 1fr 100px; padding: 20px 24px; border-bottom: 1px solid #f1f5f9; align-items: center; transition: all 0.2s; }
                .t-row:hover { background: #f8faff; }
                .t-row:last-child { border-bottom: none; }

                .status-badge { display: inline-flex; align-items: center; gap: 6px; padding: 4px 10px; border-radius: 8px; font-size: 11px; font-weight: 800; }
                .status-sent { background: #f0fdf4; color: #166534; }
                .status-failed { background: #fef2f2; color: #991b1b; }
                .status-simulated { background: #f5f3ff; color: #7c3aed; }

                .btn-view { width: 36px; height: 36px; border-radius: 10px; border: 1px solid #e2e8f0; background: white; display: flex; align-items: center; justify-content: center; cursor: pointer; transition: all 0.2s; color: #64748b; }
                .btn-view:hover { border-color: #6366f1; color: #6366f1; background: #f0f7ff; }

                /* Modal */
                .modal-overlay { position: fixed; inset: 0; background: rgba(15, 23, 42, 0.6); backdrop-filter: blur(4px); z-index: 10000; display: flex; align-items: center; justify-content: center; padding: 40px; }
                .modal-content { background: white; width: 100%; max-width: 800px; max-height: 90vh; border-radius: 24px; display: flex; flex-direction: column; overflow: hidden; box-shadow: 0 25px 50px -12px rgba(0,0,0,0.25); }
                .modal-header { padding: 24px 32px; border-bottom: 1px solid #f1f5f9; display: flex; justify-content: space-between; align-items: center; }
                .modal-body { flex: 1; overflow-y: auto; background: #f8fafc; padding: 20px; }
                .html-preview { background: white; border-radius: 12px; border: 1px solid #e2e8f0; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05); }

                @media (max-width: 768px) {
                    .header-flex { flex-direction: column; align-items: flex-start; gap: 12px; }
                    .filters-bar { flex-direction: column; align-items: stretch; }
                    .search-pill { width: 100%; }
                    .filter-select { width: 100%; }
                    .log-table { overflow-x: auto; border-radius: 12px; }
                    .t-head, .t-row { grid-template-columns: 200px 180px 100px 120px 80px; width: fit-content; padding: 12px 16px; }
                    .modal-overlay { padding: 0; }
                    .modal-content { max-height: 100vh; border-radius: 0; }
                }
            `}</style>

            <div className="header-flex">
                <div>
                    <h2>Transmission Logs</h2>
                    <p>Audit trail of all email communications sent via the platform.</p>
                </div>
                <div style={{ display: 'flex', gap: '8px', color: '#64748b', fontSize: '13px', fontWeight: 600 }}>
                    <Calendar size={18} /> Last 30 days
                </div>
            </div>

            <div className="filters-bar">
                <div className="search-pill">
                    <Search size={18} />
                    <input 
                        type="text" 
                        placeholder="Search by shop URL or subject..." 
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                </div>
                <select className="filter-select" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
                    <option value="all">All Statuses</option>
                    <option value="sent">Sent</option>
                    <option value="failed">Failed</option>
                    <option value="simulated">Simulated</option>
                </select>
                <button className="btn-view" title="More options" style={{ width: '44px', height: '44px', borderRadius: '14px' }}>
                    <Filter size={18} />
                </button>
            </div>

            <div className="log-table">
                <div className="t-head">
                    <div>Recipient Shop <ArrowUpDown size={12} /></div>
                    <div>Subject</div>
                    <div>Status</div>
                    <div>Executed On</div>
                    <div></div>
                </div>

                {filteredLogs.length === 0 ? (
                    <div style={{ padding: '100px 0', textAlign: 'center', color: '#94a3b8' }}>
                        <Mail size={48} style={{ margin: '0 auto 16px', opacity: 0.1 }} />
                        <p style={{ fontWeight: 600 }}>No logs matching your criteria.</p>
                    </div>
                ) : (
                    filteredLogs.map((log: any) => (
                        <div key={log.id} className="t-row">
                            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                <div style={{ width: 36, height: 36, borderRadius: 10, background: '#f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 900, color: '#6366f1' }}>
                                    {log.shop.slice(0, 2).toUpperCase()}
                                </div>
                                <div style={{ fontWeight: 700, color: '#1e293b' }}>{log.shop}</div>
                            </div>
                            <div style={{ fontSize: '13px', color: '#475569', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '250px' }}>
                                {log.subject || '—'}
                            </div>
                            <div>
                                <span className={`status-badge status-${log.status}`}>
                                    {log.status === 'sent' ? <CheckCircle2 size={12} /> : <AlertCircle size={12} />}
                                    {log.status.toUpperCase()}
                                </span>
                            </div>
                            <div style={{ fontSize: '13px', color: '#64748b', fontWeight: 600 }}>
                                {new Date(log.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                            </div>
                            <div style={{ textAlign: 'right' }}>
                                <button className="btn-view" onClick={() => setViewingHtml(log.html || "<p style='text-align:center; padding: 40px; color: #94a3b8;'>No content available for this legacy log.</p>")}>
                                    <Eye size={18} />
                                </button>
                            </div>
                        </div>
                    ))
                )}
            </div>

            {viewingHtml && (
                <div className="modal-overlay" onClick={() => setViewingHtml(null)}>
                    <div className="modal-content" onClick={e => e.stopPropagation()}>
                        <div className="modal-header">
                            <div>
                                <h3 style={{ fontSize: '18px', fontWeight: 800, color: '#1e293b' }}>Email Content Preview</h3>
                                <p style={{ fontSize: '12px', color: '#94a3b8', fontWeight: 600 }}>Sent payload audit</p>
                            </div>
                            <button className="btn-view" onClick={() => setViewingHtml(null)}>
                                <X size={20} />
                            </button>
                        </div>
                        <div className="modal-body">
                            <div className="html-preview">
                                <div dangerouslySetInnerHTML={{ __html: viewingHtml }} />
                            </div>
                        </div>
                        <div style={{ padding: '20px 32px', borderTop: '1px solid #f1f5f9', display: 'flex', justifyContent: 'flex-end' }}>
                            <button className="btn-view" style={{ padding: '0 24px', width: 'auto', fontWeight: 700 }} onClick={() => setViewingHtml(null)}>
                                Close Audit
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData } from "@remix-run/react";
import prisma from "../db.server";
import { requireAdminAuth } from "../utils/admin.session.server";
import { 
    Zap, 
    UserPlus, 
    AlertTriangle, 
    ShieldAlert,
    ChevronRight,
    Eye,
    History,
    MessageSquare
} from "lucide-react";
import { useState } from "react";
import { getWelcomeEmailHtml, getLimit80EmailHtml, getLimit100EmailHtml } from "../utils/email-templates";

export const loader = async ({ request }: LoaderFunctionArgs) => {
    await requireAdminAuth(request);

    // Count sends from AdminEmailLog
    const logs = await (prisma as any).adminEmailLog.groupBy({
        by: ['type'],
        _count: { _all: true },
        _max: { createdAt: true }
    });

    const statsMap = logs.reduce((acc: any, curr: any) => {
        acc[curr.type] = {
            count: curr._count._all,
            lastSent: curr._max.createdAt
        };
        return acc;
    }, {});

    return json({ stats: statsMap });
};

export default function AdminEmailAutomations() {
    const { stats } = useLoaderData<typeof loader>();
    const [previewType, setPreviewType] = useState<string | null>(null);

    const automations = [
        {
            id: 'welcome',
            title: 'Welcome Campaign',
            description: 'Triggers automatically when a merchant installs the app and visits the dashboard for the first time.',
            icon: <UserPlus className="text-indigo-500" size={24} />,
            color: '#6366f1',
            accent: '#e0e7ff',
            stats: stats['welcome'] || { count: 0, lastSent: null },
            template: getWelcomeEmailHtml('demo-store.myshopify.com'),
            subject: 'Welcome to Geo: Redirect & Country Block!'
        },
        {
            id: 'limit_80',
            title: '80% Usage Warning',
            description: 'Sent when a shop reaches 80% of their monthly visitor limit to prevent service interruption.',
            icon: <AlertTriangle className="text-amber-500" size={24} />,
            color: '#f59e0b',
            accent: '#fef3c7',
            stats: stats['limit_80'] || { count: 0, lastSent: null },
            template: getLimit80EmailHtml('demo-store.myshopify.com', 8000, 10000),
            subject: 'demo-store.myshopify.com: Usage Warning (80%) - Geo: Redirect & Country Block'
        },
        {
            id: 'limit_100',
            title: '100% Limit Critical',
            description: 'Critical alert sent when a shop hits 100% of their limit. Necessary for compliance and billing.',
            icon: <ShieldAlert className="text-red-500" size={24} />,
            color: '#ef4444',
            accent: '#fee2e2',
            stats: stats['limit_100'] || { count: 0, lastSent: null },
            template: getLimit100EmailHtml('demo-store.myshopify.com', 10000, 10000),
            subject: 'ACTION REQUIRED: demo-store.myshopify.com reached 100% limit - Geo: Redirect & Country Block'
        }
    ];

    return (
        <div className="automations-page">
            <style>{`
                .automations-page {
                    padding: 40px;
                    max-width: 1200px;
                    margin: 0 auto;
                }
                
                .header-section {
                    margin-bottom: 40px;
                }
                .header-section h2 {
                    font-size: 20px;
                    font-weight: 800;
                    color: #0f172a;
                    letter-spacing: -0.02em;
                }
                .header-section p {
                    color: #64748b;
                    font-size: 14px;
                    margin-top: 4px;
                    font-weight: 500;
                }

                .automation-grid {
                    display: grid;
                    grid-template-columns: repeat(auto-fill, minmax(360px, 1fr));
                    gap: 24px;
                }

                .automation-card {
                    background: white;
                    border-radius: 20px;
                    border: 1px solid rgba(0,0,0,0.06);
                    overflow: hidden;
                    transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
                    display: flex;
                    flex-direction: column;
                }
                .automation-card:hover {
                    transform: translateY(-4px);
                    box-shadow: 0 20px 25px -5px rgba(0,0,0,0.05), 0 10px 10px -5px rgba(0,0,0,0.02);
                }

                .card-header {
                    padding: 24px;
                    display: flex;
                    align-items: flex-start;
                    gap: 16px;
                }
                
                .icon-box {
                    width: 48px;
                    height: 48px;
                    border-radius: 12px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    flex-shrink: 0;
                }

                .card-content {
                    padding: 0 24px 24px;
                    flex: 1;
                }
                .card-content h3 {
                    font-size: 16px;
                    font-weight: 700;
                    color: #1e293b;
                    margin-bottom: 8px;
                }
                .card-content p {
                    font-size: 13px;
                    color: #64748b;
                    line-height: 1.6;
                }

                .card-footer {
                    background: #f8fafc;
                    padding: 16px 24px;
                    border-top: 1px solid rgba(0,0,0,0.04);
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                }

                .status-tag {
                    display: flex;
                    align-items: center;
                    gap: 6px;
                    font-size: 11px;
                    font-weight: 800;
                    text-transform: uppercase;
                    letter-spacing: 0.05em;
                }
                .status-dot {
                    width: 6px;
                    height: 6px;
                    border-radius: 50%;
                    background: #22c55e;
                    box-shadow: 0 0 0 3px rgba(34, 197, 94, 0.2);
                }

                .mini-stat {
                    display: flex;
                    align-items: center;
                    gap: 12px;
                    font-size: 12px;
                    color: #94a3b8;
                    font-weight: 600;
                }
                .mini-stat span {
                    color: #475569;
                    font-weight: 700;
                }

                .action-btn {
                    padding: 8px 14px;
                    border-radius: 10px;
                    border: 1px solid #e2e8f0;
                    background: white;
                    color: #475569;
                    font-size: 12px;
                    font-weight: 700;
                    cursor: pointer;
                    display: flex;
                    align-items: center;
                    gap: 8px;
                    transition: all 0.2s;
                }
                .action-btn:hover {
                    background: #f1f5f9;
                    border-color: #cbd5e1;
                    color: #0f172a;
                }

                /* Modal Overlay */
                .modal-overlay {
                    position: fixed;
                    inset: 0;
                    background: rgba(15, 23, 42, 0.8);
                    backdrop-filter: blur(8px);
                    z-index: 1000;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    padding: 40px;
                }
                
                .modal-content {
                    background: white;
                    width: 100%;
                    max-width: 800px;
                    max-height: 90vh;
                    border-radius: 24px;
                    overflow: hidden;
                    display: flex;
                    flex-direction: column;
                    box-shadow: 0 25px 50px -12px rgba(0,0,0,0.5);
                }

                .modal-header {
                    padding: 24px;
                    border-bottom: 1px solid #f1f5f9;
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                }
                
                .modal-body {
                    flex: 1;
                    overflow-y: auto;
                    background: #f8fafc;
                    padding: 40px;
                }

                .preview-frame {
                    background: white;
                    border-radius: 16px;
                    box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1);
                    padding: 40px;
                    max-width: 600px;
                    margin: 0 auto;
                }

                @media (max-width: 640px) {
                    .automations-page { padding: 20px; }
                    .automation-grid { grid-template-columns: 1fr; }
                }
            `}</style>

            <div className="header-section">
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
                    <Zap size={20} fill="#6366f1" color="#6366f1" />
                    <span style={{ fontSize: '11px', fontWeight: 800, color: '#6366f1', textTransform: 'uppercase', letterSpacing: '0.1em'}}>System Automations</span>
                </div>
                <h2>Automated Email Flows</h2>
                <p>Monitor your transactional and lifecycle emails that trigger automatically.</p>
            </div>

            <div className="automation-grid">
                {automations.map(auto => (
                    <div key={auto.id} className="automation-card">
                        <div className="card-header">
                            <div className="icon-box" style={{ background: auto.accent }}>
                                {auto.icon}
                            </div>
                            <div style={{ flex: 1 }}>
                                <div className="status-tag">
                                    <div className="status-dot"></div>
                                    <span style={{ color: '#22c55e' }}>Active</span>
                                </div>
                            </div>
                        </div>
                        <div className="card-content">
                            <h3>{auto.title}</h3>
                            <p>{auto.description}</p>
                            
                            <div style={{ marginTop: '24px', display: 'flex', gap: '20px' }}>
                                <div className="mini-stat">
                                    <History size={14} />
                                    Total Sent: <span>{auto.stats.count.toLocaleString()}</span>
                                </div>
                                <div className="mini-stat">
                                    <MessageSquare size={14} />
                                    Last Sent: <span>{auto.stats.lastSent ? new Date(auto.stats.lastSent).toLocaleDateString() : 'Never'}</span>
                                </div>
                            </div>
                        </div>
                        <div className="card-footer">
                            <button className="action-btn" onClick={() => setPreviewType(auto.id)}>
                                <Eye size={14} />
                                Preview Template
                            </button>
                            <ChevronRight size={16} color="#94a3b8" />
                        </div>
                    </div>
                ))}
            </div>

            {/* Preview Modal */}
            {previewType && (
                <div className="modal-overlay" onClick={() => setPreviewType(null)}>
                    <div className="modal-content" onClick={e => e.stopPropagation()}>
                        <div className="modal-header">
                            <div>
                                <div style={{ fontSize: '11px', fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase', marginBottom: '4px' }}>Template Preview</div>
                                <h3 style={{ fontSize: '18px', fontWeight: 800, color: '#0f172a' }}>
                                    {automations.find(a => a.id === previewType)?.title}
                                </h3>
                            </div>
                            <button className="action-btn" onClick={() => setPreviewType(null)}>Close</button>
                        </div>
                        <div className="modal-body">
                            <div style={{ maxWidth: '600px', margin: '0 auto 24px', background: 'white', padding: '16px', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
                                <div style={{ fontSize: '12px', color: '#64748b', marginBottom: '4px' }}>Subject</div>
                                <div style={{ fontWeight: 700, color: '#1e293b' }}>{automations.find(a => a.id === previewType)?.subject}</div>
                            </div>
                            <div className="preview-frame" dangerouslySetInnerHTML={{ __html: automations.find(a => a.id === previewType)?.template || '' }} />
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

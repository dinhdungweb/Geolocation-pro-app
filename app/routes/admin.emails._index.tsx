import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData, Link } from "@remix-run/react";
import { useState } from "react";
import { requireAdminAuth } from "../utils/admin.session.server";
import { 
    Mail, 
    Zap, 
    MoreHorizontal,
    Plus,
    ArrowUpRight,
    ArrowDownRight,
    Rocket,
    Eye,
    X
} from "lucide-react";

import prisma from "../db.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
    await requireAdminAuth(request);
    
    // Fetch logs (last 30 days)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const logs = await prisma.adminEmailLog.findMany({
        where: { createdAt: { gte: thirtyDaysAgo } },
        orderBy: { createdAt: 'desc' },
        select: { id: true, type: true, subject: true, status: true, html: true, createdAt: true }
    });

    const totalSent = logs.filter((l: any) => l.status === 'sent').length;

    // Mapping for calendar
    const activityDays = logs.map((l: any) => {
        const d = new Date(l.createdAt);
        return `${d.getMonth()+1}/${d.getDate()}`;
    });

    return json({
        stats: {
            email: { 
                sent: totalSent.toLocaleString(), 
                sentChange: 0, 
                open: "0%", 
                openChange: 0, 
                click: "0%",
                clickChange: 0,
                conv: "0%", 
                convChange: 0, 
                sales: "₫0", 
                salesChange: 0 
            },
            sms: { sent: 0, click: "0%", conv: "0%", sales: "₫0" },
            sales: { total: "₫0", count: 0 }
        },
        activities: logs.map((l: any) => ({
            id: l.id,
            subject: l.subject || `Campaign: ${l.type}`,
            channel: "Email",
            status: l.status === 'sent' ? 'Sent' : 'Draft',
            date: new Date(l.createdAt).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' }),
            open: "-",
            click: "-",
            conv: "-",
            sales: "-",
            html: l.html
        })),
        activityDays,
        campaigns: await (async () => {
            try {
                return await prisma.campaign.findMany({
                    where: { shop: 'GLOBAL' },
                    orderBy: { createdAt: 'desc' },
                    take: 10
                });
            } catch (e) {
                console.error("Prisma error in Dashboard loader:", e);
                return [];
            }
        })()
    });
};

export default function MessagingDashboard() {
    const { stats, activities, activityDays } = useLoaderData<typeof loader>();
    const [activeTab, setActiveTab] = useState("All");
    const [viewingHtml, setViewingHtml] = useState<string | null>(null);

    return (
        <div className="messaging-dashboard-v2">
            <style>{`
                @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700;800&display=swap');
                
                .messaging-dashboard-v2 { 
                    padding: 0; 
                    font-family: 'Outfit', sans-serif; 
                    color: #0f172a;
                    background: transparent;
                }

                /* Modal Review */
                .modal-overlay-v2 { position: fixed; inset: 0; background: rgba(0,0,0,0.4); z-index: 10000; display: flex; align-items: center; justify-content: center; backdrop-filter: blur(4px); }
                .modal-content-v2 { width: 90vw; height: 90vh; background: white; border-radius: 24px; display: flex; flex-direction: column; overflow: hidden; box-shadow: 0 25px 50px -12px rgba(0,0,0,0.25); }
                .modal-header-v2 { padding: 20px 32px; border-bottom: 1px solid #f1f5f9; display: flex; align-items: center; justify-content: space-between; background: #f8fafc; }
                .modal-body-v2 { flex: 1; overflow: auto; background: #f1f5f9; padding: 40px; display: flex; justify-content: center; }
                .iframe-container-v2 { width: 600px; min-height: 800px; background: white; box-shadow: 0 10px 30px rgba(0,0,0,0.1); border-radius: 8px; overflow: hidden; }
                .iframe-container-v2 iframe { width: 100%; height: 100%; border: none; }
                .btn-close-v2 { background: white; border: 1px solid #e2e8f0; border-radius: 12px; padding: 8px; cursor: pointer; color: #64748b; transition: all 0.2s; }
                .btn-close-v2:hover { color: #ef4444; border-color: #ef4444; transform: rotate(90deg); }
                
                /* --- Header Section --- */
                .glass-header {
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                    margin-bottom: 40px;
                    padding: 20px 0;
                }
                .title-group h1 { 
                    font-size: 32px; 
                    font-weight: 800; 
                    background: linear-gradient(135deg, #1e293b 0%, #475569 100%);
                    -webkit-background-clip: text;
                    -webkit-text-fill-color: transparent;
                    letter-spacing: -0.03em;
                }
                .title-group p { color: #64748b; font-size: 14px; font-weight: 500; margin-top: 4px; }
                
                .actions-group { display: flex; gap: 12px; }
                .btn-premium-outline {
                    background: white;
                    border: 1px solid #e2e8f0;
                    padding: 10px 20px;
                    border-radius: 14px;
                    font-size: 14px;
                    font-weight: 600;
                    color: #475569;
                    cursor: pointer;
                    display: flex;
                    align-items: center;
                    gap: 8px;
                    transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
                    box-shadow: 0 1px 2px rgba(0,0,0,0.05);
                }
                .btn-premium-outline:hover {
                    border-color: #6366f1;
                    color: #6366f1;
                    transform: translateY(-2px);
                    box-shadow: 0 10px 15px -3px rgba(0,0,0,0.05);
                }
                .btn-premium-solid {
                    background: linear-gradient(135deg, #6366f1 0%, #4f46e5 100%);
                    color: white;
                    border: none;
                    padding: 10px 24px;
                    border-radius: 14px;
                    font-size: 14px;
                    font-weight: 600;
                    cursor: pointer;
                    transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
                    box-shadow: 0 4px 12px rgba(99, 102, 241, 0.3);
                }
                .btn-premium-solid:hover {
                    transform: translateY(-2px);
                    box-shadow: 0 12px 20px rgba(99, 102, 241, 0.4);
                }

                /* --- Metrics Grid --- */
                .metrics-grid-v2 {
                    display: grid;
                    grid-template-columns: 1.6fr 1fr;
                    gap: 32px;
                    margin-bottom: 40px;
                }
                .premium-card {
                    background: white;
                    border-radius: 24px;
                    border: 1px solid rgba(0,0,0,0.04);
                    box-shadow: 0 10px 30px -5px rgba(0,0,0,0.03);
                    padding: 32px;
                    transition: all 0.3s ease;
                }
                .premium-card:hover { border-color: rgba(99, 102, 241, 0.1); }
                
                .card-header-v2 { display: flex; align-items: center; justify-content: space-between; margin-bottom: 32px; }
                .card-title-v2 { display: flex; align-items: center; gap: 12px; font-weight: 700; font-size: 18px; color: #1e293b; }
                .icon-circle { width: 40px; height: 40px; border-radius: 12px; display: flex; align-items: center; justify-content: center; background: #f5f3ff; color: #7c3aed; }

                .stats-grid-v2 { display: grid; grid-template-columns: repeat(4, 1fr); gap: 32px; }
                .stat-box-v2 .label { font-size: 12px; font-weight: 600; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.05em; display: block; margin-bottom: 12px; }
                .stat-box-v2 .value { font-size: 28px; font-weight: 800; color: #0f172a; letter-spacing: -0.04em; display: block; }
                .stat-box-v2 .trend { font-size: 13px; font-weight: 700; display: flex; align-items: center; gap: 4px; margin-top: 8px; }
                .trend.up { color: #10b981; }
                .trend.down { color: #ef4444; }

                /* --- Calendar Section --- */
                .calendar-wrap { margin-bottom: 40px; }
                .calendar-header-v2 { 
                    display: flex; justify-content: space-between; align-items: center; margin-bottom: 24px; 
                }
                .calendar-grid-v2 {
                    display: grid;
                    grid-template-columns: repeat(7, 1fr);
                    gap: 16px;
                }
                .day-card-v2 {
                    background: #f8fafc;
                    border-radius: 20px;
                    padding: 18px;
                    min-height: 120px;
                    border: 1px solid transparent;
                    transition: all 0.2s;
                    display: flex;
                    flex-direction: column;
                    justify-content: space-between;
                }
                .day-card-v2:hover { background: white; border-color: #e2e8f0; box-shadow: 0 4px 12px rgba(0,0,0,0.03); }
                .day-header-v2 { display: flex; justify-content: space-between; align-items: center; }
                .day-name { font-size: 12px; font-weight: 700; color: #94a3b8; }
                .day-num-v2 { 
                    font-size: 14px; font-weight: 800; color: #1e293b; 
                    width: 28px; height: 28px; display: flex; align-items: center; justify-content: center;
                }
                .day-card-v2.is-today .day-num-v2 { background: #6366f1; color: white; border-radius: 50%; }
                
                .activity-indicator {
                    background: #6366f1; 
                    color: white; 
                    padding: 4px 8px; 
                    border-radius: 8px; 
                    font-size: 10px; 
                    font-weight: 700;
                    text-align: center;
                    animation: fadeIn 0.5s ease;
                }

                /* --- Data Table --- */
                .table-premium { background: white; border-radius: 24px; border: 1px solid rgba(0,0,0,0.04); overflow: hidden; }
                .table-tabs-v2 { display: flex; gap: 32px; padding: 0 32px; border-bottom: 1px solid #f1f5f9; }
                .tab-v2 { padding: 24px 0; font-size: 15px; font-weight: 600; color: #64748b; cursor: pointer; border-bottom: 2px solid transparent; transition: all 0.2s; }
                .tab-v2:hover { color: #1e293b; }
                .tab-v2.active { color: #6366f1; border-bottom-color: #6366f1; }
                
                .t-header-v2 { 
                    display: grid; grid-template-columns: 2fr 1fr 1fr 1.2fr 1fr 1fr 1fr 1fr 40px; 
                    padding: 16px 32px; background: #f8fafc; font-size: 12px; font-weight: 700; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.05em; 
                }
                .t-row-v2 { 
                    display: grid; grid-template-columns: 2fr 1fr 1fr 1.2fr 1fr 1fr 1fr 1fr 40px; 
                    padding: 24px 32px; border-bottom: 1px solid #f1f5f9; align-items: center; transition: all 0.2s; cursor: pointer;
                }
                .t-row-v2:hover { background: #fafaff; }
                
                .subj-group { display: flex; align-items: center; gap: 16px; }
                .subj-thumb { width: 52px; height: 52px; border-radius: 14px; background: #0f172a; flex-shrink: 0; display: flex; align-items: center; justify-content: center; }
                .subj-info .name { font-weight: 700; font-size: 15px; color: #1e293b; display: block; }
                .subj-info .date { font-size: 12px; color: #94a3b8; font-weight: 500; }
                
                .tag-premium {
                    padding: 6px 14px; border-radius: 20px; font-size: 11px; font-weight: 700; text-transform: uppercase;
                }
                .tag-sent { background: #ecfdf5; color: #059669; }
                .tag-draft { background: #f1f1f1; color: #64748b; }

                @media (max-width: 1024px) {
                    .glass-header { flex-direction: column; align-items: flex-start; gap: 20px; }
                    .metrics-grid-v2 { grid-template-columns: 1fr; }
                    .stats-grid-v2 { grid-template-columns: repeat(2, 1fr); gap: 20px; }
                    .calendar-grid-v2 { grid-template-columns: repeat(4, 1fr); gap: 12px; }
                    .table-premium { overflow-x: auto; }
                    .table-tabs-v2 { min-width: 600px; }
                    .t-header-v2, .t-row-v2 { grid-template-columns: 250px 100px 80px 100px 100px 80px 80px 120px 40px; width: fit-content; padding: 16px 20px; }
                }

                @media (max-width: 640px) {
                    .stats-grid-v2 { grid-template-columns: 1fr; }
                    .stat-box-v2 .value { font-size: 24px; }
                    .calendar-grid-v2 { grid-template-columns: repeat(2, 1fr); }
                    .title-group h1 { font-size: 24px; }
                }

                @keyframes fadeIn { from { opacity: 0; transform: translateY(5px); } to { opacity: 1; transform: translateY(0); } }
            `}</style>

            <div className="glass-header">
                <div className="title-group">
                    <h1>Messaging Dashboard</h1>
                    <p>Track your campaign performance and customer engagement in real-time.</p>
                </div>
                <div className="actions-group">
                    <Link to="/admin/emails/automations" className="btn-premium-outline" style={{ textDecoration: 'none' }}>
                        <Zap size={16} /> Automations
                    </Link>
                    <Link to="/admin/emails/composer" className="btn-premium-solid" style={{ textDecoration: 'none' }}>
                        <Rocket size={16} /> Create Campaign
                    </Link>
                    <button className="btn-premium-outline">
                        <MoreHorizontal size={18} />
                    </button>
                </div>
            </div>

            <div className="metrics-grid-v2">
                <div className="premium-card">
                    <div className="card-header-v2">
                        <div className="card-title-v2">
                            <div className="icon-circle"><Mail size={20} /></div>
                            Email Performance
                        </div>
                    </div>
                    <div className="stats-grid-v2">
                        <div className="stat-box-v2">
                            <span className="label">Sent</span>
                            <span className="value">{stats.email.sent}</span>
                            <span className="trend up"><ArrowUpRight size={14} /> {stats.email.sentChange}%</span>
                        </div>
                        <div className="stat-box-v2">
                            <span className="label">Open rate</span>
                            <span className="value">{stats.email.open}</span>
                            <span className="trend down"><ArrowDownRight size={14} /> {stats.email.openChange}%</span>
                        </div>
                        <div className="stat-box-v2">
                            <span className="label">Click rate</span>
                            <span className="value">{stats.email.click}</span>
                            <span className="trend up"><ArrowUpRight size={14} /> {stats.email.sentChange}%</span>
                        </div>
                        <div className="stat-box-v2">
                            <span className="label">Conversion</span>
                            <span className="value">{stats.email.conv}</span>
                            <span className="trend up"><Plus size={12} /> {stats.email.convChange}%</span>
                        </div>
                    </div>
                </div>

                <div className="premium-card">
                    <div className="card-header-v2">
                        <div className="card-title-v2">
                            <div className="icon-circle" style={{ background: '#ecfdf5', color: '#10b981' }}><Zap size={20} /></div>
                            Total Sales
                        </div>
                    </div>
                    <div className="stat-box-v2">
                        <span className="label">Revenue generated</span>
                        <span className="value" style={{ fontSize: '36px' }}>{stats.sales?.total ?? '₫0'}</span>
                        <p style={{ color: '#64748b', fontSize: '13px', marginTop: '8px', fontWeight: 500 }}>
                            From {stats.sales?.count ?? 0} attributed orders
                        </p>
                    </div>
                </div>
            </div>

            <div className="calendar-wrap">
                <div className="calendar-header-v2">
                    <h2 style={{ fontSize: '20px', fontWeight: 800, color: '#1e293b' }}>Activity Calendar</h2>
                    <div style={{ display: 'flex', gap: '8px' }}>
                        <button className="btn-premium-outline" style={{ padding: '6px 14px' }}>April 2026</button>
                    </div>
                </div>
                <div className="calendar-grid-v2">
                    {activityDays.slice(0, 7).concat(['4/13','4/14','4/15','4/16','4/17','4/18','4/19']).map((day: string, idx: number) => {
                        const dayNames = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
                        const dayNum = day.split('/')[1];
                        return (
                            <div key={day} className={`day-card-v2 ${day.includes('8') ? 'is-today' : ''}`}>
                                <div className="day-header-v2">
                                    <span className="day-name">{dayNames[idx % 7]}</span>
                                    <span className="day-num-v2">{dayNum}</span>
                                </div>
                                {activityDays.includes(day) && (
                                    <div className="activity-indicator">
                                        Email Sent
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            </div>

            <div className="table-premium">
                <div className="table-tabs-v2">
                    <div className={`tab-v2 ${activeTab === 'All' ? 'active' : ''}`} onClick={() => setActiveTab('All')}>All history</div>
                    <Link to="/admin/emails/automations" className="tab-v2" style={{ textDecoration: 'none' }}>Automations</Link>
                    <Link to="/admin/emails/campaigns" className="tab-v2" style={{ textDecoration: 'none' }}>Campaigns</Link>
                    <div className="tab-v2">Settings</div>
                </div>
                
                <div className="t-header-v2">
                    <span>Subject / Campaign</span>
                    <span>Status</span>
                    <span>Sent</span>
                    <span>Open rate</span>
                    <span>Click rate</span>
                    <span>Orders</span>
                    <span>Conv.</span>
                    <span>Sales</span>
                    <span></span>
                </div>

                {activities.map((act: any) => (
                    <div key={act.id} className="t-row-v2" onClick={() => act.html ? setViewingHtml(act.html) : null}>
                        <div className="subj-group">
                            <div className="subj-thumb">
                                <Mail size={20} color="white" />
                            </div>
                            <div className="subj-info">
                                <span className="name">{act.subject}</span>
                                <span className="date">{act.date}</span>
                            </div>
                        </div>
                        <div>
                            <span className={`tag-premium ${act.status === 'Sent' ? 'tag-sent' : 'tag-draft'}`}>
                                {act.status}
                            </span>
                        </div>
                        <div style={{ fontWeight: 700 }}>{act.sent?.toLocaleString() ?? 0}</div>
                        <div style={{ fontWeight: 600 }}>{act.open}</div>
                        <div style={{ fontWeight: 600 }}>{act.click}</div>
                        <div style={{ fontWeight: 600 }}>{act.orders}</div>
                        <div style={{ fontWeight: 600 }}>{act.conv}</div>
                        <div style={{ fontWeight: 700, color: '#1e293b' }}>{act.sales}</div>
                        <div className="action-view">
                            <Eye size={18} color={act.html ? "#6366f1" : "#e2e8f0"} />
                        </div>
                    </div>
                ))}
            </div>

            {viewingHtml && (
                <div className="modal-overlay-v2" onClick={() => setViewingHtml(null)}>
                    <div className="modal-content-v2" onClick={e => e.stopPropagation()}>
                        <div className="modal-header-v2">
                            <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                                <div style={{ background: '#e0f2fe', padding: '10px', borderRadius: '12px' }}>
                                    <Mail size={24} color="#0369a1" />
                                </div>
                                <div>
                                    <h3 style={{ fontWeight: 800, fontSize: '18px', color: '#1e293b' }}>Email Content Preview</h3>
                                    <span style={{ fontSize: '12px', color: '#64748b', fontWeight: 600 }}>Audit Trail: Reviewing sent campaign payload</span>
                                </div>
                            </div>
                            <button className="btn-close-v2" onClick={() => setViewingHtml(null)}>
                                <X size={20} />
                            </button>
                        </div>
                        <div className="modal-body-v2">
                            <div className="iframe-container-v2">
                                <iframe title="Email Content" srcDoc={viewingHtml} />
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

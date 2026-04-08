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
    Calendar,
    ArrowUpRight,
    ArrowDownRight,
    Filter,
    ArrowUpDown,
    Search
} from "lucide-react";

import prisma from "../db.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
    await requireAdminAuth(request);
    
    // Fetch logs (last 30 days)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const logs = await (prisma as any).adminEmailLog.findMany({
        where: { createdAt: { gte: thirtyDaysAgo } },
        orderBy: { createdAt: 'desc' }
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
                conv: "0%", 
                convChange: 0, 
                sales: "₫0", 
                salesChange: 0 
            },
            sms: { sent: 0, click: "0%", conv: "0%", sales: "₫0" }
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
            sales: "-"
        })),
        activityDays
    });
};

export default function MessagingDashboard() {
    const { stats, activities, activityDays } = useLoaderData<typeof loader>();
    const [activeTab, setActiveTab] = useState("All");

    return (
        <div className="messaging-dashboard">
            <style>{`
                .messaging-dashboard { padding: 0; font-family: 'Outfit', sans-serif; color: var(--text); }
                
                .header-row { display: flex; align-items: center; justify-content: space-between; margin-bottom: 32px; }
                .title-area { display: flex; align-items: center; gap: 14px; }
                .title-area h1 { font-size: 24px; font-weight: 700; color: var(--text); letter-spacing: -0.02em; }
                
                .btn-secondary { background: var(--surface); border: 1px solid var(--border); padding: 10px 18px; border-radius: 12px; font-size: 14px; font-weight: 600; cursor: pointer; display: flex; align-items: center; gap: 8px; color: var(--text); transition: all 0.2s; }
                .btn-secondary:hover { background: #f8fafc; border-color: var(--primary); color: var(--primary); }
                .btn-primary { background: var(--primary-gradient); color: #fff; border: none; padding: 10px 20px; border-radius: 12px; font-size: 14px; font-weight: 600; cursor: pointer; box-shadow: 0 4px 12px rgba(99, 102, 241, 0.3); transition: all 0.2s; }
                .btn-primary:hover { transform: translateY(-1px); box-shadow: 0 6px 15px rgba(99, 102, 241, 0.4); }
                
                .metrics-grid { display: grid; grid-template-columns: 1.6fr 1fr; gap: 24px; margin-bottom: 32px; }
                .metric-card { background: var(--surface); border-radius: 20px; padding: 24px; border: 1px solid var(--border); box-shadow: 0 4px 6px -1px rgba(0,0,0,0.02); }
                .card-header-icon { display: flex; align-items: center; gap: 8px; font-size: 13px; color: var(--text-muted); font-weight: 600; margin-bottom: 20px; }
                
                .stats-row { display: grid; grid-template-columns: repeat(4, 1fr); gap: 24px; }
                .stat-item .label { font-size: 12px; color: var(--text-muted); font-weight: 600; margin-bottom: 8px; display: block; border-bottom: 1px dotted var(--border); width: fit-content; }
                .stat-item .val { font-size: 22px; font-weight: 700; color: var(--text); display: flex; align-items: center; gap: 6px; }
                .stat-item .change { font-size: 12px; font-weight: 600; display: flex; align-items: center; gap: 4px; color: var(--text-muted); }
                .change.up { color: #10b981; }
                .change.down { color: #ef4444; }
                
                .section-card { background: var(--surface); border-radius: 20px; border: 1px solid var(--border); margin-bottom: 32px; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.02); }
                .card-padding { padding: 24px; }
                
                .calendar-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 24px; }
                .calendar-grid { display: grid; grid-template-columns: repeat(7, 1fr); border-top: 1px solid var(--border); }
                .calendar-day { padding: 16px; border-right: 1px solid var(--border); min-height: 180px; }
                .calendar-day:last-child { border-right: none; }
                .day-label { display: flex; justify-content: space-between; font-size: 13px; font-weight: 600; color: var(--text-muted); margin-bottom: 12px; }
                .day-num { color: var(--text); }
                .day-label.today .day-num { background: var(--primary); color: #fff; width: 24px; height: 24px; display: flex; align-items: center; justify-content: center; border-radius: 50%; }
                
                .activity-tag { padding: 6px 10px; background: #ecfdf5; border-radius: 8px; border: 1px solid #10b981; fontSize: 11px; color: #047857; font-weight: 700; text-align: center; }
                
                .tabs { display: flex; padding: 0 24px; border-bottom: 1px solid var(--border); gap: 32px; }
                .tab { padding: 18px 0; font-size: 14px; font-weight: 600; color: var(--text-muted); cursor: pointer; border-bottom: 2px solid transparent; transition: all 0.2s; }
                .tab:hover { color: var(--text); }
                .tab.active { color: var(--primary); border-bottom-color: var(--primary); }
                
                .table-header { display: grid; grid-template-columns: 2fr 1fr 1fr 1.5fr 1fr 1fr 1fr 1fr 40px; padding: 14px 24px; background: #fafafa; border-bottom: 1px solid var(--border); font-size: 11px; font-weight: 700; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.05em; }
                .table-row { display: grid; grid-template-columns: 2fr 1fr 1fr 1.5fr 1fr 1fr 1fr 1fr 40px; padding: 18px 24px; border-bottom: 1px solid var(--border); transition: all 0.2s; align-items: center; }
                .table-row:hover { background: #f8fafc; }
                
                .subject-cell { display: flex; align-items: center; gap: 14px; font-weight: 600; font-size: 15px; color: var(--text); }
                .thumb-placeholder { width: 44px; height: 44px; background: var(--sidebar-bg); border-radius: 10px; flex-shrink: 0; }
                .activity-cell { font-size: 13px; color: var(--text); }
                
                .status-pill { padding: 4px 12px; border-radius: 20px; font-size: 11px; font-weight: 700; }
                .status-sent { background: #ecfdf5; color: #10b981; }
                .status-draft { background: #f1f5f9; color: var(--text-muted); }
            `}</style>

            <div className="header-row">
                <div className="title-area">
                    <div style={{ background: '#f5d0fe', padding: '6px', borderRadius: '6px' }}><Mail size={18} color="#a21caf" /></div>
                    <h1>Messaging</h1>
                </div>
                <div className="btn-group">
                    <button className="btn-secondary">Create automation</button>
                    <button className="btn-primary">Create campaign</button>
                    <button className="btn-secondary"><MoreHorizontal size={16} /></button>
                </div>
            </div>

            <div className="date-filters">
                <button className="btn-secondary"><Calendar size={14} /> Last 30 days</button>
                <button className="btn-secondary">Compare to: Feb 6–Mar 8, 2026</button>
            </div>

            <div className="metrics-grid">
                <div className="metric-card">
                    <div className="metric-card-header"><Mail size={14} /> Email</div>
                    <div className="metrics-row">
                        <div>
                            <div className="metric-item-label">Emails sent</div>
                            <div className="metric-item-val">
                                {stats.email.sent}
                                <span className="metric-change"><ArrowUpRight size={12} /> {stats.email.sentChange}%</span>
                            </div>
                        </div>
                        <div>
                            <div className="metric-item-label">Open rate</div>
                            <div className="metric-item-val">
                                {stats.email.open}
                                <span className="metric-change"><ArrowDownRight size={12} /> {stats.email.openChange}%</span>
                            </div>
                        </div>
                        <div>
                            <div className="metric-item-label">Conversion rate</div>
                            <div className="metric-item-val">
                                {stats.email.conv}
                                <span className="metric-change"><Plus size={10} /> {stats.email.convChange}%</span>
                            </div>
                        </div>
                        <div>
                            <div className="metric-item-label">Sales</div>
                            <div className="metric-item-val">
                                {stats.email.sales}
                                <span className="metric-change"><Plus size={10} /> {stats.email.salesChange}%</span>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="metric-card">
                    <div className="metric-card-header"><Zap size={14} /> SMS</div>
                    <div className="metrics-row">
                        <div>
                            <div className="metric-item-label">SMS sent</div>
                            <div className="metric-item-val">0 <span className="metric-change">—</span></div>
                        </div>
                        <div>
                            <div className="metric-item-label">Click rate</div>
                            <div className="metric-item-val">0% <span className="metric-change">—</span></div>
                        </div>
                        <div>
                            <div className="metric-item-label">Conversion rate</div>
                            <div className="metric-item-val">0% <span className="metric-change">—</span></div>
                        </div>
                        <div>
                            <div className="metric-item-label">Sales</div>
                            <div className="metric-item-val">₫0 <span className="metric-change">—</span></div>
                        </div>
                    </div>
                </div>
            </div>

            <div className="calendar-section">
                <div className="calendar-header">
                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                        <ArrowUpRight size={16} /> <ArrowDownRight size={16} />
                        <span style={{ fontSize: '14px', fontWeight: 600 }}>Apr 6–12, 2026</span>
                    </div>
                    <button className="btn-secondary">Today</button>
                </div>
                <div className="calendar-grid">
                    {['Mon 6', 'Tue 7', 'Wed 8', 'Thu 9', 'Fri 10', 'Sat 11', 'Sun 12'].map(day => {
                        const dayNum = day.split(' ')[1];
                        const monthNum = 4; // Mocking April for now as per the date range
                        const hasActivity = activityDays.includes(`${monthNum}/${dayNum}`);
                        
                        return (
                            <div key={day} className="calendar-day">
                                <div className={`day-label ${day.includes('Wed 8') ? 'today' : ''}`}>
                                    <span>{day.split(' ')[0]}</span>
                                    <span className="day-num">{dayNum}</span>
                                </div>
                                {hasActivity && (
                                    <div style={{ padding: '4px', background: '#ecfdf5', borderRadius: '4px', border: '1px solid #10b981', fontSize: '10px', color: '#047857', fontWeight: 700, textAlign: 'center' }}>
                                        Email Sent
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            </div>

            <div className="table-section">
                <div className="table-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px' }}>
                    <div className="table-tabs">
                        {['All', 'Email', 'SMS'].map(tab => (
                            <button key={tab} className={`tab-btn ${activeTab === tab ? 'active' : ''}`} onClick={() => setActiveTab(tab)}>{tab}</button>
                        ))}
                    </div>
                    <div style={{ display: 'flex', gap: '8px' }}>
                        <div className="btn-secondary" style={{ padding: '4px 8px' }}><Search size={14} /></div>
                        <div className="btn-secondary" style={{ padding: '4px 8px' }}><Filter size={14} /></div>
                        <div className="btn-secondary" style={{ padding: '4px 8px' }}><ArrowUpDown size={14} /></div>
                    </div>
                </div>

                <div className="table-header-row">
                    <div>Subject</div>
                    <div>Channel</div>
                    <div>Status</div>
                    <div>Scheduled date</div>
                    <div>Open rate</div>
                    <div>Click rate</div>
                    <div>Conversion rate</div>
                    <div>Sales</div>
                    <div></div>
                </div>

                {activities.map((act: any) => (
                    <div key={act.id} className="table-row">
                        <div className="subject-cell">
                            <div className="thumb-placeholder"></div>
                            <span style={{ fontSize: '13px', fontWeight: 600, color: '#202223' }}>{act.subject}</span>
                        </div>
                        <div style={{ fontSize: '13px' }}>{act.channel}</div>
                        <div>
                            <span className={`status-pill ${act.status === 'Sent' ? 'status-sent' : 'status-draft'}`}>{act.status}</span>
                        </div>
                        <div style={{ fontSize: '13px', color: '#616161' }}>{act.date}</div>
                        <div style={{ fontSize: '13px' }}>{act.open}</div>
                        <div style={{ fontSize: '13px' }}>{act.click}</div>
                        <div style={{ fontSize: '13px' }}>{act.conv}</div>
                        <div style={{ fontSize: '13px' }}>{act.sales}</div>
                        <div><MoreHorizontal size={14} color="#616161" /></div>
                    </div>
                ))}
            </div>
        </div>
    );
}

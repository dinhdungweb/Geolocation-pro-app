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

export const loader = async ({ request }: LoaderFunctionArgs) => {
    await requireAdminAuth(request);
    // In a real app, we'd fetch real stats and history here
    return json({
        stats: {
            email: { sent: "95,770", sentChange: 37, open: "3.13%", openChange: 12, conv: "0%", convChange: 100, sales: "₫0", salesChange: 100 },
            sms: { sent: 0, click: "0%", conv: "0%", sales: "₫0" }
        },
        activities: [
            { id: 1, subject: "CẢM ƠN VÌ ĐÃ LÀ MỘT PHẦN CỦA HELIOS LÊ THANH NGHỊ", channel: "Email", status: "Sent", date: "Apr 1, 2026 at 5:34 pm", open: "1.77%", click: "0.01%", conv: "-", sales: "-" },
            { id: 2, subject: "Nơi chế tác mang tính thần của người đàn ông trưởng thành", channel: "Email", status: "Sent", date: "Mar 26, 2026 at 9:29 pm", open: "5.09%", click: "0.1%", conv: "-", sales: "-" },
            { id: 3, subject: "Untitled activity", channel: "Email", status: "Draft", date: "-", open: "-", click: "-", conv: "-", sales: "-" },
            { id: 4, subject: "Untitled activity", channel: "Email", status: "Draft", date: "-", open: "-", click: "-", conv: "-", sales: "-" }
        ]
    });
};

export default function MessagingDashboard() {
    const { stats, activities } = useLoaderData<typeof loader>();
    const [activeTab, setActiveTab] = useState("All");

    return (
        <div className="dashboard-container">
            <style>{`
                .dashboard-container { padding: 40px; background: #f6f6f7; min-height: 100vh; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
                
                .header-row { display: flex; align-items: center; justify-content: space-between; margin-bottom: 32px; }
                .title-area { display: flex; align-items: center; gap: 12px; }
                .title-area h1 { font-size: 20px; font-weight: 700; color: #1a1c1d; }
                .btn-group { display: flex; gap: 8px; }
                
                .btn-secondary { background: #fff; border: 1px solid #dcdfe3; padding: 8px 16px; border-radius: 8px; font-size: 13px; font-weight: 600; cursor: pointer; display: flex; align-items: center; gap: 6px; }
                .btn-primary { background: #303030; color: #fff; border: none; padding: 8px 16px; border-radius: 8px; font-size: 13px; font-weight: 600; cursor: pointer; }
                
                .date-filters { display: flex; gap: 8px; margin-bottom: 24px; }
                
                .metrics-grid { display: grid; grid-template-columns: 1.5fr 1fr; gap: 16px; margin-bottom: 24px; }
                .metric-card { background: #fff; border-radius: 12px; border: 1px solid #ebebeb; padding: 24px; }
                .metric-card-header { display: flex; align-items: center; gap: 8px; margin-bottom: 16px; font-size: 13px; color: #616161; font-weight: 600; }
                
                .metrics-row { display: grid; grid-template-columns: repeat(4, 1fr); gap: 20px; }
                .metric-item-label { font-size: 12px; color: #616161; margin-bottom: 4px; border-bottom: 1px dotted #ccc; display: inline-block; }
                .metric-item-val { font-size: 16px; font-weight: 700; color: #1a1c1d; display: flex; align-items: center; gap: 4px; }
                .metric-change { font-size: 12px; color: #616161; font-weight: 400; display: flex; align-items: center; gap: 2px; }
                
                .calendar-section { background: #fff; border-radius: 12px; border: 1px solid #ebebeb; padding: 24px; margin-bottom: 24px; }
                .calendar-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 20px; }
                .calendar-grid { display: grid; grid-template-columns: repeat(7, 1fr); border-top: 1px solid #f1f1f1; }
                .calendar-day { padding: 12px; border-right: 1px solid #f1f1f1; min-height: 180px; }
                .calendar-day:last-child { border-right: none; }
                .day-label { font-size: 12px; color: #616161; margin-bottom: 12px; display: flex; align-items: center; gap: 6px; }
                .day-label.today .day-num { background: #303030; color: #fff; width: 24px; height: 24px; border-radius: 50%; display: flex; align-items: center; justify-content: center; }
                
                .table-section { background: #fff; border-radius: 12px; border: 1px solid #ebebeb; overflow: hidden; }
                .table-tabs { display: flex; padding: 8px 16px; border-bottom: 1px solid #f1f1f1; gap: 4px; }
                .tab-btn { padding: 6px 12px; border-radius: 6px; border: none; background: transparent; font-size: 13px; font-weight: 600; cursor: pointer; color: #616161; }
                .tab-btn.active { background: #f1f1f1; color: #1a1c1d; }
                
                .table-header-row { display: grid; grid-template-columns: 2fr 1fr 1fr 1.5fr 1fr 1fr 1fr 1fr 40px; padding: 12px 16px; background: #fafafa; border-bottom: 1px solid #f1f1f1; font-size: 12px; font-weight: 600; color: #616161; }
                .table-row { display: grid; grid-template-columns: 2fr 1fr 1fr 1.5fr 1fr 1fr 1fr 1fr 40px; padding: 12px 16px; border-bottom: 1px solid #f1f1f1; align-items: center; cursor: pointer; transition: background 0.2s; }
                .table-row:hover { background: #fafafa; }
                .subject-cell { display: flex; align-items: center; gap: 12px; }
                .thumb-placeholder { width: 40px; height: 40px; background: #000; border-radius: 4px; flex-shrink: 0; }
                .status-pill { padding: 2px 8px; border-radius: 12px; font-size: 11px; font-weight: 700; width: fit-content; }
                .status-sent { background: #e3f9e5; color: #007f5f; }
                .status-draft { background: #f1f1f1; color: #616161; }
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
                    {['Mon 6', 'Tue 7', 'Wed 8', 'Thu 9', 'Fri 10', 'Sat 11', 'Sun 12'].map(day => (
                        <div key={day} className="calendar-day">
                            <div className={`day-label ${day.includes('Wed 8') ? 'today' : ''}`}>
                                <span>{day.split(' ')[0]}</span>
                                <span className="day-num">{day.split(' ')[1]}</span>
                            </div>
                        </div>
                    ))}
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

                {activities.map(act => (
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

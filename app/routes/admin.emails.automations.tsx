import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData, Link } from "@remix-run/react";
import prisma from "../db.server";
import { requireAdminAuth } from "../utils/admin.session.server";
import { 
    Zap, 
    MoreHorizontal,
    Plus,
    Search,
    ArrowUpDown,
    Filter,
    ArrowUpRight,
    ArrowDownRight,
    Calendar,
    Info,
    X,
    Rocket
} from "lucide-react";

export const loader = async ({ request }: LoaderFunctionArgs) => {
    await requireAdminAuth(request);
    
    try {
        // Fetch real automations
        const automations = await (prisma as any).automation.findMany({
            where: { shop: 'GLOBAL' }
        });

        // Fetch sent counts from log
        const logs = await (prisma as any).adminEmailLog.groupBy({
            by: ['type'],
            _count: { _all: true }
        });

        const sentMap = logs.reduce((acc: any, curr: any) => {
            acc[curr.type] = curr._count._all;
            return acc;
        }, {});

        const totalSentCount = logs.reduce((sum: number, curr: any) => sum + curr._count._all, 0);

        return json({
            automations: automations.map((a: any) => ({
                id: a.id,
                name: a.type === 'welcome' ? 'Welcome new subscribers with a discount email' : 
                      a.type === 'limit80' ? '80% Usage limit notification' : 
                      a.type === 'limit100' ? '100% Usage limit notification' : 
                      a.type === 'limit_80' ? '80% Usage limit notification' :
                      a.type === 'limit_100' ? '100% Usage limit notification' :
                      'Custom automation',
                type: a.type,
                status: a.isActive ? 'Active' : 'Inactive',
                sent: sentMap[a.type] || 0,
                click: '-',
                orders: 0,
                conv: '-',
                sales: '₫0'
            })),
            totalSentCount
        });
    } catch (e) {
        console.error("Prisma error in Automations List loader:", e);
        return json({ automations: [], totalSentCount: 0 });
    }
};

export default function AutomationsList() {
    const { automations, totalSentCount } = useLoaderData<typeof loader>();

    return (
        <div className="automations-dashboard-v2">
            <style>{`
                @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700;800&display=swap');
                
                .automations-dashboard-v2 { 
                    padding: 0; 
                    font-family: 'Outfit', sans-serif; 
                    color: #0f172a;
                }
                
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
                    box-shadow: 0 4px 12px rgba(99, 102, 241, 0.2);
                    display: flex;
                    align-items: center;
                    gap: 8px;
                }
                .btn-premium-solid:hover {
                    transform: translateY(-2px);
                    box-shadow: 0 12px 20px rgba(99, 102, 241, 0.3);
                }

                .banner-premium {
                    background: linear-gradient(90deg, #f0f9ff 0%, #e0f2fe 100%);
                    padding: 24px 32px;
                    border-radius: 24px;
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                    margin-bottom: 40px;
                    border: 1px solid rgba(186, 230, 253, 0.5);
                    box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.02);
                }
                .banner-premium .msg { font-size: 15px; color: #075985; font-weight: 600; }
                
                .stats-grid-premium {
                    background: white;
                    border: 1px solid rgba(0,0,0,0.04);
                    border-radius: 24px;
                    display: grid;
                    grid-template-columns: repeat(6, 1fr);
                    margin-bottom: 40px;
                    padding: 32px;
                    box-shadow: 0 12px 30px -10px rgba(0,0,0,0.04);
                }
                .stat-box-premium { padding: 0 24px; border-right: 1px solid #f1f5f9; }
                .stat-box-premium:last-child { border-right: none; }
                .stat-box-premium .label { font-size: 11px; font-weight: 700; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.05em; display: block; margin-bottom: 12px; }
                .stat-box-premium .value { font-size: 22px; font-weight: 800; color: #1e293b; letter-spacing: -0.02em; display: block; }

                .table-premium { background: white; border-radius: 24px; border: 1px solid rgba(0,0,0,0.04); overflow: hidden; box-shadow: 0 12px 30px -10px rgba(0,0,0,0.04); }
                .tab-header-premium { display: flex; gap: 32px; padding: 0 32px; border-bottom: 1px solid #f1f5f9; }
                .tab-v2 { padding: 24px 0; font-size: 15px; font-weight: 600; color: #64748b; cursor: pointer; border-bottom: 2px solid transparent; transition: all 0.2s; }
                .tab-v2.active { color: #6366f1; border-bottom-color: #6366f1; }
                
                .t-header-row { display: grid; grid-template-columns: 2fr 120px 100px 120px 100px 120px 120px 40px; padding: 16px 32px; background: #f8fafc; font-size: 12px; font-weight: 700; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.05em; }
                .t-row { display: grid; grid-template-columns: 2fr 120px 100px 120px 100px 120px 120px 40px; padding: 24px 32px; border-bottom: 1px solid #f1f5f9; align-items: center; cursor: pointer; transition: all 0.2s; text-decoration: none; color: #1e293b; }
                .t-row:hover { background: #fafaff; }
                
                .auto-name { font-weight: 700; font-size: 15px; }
                .tag-status { padding: 6px 14px; border-radius: 20px; font-size: 11px; font-weight: 700; text-transform: uppercase; }
                .tag-active { background: #ecfdf5; color: #059669; }
                .tag-inactive { background: #f1f5f9; color: #94a3b8; }
            `}</style>

            <div className="glass-header">
                <div className="title-group">
                    <h1>Automations</h1>
                    <p>Build and manage automated messaging flows to engage your customers.</p>
                </div>
                <Link to="/admin/emails/automations/new" className="btn-premium-solid" style={{ textDecoration: 'none' }}>
                    <Zap size={16} /> Create automation
                </Link>
            </div>

            <div className="banner-premium">
                <span className="msg">🚀 You've sent {totalSentCount.toLocaleString()} automated emails in the last 30 days.</span>
                <Link to="/admin/emails/settings" style={{ fontSize: '14px', fontWeight: 700, color: '#0369a1', textDecoration: 'none' }}>Settings →</Link>
            </div>

            <div className="stats-grid-premium">
                <div className="stat-box-premium">
                    <span className="label">Total Sent</span>
                    <span className="value">{totalSentCount.toLocaleString()}</span>
                </div>
                <div className="stat-box-premium">
                    <span className="label">Open Rate</span>
                    <span className="value">0.0%</span>
                </div>
                <div className="stat-box-premium">
                    <span className="label">Click Rate</span>
                    <span className="value">0.0%</span>
                </div>
                <div className="stat-box-premium">
                    <span className="label">Orders</span>
                    <span className="value">0</span>
                </div>
                <div className="stat-box-premium">
                    <span className="label">Conv. Rate</span>
                    <span className="value">0.0%</span>
                </div>
                <div className="stat-box-premium">
                    <span className="label">Attr. Sales</span>
                    <span className="value">₫0</span>
                </div>
            </div>

            <div className="table-premium">
                <div className="tab-header-premium">
                    <div className="tab-v2 active">All automations</div>
                    <div className="tab-v2">Active</div>
                    <div className="tab-v2">Inactive</div>
                </div>
                
                <div className="t-header-row">
                    <span>Automation name</span>
                    <span>Status</span>
                    <span>Sent</span>
                    <span>Open rate</span>
                    <span>Click rate</span>
                    <span>Orders</span>
                    <span>Sales</span>
                    <span></span>
                </div>

                {automations.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '80px 0', background: 'white', borderTop: '1px solid #f1f5f9' }}>
                         <div style={{ width: '64px', height: '64px', background: '#f8fafc', borderRadius: '20px', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px' }}>
                            <Zap size={32} color="#94a3b8" />
                        </div>
                        <h3 style={{ fontSize: '18px', fontWeight: 700, color: '#1e293b', marginBottom: '8px' }}>No automations yet</h3>
                        <p style={{ color: '#64748b', marginBottom: '24px' }}>Automate your emails to save time and boost conversions.</p>
                        <Link to="/admin/emails/automations/new" className="btn-premium-solid" style={{ margin: '0 auto', textDecoration: 'none' }}>
                           Create your first automation
                        </Link>
                    </div>
                ) : (
                    automations.map((a: any) => (
                        <Link key={a.id} to={`/admin/emails/automations/${a.id}`} className="t-row">
                            <div className="auto-name">{a.name}</div>
                            <div>
                                <span className={`tag-status ${a.status === 'Active' ? 'tag-active' : 'tag-inactive'}`}>
                                    {a.status}
                                </span>
                            </div>
                            <div style={{ fontWeight: 700 }}>{a.sent === 0 ? '-' : a.sent.toLocaleString()}</div>
                            <div style={{ fontWeight: 600 }}>{a.open || '-'}</div>
                            <div style={{ fontWeight: 600 }}>{a.click === '0%' ? '-' : a.click}</div>
                            <div style={{ fontWeight: 600 }}>{a.orders === 0 ? '-' : a.orders}</div>
                            <div style={{ fontWeight: 700 }}>{a.sales === '₫0' ? '-' : a.sales}</div>
                            <div><MoreHorizontal size={18} color="#94a3b8" /></div>
                        </Link>
                    ))
                )}
            </div>
        </div>
    );
}

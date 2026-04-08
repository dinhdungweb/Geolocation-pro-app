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
    X
} from "lucide-react";

export const loader = async ({ request }: LoaderFunctionArgs) => {
    await requireAdminAuth(request);
    
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
};

export default function AutomationsList() {
    const { automations, totalSentCount } = useLoaderData<typeof loader>();

    return (
        <div className="automations-dashboard">
            <style>{`
                .automations-dashboard { padding: 0; font-family: 'Outfit', sans-serif; color: var(--text); }
                
                .header-row { display: flex; align-items: center; justify-content: space-between; margin-bottom: 32px; }
                .title-area h1 { font-size: 24px; font-weight: 700; color: var(--text); letter-spacing: -0.02em; }
                
                .btn-secondary { background: var(--surface); border: 1px solid var(--border); padding: 10px 18px; border-radius: 12px; font-size: 14px; font-weight: 600; cursor: pointer; display: flex; align-items: center; gap: 8px; color: var(--text); transition: all 0.2s; }
                .btn-secondary:hover { background: #f8fafc; border-color: var(--primary); color: var(--primary); }
                .btn-primary { background: var(--primary-gradient); color: #fff; border: none; padding: 10px 20px; border-radius: 12px; font-size: 14px; font-weight: 600; cursor: pointer; box-shadow: 0 4px 12px rgba(99, 102, 241, 0.3); }
                
                .banner-msg { background: #e0f2fe; padding: 16px 20px; border-radius: 16px; display: flex; align-items: center; justify-content: space-between; margin-bottom: 32px; border: 1px solid #bae6fd; font-size: 14px; color: #075985; font-weight: 500; }
                
                .metrics-row { background: var(--surface); border: 1px solid var(--border); border-radius: 20px; display: grid; grid-template-columns: repeat(6, 1fr); margin-bottom: 32px; padding: 24px; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.02); }
                .metric-item { padding: 0 20px; border-right: 1px solid var(--border); }
                .metric-item:last-child { border-right: none; }
                .metric-label { font-size: 12px; color: var(--text-muted); font-weight: 600; margin-bottom: 12px; display: flex; align-items: center; gap: 6px; border-bottom: 1px dotted var(--border); width: fit-content; }
                .metric-val { font-size: 20px; font-weight: 700; color: var(--text); margin-bottom: 6px; }
                .metric-change { font-size: 12px; color: #10b981; font-weight: 600; display: flex; align-items: center; gap: 4px; }
                
                .table-card { background: var(--surface); border-radius: 20px; border: 1px solid var(--border); overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.02); }
                .tab-row { display: flex; padding: 0 24px; border-bottom: 1px solid var(--border); gap: 32px; }
                .tab-btn { padding: 18px 0; font-size: 14px; font-weight: 600; color: var(--text-muted); cursor: pointer; border-bottom: 2px solid transparent; background: none; border: none; }
                .tab-btn.active { color: var(--primary); border-bottom-color: var(--primary); }
                
                .table-header-row { display: grid; grid-template-columns: 2fr 120px 100px 120px 100px 120px 120px 40px; padding: 14px 24px; background: #fafafa; border-bottom: 1px solid var(--border); font-size: 11px; font-weight: 700; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.05em; }
                .table-row { display: grid; grid-template-columns: 2fr 120px 100px 120px 100px 120px 120px 40px; padding: 20px 24px; border-bottom: 1px solid var(--border); align-items: center; cursor: pointer; transition: all 0.2s; text-decoration: none; color: var(--text); }
                .table-row:hover { background: #f8fafc; }
                
                .status-badge { padding: 4px 12px; border-radius: 20px; font-size: 11px; font-weight: 700; width: fit-content; }
                .status-active { background: #ecfdf5; color: #10b981; }
                .status-inactive { background: #f1f5f9; color: var(--text-muted); }
            `}</style>

            <div className="header-row">
                <div className="title-area">
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <Zap size={18} color="#616161" />
                        <h1>Automations</h1>
                    </div>
                </div>
                <div style={{ display: 'flex', gap: '8px' }}>
                    <button className="btn-primary">Create automation</button>
                    <button className="btn-secondary"><MoreHorizontal size={14} /></button>
                </div>
            </div>

            <div className="banner-msg">
                <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                    <Info size={16} />
                    <span>Marketing automations have moved into Shopify Messaging. Your other automations will continue to run without disruption in <strong>Flow</strong>.</span>
                </div>
                <X size={14} style={{ cursor: 'pointer' }} />
            </div>

            <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
                <button className="btn-secondary"><Calendar size={14} /> Last 30 days</button>
                <button className="btn-secondary">Compare to: Feb 6–Mar 8, 2026</button>
            </div>

            <div className="metrics-row">
                <div className="metric-item">
                    <div className="metric-label">Sent</div>
                    <div className="metric-val">{totalSentCount.toLocaleString()}</div>
                    <div className="metric-change"><ArrowUpRight size={12} /> 0%</div>
                </div>
                <div className="metric-item">
                    <div className="metric-label">Click rate</div>
                    <div className="metric-val">1.13%</div>
                    <div className="metric-change"><ArrowUpRight size={12} /> 39%</div>
                </div>
                <div className="metric-item">
                    <div className="metric-label">Orders</div>
                    <div className="metric-val">0</div>
                    <div className="metric-change"><ArrowDownRight size={12} /> 100%</div>
                </div>
                <div className="metric-item">
                    <div className="metric-label">Conversion rate</div>
                    <div className="metric-val">0%</div>
                    <div className="metric-change"><ArrowUpRight size={12} /> 100%</div>
                </div>
                <div className="metric-item">
                    <div className="metric-label">Sales</div>
                    <div className="metric-val">₫0</div>
                    <div className="metric-change"><ArrowUpRight size={12} /> 100%</div>
                </div>
                <div className="metric-item">
                    <div className="metric-label">Average order value</div>
                    <div className="metric-val">₫0</div>
                    <div className="metric-change">—</div>
                </div>
            </div>

            <div className="table-card">
                <div className="tab-row">
                    <button className="tab-btn">All</button>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 16px', borderBottom: '1px solid #f1f1f1' }}>
                    <div style={{ display: 'flex', gap: '8px' }}>
                        <div className="btn-secondary" style={{ padding: '4px 8px' }}><Search size={14} /></div>
                        <div className="btn-secondary" style={{ padding: '4px 8px' }}><ArrowUpDown size={14} /></div>
                    </div>
                </div>

                <div className="table-header-row">
                    <div>Automation name</div>
                    <div>Status</div>
                    <div>Sent</div>
                    <div>Click rate</div>
                    <div>Orders</div>
                    <div>Conversion rate</div>
                    <div>Sales</div>
                    <div></div>
                </div>

                {automations.map((a: any) => (
                    <Link key={a.id} to={`/admin/emails/automations/${a.id}`} className="table-row">
                        <div style={{ fontSize: '13px', fontWeight: 600, color: '#1a1c1d' }}>{a.name}</div>
                        <div>
                            <span className={`status-badge ${a.status === 'Active' ? 'status-active' : 'status-inactive'}`}>{a.status}</span>
                        </div>
                        <div style={{ fontSize: '13px', color: '#1a1c1d' }}>{a.sent === 0 ? '-' : a.sent.toLocaleString()}</div>
                        <div style={{ fontSize: '13px', color: '#1a1c1d' }}>{a.click === '0%' ? '-' : a.click}</div>
                        <div style={{ fontSize: '13px', color: '#1a1c1d' }}>{a.orders === 0 ? '-' : a.orders}</div>
                        <div style={{ fontSize: '13px', color: '#1a1c1d' }}>{a.conv === '0%' ? '-' : a.conv}</div>
                        <div style={{ fontSize: '13px', color: '#1a1c1d' }}>{a.sales === '₫0' ? '-' : a.sales}</div>
                        <div><MoreHorizontal size={14} color="#616161" /></div>
                    </Link>
                ))}
            </div>
        </div>
    );
}

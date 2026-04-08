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
    
    const automations = await (prisma as any).automation.findMany({
        where: { shop: 'GLOBAL' }
    });

    return json({
        automations: automations.map((a: any) => ({
            id: a.id,
            name: a.type === 'welcome' ? 'Welcome new subscribers with a discount email' : 
                  a.type === 'limit80' ? '80% Usage limit notification' : 
                  a.type === 'limit100' ? '100% Usage limit notification' : 'Custom automation',
            type: a.type,
            status: 'Active',
            sent: 1212,
            click: '5%',
            orders: 0,
            conv: '0.1%',
            sales: '₫0'
        })).concat([
            { id: 'm1', name: 'Celebrate customer birthday', type: 'birthday', status: 'Inactive', sent: 0, click: '0%', orders: 0, conv: '0%', sales: '₫0' },
            { id: 'm2', name: 'Giữ chân khách hàng', type: 'retention', status: 'Inactive', sent: 0, click: '0%', orders: 0, conv: '0%', sales: '₫0' }
        ])
    });
};

export default function AutomationsList() {
    const { automations } = useLoaderData<typeof loader>();

    return (
        <div className="automations-container">
            <style>{`
                .automations-container { padding: 40px; background: #f6f6f7; min-height: 100vh; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
                
                .header-row { display: flex; align-items: center; justify-content: space-between; margin-bottom: 24px; }
                .title-area h1 { font-size: 20px; font-weight: 700; color: #1a1c1d; }
                
                .btn-secondary { background: #fff; border: 1px solid #dcdfe3; padding: 6px 14px; border-radius: 8px; font-size: 13px; font-weight: 600; cursor: pointer; display: flex; align-items: center; gap: 6px; }
                .btn-primary { background: #303030; color: #fff; border: none; padding: 6px 16px; border-radius: 8px; font-size: 13px; font-weight: 600; cursor: pointer; }
                
                .banner-msg { background: #e0f2fe; padding: 12px 16px; border-radius: 8px; display: flex; align-items: center; justify-content: space-between; margin-bottom: 24px; border: 1px solid #bae6fd; font-size: 13px; color: #075985; }
                
                .metrics-row { background: #fff; border: 1px solid #ebebeb; border-radius: 12px; display: grid; grid-template-columns: repeat(6, 1fr); margin-bottom: 24px; padding: 16px; }
                .metric-item { padding: 0 16px; border-right: 1px solid #f1f1f1; }
                .metric-item:last-child { border-right: none; }
                .metric-label { font-size: 11px; color: #616161; font-weight: 600; margin-bottom: 8px; display: flex; align-items: center; gap: 6px; border-bottom: 1px dotted #ccc; width: fit-content; }
                .metric-val { font-size: 15px; font-weight: 700; color: #1a1c1d; margin-bottom: 4px; }
                .metric-change { font-size: 11px; color: #616161; display: flex; align-items: center; gap: 2px; }
                
                .table-card { background: #fff; border-radius: 12px; border: 1px solid #ebebeb; overflow: hidden; }
                .tab-row { display: flex; padding: 8px 16px; border-bottom: 1px solid #f1f1f1; gap: 4px; }
                .tab-btn { padding: 6px 12px; border-radius: 6px; border: none; background: #f1f1f1; font-size: 13px; font-weight: 600; cursor: pointer; color: #1a1c1d; }
                
                .table-header-row { display: grid; grid-template-columns: 2fr 100px 100px 100px 100px 100px 100px 40px; padding: 12px 16px; background: #fafafa; border-bottom: 1px solid #f1f1f1; font-size: 12px; font-weight: 500; color: #616161; }
                .table-row { display: grid; grid-template-columns: 2fr 100px 100px 100px 100px 100px 100px 40px; padding: 16px; border-bottom: 1px solid #f1f1f1; align-items: center; cursor: pointer; transition: background 0.1s; text-decoration: none; }
                .table-row:hover { background: #fafafa; }
                
                .status-badge { padding: 2px 10px; border-radius: 12px; font-size: 11px; font-weight: 700; width: fit-content; }
                .status-active { background: #dcfce7; color: #166534; }
                .status-inactive { background: #f1f1f1; color: #616161; }
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
                    <div className="metric-val">1,421</div>
                    <div className="metric-change"><ArrowUpRight size={12} /> 37%</div>
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

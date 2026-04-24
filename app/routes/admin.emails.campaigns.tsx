import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData, Link } from "@remix-run/react";
import prisma from "../db.server";
import { requireAdminAuth } from "../utils/admin.session.server";
import { 
    BarChart3, 
    Plus,
    Search,
    Filter,
    Clock,
    CheckCircle2,
    AlertCircle,
    FileText
} from "lucide-react";
import { useState } from "react";

export const loader = async ({ request }: LoaderFunctionArgs) => {
    await requireAdminAuth(request);
    
    try {
        const campaigns = await prisma.campaign.findMany({
            orderBy: { createdAt: 'desc' }
        });
        return json({ campaigns });
    } catch (e) {
        console.error("Error loading campaigns:", e);
        return json({ campaigns: [] });
    }
};

export default function CampaignsList() {
    const { campaigns } = useLoaderData<typeof loader>();
    const [searchTerm, setSearchTerm] = useState("");

    const filteredCampaigns = campaigns.filter((c: any) => 
        c.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
        c.subject.toLowerCase().includes(searchTerm.toLowerCase())
    );

    return (
        <div className="campaigns-page">
            <style>{`
                .campaigns-page { padding: 0; font-family: 'Outfit', sans-serif; }
                .header-flex { display: flex; justify-content: space-between; align-items: flex-end; margin-bottom: 32px; }
                .header-flex h2 { font-size: 24px; font-weight: 700; color: #1e293b; letter-spacing: -0.02em; }
                .header-flex p { color: #64748b; font-size: 14px; margin-top: 4px; }
                
                .stats-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 20px; margin-bottom: 40px; }
                .stat-card { background: white; padding: 24px; border-radius: 16px; border: 1px solid #e2e8f0; }
                .stat-label { font-size: 12px; font-weight: 700; color: #64748b; text-transform: uppercase; margin-bottom: 12px; }
                .stat-value { font-size: 24px; font-weight: 800; color: #1e293b; }

                .filters-bar { display: flex; gap: 16px; margin-bottom: 24px; }
                .search-box { flex: 1; position: relative; }
                .search-box input { width: 100%; padding: 12px 16px 12px 42px; border-radius: 12px; border: 1px solid #e2e8f0; outline: none; transition: all 0.2s; }
                .search-box input:focus { border-color: #6366f1; box-shadow: 0 0 0 4px rgba(99, 102, 241, 0.1); }
                .search-box svg { position: absolute; left: 14px; top: 12px; color: #94a3b8; }

                .campaign-table { background: white; border-radius: 20px; border: 1px solid #e2e8f0; overflow: hidden; }
                .t-head { background: #f8fafc; display: grid; grid-template-columns: 2fr 1fr 1fr 1fr 100px; padding: 16px 24px; border-bottom: 1px solid #e2e8f0; }
                .t-head div { font-size: 11px; font-weight: 800; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.05em; }
                
                .t-row { display: grid; grid-template-columns: 2fr 1fr 1fr 1fr 100px; padding: 20px 24px; border-bottom: 1px solid #f1f5f9; align-items: center; transition: all 0.2s; cursor: pointer; text-decoration: none; color: inherit; }
                .t-row:hover { background: #f8faff; }
                .t-row:last-child { border-bottom: none; }

                .status-badge { display: inline-flex; align-items: center; gap: 6px; padding: 4px 10px; border-radius: 8px; font-size: 12px; font-weight: 700; }
                .status-sent { background: #f0fdf4; color: #166534; }
                .status-draft { background: #f1f5f9; color: #475569; }
                .status-failed { background: #fef2f2; color: #991b1b; }

                .btn-premium { background: linear-gradient(135deg, #6366f1 0%, #4f46e5 100%); color: white; padding: 12px 24px; border-radius: 12px; border: none; font-weight: 700; cursor: pointer; display: flex; align-items: center; gap: 8px; text-decoration: none; box-shadow: 0 4px 12px rgba(99, 102, 241, 0.2); }
                .btn-premium:hover { transform: translateY(-1px); box-shadow: 0 6px 15px rgba(99, 102, 241, 0.3); }
            `}</style>

            <div className="header-flex">
                <div>
                    <h2>Campaigns</h2>
                    <p>Manage and track your one-off broadcast email campaigns.</p>
                </div>
                <Link to="/admin/emails/composer" className="btn-premium">
                    <Plus size={18} /> New Campaign
                </Link>
            </div>

            <div className="stats-grid">
                <div className="stat-card">
                    <div className="stat-label">Total Campaigns</div>
                    <div className="stat-value">{campaigns.length}</div>
                </div>
                <div className="stat-card">
                    <div className="stat-label">Total Sent</div>
                    <div className="stat-value">{campaigns.reduce((s: number, c: any) => s + c.sentCount, 0)}</div>
                </div>
                <div className="stat-card">
                    <div className="stat-label">Deliverability</div>
                    <div className="stat-value" style={{ color: '#22c55e' }}>99.2%</div>
                </div>
                <div className="stat-card">
                    <div className="stat-label">Engagement</div>
                    <div className="stat-value">12.4%</div>
                </div>
            </div>

            <div className="filters-bar">
                <div className="search-box">
                    <Search size={18} />
                    <input 
                        type="text" 
                        placeholder="Search campaigns by name or subject..." 
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                </div>
                <button className="btn-premium" style={{ background: 'white', color: '#1e293b', border: '1px solid #e2e8f0', boxShadow: 'none' }}>
                    <Filter size={18} /> Filter
                </button>
            </div>

            <div className="campaign-table">
                <div className="t-head">
                    <div>Campaign Name</div>
                    <div>Status</div>
                    <div>Recipients</div>
                    <div>Sent Date</div>
                    <div></div>
                </div>
                
                {filteredCampaigns.length === 0 ? (
                    <div style={{ padding: '80px 0', textAlign: 'center', color: '#94a3b8' }}>
                        <FileText size={48} style={{ margin: '0 auto 16px', opacity: 0.2 }} />
                        <p>No campaigns found matching your criteria.</p>
                    </div>
                ) : (
                    filteredCampaigns.map((c: any) => (
                        <Link key={c.id} to={`/admin/emails/composer?id=${c.id}`} className="t-row">
                            <div>
                                <div style={{ fontWeight: 700, color: '#1e293b' }}>{c.name}</div>
                                <div style={{ fontSize: '12px', color: '#64748b', marginTop: '4px' }}>{c.subject}</div>
                            </div>
                            <div>
                                <span className={`status-badge status-${c.status}`}>
                                    {c.status === 'sent' ? <CheckCircle2 size={12} /> : c.status === 'draft' ? <Clock size={12} /> : <AlertCircle size={12} />}
                                    {c.status.toUpperCase()}
                                </span>
                            </div>
                            <div style={{ fontWeight: 600, color: '#475569' }}>{c.sentCount} shops</div>
                            <div style={{ fontSize: '13px', color: '#64748b' }}>
                                {new Date(c.createdAt).toLocaleDateString()}
                            </div>
                            <div style={{ textAlign: 'right' }}>
                                <BarChart3 size={18} color="#94a3b8" />
                            </div>
                        </Link>
                    ))
                )}
            </div>
        </div>
    );
}

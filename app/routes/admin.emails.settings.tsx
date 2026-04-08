import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData } from "@remix-run/react";
import { requireAdminAuth } from "../utils/admin.session.server";
import { 
    Settings as SettingsIcon,
    Mail,
    Shield,
    Bell
} from "lucide-react";

export const loader = async ({ request }: LoaderFunctionArgs) => {
    await requireAdminAuth(request);
    return json({});
};

export default function EmailSettings() {
    return (
        <div className="settings-dashboard-v2">
            <style>{`
                @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700;800&display=swap');
                
                .settings-dashboard-v2 { 
                    padding: 0; 
                    font-family: 'Outfit', sans-serif; 
                    color: #0f172a;
                }
                
                .glass-header {
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
                
                .settings-layout-premium { display: grid; grid-template-columns: 280px 1fr; gap: 48px; }
                
                .premium-nav { display: flex; flex-direction: column; gap: 12px; }
                .nav-link-v2 { 
                    padding: 14px 20px; 
                    border-radius: 16px; 
                    font-size: 15px; 
                    font-weight: 600; 
                    color: #64748b; 
                    cursor: pointer; 
                    display: flex; 
                    align-items: center; 
                    gap: 14px; 
                    transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
                    border: 1px solid transparent;
                }
                .nav-link-v2:hover { background: white; color: #1e293b; border-color: rgba(0,0,0,0.04); }
                .nav-link-v2.active { 
                    background: white; 
                    color: #6366f1; 
                    border-color: rgba(99, 102, 241, 0.2); 
                    box-shadow: 0 10px 15px -3px rgba(99, 102, 241, 0.05);
                }
                
                .card-premium-v2 { 
                    background: white; 
                    border-radius: 24px; 
                    border: 1px solid rgba(0,0,0,0.04); 
                    padding: 40px; 
                    box-shadow: 0 12px 30px -10px rgba(0,0,0,0.04); 
                }
                .card-premium-v2 .title { font-size: 20px; font-weight: 800; color: #1e293b; margin-bottom: 32px; letter-spacing: -0.02em; }
                
                .form-group-v2 { margin-bottom: 28px; }
                .form-group-v2 label { display: block; font-size: 13px; font-weight: 700; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 12px; }
                .input-premium { 
                    width: 100%; 
                    padding: 14px 18px; 
                    border: 1.5px solid #f1f5f9; 
                    border-radius: 14px; 
                    font-size: 15px; 
                    font-weight: 500;
                    font-family: inherit; 
                    transition: all 0.2s; 
                    color: #1e293b;
                    background: #f8fafc;
                }
                .input-premium:focus { 
                    background: white;
                    border-color: #6366f1; 
                    outline: none; 
                    box-shadow: 0 0 0 4px rgba(99, 102, 241, 0.1); 
                }
                .input-premium[readonly] { color: #64748b; cursor: not-allowed; }
            `}</style>

            <div className="glass-header">
                <div className="title-group">
                    <h1>Settings</h1>
                    <p>Configure your sender profile and verification preferences.</p>
                </div>
            </div>

            <div className="settings-layout-premium">
                <div className="premium-nav">
                    <div className="nav-link-v2 active"><Mail size={18} /> General</div>
                    <div className="nav-link-v2"><Shield size={18} /> Domain verification</div>
                    <div className="nav-link-v2"><Bell size={18} /> Notifications</div>
                </div>
                
                <div className="card-premium-v2">
                    <div className="title">Sender profile</div>
                    <div className="form-group-v2">
                        <label>Display name</label>
                        <input className="input-premium" defaultValue="Geo: Redirect & Country Block" />
                    </div>
                    <div className="form-group-v2">
                        <label>Sender email</label>
                        <input className="input-premium" defaultValue="send@geopro.bluepeaks.top" readOnly />
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '12px' }}>
                        <button className="btn-premium-solid" style={{ padding: '12px 32px', borderRadius: '16px' }}>Save Changes</button>
                    </div>
                </div>
            </div>
        </div>
    );
}

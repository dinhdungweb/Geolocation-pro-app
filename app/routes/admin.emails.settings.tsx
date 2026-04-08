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
        <div className="settings-page">
            <style>{`
                .settings-page { padding: 0; font-family: 'Outfit', sans-serif; color: var(--text); }
                .header-row { margin-bottom: 32px; }
                .header-row h1 { font-size: 24px; font-weight: 700; color: var(--text); letter-spacing: -0.02em; }
                
                .settings-grid { display: grid; grid-template-columns: 280px 1fr; gap: 40px; }
                .settings-nav { display: flex; flex-direction: column; gap: 8px; }
                .nav-item { padding: 12px 20px; border-radius: 12px; font-size: 14px; font-weight: 600; color: var(--text-muted); cursor: pointer; display: flex; align-items: center; gap: 12px; transition: all 0.2s; }
                .nav-item:hover { color: var(--text); background: var(--surface); }
                .nav-item.active { background: var(--surface); color: var(--primary); border: 1px solid var(--border); box-shadow: 0 4px 6px -1px rgba(0,0,0,0.02); }
                
                .settings-card { background: var(--surface); border-radius: 20px; border: 1px solid var(--border); padding: 32px; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.02); }
                .card-title { font-size: 18px; font-weight: 700; color: var(--text); margin-bottom: 24px; }
                
                .form-group { margin-bottom: 24px; }
                .form-group label { display: block; font-size: 14px; font-weight: 600; color: var(--text-muted); margin-bottom: 10px; }
                .form-input { width: 100%; padding: 12px 16px; border: 1px solid var(--border); border-radius: 12px; font-size: 14px; font-family: inherit; transition: all 0.2s; }
                .form-input:focus { border-color: var(--primary); outline: none; box-shadow: 0 0 0 4px rgba(99, 102, 241, 0.1); }
            `}</style>

            <div className="header-row">
                <h1>Settings</h1>
            </div>

            <div className="settings-grid">
                <div className="settings-nav">
                    <div className="nav-item active"><Mail size={16} /> General</div>
                    <div className="nav-item"><Shield size={16} /> Domain verification</div>
                    <div className="nav-item"><Bell size={16} /> Notifications</div>
                </div>
                
                <div className="settings-card">
                    <div className="card-title">General settings</div>
                    <div className="form-group">
                        <label>Sender name</label>
                        <input className="form-input" defaultValue="Geo: Redirect & Country Block" />
                    </div>
                    <div className="form-group">
                        <label>Sender email</label>
                        <input className="form-input" defaultValue="send@geopro.bluepeaks.top" readOnly />
                    </div>
                </div>
            </div>
        </div>
    );
}

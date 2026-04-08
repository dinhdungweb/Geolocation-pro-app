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
        <div className="settings-container">
            <style>{`
                .settings-container { padding: 40px; background: #f6f6f7; min-height: 100vh; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
                .header-row { margin-bottom: 32px; }
                .header-row h1 { font-size: 20px; font-weight: 700; color: #1a1c1d; }
                
                .settings-grid { display: grid; grid-template-columns: 250px 1fr; gap: 40px; max-width: 1000px; }
                .settings-nav { display: flex; flex-direction: column; gap: 4px; }
                .nav-item { padding: 10px 16px; border-radius: 8px; font-size: 13px; font-weight: 600; color: #616161; cursor: pointer; display: flex; align-items: center; gap: 10px; }
                .nav-item.active { background: #fff; color: #1a1c1d; border: 1px solid #dcdfe3; }
                
                .settings-card { background: #fff; border-radius: 12px; border: 1px solid #ebebeb; padding: 24px; box-shadow: 0 1px 3px rgba(0,0,0,0.05); }
                .card-title { font-size: 15px; font-weight: 700; color: #1a1c1d; margin-bottom: 20px; }
                
                .form-group { margin-bottom: 20px; }
                .form-group label { display: block; font-size: 13px; font-weight: 600; color: #616161; margin-bottom: 8px; }
                .form-input { width: 100%; padding: 8px 12px; border: 1px solid #dcdfe3; border-radius: 8px; font-size: 13px; }
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

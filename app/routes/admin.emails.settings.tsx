import type { LoaderFunctionArgs, ActionFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData, Form, useActionData } from "@remix-run/react";
import { requireAdminAuth } from "../utils/admin.session.server";
import prisma from "../db.server";
import { 
    Settings as SettingsIcon,
    Mail,
    Shield,
    Bell,
    CheckCircle
} from "lucide-react";

export const loader = async ({ request }: LoaderFunctionArgs) => {
    await requireAdminAuth(request);
    let settings = null;
    try {
        settings = await prisma.settings.findUnique({
            where: { shop: 'GLOBAL' }
        });
    } catch (e) {
        console.error("Prisma error in Settings loader:", e);
    }
    return json({ settings });
};

export const action = async ({ request }: ActionFunctionArgs) => {
    await requireAdminAuth(request);
    const formData = await request.formData();
    const name = formData.get("senderName") as string;
    const email = formData.get("senderEmail") as string;
    const smtpHost = formData.get("smtpHost") as string;
    const smtpPort = parseInt(formData.get("smtpPort") as string) || 587;
    const smtpUser = formData.get("smtpUser") as string;
    const smtpPass = formData.get("smtpPass") as string;
    const smtpSecure = formData.get("smtpSecure") === "true";

    await (prisma as any).settings.upsert({
        where: { shop: 'GLOBAL' },
        update: { 
            emailSenderName: name,
            emailSenderEmail: email,
            smtpHost,
            smtpPort,
            smtpUser,
            smtpPass,
            smtpSecure
        },
        create: {
            shop: 'GLOBAL',
            emailSenderName: name,
            emailSenderEmail: email,
            smtpHost,
            smtpPort,
            smtpUser,
            smtpPass,
            smtpSecure
        }
    });

    return json({ success: true });
};

export default function EmailSettings() {
    const { settings } = useLoaderData<typeof loader>();
    const actionData = useActionData<typeof action>();

    return (
        <div className="settings-dashboard-v2">
            <style>{`
                @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700;800&display=swap');
                
                .settings-dashboard-v2 { 
                    padding: 0; 
                    font-family: 'Outfit', sans-serif; 
                    color: #0f172a;
                    animation: fadeIn 0.5s ease-out;
                }
                
                @keyframes fadeIn { from { opacity: 0; transform: translateY(5px); } to { opacity: 1; transform: translateY(0); } }
                
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

                .btn-premium-solid {
                    background: linear-gradient(135deg, #6366f1 0%, #4f46e5 100%);
                    color: white;
                    border: none;
                    padding: 12px 32px;
                    border-radius: 16px;
                    font-size: 15px;
                    font-weight: 600;
                    cursor: pointer;
                    transition: all 0.3s;
                    box-shadow: 0 4px 12px rgba(99, 102, 241, 0.2);
                }
                .btn-premium-solid:hover { transform: translateY(-2px); box-shadow: 0 10px 20px rgba(99, 102, 241, 0.3); }

                .success-banner {
                    background: #ecfdf5;
                    border: 1px solid #10b981;
                    padding: 16px;
                    border-radius: 16px;
                    color: #059669;
                    font-weight: 600;
                    display: flex;
                    align-items: center;
                    gap: 12px;
                    margin-bottom: 24px;
                }
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
                
                <Form method="post" className="card-premium-v2">
                    {actionData?.success && (
                        <div className="success-banner">
                            <CheckCircle size={20} /> Settings saved successfully!
                        </div>
                    )}
                    <div className="title">Sender profile</div>
                    <div className="form-group-v2">
                        <label>Display name</label>
                        <input name="senderName" className="input-premium" defaultValue={(settings as any)?.emailSenderName || "Geo Admin"} placeholder="Enter sender name" />
                    </div>
                    <div className="form-group-v2">
                        <label>Sender email</label>
                        <input name="senderEmail" className="input-premium" defaultValue={(settings as any)?.emailSenderEmail || "noreply@geopro.bluepeaks.top"} placeholder="Enter sender email" />
                    </div>

                    <div style={{ marginTop: '32px', paddingTop: '32px', borderTop: '1px solid #f1f5f9' }}>
                        <div className="title" style={{ marginBottom: '16px' }}>SMTP Credentials</div>
                        <p style={{ color: '#64748b', fontSize: '13px', marginBottom: '24px' }}>Configure your own email server for better deliverability and custom domain support.</p>
                        
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 120px', gap: '20px' }}>
                            <div className="form-group-v2">
                                <label>SMTP Host</label>
                                <input type="text" name="smtpHost" className="input-premium" defaultValue={(settings as any)?.smtpHost || ""} placeholder="e.g. smtp.gmail.com" />
                            </div>
                            <div className="form-group-v2">
                                <label>Port</label>
                                <input type="number" name="smtpPort" className="input-premium" defaultValue={(settings as any)?.smtpPort || 587} />
                            </div>
                        </div>
                        
                        <div className="form-group-v2">
                            <label>SMTP Username</label>
                            <input type="text" name="smtpUser" className="input-premium" defaultValue={(settings as any)?.smtpUser || ""} />
                        </div>
                        <div className="form-group-v2">
                            <label>SMTP Password</label>
                            <input type="password" name="smtpPass" className="input-premium" defaultValue={(settings as any)?.smtpPass || ""} />
                        </div>
                        
                        <div className="form-group-v2" style={{ display: 'flex', alignItems: 'center', gap: '12px', background: '#f8fafc', padding: '16px', borderRadius: '12px' }}>
                            <input type="checkbox" name="smtpSecure" value="true" defaultChecked={(settings as any)?.smtpSecure} style={{ width: '20px', height: '20px' }} />
                            <label style={{ marginBottom: 0 }}>Use Secure Connection (SSL/TLS)</label>
                        </div>
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '24px' }}>
                        <button type="submit" className="btn-premium-solid">Save Changes</button>
                    </div>
                </Form>
            </div>
        </div>
    );
}

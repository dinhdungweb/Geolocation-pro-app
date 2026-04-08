import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData } from "@remix-run/react";
import { requireAdminAuth } from "../utils/admin.session.server";
import { 
    Search, 
    ArrowUpDown,
    MoreHorizontal,
    Plus
} from "lucide-react";

export const loader = async ({ request }: LoaderFunctionArgs) => {
    await requireAdminAuth(request);
    return json({
        templates: [
            { id: 1, name: "Angelic-1", edited: "Feb 6, 2026 at 3:25 pm", thumb: "https://via.placeholder.com/60x80/000/fff?text=A1" },
            { id: 2, name: "Copy of Đức tin của bạn là gì", edited: "Dec 6, 2025 at 5:49 pm", thumb: "https://via.placeholder.com/60x80/222/ddd?text=DE" },
            { id: 3, name: "BLACK DIAMOND", edited: "Dec 5, 2025 at 6:12 pm", thumb: "https://via.placeholder.com/60x80/111/eee?text=BD" },
            { id: 4, name: "DIAMOND", edited: "Dec 5, 2025 at 6:11 pm", thumb: "https://via.placeholder.com/60x80/333/ccc?text=DI" },
            { id: 5, name: "PLATINUM", edited: "Dec 5, 2025 at 6:10 pm", thumb: "https://via.placeholder.com/60x80/444/bbb?text=PL" },
            { id: 6, name: "GOLD", edited: "Dec 5, 2025 at 6:09 pm", thumb: "https://via.placeholder.com/60x80/555/aaa?text=GO" }
        ]
    });
};

export default function TemplatesGallery() {
    const { templates } = useLoaderData<typeof loader>();

    return (
        <div className="templates-dashboard-v2">
            <style>{`
                @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700;800&display=swap');
                
                .templates-dashboard-v2 { 
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
                
                .actions-group { display: flex; gap: 12px; }
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
                .btn-premium-outline {
                    background: white;
                    border: 1px solid #e2e8f0;
                    padding: 10px 20px;
                    border-radius: 14px;
                    font-size: 14px;
                    font-weight: 600;
                    color: #475569;
                    cursor: pointer;
                    display: flex;
                    align-items: center;
                    gap: 8px;
                    transition: all 0.3s;
                }
                .btn-premium-outline:hover { border-color: #6366f1; color: #6366f1; transform: translateY(-1px); }

                .templates-grid-premium {
                    display: grid;
                    grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
                    gap: 32px;
                    margin-top: 40px;
                }
                .template-card-premium {
                    background: white;
                    border-radius: 24px;
                    border: 1px solid rgba(0,0,0,0.04);
                    overflow: hidden;
                    transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
                    cursor: pointer;
                    box-shadow: 0 4px 6px -1px rgba(0,0,0,0.01), 0 2px 4px -1px rgba(0,0,0,0.01);
                }
                .template-card-premium:hover {
                    transform: translateY(-8px);
                    box-shadow: 0 20px 25px -5px rgba(0,0,0,0.05), 0 10px 10px -5px rgba(0,0,0,0.02);
                    border-color: rgba(99, 102, 241, 0.2);
                }
                .template-preview-v2 {
                    height: 240px;
                    background: #f8fafc;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    border-bottom: 1px solid #f1f5f9;
                    position: relative;
                }
                .template-preview-v2 img {
                    width: 70%;
                    height: 80%;
                    object-fit: cover;
                    border-radius: 8px;
                    box-shadow: 0 10px 15px -3px rgba(0,0,0,0.1);
                }
                .template-info-v2 { padding: 20px; }
                .template-info-v2 .name { font-weight: 700; font-size: 16px; color: #1e293b; display: block; margin-bottom: 4px; }
                .template-info-v2 .edited { font-size: 12px; color: #94a3b8; font-weight: 500; }
            `}</style>

            <div className="glass-header">
                <div className="title-group">
                    <h1>Email Templates</h1>
                    <p>Select a template to build your campaign or create your own custom design.</p>
                </div>
                <div className="actions-group">
                    <button className="btn-premium-outline">Manage colors</button>
                    <button className="btn-premium-solid">
                        <Plus size={16} /> Create template
                    </button>
                </div>
            </div>

            <div className="templates-grid-premium">
                {templates.map(tmp => (
                    <div key={tmp.id} className="template-card-premium">
                        <div className="template-preview-v2">
                            <img src={tmp.thumb} alt={tmp.name} />
                        </div>
                        <div className="template-info-v2">
                            <span className="name">{tmp.name}</span>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <span className="edited">Edited {tmp.edited}</span>
                                <MoreHorizontal size={16} color="#94a3b8" />
                            </div>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}

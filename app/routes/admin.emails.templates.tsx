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
        <div className="templates-dashboard">
            <style>{`
                .templates-dashboard { padding: 0; font-family: 'Outfit', sans-serif; color: var(--text); }
                .header-row { display: flex; align-items: center; justify-content: space-between; margin-bottom: 32px; }
                .title-area h1 { font-size: 24px; font-weight: 700; color: var(--text); letter-spacing: -0.02em; }
                
                .btn-secondary { background: var(--surface); border: 1px solid var(--border); padding: 10px 18px; border-radius: 12px; font-size: 14px; font-weight: 600; cursor: pointer; display: flex; align-items: center; gap: 8px; color: var(--text); transition: all 0.2s; }
                .btn-secondary:hover { background: #f8fafc; border-color: var(--primary); color: var(--primary); }
                .btn-primary { background: var(--primary-gradient); color: #fff; border: none; padding: 10px 20px; border-radius: 12px; font-size: 14px; font-weight: 600; cursor: pointer; box-shadow: 0 4px 12px rgba(99, 102, 241, 0.3); }
                
                .table-card { background: var(--surface); border-radius: 20px; border: 1px solid var(--border); overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.02); }
                .table-header { display: flex; align-items: center; justify-content: space-between; padding: 14px 24px; border-bottom: 1px solid var(--border); background: #fafafa; }
                
                .tab-row { display: flex; border-bottom: 1px solid var(--border); padding: 0 24px; gap: 32px; }
                .tab-item { padding: 18px 0; border-bottom: 2px solid transparent; font-size: 14px; font-weight: 600; color: var(--text-muted); cursor: pointer; }
                .tab-item.active { border-bottom-color: var(--primary); color: var(--primary); }
                
                .grid-row { display: grid; grid-template-columns: 40px 100px 1fr 1fr 40px; padding: 20px 24px; border-bottom: 1px solid var(--border); align-items: center; cursor: pointer; transition: all 0.2s; }
                .grid-row:hover { background: #f8fafc; }
                
                .template-thumb { width: 64px; height: 84px; background: var(--sidebar-bg); border-radius: 10px; overflow: hidden; border: 1px solid var(--border); }
                .template-thumb img { width: 100%; height: 100%; object-fit: cover; }
            `}</style>

            <div className="header-row">
                <div className="title-area">
                    <h1>Templates</h1>
                </div>
                <div style={{ display: 'flex', gap: '8px' }}>
                    <button className="btn-secondary">Manage branding</button>
                    <button className="btn-primary">Create template</button>
                    <button className="btn-secondary"><MoreHorizontal size={14} /></button>
                </div>
            </div>

            <div className="table-card">
                <div className="tab-row">
                    <div className="tab-item active">All</div>
                </div>
                <div className="table-header">
                    <div style={{ display: 'flex', gap: '8px' }}>
                        <input type="checkbox" style={{ marginRight: '8px' }} />
                        <span style={{ fontSize: '13px', color: '#616161' }}>Name</span>
                    </div>
                    <div style={{ display: 'flex', gap: '8px' }}>
                        <div className="btn-secondary" style={{ padding: '4px 8px' }}><Search size={14} /></div>
                        <div className="btn-secondary" style={{ padding: '4px 8px' }}><ArrowUpDown size={14} /></div>
                    </div>
                </div>

                {templates.map(tmp => (
                    <div key={tmp.id} className="grid-row">
                        <input type="checkbox" />
                        <div className="template-thumb">
                            <img src={tmp.thumb} alt={tmp.name} />
                        </div>
                        <div style={{ fontSize: '13px', fontWeight: 600, color: '#1a1c1d' }}>{tmp.name}</div>
                        <div style={{ fontSize: '13px', color: '#616161' }}>{tmp.edited}</div>
                        <div style={{ textAlign: 'right' }}><MoreHorizontal size={14} color="#616161" /></div>
                    </div>
                ))}
            </div>
        </div>
    );
}

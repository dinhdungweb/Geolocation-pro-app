import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData, useFetcher } from "@remix-run/react";
import prisma from "../db.server";
import { requireAdminAuth } from "../utils/admin.session.server";
import { 
    Zap, 
    UserPlus, 
    AlertTriangle, 
    ShieldAlert,
    ChevronRight,
    Eye,
    History,
    MessageSquare,
    Edit3,
    Plus,
    Trash2,
    ArrowUp,
    ArrowDown,
    Save,
    RotateCcw,
    Type,
    Image as ImageIcon,
    Square,
    Layout,
    Share2,
    CheckCircle2,
    X,
    Info
} from "lucide-react";
import { useState, useEffect } from "react";
import { getWelcomeEmailHtml, getLimit80EmailHtml, getLimit100EmailHtml } from "../utils/email-templates";
import { generateEmailHtml, type EmailBlock, type EmailBlockType } from "../utils/email-generator";

export const loader = async ({ request }: LoaderFunctionArgs) => {
    await requireAdminAuth(request);

    // Fetch stats
    const logs = await (prisma as any).adminEmailLog.groupBy({
        by: ['type'],
        _count: { _all: true },
        _max: { createdAt: true }
    });

    const statsMap = logs.reduce((acc: any, curr: any) => {
        acc[curr.type] = {
            count: curr._count._all,
            lastSent: curr._max.createdAt
        };
        return acc;
    }, {});

    // For Global Admin Panel, we manage 'GLOBAL' templates by default
    const shop = "GLOBAL";
    
    // Fetch custom automations
    const customAutomations = await (prisma as any).automation.findMany({
        where: { shop }
    });

    const customMap = customAutomations.reduce((acc: any, curr: any) => {
        acc[curr.type] = curr;
        return acc;
    }, {});

    return json({ stats: statsMap, customMap, shop });
};

export const action = async ({ request }: ActionFunctionArgs) => {
    await requireAdminAuth(request);
    const formData = await request.formData();
    const action = formData.get("action");
    const type = formData.get("type") as string;
    const shop = "GLOBAL"; // Default for Admin Panel

    if (action === "save") {
        const subject = formData.get("subject") as string;
        const config = formData.get("config") as string;
        const html = formData.get("html") as string;
        const isActive = formData.get("isActive") === "true";

        await (prisma as any).automation.upsert({
            where: { shop_type: { shop, type } },
            update: { subject, config, html, isActive },
            create: { shop, type, subject, config, html, isActive }
        });

        return json({ success: true, message: "Automation saved successfully!" });
    }

    if (action === "reset") {
        await (prisma as any).automation.deleteMany({
            where: { shop, type }
        });
        return json({ success: true, message: "Restored to default template." });
    }

    if (action === "toggle") {
        const isActive = formData.get("isActive") === "true";
        await (prisma as any).automation.updateMany({
            where: { shop, type },
            data: { isActive }
        });
        return json({ success: true });
    }

    return json({ error: "Invalid action" });
};

export default function AdminEmailAutomations() {
    const { stats, customMap, shop } = useLoaderData<typeof loader>();
    const fetcher = useFetcher();
    const [previewType, setPreviewType] = useState<string | null>(null);
    const [editingType, setEditingType] = useState<string | null>(null);
    const [editSubject, setEditSubject] = useState("");
    const [editBlocks, setEditBlocks] = useState<EmailBlock[]>([]);
    const [editIsActive, setEditIsActive] = useState(true);

    const automations = [
        {
            id: 'welcome',
            title: 'Welcome Campaign',
            description: 'Triggers automatically when a merchant installs the app and visits the dashboard for the first time.',
            icon: <UserPlus className="text-indigo-500" size={24} />,
            color: '#6366f1',
            accent: '#e0e7ff',
            stats: stats['welcome'] || { count: 0, lastSent: null },
            custom: customMap['welcome'],
            template: getWelcomeEmailHtml('demo-store.myshopify.com'),
            subject: 'Welcome to Geo: Redirect & Country Block!'
        },
        {
            id: 'limit_80',
            title: '80% Usage Warning',
            description: 'Sent when a shop reaches 80% of their monthly visitor limit to prevent service interruption.',
            icon: <AlertTriangle className="text-amber-500" size={24} />,
            color: '#f59e0b',
            accent: '#fef3c7',
            stats: stats['limit_80'] || { count: 0, lastSent: null },
            custom: customMap['limit_80'],
            template: getLimit80EmailHtml('demo-store.myshopify.com', 8000, 10000),
            subject: 'demo-store.myshopify.com: Usage Warning (80%) - Geo: Redirect & Country Block'
        },
        {
            id: 'limit_100',
            title: '100% Limit Critical',
            description: 'Critical alert sent when a shop hits 100% of their limit. Necessary for compliance and billing.',
            icon: <ShieldAlert className="text-red-500" size={24} />,
            color: '#ef4444',
            accent: '#fee2e2',
            stats: stats['limit_100'] || { count: 0, lastSent: null },
            custom: customMap['limit_100'],
            template: getLimit100EmailHtml('demo-store.myshopify.com', 10000, 10000),
            subject: 'ACTION REQUIRED: demo-store.myshopify.com reached 100% limit - Geo: Redirect & Country Block'
        }
    ];

    // Initialize Editor
    const startEditing = (auto: any) => {
        setEditingType(auto.id);
        setEditIsActive(auto.custom?.isActive ?? true);
        
        if (auto.custom) {
            setEditSubject(auto.custom.subject);
            setEditBlocks(JSON.parse(auto.custom.config));
        } else {
            // Default blocks based on type
            setEditSubject(auto.id === 'welcome' ? 'Welcome to Geo: Redirect & Country Block!' : 'Usage Warning: Geo: Redirect & Country Block');
            setEditBlocks(getDefaultBlocks(auto.id));
        }
    };

    const addBlock = (type: EmailBlockType) => {
        const newBlock: EmailBlock = {
            id: Math.random().toString(36).substr(2, 9),
            type,
            content: getDefaultContent(type),
            style: getDefaultStyle(type)
        };
        setEditBlocks([...editBlocks, newBlock]);
    };

    const removeBlock = (id: string) => {
        setEditBlocks(editBlocks.filter(b => b.id !== id));
    };

    const moveBlock = (index: number, direction: 'up' | 'down') => {
        const newBlocks = [...editBlocks];
        const newIndex = direction === 'up' ? index - 1 : index + 1;
        if (newIndex >= 0 && newIndex < newBlocks.length) {
            [newBlocks[index], newBlocks[newIndex]] = [newBlocks[newIndex], newBlocks[index]];
            setEditBlocks(newBlocks);
        }
    };

    const updateBlockContent = (id: string, newContent: any) => {
        setEditBlocks(editBlocks.map(b => b.id === id ? { ...b, content: { ...b.content, ...newContent } } : b));
    };

    const updateBlockStyle = (id: string, newStyle: any) => {
        setEditBlocks(editBlocks.map(b => b.id === id ? { ...b, style: { ...b.style, ...newStyle } } : b));
    };

    const handleSave = () => {
        const html = generateEmailHtml(editBlocks, shop);
        fetcher.submit({
            action: "save",
            type: editingType!,
            subject: editSubject,
            config: JSON.stringify(editBlocks),
            html,
            isActive: String(editIsActive)
        }, { method: "post" });
        setEditingType(null);
    };

    return (
        <div className="automations-page">
            <style>{`
                .automations-page { padding: 40px; max-width: 1200px; margin: 0 auto; }
                .header-section { margin-bottom: 40px; }
                .header-section h2 { font-size: 20px; font-weight: 800; color: #0f172a; letter-spacing: -0.02em; }
                .header-section p { color: #64748b; font-size: 14px; margin-top: 4px; font-weight: 500; }
                .automation-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(360px, 1fr)); gap: 24px; }
                .automation-card { background: white; border-radius: 20px; border: 1px solid rgba(0,0,0,0.06); overflow: hidden; transition: all 0.3s; display: flex; flex-direction: column; }
                .automation-card:hover { transform: translateY(-4px); box-shadow: 0 20px 25px -5px rgba(0,0,0,0.05); }
                .card-header { padding: 24px; display: flex; align-items: flex-start; gap: 16px; }
                .icon-box { width: 48px; height: 48px; border-radius: 12px; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
                .card-content { padding: 0 24px 24px; flex: 1; }
                .card-content h3 { font-size: 16px; font-weight: 700; color: #1e293b; margin-bottom: 8px; }
                .card-footer { background: #f8fafc; padding: 16px 24px; border-top: 1px solid rgba(0,0,0,0.04); display: flex; justify-content: space-between; gap: 8px; }
                .status-tag { display: flex; align-items: center; gap: 6px; font-size: 11px; font-weight: 800; text-transform: uppercase; }
                .status-dot { width: 6px; height: 6px; border-radius: 50%; }
                .mini-stat { display: flex; align-items: center; gap: 8px; font-size: 12px; color: #94a3b8; font-weight: 600; }
                .action-btn { padding: 8px 12px; border-radius: 10px; border: 1px solid #e2e8f0; background: white; color: #475569; font-size: 12px; font-weight: 700; cursor: pointer; display: flex; align-items: center; gap: 6px; transition: all 0.2s; }
                .action-btn:hover { background: #f1f5f9; color: #0f172a; }
                .btn-primary { background: #6366f1; color: white; border-color: #6366f1; }
                .btn-primary:hover { background: #4f46e5; color: white; }

                /* Editor Layout */
                .editor-overlay { position: fixed; inset: 0; background: rgba(15, 23, 42, 0.9); backdrop-filter: blur(12px); z-index: 1100; display: flex; }
                .editor-sidebar { width: 300px; background: white; border-right: 1px solid #f1f5f9; display: flex; flex-direction: column; }
                .editor-canvas { flex: 1; overflow-y: auto; display: flex; justify-content: center; padding: 60px; background: #f1f5f9; }
                .editor-props { width: 320px; background: white; border-left: 1px solid #f1f5f9; overflow-y: auto; padding: 24px; }
                
                .block-item { background: #f8fafc; border: 1.5px dashed #e2e8f0; border-radius: 12px; padding: 16px; margin-bottom: 12px; cursor: grab; transition: all 0.2s; }
                .block-item:hover { border-color: #6366f1; background: #f5f7ff; }
                
                .canvas-content { width: 600px; min-height: 800px; background: white; border-radius: 12px; box-shadow: 0 4px 6px rgba(0,0,0,0.05); }
                .canvas-block { position: relative; border: 2px solid transparent; transition: all 0.2s; }
                .canvas-block:hover { border-color: #6366f1; }
                .block-actions { position: absolute; right: -50px; top: 0; display: none; flex-direction: column; gap: 4px; }
                .canvas-block:hover .block-actions { display: flex; }
                .action-icon { width: 32px; height: 32px; border-radius: 8px; background: white; border: 1px solid #e2e8f0; display: flex; alignItems: center; justify-content: center; cursor: pointer; color: #64748b; }
                .action-icon:hover { color: #dc2626; border-color: #fca5a5; }

                .prop-group { margin-bottom: 24px; }
                .prop-label { font-size: 11px; font-weight: 800; color: #94a3b8; text-transform: uppercase; margin-bottom: 8px; }
                .prop-input { width: 100%; padding: 10px; border-radius: 8px; border: 1px solid #e2e8f0; font-size: 13px; font-weight: 500; }
                
                .var-tag { background: #e0e7ff; color: #4338ca; padding: 2px 6px; border-radius: 4px; font-size: 11px; font-weight: 700; cursor: pointer; }
                
                /* Modal Overlay */
                .modal-overlay { position: fixed; inset: 0; background: rgba(15, 23, 42, 0.8); backdrop-filter: blur(8px); z-index: 1000; display: flex; align-items: center; justify-content: center; padding: 40px; }
                .modal-content { background: white; width: 100%; max-width: 800px; max-height: 90vh; border-radius: 24px; overflow: hidden; display: flex; flex-direction: column; box-shadow: 0 25px 50px -12px rgba(0,0,0,0.5); }
                .modal-header { padding: 24px; border-bottom: 1px solid #f1f5f9; display: flex; justify-content: space-between; align-items: center; }
                .modal-body { flex: 1; overflow-y: auto; background: #f8fafc; padding: 40px; }
                .preview-frame { background: white; border-radius: 16px; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1); padding: 40px; max-width: 600px; margin: 0 auto; }
            `}</style>

            <div className="header-section">
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
                    <Zap size={20} fill="#6366f1" color="#6366f1" />
                    <span style={{ fontSize: '11px', fontWeight: 800, color: '#6366f1', textTransform: 'uppercase', letterSpacing: '0.1em'}}>System Automations</span>
                </div>
                <h2>Automated Email Flows</h2>
                <p>Customize and monitor your transactional email campaigns.</p>
            </div>

            <div className="automation-grid">
                {automations.map(auto => (
                    <div key={auto.id} className="automation-card">
                        <div className="card-header">
                            <div className="icon-box" style={{ background: auto.accent }}>
                                {auto.icon}
                            </div>
                            <div style={{ flex: 1 }}>
                                <div className="status-tag">
                                    <div className="status-dot" style={{ background: auto.custom?.isActive === false ? '#94a3b8' : '#22c55e' }}></div>
                                    <span style={{ color: auto.custom?.isActive === false ? '#94a3b8' : '#22c55e' }}>
                                        {auto.custom?.isActive === false ? 'Disabled' : 'Active'}
                                    </span>
                                </div>
                            </div>
                        </div>
                        <div className="card-content">
                            <h3>{auto.title} {auto.custom && <span className="var-tag">Customized</span>}</h3>
                            <p>{auto.description}</p>
                            
                            <div style={{ marginTop: '20px', display: 'flex', flexWrap: 'wrap', gap: '16px' }}>
                                <div className="mini-stat">
                                    <History size={14} /> {auto.stats.count} sent
                                </div>
                                <div className="mini-stat">
                                    <MessageSquare size={14} /> {auto.stats.lastSent ? new Date(auto.stats.lastSent).toLocaleDateString() : 'Never'}
                                </div>
                            </div>
                        </div>
                        <div className="card-footer">
                            <button className="action-btn" onClick={() => startEditing(auto)}>
                                <Edit3 size={14} /> Edit
                            </button>
                            <button className="action-btn" onClick={() => setPreviewType(auto.id)}>
                                <Eye size={14} /> Preview
                            </button>
                        </div>
                    </div>
                ))}
            </div>

            {/* Drag & Drop Editor */}
            {editingType && (
                <div className="editor-overlay">
                    <div className="editor-sidebar">
                        <div style={{ padding: '24px', borderBottom: '1px solid #f1f5f9' }}>
                            <h3 style={{ fontSize: '13px', fontWeight: 800, color: '#0f172a', textTransform: 'uppercase' }}>Email Blocks</h3>
                            <p style={{ fontSize: '11px', color: '#64748b', marginTop: '4px' }}>Click to add element to email</p>
                        </div>
                        <div style={{ flex: 1, overflowY: 'auto', padding: '24px' }}>
                            <button className="block-item" onClick={() => addBlock('header')}>
                                <Layout size={18} /> <strong>Header</strong>
                            </button>
                            <button className="block-item" onClick={() => addBlock('heading')}>
                                <Type size={18} /> <strong>Heading</strong>
                            </button>
                            <button className="block-item" onClick={() => addBlock('text')}>
                                <Edit3 size={18} /> <strong>Paragraph</strong>
                            </button>
                            <button className="block-item" onClick={() => addBlock('button')}>
                                <Square size={18} /> <strong>Call to Action</strong>
                            </button>
                            <button className="block-item" onClick={() => addBlock('hero')}>
                                <ImageIcon size={18} /> <strong>Hero Banner</strong>
                            </button>
                            <button className="block-item" onClick={() => addBlock('coupon')}>
                                <Zap size={18} /> <strong>Coupon Card</strong>
                            </button>
                            <button className="block-item" onClick={() => addBlock('divider')}>
                                <Minus size={18} /> <strong>Divider</strong>
                            </button>
                            <button className="block-item" onClick={() => addBlock('footer')}>
                                <Share2 size={18} /> <strong>Footer</strong>
                            </button>
                        </div>
                        <div style={{ padding: '24px', borderTop: '1px solid #f1f5f9', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                            <button className="action-btn" style={{ background: '#fef2f2', color: '#ef4444', borderColor: '#fee2e2' }} onClick={() => {
                                if(confirm("Discard all changes?")) setEditingType(null);
                            }}>
                                <X size={14} /> Discard Changes
                            </button>
                            <button className="action-btn btn-primary" style={{ width: '100%', justifyContent: 'center' }} onClick={handleSave}>
                                <Save size={14} /> Save Automation
                            </button>
                        </div>
                    </div>

                    <div className="editor-canvas">
                        <div className="canvas-content">
                            <div style={{ padding: '24px', borderBottom: '1px solid #f1f5f9', background: '#f8fafc' }}>
                                <div className="prop-label">Email Subject</div>
                                <input className="prop-input" value={editSubject} onChange={e => setEditSubject(e.target.value)} />
                                <div style={{ marginTop: '8px', display: 'flex', gap: '8px' }}>
                                    <span className="var-tag" onClick={() => setEditSubject(s => s + '{shop_name}')}>{`{shop_name}`}</span>
                                </div>
                            </div>
                            
                            <div style={{ padding: '0' }}>
                                {editBlocks.map((block, idx) => (
                                    <div key={block.id} className="canvas-block">
                                        <div dangerouslySetInnerHTML={{ __html: renderBlockPreview(block) }} />
                                        <div className="block-actions">
                                            <button className="action-icon" onClick={() => moveBlock(idx, 'up')} disabled={idx === 0}><ArrowUp size={14} /></button>
                                            <button className="action-icon" onClick={() => moveBlock(idx, 'down')} disabled={idx === editBlocks.length - 1}><ArrowDown size={14} /></button>
                                            <button className="action-icon" style={{ color: '#ef4444' }} onClick={() => removeBlock(block.id)}><Trash2 size={14} /></button>
                                        </div>
                                    </div>
                                ))}
                                {editBlocks.length === 0 && (
                                    <div style={{ padding: '60px', textAlign: 'center', color: '#94a3b8' }}>
                                        <Info size={48} style={{ margin: '0 auto 16px', opacity: 0.2 }} />
                                        <p>No blocks added yet. Click on the left elements to start building your email.</p>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>

                    <div className="editor-props">
                        <h3 style={{ fontSize: '13px', fontWeight: 800, color: '#0f172a', textTransform: 'uppercase', marginBottom: '20px' }}>Settings</h3>
                        <div className="prop-group">
                            <div className="prop-label">Automation Status</div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', cursor: 'pointer' }}>
                                    <input type="checkbox" checked={editIsActive} onChange={e => setEditIsActive(e.target.checked)} /> Enable this email flow
                                </label>
                            </div>
                        </div>
                        <hr style={{ border: '0', borderTop: '1px solid #f1f5f9', margin: '20px 0' }} />
                        <div style={{ padding: '12px', background: '#f0fdf4', borderRadius: '12px', border: '1px solid #dcfce7' }}>
                            <div style={{ display: 'flex', gap: '8px', color: '#166534' }}>
                                <CheckCircle2 size={16} />
                                <div style={{ fontSize: '12px', fontWeight: 600 }}>Active Variables</div>
                            </div>
                            <p style={{ fontSize: '11px', color: '#166534', marginTop: '6px' }}>You can use these in any text block:</p>
                            <div style={{ marginTop: '8px', display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                                <span className="var-tag">{`{shop}`}</span>
                                <span className="var-tag">{`{shop_name}`}</span>
                                <span className="var-tag">{`{usage}`}</span>
                                <span className="var-tag">{`{limit}`}</span>
                                <span className="var-tag">{`{year}`}</span>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Preview Modal */}
            {previewType && (
                <div className="modal-overlay" onClick={() => setPreviewType(null)}>
                    <div className="modal-content" onClick={e => e.stopPropagation()}>
                        <div className="modal-header">
                            <div>
                                <div style={{ fontSize: '11px', fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase', marginBottom: '4px' }}>Template Preview</div>
                                <h3 style={{ fontSize: '18px', fontWeight: 800, color: '#0f172a' }}>
                                    {automations.find(a => a.id === previewType)?.title}
                                </h3>
                            </div>
                            <div style={{ display: 'flex', gap: '8px' }}>
                                <fetcher.Form method="post" onSubmit={() => setPreviewType(null)}>
                                    <input type="hidden" name="type" value={previewType} />
                                    <button name="action" value="reset" className="action-btn" style={{ color: '#ef4444' }}>
                                        <RotateCcw size={14} /> Restore Default
                                    </button>
                                </fetcher.Form>
                                <button className="action-btn" onClick={() => setPreviewType(null)}>Close</button>
                            </div>
                        </div>
                        <div className="modal-body">
                            {(() => {
                                const activeAuto = automations.find(a => a.id === previewType);
                                if (!activeAuto) return <div>Template not found</div>;
                                return (
                                    <>
                                        <div style={{ maxWidth: '600px', margin: '0 auto 24px', background: 'white', padding: '16px', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
                                            <div style={{ fontSize: '12px', color: '#64748b', marginBottom: '4px' }}>Subject</div>
                                            <div style={{ fontWeight: 700, color: '#1e293b' }}>
                                                {activeAuto.custom?.subject || activeAuto.subject}
                                            </div>
                                        </div>
                                        <div className="preview-frame" dangerouslySetInnerHTML={{ 
                                            __html: activeAuto.custom?.html || activeAuto.template || '' 
                                        }} />
                                    </>
                                );
                            })()}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

// Helpers
function Minus(props: any) {
    return <svg {...props} width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="5" y1="12" x2="19" y2="12"></line></svg>
}

function getDefaultBlocks(type: string): EmailBlock[] {
    const commonHeader: EmailBlock = { id: 'h1', type: 'header', content: { logoText: 'Geo: Redirect' }, style: { themeColor: '#6366f1' } };
    const commonFooter: EmailBlock = { id: 'f1', type: 'footer', content: { text: '&copy; 2024 Geo: Redirect & Country Block. All rights reserved.' } };

    if (type === 'welcome') {
        return [
            commonHeader,
            { id: 'b1', type: 'heading', content: { text: 'Welcome to Geo: Redirect & Country Block!' }, style: { fontSize: '24px', textAlign: 'center' } },
            { id: 'b2', type: 'text', content: { text: 'Hi there,\n\nThank you for installing our app! We are here to help you localized your international customers and protect your store from unwanted traffic.' } },
            { id: 'b3', type: 'button', content: { label: 'Go to Dashboard', url: 'https://{shop}/admin/apps/geo-redirect-country-block' }, style: { buttonColor: '#6366f1' } },
            commonFooter
        ];
    }
    
    return [
        commonHeader,
        { id: 'b1', type: 'heading', content: { text: 'Usage Warning' }, style: { fontSize: '24px' } },
        { id: 'b2', type: 'text', content: { text: 'Your shop {shop_name} has reached {usage} visitors, which is 80% of your current plan limit.' } },
        { id: 'b3', type: 'button', content: { label: 'Upgrade Plan', url: '#' }, style: { buttonColor: '#f59e0b' } },
        commonFooter
    ];
}

function getDefaultContent(type: EmailBlockType) {
    switch(type) {
        case 'header': return { logoText: 'Geo: Redirect' };
        case 'heading': return { text: 'Enter Heading Text' };
        case 'text': return { text: 'Compose your message here...' };
        case 'button': return { label: 'Click Here', url: '#' };
        case 'hero': return { title: 'Big Announcement!', imageUrl: '' };
        case 'coupon': return { code: 'WELCOME20' };
        case 'footer': return { text: '&copy; 2024 All rights reserved.' };
        default: return {};
    }
}

function getDefaultStyle(type: EmailBlockType) {
    if (type === 'header') return { themeColor: '#6366f1' };
    if (type === 'button') return { buttonColor: '#6366f1', textAlign: 'center' };
    if (type === 'heading') return { fontSize: '24px', textAlign: 'left', color: '#1e293b' };
    return { padding: '30px', backgroundColor: '#ffffff', color: '#475569' };
}

function renderBlockPreview(block: EmailBlock): string {
    const { type, content } = block;
    const style = block.style || {};
    switch(type) {
        case 'header': 
            return `<div style="background: ${style.themeColor || '#6366f1'}; padding: 20px; text-align: center; color: white; font-weight: 800;">${content.logoText || 'Logo'}</div>`;
        case 'heading':
            return `<div style="padding: 20px 30px; font-size: ${style.fontSize || '24px'}; font-weight: 800; text-align: ${style.textAlign || 'left'}; color: ${style.color || '#1e293b'}">${content.text}</div>`;
        case 'text':
            return `<div style="padding: 10px 30px; font-size: 14px; color: ${style.color || '#64748b'}; line-height: 1.6; text-align: ${style.textAlign || 'left'}">${content.text.replace(/\n/g, '<br>')}</div>`;
        case 'button':
            return `<div style="padding: 20px; text-align: ${style.textAlign || 'center'}"><div style="background: ${style.buttonColor || '#6366f1'}; color: white; display: inline-block; padding: 10px 24px; border-radius: 8px; font-weight: 700;">${content.label}</div></div>`;
        case 'hero':
            return `<div style="background: #f1f5f9; padding: 40px 20px; text-align: center;"><div style="font-size: 24px; font-weight: 900;">${content.title}</div></div>`;
        case 'coupon':
            return `<div style="padding: 20px;"><div style="border: 2px dashed #facc15; background: #fefce8; padding: 20px; text-align: center; font-weight: 900; font-size: 24px;">${content.code}</div></div>`;
        case 'divider':
            return `<div style="padding: 10px 30px;"><hr style="border: 0; border-top: 1px solid #e2e8f0;"></div>`;
        case 'footer':
            return `<div style="padding: 24px; background: #f8fafc; text-align: center; color: #94a3b8; font-size: 11px;">${content.text}</div>`;
        default: return `<div style="padding: 20px; text-align: center; color: #94a3b8;">Block: ${type}</div>`;
    }
}

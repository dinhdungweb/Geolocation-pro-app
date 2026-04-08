import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json, redirect } from "@remix-run/node";
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

export const loader = async ({ request, params }: LoaderFunctionArgs) => {
    await requireAdminAuth(request);
    const shop = "GLOBAL";
    const { id } = params;
    
    try {
        // If specific ID is requested, fetch it
        let currentAutomation = null;
        if (id && id !== 'new') {
            currentAutomation = await (prisma as any).automation.findUnique({
                where: { id }
            });
        }

        if (!currentAutomation && !['welcome', 'limit_80', 'limit_100'].includes(id || '')) {
            return redirect("/admin/emails/automations");
        }

        return json({ shop, currentAutomation, requestedId: id });
    } catch (error) {
        console.error("Prisma error in Automation Editor loader:", error);
        return redirect("/admin/emails/automations");
    }
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
        const id = formData.get("id") as string;
        await (prisma as any).automation.update({
            where: { id },
            data: { isActive }
        });
        return json({ success: true });
    }

    return json({ error: "Invalid action" });
};

export default function AdminEmailAutomations() {
    const { shop, currentAutomation, requestedId } = useLoaderData<typeof loader>();
    const fetcher = useFetcher();
    const [editSubject, setEditSubject] = useState("");
    const [editBlocks, setEditBlocks] = useState<EmailBlock[]>([]);
    const [editIsActive, setEditIsActive] = useState(true);
    const [selectedBlockId, setSelectedBlockId] = useState<string | null>(null);

    // Effect to initialize editor
    useEffect(() => {
        if (currentAutomation) {
            setEditIsActive(currentAutomation.isActive);
            setEditSubject(currentAutomation.subject);
            try {
                setEditBlocks(currentAutomation.config ? JSON.parse(currentAutomation.config) : []);
            } catch (e) {
                setEditBlocks([]);
            }
        } else if (requestedId && ['welcome', 'limit_80', 'limit_100'].includes(requestedId)) {
            setEditIsActive(true);
            setEditSubject(requestedId === 'welcome' ? 'Welcome to Geo: Redirect & Country Block!' : 'Usage Warning: Geo: Redirect & Country Block');
            setEditBlocks(getDefaultBlocks(requestedId));
        }
    }, [currentAutomation, requestedId]);

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
            type: currentAutomation?.type || requestedId!,
            subject: editSubject,
            config: JSON.stringify(editBlocks),
            html,
            isActive: String(editIsActive)
        }, { method: "post" });
    };

    return (
            <div className="editor-overlay">
                <div className="editor-sidebar">
                    <div style={{ padding: '24px', borderBottom: '1px solid #f1f5f9' }}>
                        <h3 style={{ fontSize: '12px', fontWeight: 800, color: '#0f172a', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Email Elements</h3>
                        <p style={{ fontSize: '11px', color: '#64748b', marginTop: '4px' }}>Build your automated flow</p>
                    </div>
                    
                    <div className="blocks-grid">
                        <button className="block-item" onClick={() => addBlock('header')}>
                            <Layout size={22} />
                            <strong>Header</strong>
                        </button>
                        <button className="block-item" onClick={() => addBlock('heading')}>
                            <Type size={22} />
                            <strong>Heading</strong>
                        </button>
                        <button className="block-item" onClick={() => addBlock('text')}>
                            <Edit3 size={22} />
                            <strong>Text</strong>
                        </button>
                        <button className="block-item" onClick={() => addBlock('button')}>
                            <Square size={22} />
                            <strong>Button</strong>
                        </button>
                        <button className="block-item" onClick={() => addBlock('hero')}>
                            <ImageIcon size={22} />
                            <strong>Banner</strong>
                        </button>
                        <button className="block-item" onClick={() => addBlock('coupon')}>
                            <Zap size={22} />
                            <strong>Coupon</strong>
                        </button>
                        <button className="block-item" onClick={() => addBlock('divider')}>
                            <div style={{ height: '2px', width: '22px', background: '#94a3b8' }}></div>
                            <strong>Divider</strong>
                        </button>
                        <button className="block-item" onClick={() => addBlock('footer')}>
                            <Share2 size={22} />
                            <strong>Footer</strong>
                        </button>
                    </div>

                    <div style={{ flex: 1 }}></div>

                    <div style={{ padding: '24px', background: '#f8fafc', borderTop: '1px solid #f1f5f9', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                        <button className="action-btn" style={{ width: '100%', height: '44px', justifyContent: 'center', background: 'transparent' }} onClick={() => {
                            window.location.href = "/admin/emails/automations";
                        }}>
                            <X size={14} /> Back to List
                        </button>
                        <button className="action-btn btn-primary" style={{ width: '100%', height: '48px', justifyContent: 'center', fontSize: '13px', borderRadius: '12px' }} onClick={handleSave}>
                            {fetcher.state === 'submitting' ? 'Saving...' : <><Save size={16} /> Save Changes</>}
                        </button>
                    </div>
                </div>

                <div className="editor-canvas">
                    <div className="canvas-content">
                        {(fetcher.data as any)?.success && (
                            <div style={{ padding: '12px 24px', background: '#ecfdf5', borderBottom: '1px solid #10b981', color: '#059669', fontSize: '13px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <CheckCircle2 size={16} /> Saved successfully!
                            </div>
                        )}
                        <div style={{ padding: '24px', borderBottom: '1px solid #f1f5f9', background: '#f8fafc' }}>
                            <div className="prop-label">Email Subject</div>
                            <input className="prop-input" value={editSubject} onChange={e => setEditSubject(e.target.value)} />
                        </div>
                        
                        <div style={{ padding: '0' }}>
                            {editBlocks.map((block, idx) => (
                                <div 
                                    key={block.id} 
                                    className={`canvas-block ${selectedBlockId === block.id ? 'selected' : ''}`}
                                    onClick={(e) => { e.stopPropagation(); setSelectedBlockId(block.id); }}
                                >
                                    <div dangerouslySetInnerHTML={{ __html: renderBlockPreview(block) }} />
                                    <div className="block-actions">
                                        <button className="action-icon" onClick={(e) => { e.stopPropagation(); moveBlock(idx, 'up'); }} disabled={idx === 0} title="Move Up"><ArrowUp size={14} /></button>
                                        <button className="action-icon" onClick={(e) => { e.stopPropagation(); moveBlock(idx, 'down'); }} disabled={idx === editBlocks.length - 1} title="Move Down"><ArrowDown size={14} /></button>
                                        <button className="action-icon delete" onClick={(e) => { e.stopPropagation(); removeBlock(block.id); }} title="Delete Block"><Trash2 size={14} /></button>
                                    </div>
                                </div>
                            ))}
                            {editBlocks.length === 0 && (
                                <div style={{ padding: '60px', textAlign: 'center', color: '#94a3b8' }}>
                                    <Info size={48} style={{ margin: '0 auto 16px', opacity: 0.2 }} />
                                    <p>No blocks added yet. Use the sidebar to start building.</p>
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                <div className="editor-props" onClick={e => e.stopPropagation()}>
                    <h3 style={{ fontSize: '14px', fontWeight: 800, color: '#0f172a', textTransform: 'uppercase', marginBottom: '24px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <Type size={16} fill="#6366f1" color="#6366f1" /> Properties
                    </h3>

                    {selectedBlockId ? (
                        (() => {
                            const block = editBlocks.find(b => b.id === selectedBlockId);
                            if (!block) return null;
                            return (
                                <div className="block-settings-form">
                                    <div style={{ marginBottom: '20px', padding: '12px', background: '#f8fafc', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
                                        <span style={{ fontSize: '10px', color: '#94a3b8', fontWeight: 800, textTransform: 'uppercase' }}>Editing</span>
                                        <div style={{ fontWeight: 700, color: '#1e293b', fontSize: '14px', textTransform: 'capitalize' }}>{block.type} Block</div>
                                    </div>

                                    {block.type === 'heading' || block.type === 'text' ? (
                                        <div className="prop-group">
                                            <div className="prop-label">Content Text</div>
                                            <textarea 
                                                className="prop-input" 
                                                rows={4} 
                                                value={block.content.text} 
                                                onChange={e => updateBlockContent(block.id, { text: e.target.value })} 
                                            />
                                        </div>
                                    ) : null}

                                    {block.type === 'button' ? (
                                        <>
                                            <div className="prop-group">
                                                <div className="prop-label">Button Label</div>
                                                <input className="prop-input" value={block.content.label} onChange={e => updateBlockContent(block.id, { label: e.target.value })} />
                                            </div>
                                            <div className="prop-group">
                                                <div className="prop-label">Destination URL</div>
                                                <input className="prop-input" value={block.content.url} onChange={e => updateBlockContent(block.id, { url: e.target.value })} />
                                            </div>
                                        </>
                                    ) : null}

                                    <button className="action-btn" style={{ width: '100%', justifyContent: 'center', marginTop: '10px' }} onClick={() => setSelectedBlockId(null)}>
                                        <CheckCircle2 size={14} /> Done
                                    </button>
                                </div>
                            )
                        })()
                    ) : (
                        <div className="global-settings">
                            <div className="prop-group">
                                <div className="prop-label">Activation</div>
                                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', cursor: 'pointer' }}>
                                    <input type="checkbox" checked={editIsActive} onChange={e => setEditIsActive(e.target.checked)} /> 
                                    Enable this automation
                                </label>
                            </div>
                        </div>
                    )}
                </div>
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

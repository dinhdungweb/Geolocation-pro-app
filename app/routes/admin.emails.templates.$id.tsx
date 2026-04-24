import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json, redirect } from "@remix-run/node";
import { useLoaderData, useFetcher, useNavigate } from "@remix-run/react";
import prisma from "../db.server";
import { requireAdminAuth } from "../utils/admin.session.server";
import { 
    Mail, 
    Save, 
    X, 
    Type, 
    Image as ImageIcon, 
    Square, 
    Layout, 
    Share2, 
    Zap, 
    Trash2, 
    ArrowUp, 
    ArrowDown,
    Plus,
    Edit3,
    CheckCircle2,
    RotateCcw,
    ChevronLeft
} from "lucide-react";
import { useState, useEffect } from "react";
import { generateEmailHtml, type EmailBlock, type EmailBlockType } from "../utils/email-generator";

export const loader = async ({ request, params }: LoaderFunctionArgs) => {
    await requireAdminAuth(request);
    const { id } = params;

    try {
        const template = await prisma.emailTemplate.findUnique({
            where: { id }
        });

        if (!template && id !== 'new') {
            return redirect("/admin/emails/templates");
        }

        return json({ template });
    } catch (e) {
        console.error("Error loading template:", e);
        return redirect("/admin/emails/templates");
    }
};

export const action = async ({ request, params }: ActionFunctionArgs) => {
    await requireAdminAuth(request);
    const { id } = params;
    const formData = await request.formData();
    const action = formData.get("action");

    if (action === "save") {
        const name = formData.get("name") as string;
        const subject = formData.get("subject") as string;
        const config = formData.get("config") as string;
        const html = formData.get("html") as string;

        await prisma.emailTemplate.update({
            where: { id },
            data: { name, subject, config, html }
        });

        return json({ success: true });
    }

    if (action === "delete") {
        await prisma.emailTemplate.delete({
            where: { id }
        });
        return redirect("/admin/emails/templates");
    }

    return json({ error: "Invalid action" });
};

export default function TemplateEditor() {
    const { template } = useLoaderData<typeof loader>();
    const fetcher = useFetcher();
    const navigate = useNavigate();

    const [name, setName] = useState(template?.name || "Untitled Template");
    const [subject, setSubject] = useState(template?.subject || "");
    const [blocks, setBlocks] = useState<EmailBlock[]>([]);
    const [selectedBlockId, setSelectedBlockId] = useState<string | null>(null);

    useEffect(() => {
        if (template?.config) {
            try {
                setBlocks(JSON.parse(template.config));
            } catch (e) {
                setBlocks([]);
            }
        }
    }, [template]);

    const addBlock = (type: EmailBlockType) => {
        const newBlock: EmailBlock = {
            id: Math.random().toString(36).substr(2, 9),
            type,
            content: getDefaultContent(type),
            style: getDefaultStyle(type)
        };
        setBlocks([...blocks, newBlock]);
    };

    const removeBlock = (id: string) => {
        setBlocks(blocks.filter(b => b.id !== id));
        if (selectedBlockId === id) setSelectedBlockId(null);
    };

    const moveBlock = (index: number, direction: 'up' | 'down') => {
        const newBlocks = [...blocks];
        const newIndex = direction === 'up' ? index - 1 : index + 1;
        if (newIndex >= 0 && newIndex < newBlocks.length) {
            [newBlocks[index], newBlocks[newIndex]] = [newBlocks[newIndex], newBlocks[index]];
            setBlocks(newBlocks);
        }
    };

    const updateBlockContent = (id: string, newContent: any) => {
        setBlocks(blocks.map(b => b.id === id ? { ...b, content: { ...b.content, ...newContent } } : b));
    };

    const updateBlockStyle = (id: string, newStyle: any) => {
        setBlocks(blocks.map(b => b.id === id ? { ...b, style: { ...b.style, ...newStyle } } : b));
    };

    const handleSave = () => {
        const html = generateEmailHtml(blocks, "GLOBAL");
        fetcher.submit({
            action: "save",
            name,
            subject,
            config: JSON.stringify(blocks),
            html
        }, { method: "post" });
    };

    const isSaving = fetcher.state === "submitting";

    return (
        <div className="template-editor-page">
            <style>{`
                .template-editor-page { 
                    position: fixed; 
                    inset: 0; 
                    background: #f1f5f9; 
                    z-index: 9999; 
                    display: flex; 
                    flex-direction: column;
                    font-family: 'Outfit', sans-serif;
                }
                
                .editor-header {
                    height: 72px;
                    background: white;
                    border-bottom: 1px solid #e2e8f0;
                    display: flex;
                    align-items: center;
                    padding: 0 24px;
                    justify-content: space-between;
                    box-shadow: 0 4px 6px -1px rgba(0,0,0,0.02);
                }

                .editor-main {
                    flex: 1;
                    display: grid;
                    grid-template-columns: 280px 1fr 340px;
                    overflow: hidden;
                }

                @media (max-width: 1200px) {
                    .editor-main {
                        grid-template-columns: 1fr;
                        height: auto;
                        overflow-y: auto;
                        display: flex;
                        flex-direction: column;
                    }
                    .sidebar-left, .sidebar-right { 
                        width: 100%; 
                        border: none; 
                        border-top: 1px solid #e2e8f0; 
                        height: auto;
                    }
                    .canvas-area { 
                        padding: 20px 10px; 
                        width: 100%;
                    }
                    .canvas-inner { 
                        width: 100% !important; 
                        min-height: auto; 
                    }
                    .template-editor-page {
                        position: relative;
                        height: auto;
                        min-height: 100vh;
                        overflow-y: auto;
                    }
                }

                .sidebar-left {
                    background: white;
                    border-right: 1px solid #e2e8f0;
                    padding: 24px;
                    display: flex;
                    flex-direction: column;
                    gap: 20px;
                }

                .canvas-area {
                    overflow-y: auto;
                    padding: 40px;
                    display: flex;
                    justify-content: center;
                }

                .canvas-inner {
                    width: 600px;
                    min-height: 800px;
                    background: white;
                    box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1);
                    border-radius: 8px;
                    overflow: hidden;
                }

                .sidebar-right {
                    background: white;
                    border-left: 1px solid #e2e8f0;
                    padding: 24px;
                    overflow-y: auto;
                }

                .block-button {
                    width: 100%;
                    padding: 16px;
                    background: #f8fafc;
                    border: 1px solid #e2e8f0;
                    border-radius: 12px;
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    gap: 8px;
                    cursor: pointer;
                    transition: all 0.2s;
                    color: #475569;
                }
                .block-button:hover {
                    background: #f0f7ff;
                    border-color: #6366f1;
                    color: #6366f1;
                    transform: translateY(-2px);
                }
                .block-button strong { font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em; font-weight: 800; }

                .canvas-block {
                    position: relative;
                    border: 2px solid transparent;
                    cursor: pointer;
                    transition: all 0.2s;
                }
                .canvas-block:hover { border-color: #e2e8f0; }
                .canvas-block.selected { border-color: #6366f1; background: rgba(99, 102, 241, 0.02); }

                .block-tools {
                    position: absolute;
                    right: 10px;
                    top: 10px;
                    display: none;
                    flex-direction: column;
                    gap: 4px;
                    z-index: 10;
                }
                .canvas-block.selected .block-tools { display: flex; }

                .tool-btn {
                    width: 32px;
                    height: 32px;
                    background: white;
                    border: 1px solid #e2e8f0;
                    border-radius: 8px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    color: #64748b;
                    box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1);
                    cursor: pointer;
                }
                .tool-btn:hover { color: #6366f1; border-color: #6366f1; }
                .tool-btn.delete:hover { color: #ef4444; border-color: #ef4444; }

                .prop-input {
                    width: 100%;
                    padding: 12px;
                    border: 1px solid #e2e8f0;
                    border-radius: 10px;
                    font-size: 14px;
                    margin-bottom: 20px;
                }
                .prop-label {
                    font-size: 12px;
                    font-weight: 700;
                    color: #64748b;
                    margin-bottom: 8px;
                    display: block;
                }

                .btn-save {
                    background: linear-gradient(135deg, #6366f1 0%, #4f46e5 100%);
                    color: white;
                    padding: 10px 24px;
                    border-radius: 12px;
                    border: none;
                    font-weight: 700;
                    cursor: pointer;
                    display: flex;
                    align-items: center;
                    gap: 10px;
                    transition: all 0.2s;
                }
                .btn-save:hover { transform: translateY(-1px); box-shadow: 0 4px 12px rgba(99, 102, 241, 0.3); }

                .var-badge {
                    background: #f1f5f9;
                    color: #6366f1;
                    padding: 2px 6px;
                    border-radius: 4px;
                    font-size: 11px;
                    font-weight: 700;
                    margin: 4px;
                    display: inline-block;
                    cursor: pointer;
                }
            `}</style>

            <div className="editor-header">
                <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
                    <button onClick={() => navigate("/admin/emails/templates")} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b' }}>
                        <ChevronLeft size={24} />
                    </button>
                    <div>
                        <input 
                            value={name} 
                            onChange={e => setName(e.target.value)} 
                            style={{ fontSize: '18px', fontWeight: 800, border: 'none', outline: 'none', background: 'none' }}
                            placeholder="Template Name"
                        />
                        <div style={{ fontSize: '12px', color: '#94a3b8', fontWeight: 600 }}>Editing template draft</div>
                    </div>
                </div>

                <div style={{ display: 'flex', gap: '12px' }}>
                    <button className="btn-save" onClick={handleSave} disabled={isSaving}>
                        <Save size={18} /> {isSaving ? "Saving..." : "Save Changes"}
                    </button>
                </div>
            </div>

            <div className="editor-main">
                <div className="sidebar-left">
                    <div style={{ fontWeight: 800, fontSize: '12px', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Email Elements</div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                        <button className="block-button" onClick={() => addBlock('header')}>
                            <Layout size={20} />
                            <strong>Header</strong>
                        </button>
                        <button className="block-button" onClick={() => addBlock('heading')}>
                            <Type size={20} />
                            <strong>Heading</strong>
                        </button>
                        <button className="block-button" onClick={() => addBlock('text')}>
                            <Edit3 size={20} />
                            <strong>Text</strong>
                        </button>
                        <button className="block-button" onClick={() => addBlock('button')}>
                            <Square size={20} />
                            <strong>Button</strong>
                        </button>
                        <button className="block-button" onClick={() => addBlock('hero')}>
                            <ImageIcon size={20} />
                            <strong>Banner</strong>
                        </button>
                        <button className="block-button" onClick={() => addBlock('divider')}>
                            <div style={{ height: '2px', width: '20px', background: '#94a3b8' }}></div>
                            <strong>Divider</strong>
                        </button>
                        <button className="block-button" onClick={() => addBlock('footer')}>
                            <Share2 size={20} />
                            <strong>Footer</strong>
                        </button>
                        <button className="block-button" onClick={() => addBlock('coupon')}>
                            <Zap size={20} />
                            <strong>Coupon</strong>
                        </button>
                    </div>
                </div>

                <div className="canvas-area" onClick={() => setSelectedBlockId(null)}>
                    <div className="canvas-inner">
                        <div style={{ padding: '20px', background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                            <span className="prop-label">Email Subject</span>
                            <input className="prop-input" value={subject} onChange={e => setSubject(e.target.value)} placeholder="New Campaign" style={{ marginBottom: 0 }} />
                        </div>

                        {blocks.map((block, idx) => (
                            <div 
                                key={block.id} 
                                className={`canvas-block ${selectedBlockId === block.id ? 'selected' : ''}`}
                                onClick={(e) => { e.stopPropagation(); setSelectedBlockId(block.id); }}
                            >
                                <div dangerouslySetInnerHTML={{ __html: renderBlockPreview(block) }} />
                                <div className="block-tools">
                                    <button className="tool-btn" onClick={(e) => { e.stopPropagation(); moveBlock(idx, 'up'); }} disabled={idx === 0}><ArrowUp size={14} /></button>
                                    <button className="tool-btn" onClick={(e) => { e.stopPropagation(); moveBlock(idx, 'down'); }} disabled={idx === blocks.length - 1}><ArrowDown size={14} /></button>
                                    <button className="tool-btn delete" onClick={(e) => { e.stopPropagation(); removeBlock(block.id); }}><Trash2 size={14} /></button>
                                </div>
                            </div>
                        ))}

                        {blocks.length === 0 && (
                            <div style={{ padding: '80px 40px', textAlign: 'center' }}>
                                <Mail size={48} style={{ margin: '0 auto 20px', color: '#e2e8f0' }} />
                                <div style={{ fontSize: '18px', fontWeight: 700, color: '#94a3b8' }}>Empty Canvas</div>
                                <p style={{ color: '#cbd5e1', fontSize: '14px' }}>Add elements from the left panel to build your email.</p>
                            </div>
                        )}
                    </div>
                </div>

                <div className="sidebar-right">
                    <div style={{ fontWeight: 800, fontSize: '12px', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '20px' }}>Settings</div>
                    
                    {selectedBlockId ? (
                        (() => {
                            const block = blocks.find(b => b.id === selectedBlockId);
                            if(!block) return null;
                            return (
                                <div>
                                    <div style={{ padding: '12px', background: '#f8fafc', borderRadius: '12px', marginBottom: '24px' }}>
                                        <div style={{ fontSize: '10px', color: '#64748b', fontWeight: 800 }}>OBJECT TYPE</div>
                                        <div style={{ fontSize: '14px', fontWeight: 800, color: '#1e293b', textTransform: 'capitalize' }}>{block.type} Element</div>
                                    </div>

                                    {(block.type === 'heading' || block.type === 'text') && (
                                        <>
                                            <span className="prop-label">Text Content</span>
                                            <textarea className="prop-input" rows={6} value={block.content.text} onChange={e => updateBlockContent(block.id, { text: e.target.value })} />
                                        </>
                                    )}

                                    {block.type === 'button' && (
                                        <>
                                            <span className="prop-label">Label</span>
                                            <input className="prop-input" value={block.content.label} onChange={e => updateBlockContent(block.id, { label: e.target.value })} />
                                            <span className="prop-label">Link URL</span>
                                            <input className="prop-input" value={block.content.url} onChange={e => updateBlockContent(block.id, { url: e.target.value })} />
                                        </>
                                    )}

                                    {block.type === 'coupon' && (
                                        <>
                                            <span className="prop-label">Coupon Code</span>
                                            <input className="prop-input" value={block.content.code} onChange={e => updateBlockContent(block.id, { code: e.target.value })} />
                                        </>
                                    )}

                                    <span className="prop-label">Alignment</span>
                                    <div style={{ display: 'flex', gap: '8px', marginBottom: '24px' }}>
                                        {['left', 'center', 'right'].map(align => (
                                            <button 
                                                key={align} 
                                                className="tool-btn" 
                                                style={{ flex: 1, borderColor: block.style?.textAlign === align ? '#6366f1' : '#e2e8f0', background: block.style?.textAlign === align ? '#f0f7ff' : 'white' }}
                                                onClick={() => updateBlockStyle(block.id, { textAlign: align })}
                                            >
                                                {align[0].toUpperCase()}
                                            </button>
                                        ))}
                                    </div>

                                    <button className="btn-save" style={{ width: '100%', justifyContent: 'center' }} onClick={() => setSelectedBlockId(null)}>
                                        Complete
                                    </button>
                                </div>
                            );
                        })()
                    ) : (
                        <div>
                            <p style={{ fontSize: '13px', color: '#94a3b8' }}>Select an element on the canvas to edit its properties.</p>
                            
                            <hr style={{ border: 0, borderTop: '1px solid #f1f5f9', margin: '32px 0' }} />
                            
                            <div style={{ background: '#fdf2f2', padding: '16px', borderRadius: '12px', border: '1px solid #fee2e2' }}>
                                <div style={{ fontWeight: 800, fontSize: '11px', color: '#ef4444', textTransform: 'uppercase', marginBottom: '8px' }}>Danger Zone</div>
                                <fetcher.Form method="post">
                                    <input type="hidden" name="action" value="delete" />
                                    <button type="submit" style={{ width: '100%', padding: '10px', background: 'white', border: '1px solid #fee2e2', borderRadius: '8px', color: '#ef4444', fontWeight: 700, cursor: 'pointer' }} onClick={e => { if(!confirm("Delete this template?")) e.preventDefault(); }}>
                                        Delete Template
                                    </button>
                                </fetcher.Form>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

// Helpers
function getDefaultContent(type: EmailBlockType) {
    switch(type) {
        case 'header': return { logoText: 'My Brand' };
        case 'heading': return { text: 'New Campaign' };
        case 'text': return { text: 'Write your email content here...' };
        case 'button': return { label: 'Click Here', url: '#' };
        case 'coupon': return { code: 'WELCOME20' };
        case 'footer': return { text: '&copy; 2024 My Store. All rights reserved.' };
        default: return {};
    }
}

function getDefaultStyle(type: EmailBlockType) {
    if (type === 'button') return { buttonColor: '#6366f1', textAlign: 'center' };
    if (type === 'heading') return { fontSize: '24px', textAlign: 'left', color: '#1e293b' };
    return { textAlign: 'left' };
}

function renderBlockPreview(block: EmailBlock): string {
    const { type, content } = block;
    const style = block.style || {};
    switch(type) {
        case 'header': 
            return `<div style="padding: 24px; text-align: center; border-bottom: 2px solid #6366f1; color: #6366f1; font-weight: 900; font-size: 20px;">${content.logoText || 'LOGO'}</div>`;
        case 'heading':
            return `<div style="padding: 24px 40px; font-size: 24px; font-weight: 800; text-align: ${style.textAlign || 'left'}; color: #1e293b;">${content.text}</div>`;
        case 'text':
            return `<div style="padding: 10px 40px 24px; font-size: 15px; line-height: 1.6; color: #475569; text-align: ${style.textAlign || 'left'};">${content.text.replace(/\n/g, '<br>')}</div>`;
        case 'button':
            return `<div style="padding: 24px; text-align: ${style.textAlign || 'center'}"><div style="background: ${style.buttonColor || '#6366f1'}; color: white; padding: 12px 32px; border-radius: 8px; font-weight: 700; display: inline-block;">${content.label}</div></div>`;
        case 'divider':
            return `<div style="padding: 20px 40px;"><hr style="border: 0; border-top: 1px solid #f1f5f9;"></div>`;
        case 'coupon':
            return `<div style="padding: 24px 40px;"><div style="background: #fdfdfd; border: 2px dashed #6366f1; padding: 24px; text-align: center; font-size: 24px; font-weight: 900; color: #6366f1; letter-spacing: 2px;">${content.code}</div></div>`;
        case 'hero':
            return `<div style="padding: 0; text-align: center;"><img src="https://via.placeholder.com/600x300?text=Banner+Image" style="width: 100%; max-width: 600px; display: block;" /></div>`;
        case 'footer':
            return `<div style="padding: 40px; background: #f8fafc; text-align: center; color: #94a3b8; font-size: 11px;">${content.text}</div>`;
        default: return "";
    }
}

import type { LoaderFunctionArgs, ActionFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData, useFetcher } from "@remix-run/react";
import { useState, useMemo, useEffect } from "react";
import prisma from "../db.server";
import { requireAdminAuth } from "../utils/admin.session.server";
import { sendAdminEmail } from "../utils/email.server";
import { unauthenticated } from "../shopify.server";
import { 
    Search, 
    Mail, 
    Layers, 
    Check, 
    Send, 
    Monitor, 
    Smartphone, 
    Layout,
    AlertCircle,
    Info
} from "lucide-react";

// Sample templates
import { getWelcomeEmailHtml, getLimit80EmailHtml, getLimit100EmailHtml } from "../utils/email-templates";

const PROMO_TEMPLATE = `<div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #e1e1e1; border-radius: 8px; overflow: hidden;">
    <div style="background-color: #6366f1; padding: 20px; text-align: center;">
        <h1 style="color: white; margin: 0;">Special Offer for You!</h1>
    </div>
    <div style="padding: 30px; line-height: 1.6; color: #333;">
        <p>Hi there,</p>
        <p>Unlock new features and boost your international sales with Geo: Redirect & Country Block.</p>
        <p>For a limited time, upgrade your plan and enjoy premium benefits.</p>
        <div style="text-align: center; margin: 30px 0;">
            <a href="#" style="background-color: #6366f1; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; font-weight: bold;">Upgrade Now</a>
        </div>
        <p>Best regards,<br>The Geo Support Team</p>
    </div>
</div>`;

export const loader = async ({ request }: LoaderFunctionArgs) => {
    await requireAdminAuth(request);

    // Fetch shops
    const shops = await prisma.session.findMany({ select: { shop: true, email: true }, distinct: ['shop'] });
    const settings = await prisma.settings.findMany({ select: { shop: true, currentPlan: true } });

    const shopMap = await Promise.all(shops.map(async s => {
        let email = s.email;

        // Auto-heal missing emails using Shopify GraphQL API
        if (!email) {
            try {
                const { admin } = await unauthenticated.admin(s.shop);
                if (admin) {
                    const response = await admin.graphql(`query { shop { email } }`);
                    const data = await response.json();
                    email = data?.data?.shop?.email;
                    
                    if (email) {
                        await prisma.session.updateMany({ where: { shop: s.shop }, data: { email } });
                    }
                }
            } catch (e) {
                console.error(`[EmailSync] Failed to fetch email for ${s.shop}:`, e);
            }
        }

        const setting = settings.find(st => st.shop === s.shop);
        return {
            ...s,
            email,
            plan: setting?.currentPlan || 'free'
        };
    }));

    return json({ shops: shopMap });
};

export const action = async ({ request }: ActionFunctionArgs) => {
    await requireAdminAuth(request);
    const formData = await request.formData();
    
    const selectedShops = formData.getAll("selectedShops") as string[];
    const subject = formData.get("subject") as string;
    const html = formData.get("body") as string;

    if (!selectedShops.length || !subject || !html) {
        return json({ success: false, error: "Missing required fields (Shops, Subject, or HTML Body)." }, { status: 400 });
    }

    const results = [];
    for (const shop of selectedShops) {
        const res = await sendAdminEmail({
            shop,
            type: 'manual',
            subject,
            html
        });
        results.push({ shop, ...res });
    }

    const successCount = results.filter(r => r.success).length;
    return json({ success: true, message: `Successfully sent to ${successCount} out of ${selectedShops.length} shops.` });
};

export default function EmailComposer() {
    const { shops } = useLoaderData<typeof loader>();
    const fetcher = useFetcher<typeof action>();
    
    const [filterPlan, setFilterPlan] = useState("all");
    const [searchTerm, setSearchTerm] = useState("");
    const [selectedShops, setSelectedShops] = useState<string[]>([]);
    
    const [subject, setSubject] = useState("");
    const [body, setBody] = useState("");
    const [selectedTemplate, setSelectedTemplate] = useState("custom");
    const [previewMode, setPreviewMode] = useState<'desktop' | 'mobile'>('desktop');

    // Filter & Search logic
    const displayedShops = useMemo(() => {
        let filtered = shops;
        if (filterPlan !== "all") {
            filtered = filtered.filter(s => s.plan.toLowerCase() === filterPlan.toLowerCase());
        }
        if (searchTerm) {
            filtered = filtered.filter(s => 
                s.shop.toLowerCase().includes(searchTerm.toLowerCase()) || 
                (s.email && s.email.toLowerCase().includes(searchTerm.toLowerCase()))
            );
        }
        return filtered;
    }, [shops, filterPlan, searchTerm]);

    // Handle template selection
    useEffect(() => {
        switch(selectedTemplate) {
            case 'welcome':
                setSubject("Welcome to Geo: Redirect & Country Block!");
                setBody(getWelcomeEmailHtml('example.myshopify.com'));
                break;
            case 'limit80':
                setSubject("Usage Warning: Geo: Redirect & Country Block");
                setBody(getLimit80EmailHtml('example.myshopify.com', 8000, 10000));
                break;
            case 'promo':
                setSubject("Special Offer inside!");
                setBody(PROMO_TEMPLATE);
                break;
            case 'custom':
                if(body === getWelcomeEmailHtml('example.myshopify.com') || body === PROMO_TEMPLATE || body.includes("Usage Warning")) {
                    setBody("");
                    setSubject("");
                }
                break;
        }
    }, [selectedTemplate]);

    const handleSelectAll = (checked: boolean) => {
        if (checked) {
            const allAvailable = displayedShops.map(s => s.shop);
            setSelectedShops(Array.from(new Set([...selectedShops, ...allAvailable])));
        } else {
            const displayedShopKeys = new Set(displayedShops.map(s => s.shop));
            setSelectedShops(selectedShops.filter(s => !displayedShopKeys.has(s)));
        }
    };

    const toggleShop = (shop: string) => {
        if (selectedShops.includes(shop)) {
            setSelectedShops(selectedShops.filter(s => s !== shop));
        } else {
            setSelectedShops([...selectedShops, shop]);
        }
    };

    const isSending = fetcher.state === "submitting" || fetcher.state === "loading";
    const allDisplayedSelected = displayedShops.length > 0 && displayedShops.every(s => selectedShops.includes(s.shop));

    const fetcherData = fetcher.data as { success?: boolean; message?: string; error?: string } | undefined;

    return (
        <div className="composer-container">
            <style>{`
                .composer-container {
                    display: grid;
                    grid-template-columns: 460px 1fr;
                    height: calc(100vh - 180px);
                    background: #f8fafc;
                }
                
                .editor-sidebar {
                    background: white;
                    border-right: 1px solid rgba(0,0,0,0.06);
                    display: flex;
                    flex-direction: column;
                    overflow: hidden;
                    box-shadow: 10px 0 30px rgba(0,0,0,0.02);
                }
                
                .editor-content {
                    flex: 1;
                    overflow-y: auto;
                    padding: 32px;
                }
                
                .section-label {
                    display: flex;
                    align-items: center;
                    gap: 8px;
                    font-size: 11px;
                    font-weight: 800;
                    color: #94a3b8;
                    text-transform: uppercase;
                    letter-spacing: 0.1em;
                    margin-bottom: 20px;
                }
                
                .search-pill {
                    display: flex;
                    align-items: center;
                    background: #f1f5f9;
                    border-radius: 12px;
                    padding: 8px 16px;
                    margin-bottom: 16px;
                    border: 1px solid transparent;
                    transition: all 0.2s;
                }
                .search-pill:focus-within {
                    background: white;
                    border-color: var(--primary);
                    box-shadow: 0 0 0 4px rgba(99, 102, 241, 0.1);
                }
                .search-pill input {
                    background: transparent;
                    border: none;
                    outline: none;
                    width: 100%;
                    font-size: 14px;
                    margin-left: 10px;
                    color: #1e293b;
                }
                
                .plan-filters {
                    display: flex;
                    gap: 6px;
                    margin-bottom: 20px;
                    overflow-x: auto;
                    padding-bottom: 4px;
                }
                .plan-filters::-webkit-scrollbar { display: none; }
                
                .plan-chip {
                    padding: 6px 14px;
                    border-radius: 20px;
                    font-size: 12px;
                    font-weight: 700;
                    cursor: pointer;
                    white-space: nowrap;
                    transition: all 0.2s;
                    background: #f1f5f9;
                    color: #64748b;
                    border: 1px solid transparent;
                }
                .plan-chip.active {
                    background: #f0f7ff;
                    color: var(--primary);
                    border-color: rgba(99, 102, 241, 0.2);
                }
                
                .audience-list {
                    background: #f8fafc;
                    border-radius: 16px;
                    border: 1px solid rgba(0,0,0,0.05);
                    max-height: 280px;
                    overflow-y: auto;
                    margin-bottom: 32px;
                }
                
                .audience-item {
                    display: flex;
                    align-items: center;
                    padding: 12px 16px;
                    gap: 12px;
                    border-bottom: 1px solid rgba(0,0,0,0.03);
                    cursor: pointer;
                    transition: background 0.2s;
                }
                .audience-item:hover { background: white; }
                .audience-item:last-child { border-bottom: none; }
                
                .shop-avatar {
                    width: 32px;
                    height: 32px;
                    border-radius: 8px;
                    background: linear-gradient(135deg, #6366f1 0%, #a855f7 100%);
                    color: white;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    font-size: 10px;
                    font-weight: 800;
                    flex-shrink: 0;
                }
                
                .audience-info { flex: 1; min-width: 0; }
                .audience-name { font-size: 13px; font-weight: 700; color: #1e293b; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
                .audience-sub { font-size: 11px; color: #94a3b8; }
                
                .audience-check {
                    width: 20px;
                    height: 20px;
                    border-radius: 6px;
                    border: 2px solid #e2e8f0;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    transition: all 0.2s;
                }
                .audience-item.active .audience-check {
                    background: var(--primary);
                    border-color: var(--primary);
                    color: white;
                }
                
                .form-control-group { margin-bottom: 24px; }
                .form-control-group label {
                    display: block;
                    font-size: 13px;
                    font-weight: 700;
                    color: #475569;
                    margin-bottom: 8px;
                }
                .form-control-group input, 
                .form-control-group select,
                .form-control-group textarea {
                    width: 100%;
                    padding: 12px 16px;
                    border: 1.5px solid #e2e8f0;
                    border-radius: 12px;
                    font-size: 14px;
                    color: #1e293b;
                    transition: all 0.2s;
                    background: #f8fafc;
                }
                .form-control-group input:focus, 
                .form-control-group select:focus,
                .form-control-group textarea:focus {
                    border-color: var(--primary);
                    background: white;
                    outline: none;
                }
                
                .modern-editor {
                    font-family: 'JetBrains Mono', 'Fira Code', monospace;
                    font-size: 13px;
                    min-height: 250px;
                    background: #0f172a !important;
                    color: #94a3b8 !important;
                    line-height: 1.6;
                    border: none !important;
                }
                
                .footer-actions {
                    padding: 24px 32px;
                    background: white;
                    border-top: 1px solid rgba(0,0,0,0.06);
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                }
                
                /* Preview Panel */
                .preview-viewport {
                    padding: 60px;
                    background: linear-gradient(135deg, #f1f5f9 0%, #e2e8f0 100%);
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    overflow-y: auto;
                }
                
                .preview-controls {
                    display: flex;
                    gap: 8px;
                    background: white;
                    padding: 6px;
                    border-radius: 12px;
                    margin-bottom: 40px;
                    box-shadow: 0 10px 15px -3px rgba(0,0,0,0.1);
                }
                
                .control-btn {
                    padding: 8px 16px;
                    border-radius: 8px;
                    border: none;
                    background: transparent;
                    color: #64748b;
                    cursor: pointer;
                    display: flex;
                    align-items: center;
                    gap: 8px;
                    font-size: 13px;
                    font-weight: 700;
                    transition: all 0.2s;
                }
                .control-btn.active {
                    background: #f1f5f9;
                    color: #0f172a;
                }
                
                .mac-window {
                    width: 100%;
                    background: white;
                    border-radius: 16px;
                    box-shadow: 0 50px 100px -20px rgba(50, 50, 93, 0.25), 0 30px 60px -30px rgba(0, 0, 0, 0.3);
                    overflow: hidden;
                    display: flex;
                    flex-direction: column;
                    max-height: 75vh;
                    transition: all 0.5s cubic-bezier(0.4, 0, 0.2, 1);
                }
                
                .mac-titlebar {
                    background: #f8fafc;
                    height: 48px;
                    display: flex;
                    align-items: center;
                    padding: 0 20px;
                    border-bottom: 1px solid rgba(0,0,0,0.05);
                }
                
                .mac-dots { display: flex; gap: 8px; }
                .mac-dot { width: 12px; height: 12px; border-radius: 50%; }
                .dot-red { background: #ff5f56; }
                .dot-yellow { background: #ffbd2e; }
                .dot-green { background: #27c93f; }
                
                .mac-url {
                    flex: 1;
                    text-align: center;
                    font-size: 12px;
                    font-weight: 600;
                    color: #94a3b8;
                    margin-left: -50px;
                }
                
                .preview-frame-content {
                    padding: 0;
                    flex: 1;
                    overflow-y: auto;
                    background: white;
                    min-height: 400px;
                }
                
                .preview-email-header {
                    padding: 30px 40px;
                    border-bottom: 1px dashed #e2e8f0;
                }
                .preview-subj { font-size: 20px; font-weight: 800; color: #0f172a; margin-bottom: 12px; }
                .preview-from { display: flex; align-items: center; gap: 10px; font-size: 13px; color: #64748b; }
                
                .btn-submit-premium {
                    background: linear-gradient(135deg, #6366f1 0%, #4f46e5 100%);
                    color: white;
                    border: none;
                    padding: 14px 32px;
                    border-radius: 14px;
                    font-weight: 700;
                    font-size: 15px;
                    cursor: pointer;
                    display: flex;
                    align-items: center;
                    gap: 12px;
                    box-shadow: 0 10px 15px -3px rgba(79, 70, 229, 0.3);
                    transition: all 0.3s;
                }
                .btn-submit-premium:hover {
                    transform: translateY(-2px);
                    box-shadow: 0 20px 25px -5px rgba(79, 70, 229, 0.4);
                }
                .btn-submit-premium:disabled {
                    background: #cbd5e1;
                    box-shadow: none;
                    cursor: not-allowed;
                    transform: none;
                }

                @media (max-width: 1024px) {
                    .composer-container { grid-template-columns: 1fr; height: auto; }
                    .editor-sidebar { border-right: none; }
                }
            `}</style>

            <div className="editor-sidebar">
                <div className="editor-content">
                    {fetcherData?.message || fetcherData?.error ? (
                        <div style={{ 
                            padding: '16px', 
                            borderRadius: '12px', 
                            background: fetcherData.success ? '#f0fdf4' : '#fef2f2', 
                            color: fetcherData.success ? '#16a34a' : '#dc2626',
                            border: '1px solid',
                            borderColor: fetcherData.success ? '#bbf7d0' : '#fecaca',
                            fontSize: '14px',
                            fontWeight: 600,
                            marginBottom: '24px',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '10px'
                        }}>
                            <Info size={18} />
                            <span>{fetcherData.message || fetcherData.error}</span>
                        </div>
                    ) : null}

                    <fetcher.Form id="email-form" method="post">
                        <div className="section-label"><Layers size={14} /> 1. Selected Audience</div>
                        
                        <div className="search-pill">
                            <Search size={16} color="#94a3b8" />
                            <input 
                                type="text" 
                                placeholder="Search by shop URL or email..." 
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                            />
                        </div>

                        <div className="plan-filters">
                            <div className={`plan-chip ${filterPlan === 'all' ? 'active' : ''}`} onClick={() => setFilterPlan('all')}>All Shops</div>
                            <div className={`plan-chip ${filterPlan === 'free' ? 'active' : ''}`} onClick={() => setFilterPlan('free')}>Free</div>
                            <div className={`plan-chip ${filterPlan === 'premium' ? 'active' : ''}`} onClick={() => setFilterPlan('premium')}>Premium</div>
                            <div className={`plan-chip ${filterPlan === 'plus' ? 'active' : ''}`} onClick={() => setFilterPlan('plus')}>Plus</div>
                        </div>

                        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0 8px 12px' }}>
                            <span style={{ fontSize: '12px', fontWeight: 700, color: '#64748b' }}>{displayedShops.length} Found</span>
                            <label style={{ fontSize: '12px', fontWeight: 800, color: 'var(--primary)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                <input type="checkbox" checked={allDisplayedSelected} onChange={(e) => handleSelectAll(e.target.checked)} />
                                Select Displayed
                            </label>
                        </div>

                        <div className="audience-list">
                            {displayedShops.map(s => (
                                <div key={s.shop} className={`audience-item ${selectedShops.includes(s.shop) ? 'active' : ''}`} onClick={() => toggleShop(s.shop)}>
                                    <div className="shop-avatar">{s.shop.slice(0, 2).toUpperCase()}</div>
                                    <div className="audience-info">
                                        <div className="audience-name">{s.shop}</div>
                                        <div className="audience-sub">{s.email || "No direct email"}</div>
                                    </div>
                                    <div className="audience-check">
                                        {selectedShops.includes(s.shop) && <Check size={14} />}
                                    </div>
                                    <input type="hidden" name="selectedShops" value={s.shop} disabled={!selectedShops.includes(s.shop)} />
                                </div>
                            ))}
                        </div>

                        <div className="section-label"><Mail size={14} /> 2. Campaign Content</div>

                        <div className="form-control-group">
                            <label>Design Template</label>
                            <select value={selectedTemplate} onChange={(e) => setSelectedTemplate(e.target.value)}>
                                <option value="custom">Blank Canvas (Custom HTML)</option>
                                <option value="welcome">Onboarding Welcome Email</option>
                                <option value="promo">Feature Upgrade Promotion</option>
                                <option value="limit80">System Alert: 80% Usage</option>
                            </select>
                        </div>

                        <div className="form-control-group">
                            <label>Subject Line</label>
                            <input 
                                type="text" 
                                name="subject" 
                                value={subject} 
                                onChange={(e) => setSubject(e.target.value)}
                                placeholder="What will they see in their inbox?" 
                                required 
                            />
                        </div>

                        <div className="form-control-group" style={{ marginBottom: 0 }}>
                            <label>Markup Content (HTML)</label>
                            <textarea
                                className="modern-editor"
                                name="body"
                                value={body}
                                onChange={(e) => setBody(e.target.value)}
                                placeholder="Paste your HTML build here..."
                                required
                            />
                        </div>
                    </fetcher.Form>
                </div>

                <div className="footer-actions">
                    <div style={{ flex: 1 }}>
                        <div style={{ fontSize: '15px', fontWeight: 800, color: '#1e293b' }}>{selectedShops.length} Recipients</div>
                        <div style={{ fontSize: '12px', color: '#94a3b8', fontWeight: 600 }}>Queued for delivery</div>
                    </div>
                    <button 
                        type="submit" 
                        form="email-form" 
                        className="btn-submit-premium"
                        disabled={isSending || selectedShops.length === 0 || !subject || !body}
                    >
                        {isSending ? "Processing..." : "Launch Campaign"}
                        <Send size={18} />
                    </button>
                </div>
            </div>

            <div className="preview-viewport">
                <div className="preview-controls">
                    <button className={`control-btn ${previewMode === 'desktop' ? 'active' : ''}`} onClick={() => setPreviewMode('desktop')}>
                        <Monitor size={16} /> Desktop
                    </button>
                    <button className={`control-btn ${previewMode === 'mobile' ? 'active' : ''}`} onClick={() => setPreviewMode('mobile')}>
                        <Smartphone size={16} /> Mobile
                    </button>
                </div>

                <div className="mac-window" style={{ maxWidth: previewMode === 'mobile' ? '375px' : '700px' }}>
                    <div className="mac-titlebar">
                        <div className="mac-dots">
                            <div className="mac-dot dot-red"></div>
                            <div className="mac-dot dot-yellow"></div>
                            <div className="mac-dot dot-green"></div>
                        </div>
                        <div className="mac-url">Draft Campaign Preview</div>
                    </div>
                    <div className="preview-frame-content">
                        <div className="preview-email-header">
                            <div className="preview-subj">{subject || "Add a subject line..."}</div>
                            <div className="preview-from">
                                <div style={{ width: 24, height: 24, borderRadius: '50%', background: '#6366f1', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontSize: 10, fontWeight: 800 }}>G</div>
                                <span><strong>Geo: Redirect & Country Block</strong> &lt;send@geopro.bluepeaks.top&gt;</span>
                            </div>
                        </div>
                        <div 
                            style={{ padding: previewMode === 'mobile' ? '20px' : '40px' }}
                            dangerouslySetInnerHTML={{ __html: body || "<div style='color: #94a3b8; font-style: italic; text-align: center; padding: 100px 0;'>Select a template or start writing HTML to see a preview.</div>" }}
                        />
                    </div>
                </div>

                <div style={{ marginTop: '40px', display: 'flex', gap: '32px', color: '#64748b', fontSize: '13px', fontWeight: 600 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}><Layout size={16} /> Fully Responsive</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}><AlertCircle size={16} /> Verified Markup</div>
                </div>
            </div>
        </div>
    );
}

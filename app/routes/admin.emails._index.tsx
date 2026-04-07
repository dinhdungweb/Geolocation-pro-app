import type { LoaderFunctionArgs, ActionFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData, useFetcher, useNavigation } from "@remix-run/react";
import { useState, useMemo, useEffect } from "react";
import prisma from "../db.server";
import { requireAdminAuth } from "../utils/admin.session.server";
import { sendAdminEmail } from "../utils/email.server";
import { unauthenticated } from "../shopify.server";

// Sample templates
import { getWelcomeEmailHtml, getLimit80EmailHtml, getLimit100EmailHtml } from "../utils/email-templates";

const PROMO_TEMPLATE = `<div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #e1e1e1; border-radius: 8px; overflow: hidden;">
    <div style="background-color: #6366f1; padding: 20px; text-align: center;">
        <h1 style="color: white; margin: 0;">Special Offer for You!</h1>
    </div>
    <div style="padding: 30px; line-height: 1.6; color: #333;">
        <p>Hi there,</p>
        <p>Unlock new features and boost your international sales with GeoPro Plus.</p>
        <p>For a limited time, upgrade your plan and enjoy premium benefits.</p>
        <div style="text-align: center; margin: 30px 0;">
            <a href="#" style="background-color: #6366f1; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; font-weight: bold;">Upgrade Now</a>
        </div>
        <p>Best regards,<br>The GeoPro Team</p>
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
    const navigation = useNavigation();
    
    const [filterPlan, setFilterPlan] = useState("all"); // 'all', 'free', 'premium', 'plus'
    const [selectedShops, setSelectedShops] = useState<string[]>([]);
    
    const [subject, setSubject] = useState("");
    const [body, setBody] = useState("");
    const [selectedTemplate, setSelectedTemplate] = useState("custom");

    // Filter logic
    const displayedShops = useMemo(() => {
        if (filterPlan === "all") return shops;
        return shops.filter(s => s.plan.toLowerCase() === filterPlan.toLowerCase());
    }, [shops, filterPlan]);

    // Handle template selection
    useEffect(() => {
        switch(selectedTemplate) {
            case 'welcome':
                setSubject("Welcome to GeoPro Geolocation Redirect!");
                setBody(getWelcomeEmailHtml('example.myshopify.com'));
                break;
            case 'limit80':
                setSubject("Usage Warning: Approaching Plan Limits");
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

    return (
        <div className="composer-wrapper">
            <style>{`
                .composer-wrapper {
                    display: grid;
                    grid-template-columns: 480px 1fr;
                    height: 100%;
                    background: var(--bg);
                }
                
                /* Editor Panel (Left) */
                .editor-panel {
                    border-right: 1px solid var(--border);
                    background: white;
                    display: flex;
                    flex-direction: column;
                    height: calc(100vh - 160px);
                }
                
                .editor-scroll-area {
                    flex: 1;
                    overflow-y: auto;
                    padding: 24px;
                }
                
                .form-section {
                    margin-bottom: 24px;
                }
                
                .form-section h3 {
                    font-size: 14px;
                    font-weight: 700;
                    margin-bottom: 12px;
                    color: var(--text);
                    text-transform: uppercase;
                    letter-spacing: 0.05em;
                }
                
                .audience-filters {
                    display: flex;
                    gap: 8px;
                    margin-bottom: 12px;
                    flex-wrap: wrap;
                }
                
                .filter-btn {
                    padding: 6px 12px;
                    border: 1px solid var(--border);
                    background: white;
                    border-radius: 20px;
                    font-size: 12px;
                    font-weight: 600;
                    cursor: pointer;
                    color: var(--text-muted);
                    transition: all 0.2s;
                }
                .filter-btn.active {
                    background: #f0f7ff;
                    border-color: var(--primary);
                    color: var(--primary);
                }
                
                .shop-list-container {
                    border: 1px solid var(--border);
                    border-radius: 8px;
                    max-height: 200px;
                    overflow-y: auto;
                }
                
                .shop-row {
                    display: flex;
                    align-items: center;
                    padding: 10px 14px;
                    border-bottom: 1px solid #f1f5f9;
                    cursor: pointer;
                    gap: 12px;
                }
                .shop-row:hover { background: #f8fafc; }
                .shop-row:last-child { border-bottom: none; }
                .shop-info-text { flex: 1; min-width: 0; }
                .shop-name { font-weight: 600; font-size: 13px; color: var(--text); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
                .shop-email { font-size: 11px; color: var(--text-muted); }
                .plan-badge { padding: 2px 6px; background: #e2e8f0; color: #475569; font-size: 10px; font-weight: 700; border-radius: 4px; text-transform: uppercase; }
                
                .field-group { margin-bottom: 16px; }
                .field-group label { display: block; font-size: 13px; font-weight: 600; margin-bottom: 6px; color: var(--text); }
                .field-group input, .field-group select { 
                    width: 100%; padding: 10px 12px; border: 1px solid var(--border); 
                    border-radius: 8px; font-size: 14px; font-family: inherit; 
                    outline: none; transition: border-color 0.2s;
                }
                .field-group input:focus, .field-group select:focus { border-color: var(--primary); }
                
                .code-editor {
                    width: 100%;
                    height: 300px;
                    padding: 16px;
                    background: #1e1e1e;
                    color: #d4d4d4;
                    font-family: 'Consolas', 'Monaco', monospace;
                    font-size: 13px;
                    border-radius: 8px;
                    border: none;
                    resize: vertical;
                    outline: none;
                }
                
                .action-footer {
                    padding: 20px 24px;
                    border-top: 1px solid var(--border);
                    background: #f8fafc;
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                }
                
                .btn-primary {
                    background: var(--primary);
                    color: white;
                    border: none;
                    padding: 12px 24px;
                    border-radius: 8px;
                    font-weight: 600;
                    font-size: 14px;
                    cursor: pointer;
                    transition: opacity 0.2s;
                    display: flex;
                    align-items: center;
                    gap: 8px;
                }
                .btn-primary:hover { opacity: 0.9; }
                .btn-primary:disabled { background: #94a3b8; cursor: not-allowed; }
                
                /* Preview Panel (Right) */
                .preview-panel {
                    padding: 40px;
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    overflow-y: auto;
                    height: calc(100vh - 160px);
                }
                
                .device-frame {
                    width: 100%;
                    max-width: 600px;
                    background: white;
                    border-radius: 12px;
                    box-shadow: 0 20px 40px rgba(0,0,0,0.08);
                    border: 1px solid var(--border);
                    overflow: hidden;
                    display: flex;
                    flex-direction: column;
                    transition: all 0.3s ease;
                }
                
                .device-header {
                    background: #f8fafc;
                    border-bottom: 1px solid var(--border);
                    padding: 16px 20px;
                }
                
                .subject-preview { font-weight: 700; font-size: 16px; color: var(--text); margin-bottom: 4px; }
                .sender-preview { font-size: 13px; color: var(--text-muted); }
                
                .preview-content {
                    padding: 30px;
                    background: white;
                    min-height: 400px;
                }
                
                .notice-box {
                    padding: 16px;
                    border-radius: 8px;
                    background: #e6fcf5;
                    color: #0ca678;
                    border: 1px solid #b2f2bb;
                    margin-bottom: 24px;
                    font-size: 14px;
                    font-weight: 600;
                }

                @media (max-width: 1024px) {
                    .composer-wrapper { grid-template-columns: 400px 1fr; }
                }

                @media (max-width: 850px) {
                    .composer-wrapper { grid-template-columns: 1fr; }
                    .editor-panel { height: auto; border-right: none; }
                    .preview-panel { height: auto; padding: 20px; }
                }
            `}</style>

            {/* Left: Settings & Editor */}
            <div className="editor-panel">
                <div className="editor-scroll-area">
                    {(fetcher.data as any)?.message || (fetcher.data as any)?.error ? (
                        <div className="notice-box" style={{ background: (fetcher.data as any).success ? '#e6fcf5' : '#fff5f5', color: (fetcher.data as any).success ? '#0ca678' : '#fa5252', borderColor: (fetcher.data as any).success ? '#b2f2bb' : '#ffa8a8' }}>
                            {(fetcher.data as any).message || (fetcher.data as any).error}
                        </div>
                    ) : null}

                    <fetcher.Form id="email-form" method="post">
                        <div className="form-section">
                            <h3>1. Select Audience</h3>
                            <div className="audience-filters">
                                <button type="button" className={`filter-btn ${filterPlan === 'all' ? 'active' : ''}`} onClick={() => setFilterPlan('all')}>All Shops</button>
                                <button type="button" className={`filter-btn ${filterPlan === 'free' ? 'active' : ''}`} onClick={() => setFilterPlan('free')}>Free Plan</button>
                                <button type="button" className={`filter-btn ${filterPlan === 'premium' ? 'active' : ''}`} onClick={() => setFilterPlan('premium')}>Premium</button>
                                <button type="button" className={`filter-btn ${filterPlan === 'plus' ? 'active' : ''}`} onClick={() => setFilterPlan('plus')}>Plus</button>
                            </div>
                            
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px', padding: '0 4px' }}>
                                <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Found {displayedShops.length} shops</span>
                                <label style={{ fontSize: '12px', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                    <input 
                                        type="checkbox" 
                                        checked={allDisplayedSelected}
                                        onChange={(e) => handleSelectAll(e.target.checked)}
                                    /> Select All Displayed
                                </label>
                            </div>
                            
                            <div className="shop-list-container">
                                {displayedShops.length > 0 ? displayedShops.map(s => (
                                    <label key={s.shop} className="shop-row">
                                        <input 
                                            type="checkbox" 
                                            name="selectedShops" 
                                            value={s.shop}
                                            checked={selectedShops.includes(s.shop)} 
                                            onChange={() => toggleShop(s.shop)}
                                        />
                                        <div className="shop-info-text">
                                            <div className="shop-name">{s.shop}</div>
                                            <div className="shop-email">{s.email || <span style={{ color: '#ef4444' }}>No email found</span>}</div>
                                        </div>
                                        <div className="plan-badge">{s.plan}</div>
                                    </label>
                                )) : (
                                    <div style={{ padding: '20px', textAlign: 'center', color: '#94a3b8', fontSize: '13px' }}>
                                        No shops match this filter.
                                    </div>
                                )}
                            </div>
                        </div>

                        <div className="form-section">
                            <h3>2. Compose Details</h3>
                            <div className="field-group">
                                <label>Template Preset</label>
                                <select value={selectedTemplate} onChange={(e) => setSelectedTemplate(e.target.value)}>
                                    <option value="custom">Custom HTML</option>
                                    <option value="welcome">Welcome Onboarding</option>
                                    <option value="promo">Promotional Offer</option>
                                    <option value="limit80">Usage Warning (80%)</option>
                                </select>
                            </div>

                            <div className="field-group">
                                <label>Subject Line</label>
                                <input 
                                    type="text" 
                                    name="subject" 
                                    value={subject} 
                                    onChange={(e) => setSubject(e.target.value)}
                                    placeholder="Enter eye-catching subject..." 
                                    required 
                                />
                            </div>

                            <div className="field-group" style={{ marginBottom: 0 }}>
                                <label>HTML Body</label>
                                <textarea
                                    className="code-editor"
                                    name="body"
                                    value={body}
                                    onChange={(e) => setBody(e.target.value)}
                                    placeholder="<h1>Hello World</h1><p>Start coding...</p>"
                                    required
                                />
                                <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '8px', textAlign: 'right' }}>
                                    Standard HTML markup is fully supported.
                                </div>
                            </div>
                        </div>
                    </fetcher.Form>
                </div>
                
                <div className="action-footer">
                    <div>
                        <div style={{ fontSize: '13px', fontWeight: 600 }}>{selectedShops.length} selected</div>
                        <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Ready to launch</div>
                    </div>
                    <button 
                        type="submit" 
                        form="email-form" 
                        className="btn-primary"
                        disabled={isSending || selectedShops.length === 0 || !subject || !body}
                    >
                        {isSending ? "Sending..." : "Send Campaign"}
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="22" y1="2" x2="11" y2="13"></line><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon></svg>
                    </button>
                </div>
            </div>

            {/* Right: Live Preview */}
            <div className="preview-panel">
                <div className="device-frame">
                    <div className="device-header">
                        <div className="subject-preview">{subject || "No Subject provided"}</div>
                        <div className="sender-preview">From: GeoPro Admin &lt;send@geopro.bluepeaks.top&gt;</div>
                    </div>
                    <div 
                        className="preview-content"
                        dangerouslySetInnerHTML={{ __html: body || "<div style='color: #94a3b8; font-style: italic; text-align: center; padding-top: 40px;'>Email preview will appear here...</div>" }}
                    />
                </div>
            </div>
        </div>
    );
}

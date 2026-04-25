import type { LoaderFunctionArgs, ActionFunctionArgs } from "@remix-run/node";
import { json, redirect } from "@remix-run/node";
import { Form, Link, useLoaderData, useActionData, useNavigation } from "@remix-run/react";
import { useState, useEffect } from "react";
import { requireAdminAuth } from "../utils/admin.session.server";
import prisma from "../db.server";
import { FREE_PLAN } from "../billing.config";
import { issueApplicationCredit } from "../utils/billing.server";
import { 
    ArrowLeft, 
    Eye, 
    Zap, 
    ShieldAlert, 
    Store,
    Settings as SettingsIcon,
    History,
    Globe,
    ChevronRight,
    Loader2,
    X,
    Settings2
} from "lucide-react";

export const action = async ({ request, params }: ActionFunctionArgs) => {
    await requireAdminAuth(request);
    const shop = decodeURIComponent(params.shop ?? "");
    const formData = await request.formData();
    const intent = formData.get("intent");

    if (intent === "issue_credit") {
        const amount = parseFloat(formData.get("amount") as string);
        const description = formData.get("description") as string;
        
        if (isNaN(amount) || amount <= 0) {
            return json({ success: false, error: "Invalid amount" }, { status: 400 });
        }

        const result = await issueApplicationCredit(shop, amount, description);
        return json(result);
    }

    if (intent === "adjust_usage") {
        const yearMonth = formData.get("yearMonth") as string;
        const chargedVisitors = parseInt(formData.get("chargedVisitors") as string);

        if (isNaN(chargedVisitors) || !yearMonth) {
            return json({ success: false, error: "Invalid input" }, { status: 400 });
        }

        try {
            await prisma.monthlyUsage.update({
                where: { shop_yearMonth: { shop, yearMonth } },
                data: { chargedVisitors }
            });
            return json({ success: true, message: "Usage adjusted successfully" });
        } catch (e: any) {
            return json({ success: false, error: e.message }, { status: 500 });
        }
    }

    return json({ success: false, error: "Unknown intent" }, { status: 400 });
};

export const loader = async ({ request, params }: LoaderFunctionArgs) => {
    await requireAdminAuth(request);
    const shop = decodeURIComponent(params.shop ?? "");
    if (!shop) throw redirect("/admin");

    const [settings, rules, logs, monthlyUsage] = await Promise.all([
        prisma.settings.findUnique({ where: { shop } }),
        prisma.redirectRule.findMany({
            where: { shop },
            orderBy: { priority: "desc" },
            select: {
                id: true, name: true, matchType: true, ruleType: true,
                isActive: true, priority: true, countryCodes: true, ipAddresses: true,
                scheduleEnabled: true, createdAt: true,
            },
        }),
        prisma.visitorLog.findMany({
            where: { shop },
            orderBy: { timestamp: "desc" },
            take: 100,
            select: {
                id: true, ipAddress: true, countryCode: true, action: true,
                ruleName: true, targetUrl: true, timestamp: true,
            },
        }),
        prisma.monthlyUsage.findMany({
            where: { shop },
            orderBy: { yearMonth: "desc" },
            take: 6,
        }),
    ]);

    const currentPlan = settings?.currentPlan || FREE_PLAN;
    const hasProPlan = currentPlan !== FREE_PLAN;

    const totalVisitors = monthlyUsage.reduce((s: number, u: any) => s + u.totalVisitors, 0);
    const totalRedirected = monthlyUsage.reduce((s: number, u: any) => s + u.redirected, 0);
    const totalBlocked = monthlyUsage.reduce((s: number, u: any) => s + u.blocked, 0);
    const totalPopups = monthlyUsage.reduce((s: number, u: any) => s + (u.popupShown || 0), 0);

    const effectiveActiveRules = rules.filter((r: any) => {
        if (!r.isActive) return false;
        if (!hasProPlan) {
            if (r.matchType === "ip") return false;
            if (r.ruleType === "block") return false;
        }
        return true;
    }).length;

    return json({
        shop,
        hasSettings: !!settings,
        hasProPlan,
        currentPlan,
        settings: settings ? {
            mode: settings.mode,
            template: settings.template,
            excludeBots: settings.excludeBots,
            cookieDuration: settings.cookieDuration,
            createdAt: settings.createdAt.toISOString(),
            updatedAt: settings.updatedAt.toISOString(),
        } : null,
        rules: rules.map((r: any) => ({ ...r, createdAt: r.createdAt.toISOString() })),
        logs: logs.map((l: any) => ({ ...l, timestamp: l.timestamp.toISOString() })),
        monthlyUsage,
        stats: { totalVisitors, totalRedirected, totalBlocked, totalPopups, activeRules: effectiveActiveRules, totalRules: rules.length },
    });
};


export default function AdminShopDetail() {
    const { shop, settings, hasSettings, rules, logs, monthlyUsage, stats, hasProPlan, currentPlan } = useLoaderData<typeof loader>();
    const actionData = useActionData<any>();
    const navigation = useNavigation();
    const isSubmitting = navigation.state === "submitting" || navigation.state === "loading";
    
    const [isModalOpen, setIsModalOpen] = useState(false);

    // Close modal on escape key
    useEffect(() => {
        const handleEsc = (e: KeyboardEvent) => { if (e.key === 'Escape') setIsModalOpen(false); };
        window.addEventListener('keydown', handleEsc);
        return () => window.removeEventListener('keydown', handleEsc);
    }, []);

    // Close modal after successful submission
    useEffect(() => {
        if (actionData?.success && isModalOpen) {
            setIsModalOpen(false);
        }
    }, [actionData, isModalOpen]);

    const formatDate = (iso: string) =>
        new Date(iso).toLocaleString("en-GB", {
            day: "2-digit", month: "short", year: "numeric",
            hour: "2-digit", minute: "2-digit",
        });
    const formatDateShort = (iso: string) =>
        new Date(iso).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });

    const modeColor = (mode: string) => {
        if (mode === "popup") return "#6366f1";
        if (mode === "auto_redirect") return "#10b981";
        return "#64748b";
    };

    const actionColor = (action: string) => {
        const m: Record<string, string> = {
            visit: "#64748b", redirected: "#6366f1", blocked: "#ef4444",
            auto_redirect: "#10b981", popup_show: "#6366f1",
        };
        return m[action] ?? "#64748b";
    };

    const formatListPreview = (value: string | null | undefined, emptyText: string) => {
        const items = (value || "")
            .split(/[\n,]+/)
            .map((item) => item.trim())
            .filter(Boolean);

        if (items.length === 0) return emptyText;
        if (items.length <= 3) return items.join(", ");
        return `${items.slice(0, 3).join(", ")} ... +${items.length - 3} more`;
    };

    const formatRuleMatch = (rule: any) => {
        if (rule.matchType === "ip") {
            return formatListPreview(rule.ipAddresses, "Invalid: no IPs selected");
        }

        if (rule.countryCodes === "*") return "All Countries (*)";
        return formatListPreview(rule.countryCodes, "Invalid: no countries selected");
    };

    return (
        <div className="shop-detail-view">
            <style>{`
                .shop-detail-view { animation: fadeIn 0.4s ease-out; }
                @keyframes fadeIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }

                .back-bar { margin-bottom: 24px; display: flex; justify-content: space-between; align-items: center; }
                .back-btn { 
                    display: inline-flex; align-items: center; gap: 8px; 
                    text-decoration: none; color: #64748b; font-size: 14px; font-weight: 600;
                    padding: 8px 16px; background: white; border-radius: 10px;
                    border: 1px solid #e2e8f0; transition: all 0.2s;
                }
                .back-btn:hover { color: #1e293b; border-color: #cbd5e1; transform: translateX(-4px); }

                .adjust-trigger-btn {
                    display: inline-flex; align-items: center; gap: 8px;
                    padding: 8px 16px; background: #1e293b; color: white;
                    border: none; border-radius: 10px; font-weight: 700; font-size: 13px;
                    cursor: pointer; transition: all 0.2s;
                }
                .adjust-trigger-btn:hover { transform: translateY(-2px); box-shadow: 0 4px 12px rgba(30, 41, 59, 0.2); }

                .hero-section {
                    background: white; border-radius: 24px; padding: 32px;
                    border: 1px solid #e2e8f0; margin-bottom: 32px;
                    display: flex; align-items: center; justify-content: space-between;
                    box-shadow: 0 1px 3px rgba(0,0,0,0.05);
                }
                
                .hero-content { display: flex; align-items: center; gap: 20px; }
                .hero-icon { 
                    width: 64px; height: 64px; border-radius: 18px; 
                    background: #f1f5f9; display: flex; align-items: center; justify-content: center;
                    color: #6366f1; border: 1px solid #e2e8f0;
                }

                .shop-title-group h1 { font-size: 24px; font-weight: 800; color: #1e293b; margin: 0; letter-spacing: -0.02em; }
                .shop-title-group .label { font-size: 13px; color: #94a3b8; font-weight: 600; text-transform: uppercase; margin-bottom: 4px; }
                .shop-link-hover { transition: color 0.2s; cursor: pointer; }
                .shop-link-hover:hover { color: #6366f1; text-decoration: underline; }

                .plan-badge-premium {
                    padding: 8px 16px; border-radius: 12px; font-size: 12px; font-weight: 800;
                    display: flex; align-items: center; gap: 8px;
                    ${(() => {
                        const plan = (currentPlan || 'FREE').toUpperCase();
                        if (plan === 'ELITE') return 'background: linear-gradient(135deg, #f5f3ff 0%, #ede9fe 100%); color: #7c3aed; border: 1px solid #7c3aed33; box-shadow: 0 4px 12px rgba(124, 58, 237, 0.1);';
                        if (plan === 'PLUS') return 'background: linear-gradient(135deg, #ecfdf5 0%, #d1fae5 100%); color: #059669; border: 1px solid #05966933;';
                        if (plan === 'PREMIUM') return 'background: linear-gradient(135deg, #eef2ff 0%, #e0e7ff 100%); color: #4f46e5; border: 1px solid #4f46e533;';
                        return 'background: #f8fafc; color: #64748b; border: 1px solid #e2e8f0;';
                    })()}
                }

                .stats-grid-v3 { 
                    display: grid; 
                    grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); 
                    gap: 20px; 
                    margin-bottom: 32px; 
                }
                
                .premium-stat-card {
                    background: white; border-radius: 20px; padding: 24px;
                    border: 1px solid #e2e8f0; display: flex; align-items: center; gap: 16px;
                    transition: all 0.3s ease;
                }
                
                .stat-card-icon { 
                    width: 48px; height: 48px; border-radius: 14px; 
                    display: flex; align-items: center; justify-content: center;
                }

                .stat-info .label { font-size: 12px; font-weight: 700; color: #94a3b8; text-transform: uppercase; margin-bottom: 4px; }
                .stat-info .value { font-size: 22px; font-weight: 800; color: #1e293b; }

                .section-grid { 
                    display: grid; 
                    grid-template-columns: repeat(auto-fit, minmax(340px, 1fr)); 
                    gap: 24px; 
                    margin-bottom: 32px; 
                }
                
                .card-v3 {
                    background: white; border: 1px solid #e2e8f0; border-radius: 16px; 
                    display: flex; flex-direction: column; overflow: hidden;
                    box-shadow: 0 1px 3px rgba(0,0,0,0.05);
                }
                .card-v3-header { 
                    padding: 16px 20px; border-bottom: 1px solid #f1f5f9; 
                    background: #fcfdfe; font-weight: 700; font-size: 14px; color: #1e293b;
                    display: flex; align-items: center; gap: 10px;
                }
                .card-v3-body { padding: 20px; flex: 1; }

                .info-item { display: flex; justify-content: space-between; padding: 12px 0; border-bottom: 1px solid #f1f5f9; }
                .info-item:last-child { border-bottom: none; }
                .info-item .label { color: #64748b; font-size: 13px; font-weight: 500; }
                .info-item .value { font-weight: 700; font-size: 13px; color: #1e293b; }

                .monthly-list { display: flex; flex-direction: column; gap: 12px; }
                .month-row { display: flex; align-items: center; justify-content: space-between; padding: 12px 16px; background: #f8fafc; border-radius: 12px; border: 1px solid transparent; transition: all 0.2s; }
                .month-row:hover { border-color: #e2e8f0; background: #f1f5f9; }
                .month-name { font-weight: 800; font-size: 14px; color: #6366f1; }
                .month-stats { display: flex; gap: 16px; font-size: 12px; color: #64748b; font-weight: 600; }

                @media (max-width: 768px) {
                    .hero-section { flex-direction: column; align-items: flex-start; gap: 20px; padding: 24px; }
                    .stats-grid-v3 { grid-template-columns: 1fr 1fr; }
                }
                @media (max-width: 480px) {
                    .stats-grid-v3 { grid-template-columns: 1fr; }
                    .month-stats { flex-direction: column; gap: 4px; align-items: flex-end; }
                }

                .table-container { width: 100%; overflow-x: auto; }
                table { width: 100%; border-collapse: collapse; min-width: 600px; }
                th { 
                    text-align: left; padding: 12px 20px; font-size: 11px; 
                    font-weight: 700; color: #94a3b8; text-transform: uppercase; 
                    border-bottom: 1px solid #f1f5f9; background: #fcfdfe; 
                    letter-spacing: 0.05em;
                }
                td { padding: 16px 20px; border-bottom: 1px solid #f1f5f9; font-size: 13px; color: #334155; }
                .badge-v3 { padding: 5px 10px; border-radius: 8px; font-size: 11px; font-weight: 700; display: inline-block; }

                /* Billing Forms */
                .billing-input-group { margin-bottom: 16px; }
                .billing-input-group label { display: block; font-size: 12px; font-weight: 700; color: #64748b; margin-bottom: 6px; text-transform: uppercase; }
                .billing-input { width: 100%; padding: 10px 14px; border-radius: 10px; border: 1px solid #e2e8f0; font-size: 14px; transition: all 0.2s; }
                .billing-input:focus { border-color: #6366f1; outline: none; box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.1); }
                
                .primary-btn { 
                    width: 100%; padding: 12px; background: #6366f1; color: white; border: none; border-radius: 10px;
                    font-weight: 700; font-size: 14px; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 8px;
                    transition: all 0.2s;
                }
                .primary-btn:hover { background: #4f46e5; }
                .primary-btn:disabled { background: #94a3b8; cursor: not-allowed; }

                .alert { padding: 12px 16px; border-radius: 12px; font-size: 13px; font-weight: 500; margin-bottom: 16px; display: flex; align-items: center; gap: 10px; }
                .alert-success { background: #ecfdf5; color: #059669; border: 1px solid #10b98133; }
                .alert-error { background: #fef2f2; color: #ef4444; border: 1px solid #ef444433; }

                /* MODAL STYLES */
                .modal-overlay {
                    position: fixed; inset: 0; background: rgba(15, 23, 42, 0.6);
                    backdrop-filter: blur(4px); z-index: 9999;
                    display: flex; align-items: center; justify-content: center;
                    animation: modalFadeIn 0.2s ease-out;
                }
                .modal-content {
                    background: white; width: 90%; max-width: 500px;
                    border-radius: 24px; overflow: hidden;
                    box-shadow: 0 25px 50px -12px rgba(0,0,0,0.25);
                    animation: modalSlideUp 0.3s cubic-bezier(0.16, 1, 0.3, 1);
                }
                @keyframes modalFadeIn { from { opacity: 0; } to { opacity: 1; } }
                @keyframes modalSlideUp { from { transform: translateY(20px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }

                .modal-header {
                    padding: 24px; border-bottom: 1px solid #f1f5f9;
                    display: flex; align-items: center; justify-content: space-between;
                }
                .modal-title { display: flex; align-items: center; gap: 12px; font-weight: 800; color: #1e293b; font-size: 18px; }
                .modal-close { 
                    background: #f1f5f9; border: none; width: 32px; height: 32px; 
                    border-radius: 50%; display: flex; align-items: center; justify-content: center;
                    color: #64748b; cursor: pointer; transition: all 0.2s;
                }
                .modal-close:hover { background: #e2e8f0; color: #1e293b; }
                .modal-body { padding: 24px; }
            `}</style>

            <div className="back-bar">
                <Link to="/admin/shops" className="back-btn">
                    <ArrowLeft size={16} /> <span>Back to Shops List</span>
                </Link>

                <button className="adjust-trigger-btn" onClick={() => setIsModalOpen(true)}>
                    <Settings2 size={16} />
                    <span>Adjust Monthly Usage</span>
                </button>
            </div>

            {/* Action Feedback Area */}
            {actionData && (
                <div className={`alert ${actionData.success ? 'alert-success' : 'alert-error'}`}>
                    {actionData.success ? <Zap size={16} /> : <ShieldAlert size={16} />}
                    <span>{actionData.success ? (actionData.message || "Action completed successfully") : actionData.error}</span>
                </div>
            )}

            <div className="hero-section">
                <div className="hero-content">
                    <div className="hero-icon">
                        <Store size={32} />
                    </div>
                    <div className="shop-title-group">
                        <div className="label">Managed Store</div>
                        <a href={`https://${shop}`} target="_blank" rel="noopener noreferrer" style={{ textDecoration: 'none' }}>
                            <h1 className="shop-link-hover">{shop}</h1>
                        </a>
                    </div>
                </div>
                <div className="plan-badge-premium">
                    <Zap size={14} fill={hasProPlan ? "#059669" : "none"} />
                    {currentPlan.toUpperCase()}
                </div>
            </div>

            {/* USAGE ADJUSTMENT MODAL */}
            {isModalOpen && (
                <div className="modal-overlay" onClick={() => setIsModalOpen(false)}>
                    <div className="modal-content" onClick={e => e.stopPropagation()}>
                        <div className="modal-header">
                            <div className="modal-title">
                                <History size={20} color="#1e293b" />
                                Adjust Usage Data
                            </div>
                            <button className="modal-close" onClick={() => setIsModalOpen(false)}>
                                <X size={18} />
                            </button>
                        </div>
                        <div className="modal-body">
                            <p style={{ fontSize: '14px', color: '#64748b', marginBottom: '24px', lineHeight: '1.5' }}>
                                Manually update the "Charged Visitors" counter for a specific month in our internal database.
                            </p>
                            <Form method="post">
                                <input type="hidden" name="intent" value="adjust_usage" />
                                <div className="billing-input-group">
                                    <label>Select Month</label>
                                    <select name="yearMonth" className="billing-input" required>
                                        <option value="">-- Select Month --</option>
                                        {monthlyUsage.map((u: any) => (
                                            <option key={u.id} value={u.yearMonth}>{u.yearMonth} (Logged: {u.totalVisitors})</option>
                                        ))}
                                    </select>
                                </div>
                                <div className="billing-input-group">
                                    <label>Set Charged Visitors to:</label>
                                    <input type="number" name="chargedVisitors" placeholder="0" className="billing-input" required />
                                </div>
                                <div style={{ marginTop: '32px' }}>
                                    <button type="submit" className="primary-btn" style={{ background: '#1e293b' }} disabled={isSubmitting}>
                                        {isSubmitting ? <Loader2 className="animate-spin" size={18} /> : <>Update Records <ChevronRight size={16} /></>}
                                    </button>
                                </div>
                            </Form>
                        </div>
                    </div>
                </div>
            )}

            <div className="stats-grid-v3">
                <div className="premium-stat-card">
                    <div className="stat-card-icon" style={{ background: '#e0f2fe', color: '#0ea5e9' }}>
                        <Eye size={22} />
                    </div>
                    <div className="stat-info">
                        <div className="label">Total Views</div>
                        <div className="value">{stats.totalVisitors.toLocaleString()}</div>
                    </div>
                </div>
                <div className="premium-stat-card">
                    <div className="stat-card-icon" style={{ background: '#eef2ff', color: '#6366f1' }}>
                        <Zap size={22} />
                    </div>
                    <div className="stat-info">
                        <div className="label">Redirects</div>
                        <div className="value">{stats.totalRedirected.toLocaleString()}</div>
                    </div>
                </div>
                <div className="premium-stat-card">
                    <div className="stat-card-icon" style={{ background: '#fef2f2', color: '#ef4444' }}>
                        <ShieldAlert size={22} />
                    </div>
                    <div className="stat-info">
                        <div className="label">Blocked</div>
                        <div className="value">{stats.totalBlocked.toLocaleString()}</div>
                    </div>
                </div>
                <div className="premium-stat-card">
                    <div className="stat-card-icon" style={{ background: '#ecfdf5', color: '#10b981' }}>
                        <SettingsIcon size={22} />
                    </div>
                    <div className="stat-info">
                        <div className="label">Active Rules</div>
                        <div className="value">{stats.activeRules}</div>
                    </div>
                </div>
            </div>

            <div className="section-grid">
                <div className="card-v3">
                    <div className="card-v3-header">
                        <SettingsIcon size={18} color="#6366f1" />
                        App Configurations
                    </div>
                    <div className="card-v3-body">
                        {!hasSettings ? (
                            <div style={{ padding: '24px', textAlign: 'center', color: '#f59e0b', fontSize: '13px', fontWeight: 600 }}>
                                <ShieldAlert size={24} style={{ marginBottom: '12px', opacity: 0.5 }} />
                                <div>No settings found for this shop.</div>
                            </div>
                        ) : (
                            <>
                                <div className="info-item">
                                    <span className="label">Operation Mode</span>
                                    <span className="value" style={{ color: modeColor(settings!.mode) }}>{settings!.mode.toUpperCase()}</span>
                                </div>
                                <div className="info-item">
                                    <span className="label">Popup Template</span>
                                    <span className="value">{settings!.template}</span>
                                </div>
                                <div className="info-item">
                                    <span className="label">Exclude Bots</span>
                                    <span className="value">{settings!.excludeBots ? 'YES' : 'NO'}</span>
                                </div>
                                <div className="info-item">
                                    <span className="label">Cookie TTL</span>
                                    <span className="value">{settings!.cookieDuration} Days</span>
                                </div>
                                <div className="info-item">
                                    <span className="label">Installed On</span>
                                    <span className="value">{formatDateShort(settings!.createdAt)}</span>
                                </div>
                            </>
                        )}
                    </div>
                </div>

                <div className="card-v3">
                    <div className="card-v3-header">
                        <History size={18} color="#6366f1" />
                        Monthly Usage History
                    </div>
                    <div className="card-v3-body">
                        <div className="monthly-list">
                            {monthlyUsage.length === 0 ? (
                                <div style={{ color: '#94a3b8', fontSize: '13px', textAlign: 'center', padding: '20px' }}>No usage data recorded.</div>
                            ) : (
                                monthlyUsage.map((u: any) => (
                                    <div className="month-row" key={u.yearMonth}>
                                        <div className="month-name">{u.yearMonth}</div>
                                        <div className="month-stats">
                                            <span><b>{u.totalVisitors.toLocaleString()}</b> views</span>
                                            <span><b>{u.redirected}</b> redirs</span>
                                            <span>(Charged: <b>{u.chargedVisitors.toLocaleString()}</b>)</span>
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>
                </div>
            </div>

            <div className="card-v3" style={{ marginBottom: '32px' }}>
                <div className="card-v3-header">
                    <Zap size={18} color="#6366f1" />
                    Redirect & Block Rules
                </div>
                <div className="table-container">
                    <table>
                        <thead>
                            <tr>
                                <th>Rule Name</th>
                                <th>Match</th>
                                <th>Action</th>
                                <th>Status</th>
                                <th>Priority</th>
                            </tr>
                        </thead>
                        <tbody>
                            {rules.map((r: any) => (
                                <tr key={r.id}>
                                    <td><strong>{r.name}</strong></td>
                                    <td>
                                        <div style={{ fontSize: '11px', color: 'var(--text-muted)', lineHeight: '1.4' }}>
                                            <div style={{ fontWeight: 700, color: 'var(--text)', marginBottom: '2px' }}>{r.matchType.toUpperCase()}</div>
                                            <div style={{ maxWidth: '200px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={formatRuleMatch(r)}>
                                                {formatRuleMatch(r)}
                                            </div>
                                        </div>
                                    </td>
                                    <td><span className="badge-v3" style={{ background: r.ruleType === 'block' ? '#fef2f2' : '#eef2ff', color: r.ruleType === 'block' ? '#ef4444' : '#6366f1' }}>{r.ruleType.toUpperCase()}</span></td>
                                    <td>{r.isActive ? <span style={{ color: '#10b981' }}>● Active</span> : <span style={{ color: '#94a3b8' }}>○ Inactive</span>}</td>
                                    <td>{r.priority}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>

            <div className="card-v3">
                <div className="card-v3-header">
                    <Globe size={18} color="#6366f1" />
                    Live Interaction Logs
                </div>
                <div className="table-container">
                    <table>
                        <thead>
                            <tr>
                                <th>Time</th>
                                <th>Visitor IP</th>
                                <th>Action</th>
                                <th>Rule</th>
                            </tr>
                        </thead>
                        <tbody>
                            {logs.map((l: any) => (
                                <tr key={l.id}>
                                    <td style={{ color: 'var(--text-muted)', fontSize: '12px' }}>{formatDate(l.timestamp)}</td>
                                    <td>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                            {l.countryCode && <img src={`https://flagcdn.com/w40/${l.countryCode.toLowerCase()}.png`} width="16" alt={l.countryCode} />}
                                            <span style={{ fontFamily: 'monospace' }}>{l.ipAddress}</span>
                                        </div>
                                    </td>
                                    <td><span className="badge-v3" style={{ background: `${actionColor(l.action)}15`, color: actionColor(l.action) }}>{l.action.toUpperCase()}</span></td>
                                    <td style={{ color: 'var(--text-muted)' }}>{l.ruleName || '—'}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}

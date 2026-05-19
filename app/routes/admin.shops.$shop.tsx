import type { LoaderFunctionArgs, ActionFunctionArgs } from "@remix-run/node";
import { json, redirect } from "@remix-run/node";
import { Form, Link, useLoaderData, useActionData, useNavigation } from "@remix-run/react";
import { useState, useEffect } from "react";
import { requireAdminAuth } from "../utils/admin.session.server";
import prisma from "../db.server";
import {
    CUSTOM_PLAN,
    DEFAULT_TRIAL_DAYS,
    ELITE_PLAN,
    FREE_PLAN,
    PLUS_PLAN,
    PREMIUM_PLAN,
    UNLIMITED_PLAN,
    hasUnlimitedUsage,
} from "../billing.config";
import { issueApplicationCredit } from "../utils/billing.server";
import {
    hasPaidPlanAccess,
    normalizeBillingOverridePlan,
    resolveEffectivePlan,
} from "../utils/effective-plan.server";
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
    Settings2,
    Gem
} from "lucide-react";

function getYearMonth(date = new Date()) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function getUsageSortTime(usage: any) {
    const periodEnd = usage.billingPeriodEnd ? new Date(usage.billingPeriodEnd).getTime() : NaN;
    if (!Number.isNaN(periodEnd)) return periodEnd;

    const monthStart = new Date(`${usage.yearMonth}-01T00:00:00.000Z`).getTime();
    return Number.isNaN(monthStart) ? 0 : monthStart;
}

function sortUsageRows(rows: any[], currentBillingPeriodKey: string | null | undefined) {
    return [...rows].sort((a, b) => {
        const aCurrent = currentBillingPeriodKey && a.billingPeriodKey === currentBillingPeriodKey;
        const bCurrent = currentBillingPeriodKey && b.billingPeriodKey === currentBillingPeriodKey;
        if (aCurrent !== bCurrent) return aCurrent ? -1 : 1;

        const timeDiff = getUsageSortTime(b) - getUsageSortTime(a);
        if (timeDiff !== 0) return timeDiff;

        const aHasPeriodEnd = Boolean(a.billingPeriodEnd);
        const bHasPeriodEnd = Boolean(b.billingPeriodEnd);
        if (aHasPeriodEnd !== bHasPeriodEnd) return aHasPeriodEnd ? -1 : 1;

        return String(b.billingPeriodKey || b.yearMonth).localeCompare(String(a.billingPeriodKey || a.yearMonth));
    });
}

const BILLING_OVERRIDE_PLAN_OPTIONS = [PREMIUM_PLAN, PLUS_PLAN, ELITE_PLAN, UNLIMITED_PLAN, CUSTOM_PLAN];

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
        const billingPeriodKey = formData.get("billingPeriodKey") as string;
        const chargedVisitors = parseInt(formData.get("chargedVisitors") as string);

        if (isNaN(chargedVisitors) || !billingPeriodKey) {
            return json({ success: false, error: "Invalid input" }, { status: 400 });
        }

        try {
            await prisma.monthlyUsage.update({
                where: { shop_billingPeriodKey: { shop, billingPeriodKey } },
                data: { chargedVisitors }
            });
            return json({ success: true, message: "Usage adjusted successfully" });
        } catch (e: any) {
            return json({ success: false, error: e.message }, { status: 500 });
        }
    }

    if (intent === "save_billing_override") {
        const billingOverrideEnabled = formData.get("billingOverrideEnabled") === "true";
        const billingOverridePlan = normalizeBillingOverridePlan(
            (formData.get("billingOverridePlan") as string) || UNLIMITED_PLAN,
        );
        const billingOverrideReason = ((formData.get("billingOverrideReason") as string) || "").trim();

        if (billingOverrideEnabled && !billingOverridePlan) {
            return json({ success: false, error: "Select a valid override plan" }, { status: 400 });
        }

        try {
            await prisma.settings.upsert({
                where: { shop },
                update: {
                    billingOverrideEnabled,
                    billingOverridePlan: billingOverrideEnabled ? billingOverridePlan : null,
                    billingOverrideReason: billingOverrideEnabled ? billingOverrideReason || null : null,
                },
                create: {
                    shop,
                    billingOverrideEnabled,
                    billingOverridePlan: billingOverrideEnabled ? billingOverridePlan : null,
                    billingOverrideReason: billingOverrideEnabled ? billingOverrideReason || null : null,
                },
            });
            return json({
                success: true,
                message: billingOverrideEnabled
                    ? "Billing override enabled for this shop"
                    : "Billing override disabled for this shop",
            });
        } catch (e: any) {
            return json({ success: false, error: e.message }, { status: 500 });
        }
    }

    if (intent === "save_custom_plan") {
        const customPlanEnabled = formData.get("customPlanEnabled") === "true";
        const customPlanName = ((formData.get("customPlanName") as string) || "Custom plan").trim() || "Custom plan";
        const customPlanPrice = Number(formData.get("customPlanPrice"));
        const visitorLimitInput = ((formData.get("customPlanVisitorLimit") as string) || "").trim();
        const customPlanVisitorLimit = visitorLimitInput ? Number.parseInt(visitorLimitInput, 10) : null;
        const customPlanNoOverage = formData.get("customPlanNoOverage") === "true";
        const customPlanTrialDays = Number.parseInt((formData.get("customPlanTrialDays") as string) || String(DEFAULT_TRIAL_DAYS), 10);

        if (customPlanEnabled && (!Number.isFinite(customPlanPrice) || customPlanPrice <= 0)) {
            return json({ success: false, error: "Custom plan price must be greater than 0" }, { status: 400 });
        }

        if (visitorLimitInput && (customPlanVisitorLimit === null || !Number.isFinite(customPlanVisitorLimit) || customPlanVisitorLimit <= 0)) {
            return json({ success: false, error: "Visitor limit must be a positive number or empty for unlimited" }, { status: 400 });
        }

        if (!customPlanNoOverage && !customPlanVisitorLimit) {
            return json({ success: false, error: "Visitor limit is required when overage billing is enabled" }, { status: 400 });
        }

        if (!Number.isFinite(customPlanTrialDays) || customPlanTrialDays < 0 || customPlanTrialDays > 90) {
            return json({ success: false, error: "Trial days must be between 0 and 90" }, { status: 400 });
        }

        try {
            await prisma.settings.upsert({
                where: { shop },
                update: {
                    customPlanEnabled,
                    customPlanName,
                    customPlanPrice,
                    customPlanVisitorLimit,
                    customPlanNoOverage,
                    customPlanTrialDays,
                    allowUnlimitedPlan: false,
                },
                create: {
                    shop,
                    customPlanEnabled,
                    customPlanName,
                    customPlanPrice,
                    customPlanVisitorLimit,
                    customPlanNoOverage,
                    customPlanTrialDays,
                    allowUnlimitedPlan: false,
                },
            });
            return json({
                success: true,
                message: customPlanEnabled
                    ? "Custom plan saved and made available to this shop"
                    : "Custom plan saved and hidden from this shop",
            });
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

    const settings = await prisma.settings.findUnique({ where: { shop } });
    const currentCalendarKey = `calendar:${getYearMonth()}`;
    const shopifyPlan = settings?.currentPlan || FREE_PLAN;
    const { effectivePlan: currentPlan, isBillingOverridden } = resolveEffectivePlan({
        settings,
        shopifyPlan,
    });
    const hasProPlan = hasPaidPlanAccess(currentPlan);
    const currentBillingPeriodKey = !settings || currentPlan === FREE_PLAN || hasUnlimitedUsage(currentPlan, settings)
        ? currentCalendarKey
        : settings.billingPeriodKey || currentCalendarKey;

    const [rules, logs, recentUsage, currentPeriodUsage] = await Promise.all([
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
                userAgent: true, path: true,
            },
        }),
        prisma.monthlyUsage.findMany({
            where: { shop },
            orderBy: [
                { yearMonth: "desc" },
                { createdAt: "desc" },
            ],
            take: 12,
        }),
        prisma.monthlyUsage.findUnique({
            where: {
                shop_billingPeriodKey: {
                    shop,
                    billingPeriodKey: currentBillingPeriodKey,
                },
            },
        }),
    ]);
    const usageByKey = new Map<string, any>();
    (recentUsage as any[]).forEach((usage) => usageByKey.set(usage.billingPeriodKey, usage));
    if (currentPeriodUsage) usageByKey.set((currentPeriodUsage as any).billingPeriodKey, currentPeriodUsage);
    const monthlyUsage = sortUsageRows(Array.from(usageByKey.values()), currentBillingPeriodKey).slice(0, 6);

    const currentUsage =
        monthlyUsage.find((u: any) => u.billingPeriodKey === currentBillingPeriodKey) ||
        monthlyUsage[0] ||
        null;

    const totalVisitors = currentUsage?.totalVisitors || 0;
    const totalRedirected = currentUsage?.redirected || 0;
    const totalBlocked = currentUsage?.blocked || 0;
    const totalPopups = currentUsage?.popupShown || 0;

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
        shopifyPlan,
        isBillingOverridden,
        settings: settings ? {
            mode: settings.mode,
            template: settings.template,
            excludeBots: settings.excludeBots,
            cookieDuration: settings.cookieDuration,
            allowUnlimitedPlan: settings.allowUnlimitedPlan,
            billingOverrideEnabled: settings.billingOverrideEnabled,
            billingOverridePlan: settings.billingOverridePlan,
            billingOverrideReason: settings.billingOverrideReason,
            customPlanEnabled: settings.customPlanEnabled,
            customPlanName: settings.customPlanName,
            customPlanPrice: settings.customPlanPrice.toString(),
            customPlanVisitorLimit: settings.customPlanVisitorLimit,
            customPlanNoOverage: settings.customPlanNoOverage,
            customPlanTrialDays: settings.customPlanTrialDays,
            billingPeriodKey: settings.billingPeriodKey,
            billingPeriodEnd: settings.billingPeriodEnd?.toISOString() || null,
            createdAt: settings.createdAt.toISOString(),
            updatedAt: settings.updatedAt.toISOString(),
        } : null,
        rules: rules.map((r: any) => ({ ...r, createdAt: r.createdAt.toISOString() })),
        logs: logs.map((l: any) => ({ ...l, timestamp: l.timestamp.toISOString() })),
        monthlyUsage,
        stats: {
            totalVisitors,
            totalRedirected,
            totalBlocked,
            totalPopups,
            activeRules: effectiveActiveRules,
            totalRules: rules.length,
        },
    });
};


export default function AdminShopDetail() {
    const { shop, settings, hasSettings, rules, logs, monthlyUsage, stats, hasProPlan, currentPlan, shopifyPlan, isBillingOverridden } = useLoaderData<typeof loader>();
    const actionData = useActionData<any>();
    const navigation = useNavigation();
    const isSubmitting = navigation.state === "submitting" || navigation.state === "loading";
    
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [isCustomPlanModalOpen, setIsCustomPlanModalOpen] = useState(false);
    const [isBillingOverrideModalOpen, setIsBillingOverrideModalOpen] = useState(false);

    // Close modal on escape key
    useEffect(() => {
        const handleEsc = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                setIsModalOpen(false);
                setIsCustomPlanModalOpen(false);
                setIsBillingOverrideModalOpen(false);
            }
        };
        window.addEventListener('keydown', handleEsc);
        return () => window.removeEventListener('keydown', handleEsc);
    }, []);

    // Close modal after successful submission
    useEffect(() => {
        if (actionData?.success && (isModalOpen || isCustomPlanModalOpen)) {
            setIsModalOpen(false);
            setIsCustomPlanModalOpen(false);
        }
    }, [actionData, isModalOpen, isCustomPlanModalOpen]);

    const formatDate = (iso: string) =>
        new Date(iso).toLocaleString("en-GB", {
            day: "2-digit", month: "short", year: "numeric",
            hour: "2-digit", minute: "2-digit",
        });
    const formatDateShort = (iso: string) =>
        new Date(iso).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });

    const formatUsagePeriodEnd = (value: string | Date | null | undefined) => {
        if (!value) return null;
        const date = value instanceof Date ? value : new Date(value);
        if (Number.isNaN(date.getTime())) return null;
        return date.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
    };

    const getUsagePeriodTitle = (usage: any) => {
        const periodEnd = formatUsagePeriodEnd(usage.billingPeriodEnd);
        if (periodEnd) return `Ends ${periodEnd}`;
        if (usage.billingPeriodKey?.startsWith("calendar:")) return `${usage.yearMonth} calendar`;
        if (usage.billingPeriodKey?.startsWith("unresolved:")) return `${usage.yearMonth} unresolved`;
        return usage.yearMonth;
    };

    const getUsagePeriodMeta = (usage: any) => {
        if (usage.billingPeriodEnd) return "Shopify billing period";
        if (usage.billingPeriodKey?.startsWith("calendar:")) return "Legacy calendar month";
        if (usage.billingPeriodKey?.startsWith("unresolved:")) return "Billing period not synced";
        return usage.billingPeriodKey || usage.yearMonth;
    };

    const getUsagePeriodOptionLabel = (usage: any) =>
        `${getUsagePeriodTitle(usage)} - ${usage.totalVisitors.toLocaleString()} views - charged ${usage.chargedVisitors.toLocaleString()}`;

    const modeColor = (mode: string) => {
        if (mode === "popup") return "#82b440";
        if (mode === "auto_redirect") return "#10b981";
        return "#64748b";
    };

    const actionColor = (action: string) => {
        const m: Record<string, string> = {
            visit: "#64748b", redirected: "#82b440", blocked: "#ef4444",
            auto_redirect: "#10b981", popup_show: "#82b440",
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

    const formatCustomPlanPrice = () => Number(settings?.customPlanPrice || 0).toFixed(2);
    const formatCustomPlanLimit = () => {
        if (!settings) return "Not configured";
        if (settings.customPlanNoOverage || !settings.customPlanVisitorLimit) {
            return "Unlimited usage, no overage";
        }
        return `${settings.customPlanVisitorLimit.toLocaleString()} visitors, overage enabled`;
    };

    return (
        <div className="shop-detail-view">
            <style>{`
                .shop-detail-view { animation: none; }
                @keyframes fadeIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }

                .back-bar { margin-bottom: 24px; display: flex; justify-content: space-between; align-items: center; }
                .back-btn { 
                    min-height: 40px;
                    display: inline-flex; align-items: center; gap: 8px; 
                    text-decoration: none; color: #64748b; font-size: 14px; font-weight: 600;
                    padding: 8px 16px; background: white; border-radius: var(--ed-radius-xl);
                    border: 1px solid #e2e8f0; transition: none;
                    line-height: 18px;
                }
                .back-btn:hover { color: #1e293b; border-color: #cbd5e1; transform: none; }

                .adjust-trigger-btn {
                    min-height: 40px;
                    display: inline-flex; align-items: center; gap: 8px;
                    padding: 8px 16px; background: #1e293b; color: white;
                    border: 1px solid #1e293b; border-radius: var(--ed-radius-xl); font-weight: 700; font-size: 13px;
                    cursor: pointer; transition: none;
                    line-height: 18px;
                }
                .adjust-trigger-btn:hover { transform: none; box-shadow: none; }

                .hero-section {
                    background: white; border-radius: 8px; padding: 24px;
                    border: 1px solid #e2e8f0; margin-bottom: 20px;
                    display: flex; align-items: center; justify-content: space-between;
                    box-shadow: none;
                }
                
                .hero-content { display: flex; align-items: center; gap: 20px; }
                .hero-icon { 
                    width: 58px; height: 58px; border-radius: 8px; 
                    background: #f1f5f9; display: flex; align-items: center; justify-content: center;
                    color: #82b440; border: 1px solid #e2e8f0;
                }

                .shop-title-group h1 { font-size: 22px; font-weight: 800; color: #1e293b; margin: 0; letter-spacing: 0; }
                .shop-title-group .label { font-size: 13px; color: #94a3b8; font-weight: 600; text-transform: uppercase; margin-bottom: 4px; }
                .shop-link-hover { transition: color 0.2s; cursor: pointer; }
                .shop-link-hover:hover { color: #82b440; text-decoration: underline; }

                .ed-shop-plan-badge {
                    padding: 8px 16px; border-radius: 999px; font-size: 12px; font-weight: 800;
                    display: flex; align-items: center; gap: 8px;
                    ${(() => {
                        const plan = (currentPlan || 'FREE').toUpperCase();
                        if (plan === 'ELITE') return 'background: #f2f6ee; color: #37630f; border: 1px solid #b7df9e;';
                        if (plan === 'UNLIMITED') return 'background: #f2f6ee; color: #37630f; border: 1px solid #b7df9e;';
                        if (plan === 'CUSTOM') return 'background: #f2f6ee; color: #37630f; border: 1px solid #b7df9e;';
                        if (plan === 'PLUS') return 'background: #eef7e9; color: #37630f; border: 1px solid #b7df9e;';
                        if (plan === 'PREMIUM') return 'background: #f2f6ee; color: #37630f; border: 1px solid #b7df9e;';
                        return 'background: #f8fafc; color: #64748b; border: 1px solid #e2e8f0;';
                    })()}
                }

                .stats-grid-v3 { 
                    display: grid; 
                    grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); 
                    gap: 16px; 
                    margin-bottom: 20px; 
                }
                
                .ed-shop-stat-card {
                    background: white; border-radius: 8px; padding: 20px;
                    border: 1px solid #e2e8f0; display: flex; align-items: center; gap: 16px;
                    transition: none;
                }
                
                .stat-card-icon { 
                    width: 40px; height: 40px; border-radius: 8px; 
                    display: flex; align-items: center; justify-content: center;
                }

                .stat-info .label { font-size: 12px; font-weight: 700; color: #94a3b8; text-transform: uppercase; margin-bottom: 4px; }
                .stat-info .value { font-size: 22px; font-weight: 800; color: #1e293b; }
                .stat-info { min-width: 0; }

                .section-grid { 
                    display: grid; 
                    grid-template-columns: repeat(auto-fit, minmax(340px, 1fr)); 
                    gap: 20px; 
                    margin-bottom: 24px; 
                }
                
                .ed-shop-card {
                    background: white; border: 1px solid #e2e8f0; border-radius: 8px; 
                    display: flex; flex-direction: column; overflow: hidden;
                    box-shadow: none;
                }
                .ed-shop-card-head {
                    padding: 16px 20px; border-bottom: 1px solid #f1f5f9; 
                    background: #fcfdfe; font-weight: 700; font-size: 14px; color: #1e293b;
                    display: flex; align-items: center; gap: 10px;
                }
                .ed-shop-card-body { padding: 20px; flex: 1; }

                .info-item { display: flex; justify-content: space-between; padding: 12px 0; border-bottom: 1px solid #f1f5f9; }
                .info-item:last-child { border-bottom: none; }
                .info-item .label { color: #64748b; font-size: 13px; font-weight: 500; }
                .info-item .value { font-weight: 700; font-size: 13px; color: #1e293b; }
                .custom-plan-summary {
                    display: flex; align-items: center; justify-content: space-between; gap: 16px;
                    padding: 14px 0; border-bottom: 1px solid #f1f5f9;
                }
                .custom-plan-summary-main { min-width: 0; flex: 1; }
                .custom-plan-title { display: flex; align-items: center; gap: 8px; margin-bottom: 4px; flex-wrap: wrap; }
                .custom-plan-name { color: #1e293b; font-size: 13px; font-weight: 800; }
                .custom-plan-pill { padding: 3px 8px; border-radius: 999px; font-size: 10px; font-weight: 800; }
                .custom-plan-pill.enabled { background: #ecfdf5; color: #059669; }
                .custom-plan-pill.disabled { background: #f1f5f9; color: #64748b; }
                .custom-plan-pill.active { background: #eff6ff; color: #5f8f2f; }
                .custom-plan-meta { color: #64748b; font-size: 12px; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
                .custom-plan-note {
                    margin-top: 8px; padding: 10px 12px; border: 1px solid #bfdbfe; border-radius: 8px;
                    background: #eff6ff; color: #1e40af; font-size: 12px; line-height: 1.45; font-weight: 600;
                }
                .modal-content-wide { max-width: 620px; }

                .monthly-list { display: flex; flex-direction: column; gap: 12px; }
                .month-row { display: flex; align-items: center; justify-content: space-between; padding: 12px 16px; background: #f8fafc; border-radius: 8px; border: 1px solid transparent; transition: none; }
                .month-row:hover { border-color: #e2e8f0; background: #f1f5f9; }
                .month-name { font-weight: 800; font-size: 14px; color: #82b440; }
                .month-stats { display: flex; gap: 16px; font-size: 12px; color: #64748b; font-weight: 600; }

                @media (max-width: 768px) {
                    .back-bar {
                        display: grid;
                        grid-template-columns: repeat(2, minmax(0, 1fr));
                        gap: 8px;
                        margin-bottom: 14px;
                    }
                    .back-btn,
                    .adjust-trigger-btn {
                        height: 38px;
                        width: 100%;
                        min-width: 0;
                        justify-content: center;
                        padding: 8px 10px;
                        border-radius: var(--ed-radius-xl) !important;
                        font-size: 12px;
                        line-height: 16px;
                        white-space: nowrap;
                    }
                    .hero-section {
                        flex-direction: column;
                        align-items: stretch;
                        gap: 12px;
                        padding: 16px;
                        margin-bottom: 16px;
                    }
                    .hero-content {
                        gap: 12px;
                        min-width: 0;
                    }
                    .hero-icon {
                        width: 46px;
                        height: 46px;
                        flex: 0 0 46px;
                    }
                    .shop-title-group {
                        min-width: 0;
                    }
                    .shop-title-group h1 {
                        font-size: 17px;
                        overflow-wrap: anywhere;
                    }
                    .ed-shop-plan-badge {
                        width: fit-content;
                    }
                    .stats-grid-v3 {
                        grid-template-columns: repeat(2, minmax(0, 1fr));
                        gap: 8px;
                        margin-bottom: 12px;
                    }
                    .shop-detail-view .stats-grid-v3 .ed-shop-stat-card {
                        min-width: 0;
                        min-height: 68px;
                        gap: 8px;
                        padding: 10px !important;
                    }
                    .stat-card-icon {
                        width: 34px;
                        height: 34px;
                        flex: 0 0 34px;
                    }
                    .stat-card-icon svg {
                        width: 18px;
                        height: 18px;
                    }
                    .stat-info .label {
                        margin-bottom: 2px;
                        font-size: 10px;
                        line-height: 13px;
                    }
                    .stat-info .value {
                        font-size: 20px;
                        line-height: 22px;
                    }
                    .section-grid {
                        grid-template-columns: 1fr;
                        gap: 12px;
                    }
                    .ed-admin-content .shop-detail-view .section-grid > .ed-shop-card,
                    .ed-admin-content .shop-detail-view > .ed-shop-card {
                        padding: 0 !important;
                    }
                    .ed-shop-card-head,
                    .ed-shop-card-body {
                        padding: 14px;
                    }
                    .info-item,
                    .custom-plan-summary {
                        align-items: flex-start;
                        gap: 8px;
                    }
                    .custom-plan-summary {
                        flex-direction: column;
                    }
                    .inline-toggle-btn {
                        width: 100%;
                        justify-content: center;
                    }
                    .custom-plan-meta {
                        white-space: normal;
                    }
                    .month-row {
                        align-items: flex-start;
                        gap: 10px;
                    }
                    table {
                        min-width: 720px;
                    }
                    .modal-content,
                    .modal-content-wide {
                        width: calc(100vw - 24px);
                        max-width: calc(100vw - 24px);
                    }
                }
                @media (max-width: 480px) {
                    .stats-grid-v3 { grid-template-columns: repeat(2, minmax(0, 1fr)); }
                    .month-row {
                        flex-direction: column;
                    }
                    .month-stats {
                        flex-direction: row;
                        flex-wrap: wrap;
                        gap: 8px;
                        align-items: flex-start;
                    }
                    .info-item {
                        flex-direction: column;
                        padding: 10px 0;
                    }
                    table {
                        min-width: 660px;
                    }
                }
                @media (max-width: 360px) {
                    .stats-grid-v3 { grid-template-columns: 1fr; }
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
                .billing-input { width: 100%; padding: 10px 14px; border-radius: 8px; border: 1px solid #e2e8f0; font-size: 14px; transition: none; }
                .billing-input:focus { border-color: #82b440; outline: none; box-shadow: 0 0 0 3px rgba(130, 180, 64, 0.1); }
                
                .primary-btn { 
                    width: 100%; padding: 12px; background: #82b440; color: white; border: none; border-radius: 8px;
                    font-weight: 700; font-size: 14px; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 8px;
                    transition: none;
                }
                .primary-btn:hover { background: #6f9a37; }
                .primary-btn:disabled { background: #94a3b8; cursor: not-allowed; }
                .inline-action-form { margin: 0; }
                .inline-toggle-btn {
                    padding: 6px 10px; border: 1px solid #cbd5e1; border-radius: 8px;
                    background: white; color: #334155; font-size: 12px; font-weight: 700;
                    cursor: pointer; transition: all 0.2s;
                }
                .inline-toggle-btn:hover { border-color: #82b440; color: #6f9a37; }
                .inline-toggle-btn.enabled { border-color: #10b98133; background: #ecfdf5; color: #059669; }
                .inline-toggle-btn.disabled { border-color: #ef444433; background: #fef2f2; color: #ef4444; }

                .alert { padding: 12px 16px; border-radius: 8px; font-size: 13px; font-weight: 500; margin-bottom: 16px; display: flex; align-items: center; gap: 10px; }
                .alert-success { background: #ecfdf5; color: #059669; border: 1px solid #10b98133; }
                .alert-error { background: #fef2f2; color: #ef4444; border: 1px solid #ef444433; }

                /* MODAL STYLES */
                .modal-overlay {
                    position: fixed; inset: 0; background: rgba(15, 23, 42, 0.45);
                    backdrop-filter: none; z-index: 9999;
                    display: flex; align-items: center; justify-content: center;
                    animation: none;
                }
                .modal-content {
                    background: white; width: 90%; max-width: 500px;
                    border-radius: 8px; overflow: hidden;
                    box-shadow: none;
                    animation: none;
                    border: 1px solid #e2e8f0;
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
                    border-radius: 8px; display: flex; align-items: center; justify-content: center;
                    color: #64748b; cursor: pointer; transition: none;
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
                <div className="ed-shop-plan-badge">
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
                                Manually update the "Charged Visitors" counter for a specific billing period in our internal database.
                            </p>
                            <Form method="post">
                                <input type="hidden" name="intent" value="adjust_usage" />
                                <div className="billing-input-group">
                                    <label>Select Billing Period</label>
                                    <select name="billingPeriodKey" className="billing-input" required>
                                        <option value="">-- Select Billing Period --</option>
                                        {monthlyUsage.map((u: any) => (
                                            <option key={u.id} value={u.billingPeriodKey}>
                                                {getUsagePeriodOptionLabel(u)}
                                            </option>
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

            {hasSettings && settings && isBillingOverrideModalOpen && (
                <div className="modal-overlay" onClick={() => setIsBillingOverrideModalOpen(false)}>
                    <div className="modal-content modal-content-wide" onClick={e => e.stopPropagation()}>
                        <div className="modal-header">
                            <div className="modal-title">
                                <Zap size={20} color="#1e293b" />
                                Configure Billing Override
                            </div>
                            <button className="modal-close" onClick={() => setIsBillingOverrideModalOpen(false)}>
                                <X size={18} />
                            </button>
                        </div>
                        <div className="modal-body">
                            <p style={{ fontSize: '14px', color: '#64748b', marginBottom: '24px', lineHeight: '1.5' }}>
                                Override the app's effective plan for internal testing or dev stores. Shopify billing sync will still keep the real plan separately.
                            </p>
                            <Form method="post">
                                <input type="hidden" name="intent" value="save_billing_override" />
                                <div className="billing-input-group">
                                    <label>Override status</label>
                                    <select name="billingOverrideEnabled" className="billing-input" defaultValue={settings.billingOverrideEnabled ? "true" : "false"}>
                                        <option value="true">Enabled</option>
                                        <option value="false">Disabled</option>
                                    </select>
                                </div>
                                <div className="billing-input-group">
                                    <label>Effective plan</label>
                                    <select name="billingOverridePlan" className="billing-input" defaultValue={settings.billingOverridePlan || UNLIMITED_PLAN}>
                                        {BILLING_OVERRIDE_PLAN_OPTIONS.map((plan) => (
                                            <option key={plan} value={plan}>{plan.toUpperCase()}</option>
                                        ))}
                                    </select>
                                </div>
                                <div className="billing-input-group">
                                    <label>Reason</label>
                                    <input
                                        name="billingOverrideReason"
                                        className="billing-input"
                                        placeholder="dev store, QA, partner test..."
                                        defaultValue={settings.billingOverrideReason || ""}
                                    />
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '28px' }}>
                                    <button type="button" className="inline-toggle-btn" onClick={() => setIsBillingOverrideModalOpen(false)}>
                                        Cancel
                                    </button>
                                    <button type="submit" className="primary-btn" style={{ width: 'auto', minWidth: '180px' }} disabled={isSubmitting}>
                                        {isSubmitting ? <Loader2 className="animate-spin" size={18} /> : <>Save Override <ChevronRight size={16} /></>}
                                    </button>
                                </div>
                            </Form>
                        </div>
                    </div>
                </div>
            )}

            {hasSettings && settings && isCustomPlanModalOpen && (
                <div className="modal-overlay" onClick={() => setIsCustomPlanModalOpen(false)}>
                    <div className="modal-content modal-content-wide" onClick={e => e.stopPropagation()}>
                        <div className="modal-header">
                            <div className="modal-title">
                                <Gem size={20} color="#1e293b" />
                                Configure Custom Plan
                            </div>
                            <button className="modal-close" onClick={() => setIsCustomPlanModalOpen(false)}>
                                <X size={18} />
                            </button>
                        </div>
                        <div className="modal-body">
                            <p style={{ fontSize: '14px', color: '#64748b', marginBottom: '24px', lineHeight: '1.5' }}>
                                Configure the private plan shown to this merchant. Hiding it only removes the option from their pricing page; it does not cancel an active Shopify subscription.
                            </p>
                            {currentPlan === CUSTOM_PLAN && (
                                <div className="custom-plan-note" style={{ marginBottom: '20px' }}>
                                    This shop is currently subscribed to the custom plan. Changing availability will not cancel or downgrade the active subscription.
                                </div>
                            )}
                            <Form method="post">
                                <input type="hidden" name="intent" value="save_custom_plan" />
                                <div className="billing-input-group">
                                    <label>Merchant availability</label>
                                    <select name="customPlanEnabled" className="billing-input" defaultValue={settings.customPlanEnabled ? "true" : "false"}>
                                        <option value="true">Available on pricing page</option>
                                        <option value="false">Hidden from pricing page</option>
                                    </select>
                                </div>
                                <div className="billing-input-group">
                                    <label>Display name</label>
                                    <input name="customPlanName" className="billing-input" defaultValue={settings.customPlanName || "Custom plan"} />
                                </div>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                                    <div className="billing-input-group">
                                        <label>Monthly price USD</label>
                                        <input type="number" step="0.01" min="0" name="customPlanPrice" className="billing-input" defaultValue={settings.customPlanPrice || "79.99"} />
                                    </div>
                                    <div className="billing-input-group">
                                        <label>Trial days</label>
                                        <input type="number" min="0" max="90" name="customPlanTrialDays" className="billing-input" defaultValue={settings.customPlanTrialDays ?? DEFAULT_TRIAL_DAYS} />
                                    </div>
                                </div>
                                <div className="billing-input-group">
                                    <label>Visitor limit</label>
                                    <input
                                        type="number"
                                        min="1"
                                        name="customPlanVisitorLimit"
                                        className="billing-input"
                                        placeholder="Leave empty for unlimited"
                                        defaultValue={settings.customPlanVisitorLimit ?? ""}
                                    />
                                </div>
                                <div className="billing-input-group">
                                    <label>Overage mode</label>
                                    <select name="customPlanNoOverage" className="billing-input" defaultValue={settings.customPlanNoOverage ? "true" : "false"}>
                                        <option value="true">No overage charges</option>
                                        <option value="false">Use app overage billing after limit</option>
                                    </select>
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '28px' }}>
                                    <button type="button" className="inline-toggle-btn" onClick={() => setIsCustomPlanModalOpen(false)}>
                                        Cancel
                                    </button>
                                    <button type="submit" className="primary-btn" style={{ width: 'auto', minWidth: '160px' }} disabled={isSubmitting}>
                                        {isSubmitting ? <Loader2 className="animate-spin" size={18} /> : <>Save Plan <ChevronRight size={16} /></>}
                                    </button>
                                </div>
                            </Form>
                        </div>
                    </div>
                </div>
            )}

            <div className="stats-grid-v3">
                <div className="ed-shop-stat-card">
                    <div className="stat-card-icon" style={{ background: '#e0f2fe', color: '#0ea5e9' }}>
                        <Eye size={22} />
                    </div>
                    <div className="stat-info">
                        <div className="label">Period Views</div>
                        <div className="value">{stats.totalVisitors.toLocaleString()}</div>
                    </div>
                </div>
                <div className="ed-shop-stat-card">
                    <div className="stat-card-icon" style={{ background: '#f2f6ee', color: '#82b440' }}>
                        <Zap size={22} />
                    </div>
                    <div className="stat-info">
                        <div className="label">Period Redirects</div>
                        <div className="value">{stats.totalRedirected.toLocaleString()}</div>
                    </div>
                </div>
                <div className="ed-shop-stat-card">
                    <div className="stat-card-icon" style={{ background: '#fef2f2', color: '#ef4444' }}>
                        <ShieldAlert size={22} />
                    </div>
                    <div className="stat-info">
                        <div className="label">Period Blocked</div>
                        <div className="value">{stats.totalBlocked.toLocaleString()}</div>
                    </div>
                </div>
                <div className="ed-shop-stat-card">
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
                <div className="ed-shop-card">
                    <div className="ed-shop-card-head">
                        <SettingsIcon size={18} color="#82b440" />
                        App Configurations
                    </div>
                    <div className="ed-shop-card-body">
                        {!hasSettings ? (
                            <div style={{ padding: '24px', textAlign: 'center', color: '#f59e0b', fontSize: '13px', fontWeight: 600 }}>
                                <ShieldAlert size={24} style={{ marginBottom: '12px', opacity: 0.5 }} />
                                <div>No settings found for this shop.</div>
                                <Form method="post" className="inline-action-form" style={{ marginTop: '16px' }}>
                                    <input type="hidden" name="intent" value="save_custom_plan" />
                                    <input type="hidden" name="customPlanEnabled" value="true" />
                                    <input type="hidden" name="customPlanName" value="Custom plan" />
                                    <input type="hidden" name="customPlanPrice" value="79.99" />
                                    <input type="hidden" name="customPlanVisitorLimit" value="" />
                                    <input type="hidden" name="customPlanNoOverage" value="true" />
                                    <input type="hidden" name="customPlanTrialDays" value={DEFAULT_TRIAL_DAYS} />
                                    <button type="submit" className="inline-toggle-btn enabled" disabled={isSubmitting}>
                                        Create Custom Plan Access
                                    </button>
                                </Form>
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
                                <div className="custom-plan-summary">
                                    <div className="custom-plan-summary-main">
                                        <div className="custom-plan-title">
                                            <span className="custom-plan-name">Billing Override</span>
                                            <span className={`custom-plan-pill ${isBillingOverridden ? 'enabled' : 'disabled'}`}>
                                                {isBillingOverridden ? 'ENABLED' : 'DISABLED'}
                                            </span>
                                        </div>
                                        <div className="custom-plan-meta">
                                            Shopify: {(shopifyPlan || FREE_PLAN).toUpperCase()} | Effective: {(currentPlan || FREE_PLAN).toUpperCase()}
                                        </div>
                                        {settings!.billingOverrideReason && (
                                            <div className="custom-plan-note">
                                                {settings!.billingOverrideReason}
                                            </div>
                                        )}
                                    </div>
                                    <button
                                        type="button"
                                        className="inline-toggle-btn enabled"
                                        onClick={() => setIsBillingOverrideModalOpen(true)}
                                    >
                                        Configure
                                    </button>
                                </div>
                                <div className="custom-plan-summary">
                                    <div className="custom-plan-summary-main">
                                        <div className="custom-plan-title">
                                            <span className="custom-plan-name">Custom Plan Access</span>
                                            <span className={`custom-plan-pill ${settings!.customPlanEnabled ? 'enabled' : 'disabled'}`}>
                                                {settings!.customPlanEnabled ? 'AVAILABLE' : 'HIDDEN'}
                                            </span>
                                            {currentPlan === CUSTOM_PLAN && (
                                                <span className="custom-plan-pill active">ACTIVE SUBSCRIPTION</span>
                                            )}
                                        </div>
                                        <div className="custom-plan-meta">
                                            {settings!.customPlanName || "Custom plan"} | ${formatCustomPlanPrice()}/mo | {formatCustomPlanLimit()}
                                        </div>
                                        {currentPlan === CUSTOM_PLAN && !settings!.customPlanEnabled && (
                                            <div className="custom-plan-note">
                                                Hidden from pricing page, but this shop is still subscribed to the custom plan.
                                            </div>
                                        )}
                                    </div>
                                    <button
                                        type="button"
                                        className="inline-toggle-btn enabled"
                                        onClick={() => setIsCustomPlanModalOpen(true)}
                                    >
                                        Configure
                                    </button>
                                </div>
                                <div className="info-item">
                                    <span className="label">Installed On</span>
                                    <span className="value">{formatDateShort(settings!.createdAt)}</span>
                                </div>
                            </>
                        )}
                    </div>
                </div>

                <div className="ed-shop-card">
                    <div className="ed-shop-card-head">
                        <History size={18} color="#82b440" />
                        Usage Period History
                    </div>
                    <div className="ed-shop-card-body">
                        <div className="monthly-list">
                            {monthlyUsage.length === 0 ? (
                                <div style={{ color: '#94a3b8', fontSize: '13px', textAlign: 'center', padding: '20px' }}>No usage data recorded.</div>
                            ) : (
                                monthlyUsage.map((u: any) => {
                                    const isCurrentPeriod = settings?.billingPeriodKey && u.billingPeriodKey === settings.billingPeriodKey;
                                    return (
                                        <div className="month-row" key={u.billingPeriodKey || u.yearMonth}>
                                            <div>
                                                <div className="month-name">
                                                    {getUsagePeriodTitle(u)}
                                                    {isCurrentPeriod ? (
                                                        <span style={{ marginLeft: '8px', fontSize: '10px', color: '#10b981', fontWeight: 800 }}>CURRENT</span>
                                                    ) : null}
                                                </div>
                                                <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '3px' }}>
                                                    {getUsagePeriodMeta(u)}
                                                </div>
                                            </div>
                                            <div className="month-stats">
                                                <span><b>{u.totalVisitors.toLocaleString()}</b> views</span>
                                                <span><b>{u.redirected}</b> redirs</span>
                                                <span>(Charged: <b>{u.chargedVisitors.toLocaleString()}</b>)</span>
                                            </div>
                                        </div>
                                    );
                                })
                            )}
                        </div>
                    </div>
                </div>
            </div>

            <div className="ed-shop-card ed-shop-table-card" style={{ marginBottom: '32px' }}>
                <div className="ed-shop-card-head">
                    <Zap size={18} color="#82b440" />
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
                                    <td><span className="badge-v3" style={{ background: r.ruleType === 'block' ? '#fef2f2' : '#f2f6ee', color: r.ruleType === 'block' ? '#ef4444' : '#82b440' }}>{r.ruleType.toUpperCase()}</span></td>
                                    <td>{r.isActive ? <span style={{ color: '#10b981' }}>Active</span> : <span style={{ color: '#94a3b8' }}>Inactive</span>}</td>
                                    <td>{r.priority}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>

            <div className="ed-shop-card ed-shop-table-card">
                <div className="ed-shop-card-head">
                    <Globe size={18} color="#82b440" />
                    Live Interaction Logs
                </div>
                <div className="table-container">
                    <table>
                        <thead>
                            <tr>
                                <th>Time</th>
                                <th>Visitor IP</th>
                                <th>Page Path</th>
                                <th>User Agent</th>
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
                                    <td>
                                        <div style={{ fontSize: '11px', color: '#64748b', maxWidth: '150px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={l.path || '/'}>
                                            {l.path || '/'}
                                        </div>
                                    </td>
                                    <td>
                                        <div style={{ fontSize: '11px', color: '#64748b', maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={l.userAgent || 'Unknown'}>
                                            {l.userAgent || '-'}
                                        </div>
                                    </td>
                                    <td><span className="badge-v3" style={{ background: `${actionColor(l.action)}15`, color: actionColor(l.action) }}>{l.action.toUpperCase()}</span></td>
                                    <td style={{ color: 'var(--text-muted)' }}>{l.ruleName || '-'}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}

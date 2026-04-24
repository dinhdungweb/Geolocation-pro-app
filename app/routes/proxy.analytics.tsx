import { json } from "@remix-run/node";
import type { ActionFunctionArgs } from "@remix-run/node";
import prisma from "../db.server";
import { authenticate } from "../shopify.server";
import { cleanupOldLogs } from "../utils/cleanup.server";

function getVisitorIP(request: Request): string {
    return (
        request.headers.get("x-shopify-client-ip") ||
        request.headers.get("cf-connecting-ip") ||
        request.headers.get("x-real-ip") ||
        request.headers.get("true-client-ip") ||
        request.headers.get("x-client-ip") ||
        request.headers.get("x-forwarded-for")?.split(",")[0].trim() ||
        "0.0.0.0"
    );
}

export const action = async ({ request }: ActionFunctionArgs) => {
    // Lazy cleanup: ensure old logs are deleted even if admin doesn't visit the app
    // This runs at most once per day due to internal logic in cleanupOldLogs
    cleanupOldLogs().catch(() => { });

    // CORS headers for storefront requests
    const corsHeaders = {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
    };

    // Handle OPTIONS preflight
    if (request.method === "OPTIONS") {
        return new Response(null, { status: 204, headers: corsHeaders });
    }

    if (request.method !== "POST") {
        return json({ error: "Method not allowed" }, { status: 405, headers: corsHeaders });
    }

    try {
        await authenticate.public.appProxy(request);
    } catch (error) {
        return json({ error: "Unauthorized: Invalid signature" }, { status: 401, headers: corsHeaders });
    }

    try {
        const url = new URL(request.url);
        const shop = url.searchParams.get("shop");
        const visitorIP = getVisitorIP(request);

        // Safely parse JSON body (may be empty from sendBeacon edge cases)
        let data;
        try {
            const text = await request.text();
            if (!text || text.trim() === '') {
                console.log('[Analytics] Empty request body received');
                return json({ error: "Empty body" }, { status: 400, headers: corsHeaders });
            }
            data = JSON.parse(text);
        } catch (parseError) {
            console.error('[Analytics] JSON parse error:', parseError);
            return json({ error: "Invalid JSON" }, { status: 400, headers: corsHeaders });
        }

        const { type, countryCode, ruleId, ruleName, path } = data;

        if (!shop || !type) {
            console.log(`[Analytics] Missing required fields: shop=${shop}, type=${type}`);
            return json({ error: "Missing required fields" }, { status: 400, headers: corsHeaders });
        }

        // Verify shop exists to prevent DB pollution
        const settings = await prisma.settings.findUnique({
            where: { shop },
            select: { id: true }
        });

        if (!settings) {
            console.log(`[Analytics] Unauthorized: Shop ${shop} is not registered.`);
            return json({ error: "Unauthorized: Invalid shop" }, { status: 401, headers: corsHeaders });
        }

        // Validate event type against whitelist
        const VALID_TYPES = ['visit', 'popup_shown', 'redirected', 'auto_redirected', 'blocked', 'ip_redirected', 'ip_blocked', 'clicked_no', 'dismissed', 'vpn_blocked'];
        if (!VALID_TYPES.includes(type)) {
            return json({ error: "Invalid event type" }, { status: 400, headers: corsHeaders });
        }

        // 0. Save Detailed Visitor Log
        if (visitorIP) {
            const userAgent = request.headers.get("user-agent") || "Unknown";

            // Map event type to action string
            let action = type;
            if (type === 'redirected') action = 'clicked_redirect';
            if (type === 'auto_redirected') action = 'auto_redirect';
            if (type === 'ip_redirected') action = 'ip_redirect';
            if (type === 'ip_blocked') action = 'ip_block';
            if (type === 'vpn_blocked') action = 'vpn_block';
            if (type === 'clicked_no') action = 'declined';
            if (type === 'dismissed') action = 'dismissed';
            if (type === 'popup_shown') action = 'popup_shown';

            try {
                await prisma.visitorLog.create({
                    data: {
                        shop,
                        ipAddress: visitorIP,
                        countryCode: countryCode || null,
                        city: null,
                        action,
                        ruleName: ruleName || null,
                        targetUrl: data.targetUrl || null,
                        userAgent,
                        path: path || null,
                    }
                });
            } catch (logError) {
                console.error('[Analytics] Error saving visitor log:', logError);
            }
        }

        const today = new Date();
        today.setHours(0, 0, 0, 0);

        // 1. Update Country Stats
        if (countryCode) {
            const updateData: any = {};
            if (type === 'visit') updateData.visitors = { increment: 1 };
            if (type === 'popup_shown') updateData.popupShown = { increment: 1 };
            if (type === 'redirected' || type === 'auto_redirected' || type === 'ip_redirected') updateData.redirected = { increment: 1 };
            if (type === 'blocked' || type === 'ip_blocked' || type === 'vpn_blocked') updateData.blocked = { increment: 1 };

            if (Object.keys(updateData).length > 0) {
                await prisma.analyticsCountry.upsert({
                    where: {
                        shop_date_countryCode: {
                            shop,
                            date: today,
                            countryCode,
                        },
                    },
                    update: updateData,
                    create: {
                        shop,
                        date: today,
                        countryCode,
                        visitors: type === 'visit' ? 1 : 0,
                        popupShown: type === 'popup_shown' ? 1 : 0,
                        redirected: (type === 'redirected' || type === 'auto_redirected' || type === 'ip_redirected') ? 1 : 0,
                        blocked: (type === 'blocked' || type === 'ip_blocked' || type === 'vpn_blocked') ? 1 : 0,
                    },
                });
            }
        }

        // 2. Update Rule Stats (if ruleId provided)
        if (ruleId) {
            const updateRuleData: any = {};
            if (type === 'popup_shown') updateRuleData.seen = { increment: 1 };
            if (type === 'redirected') updateRuleData.clickedYes = { increment: 1 };
            if (type === 'auto_redirected' || type === 'ip_redirected') updateRuleData.autoRedirected = { increment: 1 };
            if (type === 'clicked_no') updateRuleData.clickedNo = { increment: 1 };
            if (type === 'dismissed') updateRuleData.dismissed = { increment: 1 };
            if (type === 'ip_blocked') updateRuleData.blocked = { increment: 1 };
            // Note: vpn_blocked typically won't have a ruleId unless it's the "vpn-shield" virtual rule

            if (Object.keys(updateRuleData).length > 0) {
                await prisma.analyticsRule.upsert({
                    where: {
                        shop_date_ruleId: {
                            shop,
                            date: today,
                            ruleId,
                        },
                    },
                    update: {
                        ...updateRuleData,
                        ruleName: ruleName || undefined,
                    },
                    create: {
                        shop,
                        date: today,
                        ruleId,
                        ruleName: ruleName || 'Unknown Rule',
                        seen: type === 'popup_shown' ? 1 : 0,
                        clickedYes: type === 'redirected' ? 1 : 0,
                        autoRedirected: (type === 'auto_redirected' || type === 'ip_redirected') ? 1 : 0,
                        clickedNo: type === 'clicked_no' ? 1 : 0,
                        dismissed: type === 'dismissed' ? 1 : 0,
                        blocked: (type === 'ip_blocked') ? 1 : 0,
                    },
                });
            }
        }

        // 3. Update Monthly Usage (for billing and statistics)
        // ONLY count billable events: popup_shown, redirected, auto_redirected, blocked, ip_redirected, ip_blocked, vpn_blocked
        if (type === 'popup_shown' || type === 'redirected' || type === 'auto_redirected' || type === 'blocked' ||
            type === 'ip_redirected' || type === 'ip_blocked' || type === 'vpn_blocked') {
            const now = new Date();
            const yearMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

            const usageUpdateData: any = {
                totalVisitors: { increment: 1 }
            };

            if (type === 'redirected' || type === 'auto_redirected' || type === 'ip_redirected') {
                usageUpdateData.redirected = { increment: 1 };
            }
            if (type === 'blocked' || type === 'ip_blocked' || type === 'vpn_blocked') {
                usageUpdateData.blocked = { increment: 1 };
            }
            if (type === 'popup_shown') {
                usageUpdateData.popupShown = { increment: 1 };
            }

            await prisma.monthlyUsage.upsert({
                where: {
                    shop_yearMonth: {
                        shop,
                        yearMonth,
                    },
                },
                update: usageUpdateData,
                create: {
                    shop,
                    yearMonth,
                    totalVisitors: 1,
                    redirected: (type === 'redirected' || type === 'auto_redirected' || type === 'ip_redirected') ? 1 : 0,
                    blocked: (type === 'blocked' || type === 'ip_blocked' || type === 'vpn_blocked') ? 1 : 0,
                    popupShown: type === 'popup_shown' ? 1 : 0,
                },
            });
        }

        return json({ success: true }, { headers: corsHeaders });
    } catch (error) {
        console.error("Analytics Error:", error);
        return json({ error: "Internal Server Error" }, { status: 500, headers: corsHeaders });
    }
};

// Handle OPTIONS for CORS
export const loader = async ({ request }: ActionFunctionArgs) => {
    if (request.method === "OPTIONS") {
        return new Response(null, {
            status: 204,
            headers: {
                "Access-Control-Allow-Origin": "*",
                "Access-Control-Allow-Methods": "POST, OPTIONS",
                "Access-Control-Allow-Headers": "Content-Type",
            },
        });
    }
    return json({ error: "Method not allowed" }, { status: 405 });
};

import { json } from "@remix-run/node";
import type { ActionFunctionArgs } from "@remix-run/node";
import prisma from "../db.server";
import { authenticate } from "../shopify.server";

export const action = async ({ request }: ActionFunctionArgs) => {
    // 1. Verify App Proxy Signature
    try {
        await authenticate.public.appProxy(request);
    } catch (error) {
        return json({ error: "Unauthorized: Invalid signature" }, { status: 401 });
    }

    if (request.method !== "POST") {
        return json({ error: "Method not allowed" }, { status: 405 });
    }

    try {
        const url = new URL(request.url);
        const shop = url.searchParams.get("shop");

        // Safely parse JSON body (may be empty from sendBeacon edge cases)
        let data;
        try {
            const text = await request.text();
            if (!text || text.trim() === '') {
                console.log('[Analytics] Empty request body received');
                return json({ error: "Empty body" }, { status: 400 });
            }
            data = JSON.parse(text);
        } catch (parseError) {
            console.error('[Analytics] JSON parse error:', parseError);
            return json({ error: "Invalid JSON" }, { status: 400 });
        }

        const { type, countryCode, ruleId, ruleName } = data;

        if (!shop || !type) {
            return json({ error: "Missing required fields" }, { status: 400 });
        }

        const today = new Date();
        today.setHours(0, 0, 0, 0);

        // 1. Update Country Stats
        if (countryCode) {
            const updateData: any = {};
            if (type === 'visit') updateData.visitors = { increment: 1 };
            if (type === 'popup_shown') updateData.popupShown = { increment: 1 };
            if (type === 'redirected' || type === 'auto_redirected' || type === 'ip_redirected') updateData.redirected = { increment: 1 };
            if (type === 'blocked' || type === 'ip_blocked') updateData.blocked = { increment: 1 };

            if (Object.keys(updateData).length > 0) {
                await (prisma as any).analyticsCountry.upsert({
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
                        blocked: (type === 'blocked' || type === 'ip_blocked') ? 1 : 0,
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

            if (Object.keys(updateRuleData).length > 0) {
                await (prisma as any).analyticsRule.upsert({
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
                    },
                });
            }
        }

        // 3. Update Monthly Usage (for billing - only count redirected + blocked)
        if (type === 'redirected' || type === 'auto_redirected' || type === 'blocked' ||
            type === 'ip_redirected' || type === 'ip_blocked') {
            const now = new Date();
            const yearMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

            const usageUpdateData: any = {
                totalVisitors: { increment: 1 },
            };

            if (type === 'redirected' || type === 'auto_redirected' || type === 'ip_redirected') {
                usageUpdateData.redirected = { increment: 1 };
            }
            if (type === 'blocked' || type === 'ip_blocked') {
                usageUpdateData.blocked = { increment: 1 };
            }

            await (prisma as any).monthlyUsage.upsert({
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
                    blocked: (type === 'blocked' || type === 'ip_blocked') ? 1 : 0,
                },
            });
        }

        return json({ success: true });
    } catch (error) {
        console.error("Analytics Error:", error);
        return json({ error: "Internal Server Error" }, { status: 500 });
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

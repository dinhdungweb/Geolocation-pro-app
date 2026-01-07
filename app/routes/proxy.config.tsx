import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import prisma from "../db.server";

/**
 * App Proxy endpoint for geolocation config
 * 
 * This route handles requests from the storefront via Shopify App Proxy.
 * URL format: https://shop.myshopify.com/apps/geolocation/config
 * 
 * Shopify adds query params: shop, logged_in_customer_id, path_prefix, timestamp, signature
 */
export const loader = async ({ request }: LoaderFunctionArgs) => {
    const url = new URL(request.url);
    const shop = url.searchParams.get("shop");

    // CORS headers for cross-origin requests
    const headers = {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
        "Cache-Control": "no-store, no-cache, must-revalidate", // No caching - settings apply immediately
    };

    if (!shop) {
        return json(
            { error: "Missing shop parameter", enabled: false },
            { status: 400, headers }
        );
    }

    try {
        // Fetch settings for the shop
        const settings = await prisma.settings.findUnique({
            where: { shop },
            select: {
                mode: true,
                popupTitle: true,
                popupMessage: true,
                confirmBtnText: true,
                cancelBtnText: true,
                popupBgColor: true,
                popupTextColor: true,
                popupBtnColor: true,
                excludeBots: true,
                cookieDuration: true,
                blockedTitle: true,
                blockedMessage: true,
                template: true,
            },
        });

        // Fetch active rules for the shop
        const rules = await prisma.redirectRule.findMany({
            where: {
                shop,
                isActive: true,
            },
            orderBy: { priority: "desc" },
            select: {
                id: true,
                name: true,
                countryCodes: true,
                targetUrl: true,
                priority: true,
                scheduleEnabled: true,
                startTime: true,
                endTime: true,
                daysOfWeek: true,
                timezone: true,
                ruleType: true,
            },
        });

        // Filter rules based on schedule
        const activeRules = rules.filter(rule => {
            if (!rule.scheduleEnabled) return true;

            const timezone = rule.timezone || "UTC";
            try {
                // Get current time in filter timezone
                const now = new Date();
                const options: Intl.DateTimeFormatOptions = { timeZone: timezone, hour12: false, hour: '2-digit', minute: '2-digit', weekday: 'short' };
                const formatter = new Intl.DateTimeFormat('en-US', options);

                // Hacky way to get parts because toLocaleString format varies
                const parts = formatter.formatToParts(now);
                const hour = parts.find(p => p.type === 'hour')?.value;
                const minute = parts.find(p => p.type === 'minute')?.value;
                const currentTime = `${hour}:${minute}`;

                // Get current day index (0=Sun, 1=Mon...)
                // Intl 'weekday' returns "Mon", "Tue"... we need 0-6
                const dayMap: { [key: string]: string } = { "Sun": "0", "Mon": "1", "Tue": "2", "Wed": "3", "Thu": "4", "Fri": "5", "Sat": "6" };
                const weekdayPart = parts.find(p => p.type === 'dayPeriod' || p.type === 'weekday')?.value; // Note: 'dayPeriod' is AM/PM, 'weekday' is needed. 
                // Let's rely on standard Date getDay() adjusted for timezone

                // Reliable way: Create a date object string in the target timezone
                const targetTimeStr = now.toLocaleString("en-US", { timeZone: timezone });
                const targetDate = new Date(targetTimeStr);
                const currentDay = targetDate.getDay().toString();

                // Check Day
                if (rule.daysOfWeek && !rule.daysOfWeek.split(",").includes(currentDay)) {
                    return false;
                }

                // Check Time
                if (rule.startTime && rule.endTime) {
                    // Simple string comparison works for HH:mm format (09:00 < 17:00)
                    if (currentTime < rule.startTime || currentTime > rule.endTime) {
                        return false;
                    }
                }

                return true;
            } catch (e) {
                console.error(`[Proxy] Error checking schedule for rule ${rule.name}:`, e);
                return true; // Fail safe: active if check fails
            }
        });

        // If no settings found, return default config
        if (!settings) {
            return json(
                {
                    enabled: false,
                    mode: "disabled",
                    rules: [],
                    message: "No settings configured for this shop"
                },
                { headers }
            );
        }

        // Transform rules to a simpler format for frontend
        const transformedRules = activeRules.map((rule) => ({
            ruleId: rule.id,
            name: rule.name,
            countries: rule.countryCodes.split(",").map((c) => c.trim().toUpperCase()),
            targetUrl: rule.targetUrl,
            ruleType: rule.ruleType,
            priority: rule.priority,
        }));

        const response = {
            enabled: settings.mode !== "disabled",
            mode: settings.mode,
            popup: {
                title: settings.popupTitle,
                message: settings.popupMessage,
                confirmBtn: settings.confirmBtnText,
                cancelBtn: settings.cancelBtnText,
                bgColor: settings.popupBgColor,
                textColor: settings.popupTextColor,
                btnColor: settings.popupBtnColor,
                template: settings.template || "modal",
            },
            excludeBots: settings.excludeBots,
            cookieDuration: settings.cookieDuration,
            blocked: {
                title: settings.blockedTitle,
                message: settings.blockedMessage,
            },
            rules: transformedRules,
        };

        console.log(`[Proxy] Config for ${shop}:`, response);

        return json(response, { headers });
    } catch (error) {
        console.error("[Proxy] Error fetching config:", error);
        return json(
            { error: "Internal server error", enabled: false },
            { status: 500, headers }
        );
    }
};

// Handle OPTIONS request for CORS preflight
export const action = async ({ request }: LoaderFunctionArgs) => {
    if (request.method === "OPTIONS") {
        return new Response(null, {
            status: 204,
            headers: {
                "Access-Control-Allow-Origin": "*",
                "Access-Control-Allow-Methods": "GET, OPTIONS",
                "Access-Control-Allow-Headers": "Content-Type",
            },
        });
    }
    return json({ error: "Method not allowed" }, { status: 405 });
};

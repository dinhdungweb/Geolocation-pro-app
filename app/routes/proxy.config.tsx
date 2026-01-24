import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { authenticate } from "../shopify.server";
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

    // Get visitor IP from request headers
    // Priority: x-shopify-client-ip > cf-connecting-ip > x-forwarded-for
    const getVisitorIP = (): string => {
        // 1. X-Shopify-Client-IP - This is the REAL visitor IP forwarded by Shopify
        const shopifyClientIP = request.headers.get("x-shopify-client-ip");
        if (shopifyClientIP) return shopifyClientIP;

        // 2. Cloudflare
        const cfIP = request.headers.get("cf-connecting-ip");
        if (cfIP) return cfIP;

        // 3. X-Real-IP
        const realIP = request.headers.get("x-real-ip");
        if (realIP) return realIP;

        // 4. True-Client-IP
        const trueClientIP = request.headers.get("true-client-ip");
        if (trueClientIP) return trueClientIP;

        // 5. X-Client-IP
        const clientIP = request.headers.get("x-client-ip");
        if (clientIP) return clientIP;

        // 6. X-Forwarded-For (first IP is original client)
        const forwardedFor = request.headers.get("x-forwarded-for");
        if (forwardedFor) {
            return forwardedFor.split(",")[0].trim();
        }

        return "0.0.0.0";
    };

    const visitorIP = getVisitorIP();

    // Lookup country from IP using free API (ip-api.com)
    // This ensures we get the REAL country, not cached Shopify value
    let detectedCountry = "";
    try {
        // ip-api.com is free for non-commercial use (45 requests/minute)
        const geoResponse = await fetch(`http://ip-api.com/json/${visitorIP}?fields=countryCode`);
        if (geoResponse.ok) {
            const geoData = await geoResponse.json();
            if (geoData.countryCode) {
                detectedCountry = geoData.countryCode;
            }
        }
    } catch (error) {
        console.log(`[Proxy] Could not lookup country for IP ${visitorIP}:`, error);
    }

    // Verify App Proxy Signature
    try {
        await authenticate.public.appProxy(request);
    } catch (error) {
        return json({ error: "Unauthorized: Invalid signature" }, { status: 401, headers });
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
                excludedIPs: true,
                cookieDuration: true,
                blockedTitle: true,
                blockedMessage: true,
                template: true,
            },
        });

        // Fetch active COUNTRY rules for the shop
        const countryRules = await prisma.redirectRule.findMany({
            where: {
                shop,
                isActive: true,
                matchType: "country",
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

        // Fetch active IP rules for the shop
        const ipRulesRaw = await prisma.redirectRule.findMany({
            where: {
                shop,
                isActive: true,
                matchType: "ip",
            },
            orderBy: { priority: "desc" },
            select: {
                id: true,
                name: true,
                ipAddresses: true,
                targetUrl: true,
                priority: true,
                ruleType: true,
            },
        });

        // Filter country rules based on schedule
        const activeCountryRules = countryRules.filter(rule => {
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
                    ipRules: [],
                    visitorIP,
                    message: "No settings configured for this shop"
                },
                { headers }
            );
        }

        // Check if visitor IP is in excluded list
        const excludedIPsList = settings.excludedIPs
            ? settings.excludedIPs.split(",").map(ip => ip.trim())
            : [];
        const isIPExcluded = excludedIPsList.includes(visitorIP);

        // Transform country rules to a simpler format for frontend
        const transformedCountryRules = activeCountryRules.map((rule) => ({
            ruleId: rule.id,
            name: rule.name,
            countries: rule.countryCodes.split(",").map((c) => c.trim().toUpperCase()),
            targetUrl: rule.targetUrl,
            ruleType: rule.ruleType,
            priority: rule.priority,
        }));

        // Transform IP rules for frontend
        const transformedIPRules = ipRulesRaw.map((rule) => ({
            ruleId: rule.id,
            name: rule.name,
            ips: rule.ipAddresses.split(",").map((ip) => ip.trim()),
            targetUrl: rule.targetUrl,
            ruleType: rule.ruleType,
            priority: rule.priority,
        }));

        const response = {
            enabled: settings.mode !== "disabled",
            mode: settings.mode,
            visitorIP, // Send visitor IP to frontend
            detectedCountry, // Country detected from IP (bypasses CDN cache)
            isIPExcluded, // Whether this IP is in the exclusion list
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
            rules: transformedCountryRules, // Country rules
            ipRules: transformedIPRules, // IP rules
        };

        console.log(`[Proxy] Config for ${shop}, visitorIP: ${visitorIP}:`, response);

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

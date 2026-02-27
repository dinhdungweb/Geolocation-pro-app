import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { getCountryFromIP } from "../utils/maxmind.server";
import { PLAN_LIMITS, FREE_PLAN } from "../billing.config";

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

    // Lookup country from IP using MaxMind GeoLite2 database (local, fast, no limits)
    let detectedCountry = "";
    try {
        detectedCountry = await getCountryFromIP(visitorIP);
        if (detectedCountry) {
            console.log(`[Proxy] Country detected from IP ${visitorIP}: ${detectedCountry}`);
        } else {
            console.log(`[Proxy] Could not detect country for IP ${visitorIP}`);
        }
    } catch (error: any) {
        console.error(`[Proxy] MaxMind lookup error for IP ${visitorIP}:`, error.message);
    }

    // Verify App Proxy Signature
    try {
        await authenticate.public.appProxy(request);
    } catch (error) {
        return json({ error: "Unauthorized: Invalid signature" }, { status: 401, headers });
    }

    try {
        // Fetch settings for the shop
        const settings = await (prisma as any).settings.findUnique({
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
                currentPlan: true,
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
                const now = new Date();

                // Get current time parts in the target timezone using Intl.DateTimeFormat
                // Use numeric types to avoid string parsing issues (e.g. "24" vs "00")
                const parts = new Intl.DateTimeFormat('en-US', {
                    timeZone: timezone,
                    hour: '2-digit',
                    minute: '2-digit',
                    weekday: 'short',
                    hour12: false,
                }).formatToParts(now);

                const hourStr = parts.find(p => p.type === 'hour')?.value ?? '0';
                const minuteStr = parts.find(p => p.type === 'minute')?.value ?? '0';
                // Normalize "24" → "00" (some systems return 24 for midnight)
                const currentHour = parseInt(hourStr, 10) % 24;
                const currentMinute = parseInt(minuteStr, 10);
                // Convert to minutes-from-midnight for reliable numeric comparison
                const currentMinutes = currentHour * 60 + currentMinute;

                // Get day of week in target timezone (0=Sun, 1=Mon…6=Sat)
                const targetTimeStr = now.toLocaleString("en-US", { timeZone: timezone });
                const targetDate = new Date(targetTimeStr);
                const currentDay = targetDate.getDay().toString();

                // Check Day of week
                if (rule.daysOfWeek && !rule.daysOfWeek.split(",").includes(currentDay)) {
                    console.log(`[Proxy] Rule "${rule.name}" skipped: day ${currentDay} not in [${rule.daysOfWeek}]`);
                    return false;
                }

                // Check Time window
                if (rule.startTime && rule.endTime) {
                    const [startH, startM] = rule.startTime.split(":").map(Number);
                    const [endH, endM] = rule.endTime.split(":").map(Number);
                    const startMinutes = startH * 60 + startM;
                    const endMinutes = endH * 60 + endM;

                    if (startMinutes <= endMinutes) {
                        // Normal range: e.g. 09:00–17:00
                        if (currentMinutes < startMinutes || currentMinutes > endMinutes) {
                            console.log(`[Proxy] Rule "${rule.name}" skipped: time ${currentHour}:${currentMinute} not in ${rule.startTime}–${rule.endTime}`);
                            return false;
                        }
                    } else {
                        // Overnight range: e.g. 22:00–06:00
                        if (currentMinutes < startMinutes && currentMinutes > endMinutes) {
                            console.log(`[Proxy] Rule "${rule.name}" skipped: time ${currentHour}:${currentMinute} not in overnight ${rule.startTime}–${rule.endTime}`);
                            return false;
                        }
                    }
                }

                return true;
            } catch (e) {
                console.error(`[Proxy] Error checking schedule for rule ${rule.name}:`, e);
                return true; // Fail safe: active if check fails
            }
        });

        // If no settings found, auto-create default settings so app works immediately
        const effectiveSettings = settings ?? await (prisma as any).settings.create({
            data: { shop },
            select: {
                mode: true,
                popupTitle: true, popupMessage: true,
                confirmBtnText: true, cancelBtnText: true,
                popupBgColor: true, popupTextColor: true, popupBtnColor: true,
                excludeBots: true, excludedIPs: true, cookieDuration: true,
                blockedTitle: true, blockedMessage: true, template: true,
                currentPlan: true,
            },
        });
        console.log(`[Proxy] ${settings ? 'Settings loaded' : 'Auto-created default settings'} for ${shop}`);

        // === PLAN LIMIT CHECK ===
        // Only enforce limits when plan is explicitly "free"
        // If currentPlan is null/empty (not yet synced), allow traffic through
        const currentPlan = (effectiveSettings as any).currentPlan || null;
        const planLimit = currentPlan ? (PLAN_LIMITS[currentPlan as keyof typeof PLAN_LIMITS] || PLAN_LIMITS[FREE_PLAN]) : PLAN_LIMITS[FREE_PLAN];

        const now = new Date();
        const yearMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
        const monthlyUsage = await (prisma as any).monthlyUsage.findUnique({
            where: {
                shop_yearMonth: { shop, yearMonth },
            },
        });
        const currentUsage = monthlyUsage?.totalVisitors || 0;

        if (currentPlan === FREE_PLAN && currentUsage >= planLimit) {
            console.log(`[Proxy] Free plan limit exceeded for ${shop}: ${currentUsage}/${planLimit}`);
            return json({
                enabled: false,
                limitExceeded: true,
                currentUsage,
                planLimit,
                currentPlan,
                message: `Monthly usage limit reached (${currentUsage}/${planLimit}). Please upgrade your plan.`,
            }, { headers });
        }

        // Check if visitor IP is in excluded list
        const excludedIPsList = effectiveSettings.excludedIPs
            ? effectiveSettings.excludedIPs.split(",").map((ip: string) => ip.trim())
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
            enabled: effectiveSettings.mode !== "disabled",
            mode: effectiveSettings.mode,
            visitorIP, // Send visitor IP to frontend
            detectedCountry, // Country detected from IP (bypasses CDN cache)
            isIPExcluded, // Whether this IP is in the exclusion list
            popup: {
                title: effectiveSettings.popupTitle,
                message: effectiveSettings.popupMessage,
                confirmBtn: effectiveSettings.confirmBtnText,
                cancelBtn: effectiveSettings.cancelBtnText,
                bgColor: effectiveSettings.popupBgColor,
                textColor: effectiveSettings.popupTextColor,
                btnColor: effectiveSettings.popupBtnColor,
                template: effectiveSettings.template || "modal",
            },
            excludeBots: effectiveSettings.excludeBots,
            cookieDuration: effectiveSettings.cookieDuration,
            blocked: {
                title: effectiveSettings.blockedTitle,
                message: effectiveSettings.blockedMessage,
            },
            rules: transformedCountryRules, // Country rules
            ipRules: transformedIPRules, // IP rules
        };

        console.log(`[Proxy] Config for ${shop}, IP: ${visitorIP}, country: ${detectedCountry}, rules: ${transformedCountryRules.length}+${transformedIPRules.length}`);

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

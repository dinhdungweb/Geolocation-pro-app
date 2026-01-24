import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import prisma from "../db.server";

/**
 * Public API endpoint to get geolocation config for a shop
 * This is called by the Theme App Extension (storefront)
 * 
 * Example: GET /api/geolocation?shop=myshop.myshopify.com
 */
export const loader = async ({ request }: LoaderFunctionArgs) => {
    const url = new URL(request.url);
    const shop = url.searchParams.get("shop");

    // Get Visitor IP
    // Shopify passes the real client IP in this header for App Proxy requests
    const visitorIP = request.headers.get("x-shopify-client-ip") ||
        request.headers.get("x-forwarded-for")?.split(',')[0] ||
        "0.0.0.0";

    // CORS headers for cross-origin requests from storefront
    const headers = {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
        "Cache-Control": "public, max-age=60", // Cache for 1 minute
    };

    if (!shop) {
        return json(
            { error: "Missing shop parameter" },
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
                blockedTitle: true,
                blockedMessage: true,
                excludeBots: true,
                excludedIPs: true,
                cookieDuration: true,
            },
        });

        // Fetch active rules for the shop
        const allRules = await prisma.redirectRule.findMany({
            where: {
                shop,
                isActive: true,
            },
            orderBy: { priority: "desc" },
            select: {
                id: true,
                name: true,
                matchType: true,
                ruleType: true,
                countryCodes: true,
                ipAddresses: true,
                targetUrl: true,
                priority: true,
            },
        });

        // If no settings found, return default disabled state
        if (!settings) {
            return json(
                {
                    enabled: false,
                    mode: "disabled",
                    visitorIP,
                    rules: [],
                    ipRules: []
                },
                { headers }
            );
        }

        // Check if visitor IP is globally excluded
        const isIPExcluded = settings.excludedIPs
            ? settings.excludedIPs.split(',').map(ip => ip.trim()).includes(visitorIP)
            : false;

        // Transform Country rules
        const rules = allRules
            .filter(r => r.matchType === 'country')
            .map((rule) => ({
                ruleId: rule.id,
                name: rule.name,
                ruleType: rule.ruleType,
                countries: rule.countryCodes.split(",").map((c) => c.trim().toUpperCase()),
                targetUrl: rule.targetUrl,
                priority: rule.priority,
            }));

        // Transform IP rules
        const ipRules = allRules
            .filter(r => r.matchType === 'ip')
            .map((rule) => ({
                ruleId: rule.id,
                name: rule.name,
                ruleType: rule.ruleType,
                ips: rule.ipAddresses.split(",").map((ip) => ip.trim()),
                targetUrl: rule.targetUrl,
                priority: rule.priority,
            }));

        return json(
            {
                enabled: settings.mode !== "disabled",
                mode: settings.mode,
                visitorIP,
                isIPExcluded,
                popup: {
                    title: settings.popupTitle,
                    message: settings.popupMessage,
                    confirmBtn: settings.confirmBtnText,
                    cancelBtn: settings.cancelBtnText,
                    bgColor: settings.popupBgColor,
                    textColor: settings.popupTextColor,
                    btnColor: settings.popupBtnColor,
                },
                blocked: {
                    title: settings.blockedTitle,
                    message: settings.blockedMessage,
                },
                excludeBots: settings.excludeBots,
                cookieDuration: settings.cookieDuration,
                rules: rules,
                ipRules: ipRules,
            },
            { headers }
        );
    } catch (error) {
        console.error("Error fetching geolocation config:", error);
        return json(
            { error: "Internal server error" },
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

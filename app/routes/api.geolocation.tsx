import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import prisma from "../db.server";
import { getCountryFromIP } from "../utils/maxmind.server";
import { authenticate } from "../shopify.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
    const url = new URL(request.url);
    const shop = url.searchParams.get("shop");
    const currentPath = url.searchParams.get("path") || "/";

    // Get Visitor IP
    const visitorIP = request.headers.get("x-shopify-client-ip") ||
        request.headers.get("x-forwarded-for")?.split(',')[0] ||
        "0.0.0.0";

    // Detect country from IP
    const detectedCountry = await getCountryFromIP(visitorIP);

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
                blockVpn: true,
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
                pageTargetingType: true,
                pagePaths: true,
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

        // VPN/Proxy & Apple Private Relay Detection
        let vpnBlocked = false;
        if (settings.blockVpn && !isIPExcluded && visitorIP !== "0.0.0.0" && visitorIP !== "127.0.0.1" && visitorIP !== "::1") {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 2000); // 2 second timeout

            try {
                // Using ip-api.com for basic VPN/Proxy detection
                const proxyResponse = await fetch(
                    `http://ip-api.com/json/${visitorIP}?fields=status,message,proxy,hosting,isp,org`,
                    { signal: controller.signal }
                );
                
                if (proxyResponse.ok) {
                    const data = await proxyResponse.json();
                    
                    if (data.status === "success") {
                        const isProxyOrHosting = data.proxy || data.hosting;
                        const isAppleRelay = (data.isp && data.isp.includes('iCloud Private Relay')) || 
                                           (data.org && data.org.includes('Apple Inc.') && data.proxy);
                        
                        if (isProxyOrHosting || isAppleRelay) {
                            vpnBlocked = true;
                            console.log(`[Geopro VPN Block] Blocked IP: ${visitorIP} | Reason: ${isAppleRelay ? 'Apple Private Relay' : 'VPN/Proxy/Hosting'}`);
                        }
                    } else {
                        console.warn(`[Geopro VPN Check] API returned error for ${visitorIP}: ${data.message}`);
                    }
                }
            } catch (err: any) {
                if (err.name === 'AbortError') {
                    console.warn(`[Geopro VPN Check] API timeout for IP ${visitorIP} (2s reached)`);
                } else {
                    console.error("[Geopro VPN Check] Error resolving proxy for IP", visitorIP, err);
                }
                // Fail-open logic remains: vpnBlocked is false
            } finally {
                clearTimeout(timeoutId);
            }
        }

        // Page Targeting Logic
        const checkPageTargeting = (rule: any, path: string) => {
            const type = rule.pageTargetingType || "all";
            if (type === "all") return true;

            const paths = (rule.pagePaths || "")
                .split(/[\n,]+/)
                .map((p: string) => p.trim())
                .filter(Boolean);
            
            if (paths.length === 0) return type === "exclude";

            const isMatch = paths.some((p: string) => {
                if (p.endsWith("*")) {
                    const prefix = p.slice(0, -1);
                    return path.startsWith(prefix);
                }
                return path === p;
            });

            return type === "include" ? isMatch : !isMatch;
        };

        // Transform Country rules
        const rules = allRules
            .filter(r => r.matchType === 'country' && checkPageTargeting(r, currentPath))
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
            .filter(r => r.matchType === 'ip' && checkPageTargeting(r, currentPath))
            .map((rule) => ({
                ruleId: rule.id,
                name: rule.name,
                ruleType: rule.ruleType,
                ips: rule.ipAddresses.split(/[\n,]+/).map((ip) => ip.trim()).filter(Boolean),
                targetUrl: rule.targetUrl,
                priority: rule.priority,
            }));

        return json(
            {
                enabled: settings.mode !== "disabled",
                mode: settings.mode,
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
                vpnBlocked,
                rules: rules,
                ipRules: ipRules,
                detectedCountry,
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

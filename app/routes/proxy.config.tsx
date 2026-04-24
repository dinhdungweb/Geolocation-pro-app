import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { isbot } from "isbot";
import { FREE_PLAN, PLAN_LIMITS } from "../billing.config";
import prisma from "../db.server";
import { authenticate } from "../shopify.server";
import {
  createAnalyticsToken,
  getYearMonth,
  hashIP,
  type RuleSource,
  type StorefrontAction,
} from "../utils/analytics-token.server";
import { getCountryFromIP } from "../utils/maxmind.server";
import { getVisitorIP } from "../utils/request-ip.server";

type ProxyRule = {
  id: string;
  name: string;
  countryCodes?: string;
  ipAddresses?: string;
  targetUrl: string;
  priority: number;
  ruleType: string;
  redirectMode: string;
  scheduleEnabled?: boolean;
  startTime?: string | null;
  endTime?: string | null;
  daysOfWeek?: string | null;
  timezone?: string | null;
  pageTargetingType: string;
  pagePaths?: string | null;
};

const corsHeaders = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Cache-Control": "no-store, no-cache, must-revalidate",
};

const VPN_CACHE_MAX_SIZE = 10_000;
const VPN_CACHE_TTL_MS = 10 * 60 * 1000;
const IP_API_FREE_URL = "http://ip-api.com/json/{ip}?fields=status,message,proxy,hosting,query";
const vpnCache = new Map<string, { blocked: boolean; expiresAt: number }>();

// Evict expired entries and enforce size limit
function vpnCacheSet(key: string, value: { blocked: boolean; expiresAt: number }) {
  // Periodically purge expired entries when cache is getting large
  if (vpnCache.size >= VPN_CACHE_MAX_SIZE) {
    const now = Date.now();
    for (const [k, v] of vpnCache) {
      if (v.expiresAt <= now) vpnCache.delete(k);
    }
    // If still over limit after purge, delete oldest 20%
    if (vpnCache.size >= VPN_CACHE_MAX_SIZE) {
      const toDelete = Math.floor(VPN_CACHE_MAX_SIZE * 0.2);
      let deleted = 0;
      for (const k of vpnCache.keys()) {
        if (deleted >= toDelete) break;
        vpnCache.delete(k);
        deleted++;
      }
    }
  }
  vpnCache.set(key, value);
}


function isLocalOrUnknownIP(ip: string) {
  return ip === "0.0.0.0" || ip === "127.0.0.1" || ip === "::1";
}

function normalizeCountryCode(country: string | null) {
  const normalized = country?.trim().toUpperCase() || "";
  return /^[A-Z]{2}$/.test(normalized) ? normalized : "";
}

function isIPMatch(visitorIP: string, ipPattern: string) {
  if (!visitorIP || !ipPattern) return false;

  const trimmedIP = visitorIP.trim();
  const trimmedPattern = ipPattern.trim();
  if (!trimmedIP || !trimmedPattern) return false;
  if (trimmedIP === trimmedPattern) return true;
  if (trimmedIP.toLowerCase() === trimmedPattern.toLowerCase()) return true;

  const isIPv6 = trimmedIP.includes(":");
  const isPatternIPv6 = trimmedPattern.includes(":");

  if (isIPv6 && isPatternIPv6) {
    const patternPrefix = trimmedPattern.replace(/::$/, "").toLowerCase();
    if (trimmedIP.toLowerCase().startsWith(patternPrefix)) return true;

    if (trimmedPattern.includes("/")) {
      const [network] = trimmedPattern.split("/");
      const networkPrefix = network.replace(/::$/, "").toLowerCase();
      return trimmedIP.toLowerCase().startsWith(networkPrefix);
    }
  }

  if (!isIPv6 && !isPatternIPv6 && trimmedPattern.includes("/")) {
    const [network, bits] = trimmedPattern.split("/");
    const maskBits = Number.parseInt(bits, 10);
    if (Number.isNaN(maskBits) || maskBits < 0 || maskBits > 32) return false;

    const ipParts = trimmedIP.split(".").map(Number);
    const networkParts = network.split(".").map(Number);
    if (
      ipParts.length !== 4 ||
      networkParts.length !== 4 ||
      ipParts.some((part) => Number.isNaN(part) || part < 0 || part > 255) ||
      networkParts.some((part) => Number.isNaN(part) || part < 0 || part > 255)
    ) {
      return false;
    }

    const ipInt =
      ((ipParts[0] << 24) | (ipParts[1] << 16) | (ipParts[2] << 8) | ipParts[3]) >>>
      0;
    const networkInt =
      ((networkParts[0] << 24) |
        (networkParts[1] << 16) |
        (networkParts[2] << 8) |
        networkParts[3]) >>>
      0;
    const mask = maskBits === 0 ? 0 : (~0 << (32 - maskBits)) >>> 0;
    return (ipInt & mask) === (networkInt & mask);
  }

  return false;
}

function isRuleInSchedule(rule: ProxyRule) {
  if (!rule.scheduleEnabled) return true;

  try {
    const timezone = rule.timezone || "UTC";
    const now = new Date();
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      hour: "2-digit",
      minute: "2-digit",
      weekday: "short",
      hour12: false,
    }).formatToParts(now);

    const currentHour = Number.parseInt(parts.find((part) => part.type === "hour")?.value ?? "0", 10) % 24;
    const currentMinute = Number.parseInt(parts.find((part) => part.type === "minute")?.value ?? "0", 10);
    const currentMinutes = currentHour * 60 + currentMinute;
    const targetDate = new Date(now.toLocaleString("en-US", { timeZone: timezone }));
    const currentDay = targetDate.getDay().toString();

    if (rule.daysOfWeek && !rule.daysOfWeek.split(",").includes(currentDay)) {
      return false;
    }

    if (rule.startTime && rule.endTime) {
      const [startH, startM] = rule.startTime.split(":").map(Number);
      const [endH, endM] = rule.endTime.split(":").map(Number);
      const startMinutes = startH * 60 + startM;
      const endMinutes = endH * 60 + endM;

      if (startMinutes <= endMinutes) {
        return currentMinutes >= startMinutes && currentMinutes <= endMinutes;
      }
      return currentMinutes >= startMinutes || currentMinutes <= endMinutes;
    }

    return true;
  } catch (error) {
    console.error(`[Proxy] Error checking schedule for rule ${rule.name}:`, error);
    return true;
  }
}

function isRuleOnPage(rule: ProxyRule, path: string) {
  const type = rule.pageTargetingType || "all";
  if (type === "all") return true;

  const paths = (rule.pagePaths || "")
    .split(/[\n,]+/)
    .map((item) => item.trim())
    .filter(Boolean);

  if (paths.length === 0) return type === "exclude";

  const isMatch = paths.some((configuredPath) => {
    if (configuredPath.endsWith("*")) {
      return path.startsWith(configuredPath.slice(0, -1));
    }
    return path === configuredPath;
  });

  return type === "include" ? isMatch : !isMatch;
}

function getActionForRule(rule: ProxyRule): StorefrontAction {
  if (rule.ruleType === "block") return "block";
  return rule.redirectMode === "auto_redirect" ? "auto_redirect" : "popup";
}

function getAnalyticsEvent(action: StorefrontAction, source: RuleSource) {
  if (action === "popup") return "popup_shown";
  if (action === "auto_redirect") return source === "ip" ? "ip_redirected" : "auto_redirected";
  if (action === "block") {
    if (source === "ip") return "ip_blocked";
    if (source === "vpn") return "vpn_blocked";
    return "blocked";
  }
  return null;
}

function buildPopup(settings: any) {
  return {
    title: settings.popupTitle,
    message: settings.popupMessage,
    confirmBtn: settings.confirmBtnText,
    cancelBtn: settings.cancelBtnText,
    bgColor: settings.popupBgColor,
    textColor: settings.popupTextColor,
    btnColor: settings.popupBtnColor,
    template: settings.template || "modal",
    cookieDuration: settings.cookieDuration,
  };
}

function buildBlocked(settings: any) {
  return {
    title: settings.blockedTitle,
    message: settings.blockedMessage,
  };
}

function buildVpnProviderUrl(providerUrl: string, visitorIP: string) {
  const rawProviderUrl = providerUrl.trim();
  if (!rawProviderUrl) return null;

  const hasProtocol = /^[a-z][a-z\d+\-.]*:\/\//i.test(rawProviderUrl);
  const providerUrlWithProtocol = hasProtocol ? rawProviderUrl : `https://${rawProviderUrl}`;
  const parsedUrl = new URL(providerUrlWithProtocol);
  const hostname = parsedUrl.hostname.toLowerCase();

  if (hostname === "ip-api.com" || hostname === "www.ip-api.com") {
    return new URL(IP_API_FREE_URL.replace("{ip}", encodeURIComponent(visitorIP)));
  }

  if (parsedUrl.protocol !== "https:") return null;

  if (rawProviderUrl.includes("{ip}")) {
    return new URL(providerUrlWithProtocol.replace("{ip}", encodeURIComponent(visitorIP)));
  }

  parsedUrl.searchParams.set("ip", visitorIP);
  return parsedUrl;
}

async function checkVpnBlocked(visitorIP: string, ipHash: string) {
  const providerUrl = process.env.VPN_CHECK_API_URL;
  if (!providerUrl || isLocalOrUnknownIP(visitorIP)) {
    return false;
  }

  const now = Date.now();
  const cached = vpnCache.get(ipHash);
  if (cached && cached.expiresAt > now) return cached.blocked;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 2000);

  try {
    const url = buildVpnProviderUrl(providerUrl, visitorIP);
    if (!url) return false;

    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) return false;

    const data = await response.json();
    if (data.status === "fail") return false;

    const blocked = Boolean(
      data.proxy ||
        data.hosting ||
        data.vpn ||
        data.tor ||
        data.is_proxy ||
        data.is_vpn ||
        data.security?.proxy ||
        data.security?.vpn ||
        data.security?.tor ||
        ((data.isp || "").includes("iCloud Private Relay") ||
          ((data.org || "").includes("Apple Inc.") && data.proxy))
    );

    vpnCacheSet(ipHash, { blocked, expiresAt: now + VPN_CACHE_TTL_MS });
    return blocked;
  } catch (error: any) {
    if (error?.name !== "AbortError") {
      console.error("[Proxy VPN Check] Error resolving proxy status:", error);
    }
    return false;
  } finally {
    clearTimeout(timeoutId);
  }
}

function buildRulePayload(rule: ProxyRule, source: RuleSource) {
  return {
    ruleId: rule.id,
    name: rule.name,
    targetUrl: rule.targetUrl,
    ruleType: rule.ruleType,
    redirectMode: rule.redirectMode,
    source,
  };
}

function buildActionResponse({
  action,
  analyticsEvent,
  blocked,
  countryCode,
  currentPath,
  currentPlan,
  eventToken,
  limitExceeded = false,
  planLimit,
  popup,
  rule,
  usage,
}: {
  action: StorefrontAction;
  analyticsEvent: string | null;
  blocked: any;
  countryCode: string;
  currentPath: string;
  currentPlan: string;
  eventToken: string | null;
  limitExceeded?: boolean;
  planLimit: number;
  popup: any;
  rule: ReturnType<typeof buildRulePayload> | null;
  usage: number;
}) {
  return {
    enabled: !limitExceeded && action !== "none",
    action,
    analyticsEvent,
    blocked,
    countryCode,
    currentPath,
    currentPlan,
    eventToken,
    limitExceeded,
    planLimit,
    popup,
    rule,
    usage,
  };
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);
  const shop = url.searchParams.get("shop");
  const currentPath = url.searchParams.get("path") || "/";
  const shopifyCountryCode = normalizeCountryCode(url.searchParams.get("country"));

  if (!shop) {
    return json({ error: "Missing shop parameter", enabled: false, action: "none" }, { status: 400, headers: corsHeaders });
  }

  try {
    await authenticate.public.appProxy(request);
  } catch {
    return json({ error: "Unauthorized: Invalid signature", enabled: false, action: "none" }, { status: 401, headers: corsHeaders });
  }

  const visitorIP = getVisitorIP(request);
  const ipHash = hashIP(visitorIP);
  let countryCode = shopifyCountryCode;

  if (!countryCode) {
    try {
      countryCode = await getCountryFromIP(visitorIP);
    } catch (error: any) {
      console.error(`[Proxy] MaxMind lookup error:`, error.message);
    }
  }

  if (process.env.GEO_DEBUG_IP === "true") {
    console.log("[Proxy IP Debug]", {
      countryCode,
      forwardedFor: request.headers.get("x-forwarded-for"),
      shopifyClientIp: request.headers.get("x-shopify-client-ip"),
      shopifyCountryCode,
      visitorIP,
    });
  }

  try {
    const settings =
      (await prisma.settings.findUnique({ where: { shop } })) ??
      (await prisma.settings.create({ data: { shop } }));

    const currentPlan = settings.currentPlan || FREE_PLAN;
    const planLimit = PLAN_LIMITS[currentPlan as keyof typeof PLAN_LIMITS] || PLAN_LIMITS[FREE_PLAN];
    const yearMonth = getYearMonth();
    const monthlyUsage = await prisma.monthlyUsage.findUnique({
      where: { shop_yearMonth: { shop, yearMonth } },
    });
    const currentUsage = monthlyUsage?.totalVisitors || 0;
    const popup = buildPopup(settings);
    const blocked = buildBlocked(settings);

    if (!settings.isEnabled || settings.mode === "disabled") {
      return json(
        buildActionResponse({
          action: "none",
          analyticsEvent: null,
          blocked,
          countryCode,
          currentPath,
          currentPlan,
          eventToken: null,
          planLimit,
          popup,
          rule: null,
          usage: currentUsage,
        }),
        { headers: corsHeaders }
      );
    }

    if (currentPlan === FREE_PLAN && currentUsage >= planLimit) {
      return json(
        buildActionResponse({
          action: "none",
          analyticsEvent: null,
          blocked,
          countryCode,
          currentPath,
          currentPlan,
          eventToken: null,
          limitExceeded: true,
          planLimit,
          popup,
          rule: null,
          usage: currentUsage,
        }),
        { headers: corsHeaders }
      );
    }

    if (settings.excludeBots && isbot(request.headers.get("user-agent") || "")) {
      return json(
        buildActionResponse({
          action: "none",
          analyticsEvent: null,
          blocked,
          countryCode,
          currentPath,
          currentPlan,
          eventToken: null,
          planLimit,
          popup,
          rule: null,
          usage: currentUsage,
        }),
        { headers: corsHeaders }
      );
    }

    const isIPExcluded = settings.excludedIPs
      .split(",")
      .map((ip) => ip.trim())
      .filter(Boolean)
      .some((excludedIP) => isIPMatch(visitorIP, excludedIP));

    if (isIPExcluded) {
      return json(
        buildActionResponse({
          action: "none",
          analyticsEvent: null,
          blocked,
          countryCode,
          currentPath,
          currentPlan,
          eventToken: null,
          planLimit,
          popup,
          rule: null,
          usage: currentUsage,
        }),
        { headers: corsHeaders }
      );
    }

    let selectedRule: ProxyRule | null = null;
    let source: RuleSource | null = null;
    let action: StorefrontAction = "none";

    if (settings.blockVpn && (await checkVpnBlocked(visitorIP, ipHash))) {
      source = "vpn";
      action = "block";
      selectedRule = {
        id: "vpn-shield",
        name: "Anti-Fraud Shield",
        targetUrl: "",
        priority: Number.MAX_SAFE_INTEGER,
        ruleType: "block",
        redirectMode: "block",
        pageTargetingType: "all",
      };
    }

    if (!selectedRule && currentPlan !== FREE_PLAN) {
      const ipRules = await prisma.redirectRule.findMany({
        where: { shop, isActive: true, matchType: "ip" },
        orderBy: { priority: "desc" },
        select: {
          id: true,
          name: true,
          ipAddresses: true,
          targetUrl: true,
          priority: true,
          ruleType: true,
          redirectMode: true,
          pageTargetingType: true,
          pagePaths: true,
        },
      });

      selectedRule =
        ipRules
          .filter((rule) => isRuleOnPage(rule, currentPath))
          .find((rule) =>
            rule.ipAddresses
              .split(",")
              .map((ip) => ip.trim())
              .filter(Boolean)
              .some((ip) => isIPMatch(visitorIP, ip))
          ) || null;

      if (selectedRule) {
        source = "ip";
        action = getActionForRule(selectedRule);
      }
    }

    if (!selectedRule && countryCode) {
      const countryRules = await prisma.redirectRule.findMany({
        where: { shop, isActive: true, matchType: "country" },
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
          redirectMode: true,
          pageTargetingType: true,
          pagePaths: true,
        },
      });

      const eligibleCountryRules = countryRules
        .filter((rule) => isRuleInSchedule(rule))
        .filter((rule) => isRuleOnPage(rule, currentPath))
        .filter((rule) => currentPlan !== FREE_PLAN || rule.ruleType !== "block");

      selectedRule =
        eligibleCountryRules.find((rule) =>
          rule.countryCodes
            .split(",")
            .map((code) => code.trim().toUpperCase())
            .includes(countryCode.toUpperCase())
        ) || null;

      if (selectedRule) {
        source = "country";
        action = getActionForRule(selectedRule);
      }
    }

    const rulePayload = selectedRule && source ? buildRulePayload(selectedRule, source) : null;
    const analyticsEvent = source ? getAnalyticsEvent(action, source) : null;
    const eventToken =
      selectedRule && source && action !== "none"
        ? createAnalyticsToken({
            shop,
            yearMonth,
            ruleId: selectedRule.id,
            action,
            source,
            path: currentPath,
            countryCode,
            ipHash,
          })
        : null;

    return json(
      buildActionResponse({
        action,
        analyticsEvent,
        blocked,
        countryCode,
        currentPath,
        currentPlan,
        eventToken,
        planLimit,
        popup,
        rule: rulePayload,
        usage: currentUsage,
      }),
      { headers: corsHeaders }
    );
  } catch (error) {
    console.error("[Proxy] Error resolving storefront action:", error);
    return json({ error: "Internal server error", enabled: false, action: "none" }, { status: 500, headers: corsHeaders });
  }
};

export const action = async ({ request }: LoaderFunctionArgs) => {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }
  return json({ error: "Method not allowed" }, { status: 405, headers: corsHeaders });
};

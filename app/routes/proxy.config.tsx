import type { LoaderFunctionArgs } from "react-router";
import { isbot } from "isbot";
import { FREE_PLAN, getPlanLimit } from "../billing.config";
import prisma from "../db.server";
import { authenticate } from "../shopify.server";
import {
  createAnalyticsEvent,
  hashIP,
  type RuleSource,
  type StorefrontAction,
} from "../utils/analytics-token.server";
import { getUsagePeriodForShop } from "../utils/billing-period.server";
import { resolveEffectivePlan } from "../utils/effective-plan.server";
import { getGeoFromIP } from "../utils/maxmind.server";
import {
  assessIpRisk,
  shouldBlockIpRisk,
} from "../utils/ip-risk.server";
import { getVisitorIP } from "../utils/request-ip.server";
import {
  enqueueStorefrontAnalyticsEvent,
  recordBillableUsage,
  startStorefrontAnalyticsQueueWorker,
} from "../utils/storefront-analytics.server";

import {
  getStorefrontConfigCache,
  setStorefrontConfigCache,
} from "../utils/storefront-config-cache.server";
import { normalizePagePathPattern, splitPagePathPatterns } from "../utils/page-targeting";
import { stateCodeMatchesRegion } from "../utils/states";
import { cityMatchesRule } from "../utils/city-targeting";

function responseData<T>(payload: T, init?: Parameters<typeof Response.json>[1]) {
  return Response.json(payload, init);
}

type ProxyRule = {
  id: string;
  name: string;
  countryCodes?: string;
  ipAddresses?: string;
  marketHandles?: string;
  marketCountryCodes?: string;
  matchType: string;
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
  stateCodes?: string;
  cityNames?: string;
  cityCountryCode?: string;
  cityRegionCode?: string;
};

type StorefrontRuntimeConfig = {
  activeRules: ProxyRule[];
  currentPlan: string;
  currentUsage: number;
  hasPaidPlan: boolean;
  planLimit: number;
  settings: any;
  usagePeriod: Awaited<ReturnType<typeof getUsagePeriodForShop>>;
};

const corsHeaders = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Cache-Control": "no-store, no-cache, must-revalidate",
};

function normalizeCountryCode(country: string | null) {
  const normalized = country?.trim().toUpperCase() || "";
  return /^[A-Z]{2}$/.test(normalized) ? normalized : "";
}

function normalizeMarketValue(value: string | null) {
  return value?.trim().toLowerCase() || "";
}

function parseCookieHeader(cookieHeader: string | null) {
  const cookies = new Map<string, string>();
  if (!cookieHeader) return cookies;

  cookieHeader.split(";").forEach((part) => {
    const [rawName, ...rawValue] = part.trim().split("=");
    if (!rawName) return;
    try {
      cookies.set(rawName, decodeURIComponent(rawValue.join("=")));
    } catch {
      cookies.set(rawName, rawValue.join("="));
    }
  });

  return cookies;
}

function normalizePath(path: string) {
  return path.replace(/\/+$/, "") || "/";
}

function getSafeOrigin(origin: string | null) {
  if (!origin) return "https://storefront.local";
  try {
    const parsed = new URL(origin);
    if (parsed.protocol === "http:" || parsed.protocol === "https:") {
      return parsed.origin;
    }
  } catch {
    // Invalid origins use the safe storefront fallback below.
  }
  return "https://storefront.local";
}

function isAlreadyOnTargetUrl(targetUrl: string, currentPath: string, currentOrigin: string | null) {
  if (!targetUrl) return true;

  try {
    const current = new URL(currentPath || "/", getSafeOrigin(currentOrigin));
    const target = new URL(targetUrl, current.origin);

    if (current.origin !== target.origin) return false;
    return normalizePath(current.pathname) === normalizePath(target.pathname);
  } catch {
    return false;
  }
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

  const currentPath = normalizePagePathPattern(path);
  const paths = splitPagePathPatterns(rule.pagePaths);

  if (paths.length === 0) return type === "exclude";

  const isMatch = paths.some((configuredPath) => {
    if (configuredPath.endsWith("*")) {
      return currentPath.startsWith(configuredPath.slice(0, -1));
    }
    return currentPath === configuredPath;
  });

  return type === "include" ? isMatch : !isMatch;
}

function isMarketMatch(rule: ProxyRule, marketHandle: string, marketId: string, countryCode: string) {
  const handle = normalizeMarketValue(marketHandle);
  const id = normalizeMarketValue(marketId);
  const country = normalizeCountryCode(countryCode);
  if (!handle && !id && !country) return false;

  const matchesCurrentMarket = (rule.marketHandles || "")
    .split(/[\n,]+/)
    .map((market) => normalizeMarketValue(market))
    .filter(Boolean)
    .some((market) => market === "*" || market === handle || market === id);

  if (matchesCurrentMarket) return true;

  return (rule.marketCountryCodes || "")
    .split(/[\n,]+/)
    .map((code) => normalizeCountryCode(code))
    .filter(Boolean)
    .some((code) => code === country);
}

function canRunCountryRule(rule: ProxyRule, hasPaidPlan: boolean) {
  if (hasPaidPlan) return true;
  return rule.ruleType !== "block" && (rule.pageTargetingType || "all") === "all";
}

function isCountryMatch(rule: ProxyRule, countryCode: string) {
  const country = normalizeCountryCode(countryCode);
  if (!country) return false;

  return (rule.countryCodes || "")
    .split(/[\n,]+/)
    .map((code) => code.trim().toUpperCase())
    .filter(Boolean)
    .some((code) => code === "*" || code === country);
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

function buildBlocked(settings: any, appOrigin: string) {
  return {
    title: settings.blockedTitle,
    message: settings.blockedMessage,
    logoUrl: settings.blockedLogoUrl,
    defaultImageUrl: new URL("/access-denied.webp", appOrigin).toString(),
    bgColor: settings.blockedBgColor,
    textColor: settings.blockedTextColor,
    accentColor: settings.blockedAccentColor,
    supportText: settings.blockedSupportText,
    supportUrl: settings.blockedSupportUrl,
  };
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
  debug,
  eventToken,
  limitExceeded = false,
  planLimit,
  popup,
  regionCode,
  regionName,
  city = "",
  rule,
  usage,
  visitToken,
}: {
  action: StorefrontAction;
  analyticsEvent: string | null;
  blocked: any;
  countryCode: string;
  currentPath: string;
  currentPlan: string;
  debug?: Record<string, string | null>;
  eventToken: string | null;
  limitExceeded?: boolean;
  planLimit: number;
  popup: any;
  regionCode?: string;
  regionName?: string;
  city?: string;
  rule: ReturnType<typeof buildRulePayload> | null;
  usage: number;
  visitToken?: string | null;
}) {
  return {
    enabled: !limitExceeded && action !== "none",
    action,
    analyticsEvent,
    blocked,
    countryCode,
    currentPath,
    currentPlan,
    ...(debug ? { debug } : {}),
    eventToken,
    limitExceeded,
    planLimit,
    popup,
    regionCode,
    regionName,
    city,
    rule,
    usage,
    visitToken,
  };
}

async function loadStorefrontRuntimeConfig(shop: string): Promise<StorefrontRuntimeConfig | null> {
  const cached = getStorefrontConfigCache<StorefrontRuntimeConfig>(shop);
  if (cached) return cached;

  const settings = await prisma.settings.findUnique({ where: { shop } });
  if (!settings) return null;

  const { effectivePlan: currentPlan } = resolveEffectivePlan({ settings });
  const hasPaidPlan = currentPlan !== FREE_PLAN;
  const planLimit = getPlanLimit(currentPlan, settings);
  const usagePeriod = await getUsagePeriodForShop({ shop, currentPlan, settings });

  const [monthlyUsage, activeRules] = await Promise.all([
    prisma.monthlyUsage.findUnique({
      where: { shop_billingPeriodKey: { shop, billingPeriodKey: usagePeriod.key } },
    }),
    prisma.redirectRule.findMany({
      where: { shop, isActive: true },
      orderBy: { priority: "desc" },
      select: {
        id: true,
        name: true,
        countryCodes: true,
        ipAddresses: true,
        marketHandles: true,
        marketCountryCodes: true,
        matchType: true,
        targetUrl: true,
        priority: true,
        ruleType: true,
        redirectMode: true,
        scheduleEnabled: true,
        startTime: true,
        endTime: true,
        daysOfWeek: true,
        timezone: true,
        pageTargetingType: true,
        pagePaths: true,
        stateCodes: true,
        cityNames: true,
        cityCountryCode: true,
        cityRegionCode: true,
      },
    }),
  ]);

  return setStorefrontConfigCache(shop, {
    activeRules,
    currentPlan,
    currentUsage: monthlyUsage?.totalVisitors || 0,
    hasPaidPlan,
    planLimit,
    settings,
    usagePeriod,
  });
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  startStorefrontAnalyticsQueueWorker();

  const url = new URL(request.url);
  const shop = url.searchParams.get("shop");
  const currentPath = url.searchParams.get("path") || "/";
  const currentOrigin = url.searchParams.get("origin");
  const shopifyCountryCode = normalizeCountryCode(url.searchParams.get("country"));
  const shopifyMarketHandle = normalizeMarketValue(url.searchParams.get("market_handle"));
  const shopifyMarketId = normalizeMarketValue(url.searchParams.get("market_id"));
  const debugRequested = url.searchParams.get("debug") === "true" || url.searchParams.get("geo_debug") === "true";

  if (!shop) {
    return responseData({ error: "Missing shop parameter", enabled: false, action: "none" }, { status: 400, headers: corsHeaders });
  }

  try {
    await authenticate.public.appProxy(request);
  } catch {
    return responseData({ error: "Unauthorized: Invalid signature", enabled: false, action: "none" }, { status: 401, headers: corsHeaders });
  }

  const visitorIP = getVisitorIP(request);
  const ipHash = hashIP(visitorIP);
  let maxmindCountryCode = "";
  let countryCode = "";
  let regionCode = "";
  let regionName = "";
  let city = "";

  try {
    const geoResult = await getGeoFromIP(visitorIP);
    maxmindCountryCode = geoResult.countryCode;
    countryCode = geoResult.countryCode;
    regionCode = geoResult.regionCode;
    regionName = geoResult.regionName;
    city = geoResult.city;
  } catch (error: any) {
    console.error(`[Proxy] MaxMind lookup error:`, error.message);
  }

  if (!countryCode) countryCode = shopifyCountryCode;
  const buildDebug = () =>
    debugRequested
      ? {
          cfConnectingIp: request.headers.get("cf-connecting-ip"),
          countryCode,
          forwardedFor: request.headers.get("x-forwarded-for"),
          maxmindCountryCode,
          regionCode,
          regionName,
          city,
          shopifyMarketHandle,
          shopifyMarketId,
          realIp: request.headers.get("x-real-ip"),
          shopifyClientIp: request.headers.get("x-shopify-client-ip"),
          shopifyCountryCode,
          visitorIP,
        }
      : undefined;
  let debug = buildDebug();

  if (process.env.GEO_DEBUG_IP === "true") {
    console.log("[Proxy IP Debug]", debug ?? {
      countryCode,
      forwardedFor: request.headers.get("x-forwarded-for"),
      maxmindCountryCode,
      regionCode,
      regionName,
      city,
      shopifyMarketHandle,
      shopifyMarketId,
      shopifyClientIp: request.headers.get("x-shopify-client-ip"),
      shopifyCountryCode,
      visitorIP,
    });
  }

  try {
    const runtimeConfig = await loadStorefrontRuntimeConfig(shop);
    if (!runtimeConfig) {
      return responseData(
        buildActionResponse({
          action: "none",
          analyticsEvent: null,
          blocked: null,
          countryCode,
          currentPath,
          currentPlan: FREE_PLAN,
          debug,
          eventToken: null,
          planLimit: getPlanLimit(FREE_PLAN),
          popup: null,
          regionCode,
          regionName,
          rule: null,
          usage: 0,
          visitToken: null,
        }),
        { headers: corsHeaders }
      );
    }

    const {
      activeRules,
      currentPlan,
      currentUsage,
      hasPaidPlan,
      planLimit,
      settings,
      usagePeriod,
    } = runtimeConfig;
    const popup = buildPopup(settings);
    const appOrigin = process.env.SHOPIFY_APP_URL || new URL(request.url).origin;
    const blocked = buildBlocked(settings, appOrigin);
    const visitAnalytics = createAnalyticsEvent({
      shop,
      yearMonth: usagePeriod.yearMonth,
      billingPeriodKey: usagePeriod.key,
      ruleId: "visit",
      action: "none",
      source: "country",
      path: currentPath,
      countryCode,
      regionCode,
      regionName,
      city,
      ipHash,
    });
    const visitToken = visitAnalytics.token;

    if (!settings.isEnabled || settings.mode === "disabled") {
      return responseData(
        buildActionResponse({
          action: "none",
          analyticsEvent: null,
          blocked,
          countryCode,
          currentPath,
          currentPlan,
          debug,
          eventToken: null,
          planLimit,
          popup,
          regionCode,
          regionName,
          rule: null,
          usage: currentUsage,
          visitToken,
        }),
        { headers: corsHeaders }
      );
    }

    if (currentPlan === FREE_PLAN && currentUsage >= planLimit) {
      return responseData(
        buildActionResponse({
          action: "none",
          analyticsEvent: null,
          blocked,
          countryCode,
          currentPath,
          currentPlan,
          debug,
          eventToken: null,
          limitExceeded: true,
          planLimit,
          popup,
          regionCode,
          regionName,
          rule: null,
          usage: currentUsage,
          visitToken,
        }),
        { headers: corsHeaders }
      );
    }

    if (settings.excludeBots && isbot(request.headers.get("user-agent") || "")) {
      return responseData(
        buildActionResponse({
          action: "none",
          analyticsEvent: null,
          blocked,
          countryCode,
          currentPath,
          currentPlan,
          debug,
          eventToken: null,
          planLimit,
          popup,
          regionCode,
          regionName,
          rule: null,
          usage: currentUsage,
          visitToken,
        }),
        { headers: corsHeaders }
      );
    }

    const isIPExcluded = settings.excludedIPs
      .split(",")
      .map((ip: string) => ip.trim())
      .filter(Boolean)
      .some((excludedIP: string) => isIPMatch(visitorIP, excludedIP));

    if (isIPExcluded) {
      return responseData(
        buildActionResponse({
          action: "none",
          analyticsEvent: null,
          blocked,
          countryCode,
          currentPath,
          currentPlan,
          debug,
          eventToken: null,
          planLimit,
          popup,
          regionCode,
          regionName,
          rule: null,
          usage: currentUsage,
          visitToken,
        }),
        { headers: corsHeaders }
      );
    }

    let selectedRule: ProxyRule | null = null;
    let source: RuleSource | null = null;
    let action: StorefrontAction = "none";

    const ipRisk = hasPaidPlan
      ? await assessIpRisk({
          ip: visitorIP,
          ipHash,
          userAgent: request.headers.get("user-agent"),
          userLanguage: request.headers.get("accept-language"),
        })
      : null;

    if (settings.blockVpn && ipRisk && shouldBlockIpRisk(ipRisk)) {
      source = "vpn";
      action = "block";
      selectedRule = {
        id: "vpn-shield",
        name: "High-Risk IP Shield",
        matchType: "vpn",
        targetUrl: "",
        priority: Number.MAX_SAFE_INTEGER,
        ruleType: "block",
        redirectMode: "block",
        pageTargetingType: "all",
      };
    }

    if (!selectedRule && hasPaidPlan) {
      const ipRules = activeRules.filter((rule) => rule.matchType === "ip");

      selectedRule =
        ipRules
          .filter((rule) => isRuleOnPage(rule, currentPath))
          .find((rule) =>
            (rule.ipAddresses || "")
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

    if (!selectedRule && hasPaidPlan && (shopifyMarketHandle || shopifyMarketId)) {
      const marketRules = activeRules.filter((rule) => rule.matchType === "market");

      selectedRule =
        marketRules
          .filter((rule) => isRuleInSchedule(rule))
          .filter((rule) => isRuleOnPage(rule, currentPath))
          .find((rule) => isMarketMatch(rule, shopifyMarketHandle, shopifyMarketId, countryCode)) || null;

      if (selectedRule) {
        source = "market";
        action = getActionForRule(selectedRule);
      }
    }

    if (!selectedRule && hasPaidPlan) {
      const cityRules = activeRules.filter((rule) => rule.matchType === "city");
      const eligibleCityRules = cityRules
        .filter((rule) => isRuleInSchedule(rule))
        .filter((rule) => isRuleOnPage(rule, currentPath))
        .filter((rule) => Boolean(rule.cityNames?.trim() && rule.cityCountryCode?.trim()));

      if (eligibleCityRules.length > 0 && !city) {
        const fallbackGeo = await getGeoFromIP(visitorIP, { useFreeFallback: true, requireCity: true });
        if (!countryCode) countryCode = fallbackGeo.countryCode;
        if (!regionCode) regionCode = fallbackGeo.regionCode;
        if (!regionName) regionName = fallbackGeo.regionName;
        if (!city) city = fallbackGeo.city;
        debug = buildDebug();
      }

      selectedRule =
        eligibleCityRules.find((rule) =>
          cityMatchesRule(
            rule,
            { city, countryCode, regionCode, regionName },
            { regionMatches: stateCodeMatchesRegion },
          ),
        ) || null;

      if (selectedRule) {
        source = "city";
        action = getActionForRule(selectedRule);
      }
    }

    if (!selectedRule && hasPaidPlan) {
      const stateRules = activeRules.filter((rule) => rule.matchType === "state");

      const eligibleStateRules = stateRules
        .filter((rule) => isRuleInSchedule(rule))
        .filter((rule) => isRuleOnPage(rule, currentPath))
        .filter((rule) =>
          (rule.stateCodes || "")
            .split(",")
            .some((code: string) => Boolean(code.trim()))
        );

      const stateRuleCountryCodes = new Set(
        eligibleStateRules.flatMap((rule) =>
          (rule.stateCodes || "")
            .split(",")
            .map((code: string) => code.trim().toUpperCase().split("-")[0])
            .filter(Boolean)
        )
      );

      if (
        eligibleStateRules.length > 0 &&
        !regionCode &&
        (!countryCode || stateRuleCountryCodes.has(countryCode))
      ) {
        const fallbackGeo = await getGeoFromIP(visitorIP, { useFreeFallback: true });
        if (!countryCode) countryCode = fallbackGeo.countryCode;
        if (!regionCode) regionCode = fallbackGeo.regionCode;
        if (!regionName) regionName = fallbackGeo.regionName;
        if (!city) city = fallbackGeo.city;
        debug = buildDebug();
      }

      if (regionCode) {
        selectedRule =
          eligibleStateRules.find((rule) =>
            (rule.stateCodes || "")
              .split(",")
              .map((code: string) => code.trim().toUpperCase())
              .some((code: string) => stateCodeMatchesRegion(code, regionCode, regionName))
          ) || null;
      }

      if (selectedRule) {
        source = "state";
        action = getActionForRule(selectedRule);
      }
    }

    if (!selectedRule && countryCode) {
      const countryRules = activeRules.filter((rule) => rule.matchType === "country");

      const eligibleCountryRules = countryRules
        .filter((rule) => isRuleInSchedule(rule))
        .filter((rule) => isRuleOnPage(rule, currentPath))
        .filter((rule) => canRunCountryRule(rule, hasPaidPlan));

      selectedRule =
        eligibleCountryRules.find((rule) => isCountryMatch(rule, countryCode)) || null;

      if (selectedRule) {
        source = "country";
        action = getActionForRule(selectedRule);
      }
    }

    const rulePayload = selectedRule && source ? buildRulePayload(selectedRule, source) : null;
    const analyticsEvent = source ? getAnalyticsEvent(action, source) : null;
    const cookies = parseCookieHeader(request.headers.get("cookie"));
    const suppressedByPopupChoice = action === "popup" && cookies.has("geo_choice");
    const suppressedByTarget =
      selectedRule &&
      (action === "popup" || action === "auto_redirect") &&
      isAlreadyOnTargetUrl(selectedRule.targetUrl, currentPath, currentOrigin);

    if (selectedRule && source && (suppressedByPopupChoice || suppressedByTarget)) {
      return responseData(
        buildActionResponse({
          action: "none",
          analyticsEvent: null,
          blocked,
          countryCode,
          currentPath,
          currentPlan,
          debug,
          eventToken: null,
          planLimit,
          popup,
          regionCode,
          regionName,
          rule: null,
          usage: currentUsage,
          visitToken,
        }),
        { headers: corsHeaders }
      );
    }

    const analytics =
      selectedRule && source && action !== "none"
        ? createAnalyticsEvent({
            shop,
            yearMonth: usagePeriod.yearMonth,
            billingPeriodKey: usagePeriod.key,
            ruleId: selectedRule.id,
            action,
            source,
            path: currentPath,
            countryCode,
            regionCode,
            regionName,
            city,
            ipHash,
          })
        : null;
    const eventToken = analytics?.token || null;
    const responseEventToken = eventToken || visitToken;

    if (selectedRule && source && analyticsEvent && analytics?.payload) {
      try {
        const billableResult = await recordBillableUsage({
          countryCode,
          path: currentPath,
          type: analyticsEvent,
          payload: analytics.payload,
        });

        if (billableResult.inserted) {
          runtimeConfig.currentUsage++;
          await enqueueStorefrontAnalyticsEvent({
            countryCode,
            path: currentPath,
            regionCode,
            regionName,
            city,
            request,
            ruleId: selectedRule.id,
            ruleName: selectedRule.name,
            shop,
            targetUrl: selectedRule.targetUrl || null,
            tokenPayload: analytics.payload,
            type: analyticsEvent,
          });
        }
      } catch (error) {
        console.error("[Proxy] Failed to record server-side action:", error);
      }
    }

    return responseData(
      buildActionResponse({
        action,
        analyticsEvent,
        blocked,
        countryCode,
        currentPath,
        currentPlan,
        debug,
        eventToken: responseEventToken,
        planLimit,
        popup,
        regionCode,
        regionName,
        city,
        rule: rulePayload,
        usage: currentUsage,
        visitToken,
      }),
      { headers: corsHeaders }
    );
  } catch (error) {
    console.error("[Proxy] Error resolving storefront action:", error);
    return responseData({ error: "Internal server error", enabled: false, action: "none" }, { status: 500, headers: corsHeaders });
  }
};

export const action = async ({ request }: LoaderFunctionArgs) => {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }
  return responseData({ error: "Method not allowed" }, { status: 405, headers: corsHeaders });
};

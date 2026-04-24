import { json } from "@remix-run/node";
import type { ActionFunctionArgs } from "@remix-run/node";
import { Prisma } from "@prisma/client";
import prisma from "../db.server";
import { authenticate } from "../shopify.server";
import {
  analyticsEventAllowedForToken,
  hashIP,
  isBillableAnalyticsEvent,
  verifyAnalyticsToken,
  type AnalyticsTokenPayload,
} from "../utils/analytics-token.server";
import { cleanupOldLogs } from "../utils/cleanup.server";

const MAX_BODY_BYTES = 8 * 1024;
const VALID_TYPES = [
  "visit",
  "popup_shown",
  "redirected",
  "auto_redirected",
  "blocked",
  "ip_redirected",
  "ip_blocked",
  "clicked_no",
  "dismissed",
  "vpn_blocked",
];

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

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

function asSafeString(value: unknown, maxLength: number) {
  return typeof value === "string" ? value.slice(0, maxLength) : "";
}

async function readJsonBody(request: Request) {
  const contentLength = Number.parseInt(request.headers.get("content-length") || "0", 10);
  if (contentLength > MAX_BODY_BYTES) {
    throw new Response(JSON.stringify({ error: "Payload too large" }), {
      status: 413,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const text = await request.text();
  if (!text.trim()) {
    throw new Response(JSON.stringify({ error: "Empty body" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  if (Buffer.byteLength(text, "utf8") > MAX_BODY_BYTES) {
    throw new Response(JSON.stringify({ error: "Payload too large" }), {
      status: 413,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    throw new Response(JSON.stringify({ error: "Invalid JSON" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
}

function actionFromType(type: string) {
  if (type === "redirected") return "clicked_redirect";
  if (type === "auto_redirected") return "auto_redirect";
  if (type === "ip_redirected") return "ip_redirect";
  if (type === "ip_blocked") return "ip_block";
  if (type === "vpn_blocked") return "vpn_block";
  if (type === "clicked_no") return "declined";
  return type;
}

async function registerBillableEvent({
  countryCode,
  path,
  payload,
  type,
}: {
  countryCode: string | null;
  path: string | null;
  payload: AnalyticsTokenPayload;
  type: string;
}) {
  try {
    await prisma.billableUsageEvent.create({
      data: {
        shop: payload.shop,
        yearMonth: payload.yearMonth,
        eventKey: payload.eventKey,
        ruleId: payload.ruleId,
        action: type,
        countryCode,
        path,
        ipHash: payload.ipHash,
      },
    });
    return true;
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return false;
    }
    throw error;
  }
}

export const action = async ({ request }: ActionFunctionArgs) => {
  cleanupOldLogs().catch(() => {});

  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (request.method !== "POST") {
    return json({ error: "Method not allowed" }, { status: 405, headers: corsHeaders });
  }

  try {
    await authenticate.public.appProxy(request);
  } catch {
    return json({ error: "Unauthorized: Invalid signature" }, { status: 401, headers: corsHeaders });
  }

  try {
    const url = new URL(request.url);
    const shop = url.searchParams.get("shop");
    const visitorIP = getVisitorIP(request);
    const data = await readJsonBody(request);
    const type = asSafeString(data.type, 40);

    if (!shop || !type) {
      return json({ error: "Missing required fields" }, { status: 400, headers: corsHeaders });
    }

    if (!VALID_TYPES.includes(type)) {
      return json({ error: "Invalid event type" }, { status: 400, headers: corsHeaders });
    }

    const settings = await prisma.settings.findUnique({
      where: { shop },
      select: { id: true },
    });
    if (!settings) {
      return json({ error: "Unauthorized: Invalid shop" }, { status: 401, headers: corsHeaders });
    }

    let tokenPayload: AnalyticsTokenPayload | null = null;
    if (type !== "visit") {
      const token = asSafeString(data.eventToken, 4096);
      tokenPayload = token ? verifyAnalyticsToken(token) : null;

      if (!tokenPayload) {
        return json({ error: "Missing or invalid analytics token" }, { status: 401, headers: corsHeaders });
      }
      if (tokenPayload.shop !== shop || tokenPayload.ipHash !== hashIP(visitorIP)) {
        return json({ error: "Analytics token does not match request" }, { status: 401, headers: corsHeaders });
      }
      if (!analyticsEventAllowedForToken(type, tokenPayload)) {
        return json({ error: "Analytics event is not allowed for this token" }, { status: 400, headers: corsHeaders });
      }
      const bodyPath = asSafeString(data.path, 500);
      const bodyRuleId = asSafeString(data.ruleId, 100);
      if (bodyPath && bodyPath !== tokenPayload.path) {
        return json({ error: "Analytics token path mismatch" }, { status: 401, headers: corsHeaders });
      }
      if (bodyRuleId && bodyRuleId !== tokenPayload.ruleId) {
        return json({ error: "Analytics token rule mismatch" }, { status: 401, headers: corsHeaders });
      }
    }

    const countryCode = tokenPayload?.countryCode || asSafeString(data.countryCode, 2).toUpperCase() || null;
    const ruleId = tokenPayload?.ruleId || asSafeString(data.ruleId, 100) || null;
    const ruleName =
      tokenPayload?.ruleId === "vpn-shield"
        ? "Anti-Fraud Shield"
        : asSafeString(data.ruleName, 200) || null;
    const path = tokenPayload?.path || asSafeString(data.path, 500) || null;
    const targetUrl = asSafeString(data.targetUrl, 1000) || null;

    try {
      await prisma.visitorLog.create({
        data: {
          shop,
          ipAddress: visitorIP,
          countryCode,
          city: null,
          action: actionFromType(type),
          ruleName,
          targetUrl,
          userAgent: request.headers.get("user-agent") || "Unknown",
          path,
        },
      });
    } catch (logError) {
      console.error("[Analytics] Error saving visitor log:", logError);
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    if (countryCode) {
      const updateData: any = {};
      if (type === "visit") updateData.visitors = { increment: 1 };
      if (type === "popup_shown") updateData.popupShown = { increment: 1 };
      if (["redirected", "auto_redirected", "ip_redirected"].includes(type)) {
        updateData.redirected = { increment: 1 };
      }
      if (["blocked", "ip_blocked", "vpn_blocked"].includes(type)) {
        updateData.blocked = { increment: 1 };
      }

      if (Object.keys(updateData).length > 0) {
        await prisma.analyticsCountry.upsert({
          where: {
            shop_date_countryCode: { shop, date: today, countryCode },
          },
          update: updateData,
          create: {
            shop,
            date: today,
            countryCode,
            visitors: type === "visit" ? 1 : 0,
            popupShown: type === "popup_shown" ? 1 : 0,
            redirected: ["redirected", "auto_redirected", "ip_redirected"].includes(type) ? 1 : 0,
            blocked: ["blocked", "ip_blocked", "vpn_blocked"].includes(type) ? 1 : 0,
          },
        });
      }
    }

    if (ruleId) {
      const updateRuleData: any = {};
      if (type === "popup_shown") updateRuleData.seen = { increment: 1 };
      if (type === "redirected") updateRuleData.clickedYes = { increment: 1 };
      if (["auto_redirected", "ip_redirected"].includes(type)) {
        updateRuleData.autoRedirected = { increment: 1 };
      }
      if (type === "clicked_no") updateRuleData.clickedNo = { increment: 1 };
      if (type === "dismissed") updateRuleData.dismissed = { increment: 1 };
      if (["blocked", "ip_blocked", "vpn_blocked"].includes(type)) {
        updateRuleData.blocked = { increment: 1 };
      }

      if (Object.keys(updateRuleData).length > 0) {
        await prisma.analyticsRule.upsert({
          where: { shop_date_ruleId: { shop, date: today, ruleId } },
          update: {
            ...updateRuleData,
            ruleName: ruleName || undefined,
          },
          create: {
            shop,
            date: today,
            ruleId,
            ruleName: ruleName || "Unknown Rule",
            seen: type === "popup_shown" ? 1 : 0,
            clickedYes: type === "redirected" ? 1 : 0,
            autoRedirected: ["auto_redirected", "ip_redirected"].includes(type) ? 1 : 0,
            clickedNo: type === "clicked_no" ? 1 : 0,
            dismissed: type === "dismissed" ? 1 : 0,
            blocked: ["blocked", "ip_blocked", "vpn_blocked"].includes(type) ? 1 : 0,
          },
        });
      }
    }

    if (tokenPayload && isBillableAnalyticsEvent(type)) {
      const shouldIncrementUsage = await registerBillableEvent({
        countryCode,
        path,
        payload: tokenPayload,
        type,
      });

      if (shouldIncrementUsage) {
        const usageUpdateData: any = { totalVisitors: { increment: 1 } };
        if (["redirected", "auto_redirected", "ip_redirected"].includes(type)) {
          usageUpdateData.redirected = { increment: 1 };
        }
        if (["blocked", "ip_blocked", "vpn_blocked"].includes(type)) {
          usageUpdateData.blocked = { increment: 1 };
        }
        if (type === "popup_shown") {
          usageUpdateData.popupShown = { increment: 1 };
        }

        await prisma.monthlyUsage.upsert({
          where: {
            shop_yearMonth: {
              shop,
              yearMonth: tokenPayload.yearMonth,
            },
          },
          update: usageUpdateData,
          create: {
            shop,
            yearMonth: tokenPayload.yearMonth,
            totalVisitors: 1,
            redirected: ["redirected", "auto_redirected", "ip_redirected"].includes(type) ? 1 : 0,
            blocked: ["blocked", "ip_blocked", "vpn_blocked"].includes(type) ? 1 : 0,
            popupShown: type === "popup_shown" ? 1 : 0,
          },
        });
      }
    }

    return json({ success: true }, { headers: corsHeaders });
  } catch (error) {
    if (error instanceof Response) return error;
    console.error("Analytics Error:", error);
    return json({ error: "Internal Server Error" }, { status: 500, headers: corsHeaders });
  }
};

export const loader = async ({ request }: ActionFunctionArgs) => {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }
  return json({ error: "Method not allowed" }, { status: 405, headers: corsHeaders });
};

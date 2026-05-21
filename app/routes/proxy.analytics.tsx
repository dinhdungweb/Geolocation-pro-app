import { json } from "@remix-run/node";
import type { ActionFunctionArgs } from "@remix-run/node";
import prisma from "../db.server";
import { authenticate } from "../shopify.server";
import {
  analyticsEventAllowedForToken,
  hashIP,
  verifyAnalyticsToken,
  type AnalyticsTokenPayload,
} from "../utils/analytics-token.server";
import { getVisitorIP } from "../utils/request-ip.server";
import { recordStorefrontAnalyticsEvent } from "../utils/storefront-analytics.server";

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

export const action = async ({ request }: ActionFunctionArgs) => {
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
    const regionCode = tokenPayload?.regionCode || asSafeString(data.regionCode, 20).toUpperCase() || null;
    const ruleId = tokenPayload?.ruleId || asSafeString(data.ruleId, 100) || null;
    const ruleName =
      tokenPayload?.ruleId === "vpn-shield"
        ? "Anti-Fraud Shield"
        : asSafeString(data.ruleName, 200) || null;
    const path = tokenPayload?.path || asSafeString(data.path, 500) || null;
    const targetUrl = asSafeString(data.targetUrl, 1000) || null;

    await recordStorefrontAnalyticsEvent({
      countryCode,
      path,
      regionCode,
      request,
      ruleId,
      ruleName,
      shop,
      targetUrl,
      tokenPayload,
      type,
    });

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

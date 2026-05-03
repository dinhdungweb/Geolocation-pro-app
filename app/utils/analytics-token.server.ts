import crypto from "crypto";

export type StorefrontAction = "none" | "popup" | "auto_redirect" | "block";
export type RuleSource = "country" | "ip" | "vpn";

export interface AnalyticsTokenPayload {
  shop: string;
  yearMonth: string;
  ruleId: string;
  action: StorefrontAction;
  source: RuleSource;
  path: string;
  countryCode: string;
  ipHash: string;
  iat: number;
  eventKey: string;
}

const TOKEN_TTL_MS = 10 * 60 * 1000;

function getSecret() {
  const secret = process.env.SHOPIFY_API_SECRET;
  if (!secret) {
    throw new Error("SHOPIFY_API_SECRET is required to sign analytics tokens");
  }
  return secret;
}

function base64UrlEncode(value: string | Buffer) {
  return Buffer.from(value)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function base64UrlDecode(value: string) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padding = "=".repeat((4 - (normalized.length % 4)) % 4);
  return Buffer.from(normalized + padding, "base64").toString("utf8");
}

function signPayload(encodedPayload: string) {
  return base64UrlEncode(
    crypto.createHmac("sha256", getSecret()).update(encodedPayload).digest()
  );
}

export function getYearMonth(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

export function hashIP(ip: string) {
  return crypto
    .createHash("sha256")
    .update(`${getSecret()}:${ip}`)
    .digest("hex");
}

export function createAnalyticsToken(
  payload: Omit<AnalyticsTokenPayload, "iat" | "eventKey">
) {
  const fullPayload: AnalyticsTokenPayload = {
    ...payload,
    iat: Date.now(),
    eventKey: crypto.randomUUID(),
  };
  const encodedPayload = base64UrlEncode(JSON.stringify(fullPayload));
  return `${encodedPayload}.${signPayload(encodedPayload)}`;
}

export function verifyAnalyticsToken(token: string): AnalyticsTokenPayload | null {
  const [encodedPayload, signature, extra] = token.split(".");
  if (!encodedPayload || !signature || extra) return null;

  const expected = signPayload(encodedPayload);
  const actualBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  if (
    actualBuffer.length !== expectedBuffer.length ||
    !crypto.timingSafeEqual(actualBuffer, expectedBuffer)
  ) {
    return null;
  }

  try {
    const payload = JSON.parse(base64UrlDecode(encodedPayload)) as AnalyticsTokenPayload;
    if (!payload.iat || Date.now() - payload.iat > TOKEN_TTL_MS) return null;
    if (!payload.shop || !payload.yearMonth || !payload.eventKey || !payload.ipHash) {
      return null;
    }
    return payload;
  } catch {
    return null;
  }
}

export function analyticsEventAllowedForToken(
  eventType: string,
  payload: AnalyticsTokenPayload
) {
  if (payload.action === "popup") {
    return ["popup_shown", "redirected", "clicked_no", "dismissed"].includes(eventType);
  }

  if (payload.action === "auto_redirect") {
    return payload.source === "ip"
      ? eventType === "ip_redirected"
      : eventType === "auto_redirected";
  }

  if (payload.action === "block") {
    if (payload.source === "ip") return eventType === "ip_blocked";
    if (payload.source === "vpn") return eventType === "vpn_blocked";
    return eventType === "blocked";
  }

  return false;
}

export function isBillableAnalyticsEvent(eventType: string) {
  return [
    "popup_shown",
    "redirected",
    "auto_redirected",
    "blocked",
    "ip_redirected",
    "ip_blocked",
    "vpn_blocked",
  ].includes(eventType);
}

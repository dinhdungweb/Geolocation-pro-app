import crypto from "node:crypto";

const APP_UNINSTALLED_TOPIC = "app/uninstalled";
const SHOP_DOMAIN_PATTERN = /^[a-z0-9][a-z0-9-]*\.myshopify\.com$/i;

export type AuthenticatedUninstallWebhook = {
  apiVersion: string | null;
  payload: Record<string, unknown>;
  shop: string;
  topic: "APP_UNINSTALLED";
  webhookId: string | null;
};

function unauthorized() {
  return new Response(null, {
    status: 401,
    statusText: "Unauthorized",
  });
}

function badRequest(message: string) {
  return new Response(message, {
    status: 400,
    statusText: "Bad Request",
  });
}

function hasValidHmac(rawBody: string, providedHmac: string, secret: string) {
  const expected = crypto
    .createHmac("sha256", secret)
    .update(rawBody, "utf8")
    .digest();

  let provided: Buffer;
  try {
    provided = Buffer.from(providedHmac, "base64");
  } catch {
    return false;
  }

  return (
    provided.length === expected.length &&
    crypto.timingSafeEqual(provided, expected)
  );
}

/**
 * Verifies APP_UNINSTALLED without loading an offline session.
 *
 * Shopify revokes access and refresh tokens when an app is uninstalled.
 * The general authenticate.webhook() flow loads the stored offline session
 * and can therefore try to refresh an already-revoked token before the
 * uninstall handler gets a chance to delete that session.
 */
export async function authenticateUninstallWebhook(
  request: Request,
): Promise<AuthenticatedUninstallWebhook> {
  if (request.method !== "POST") {
    throw new Response(null, {
      status: 405,
      statusText: "Method Not Allowed",
    });
  }

  const secret = process.env.SHOPIFY_API_SECRET;
  if (!secret) {
    throw new Error("SHOPIFY_API_SECRET is required to verify webhooks");
  }

  const rawBody = await request.text();
  const providedHmac = request.headers.get("x-shopify-hmac-sha256");

  if (!providedHmac || !hasValidHmac(rawBody, providedHmac, secret)) {
    throw unauthorized();
  }

  const rawTopic = request.headers.get("x-shopify-topic")?.trim().toLowerCase();
  if (rawTopic !== APP_UNINSTALLED_TOPIC) {
    throw badRequest("Unexpected webhook topic");
  }

  const shop = request.headers
    .get("x-shopify-shop-domain")
    ?.trim()
    .toLowerCase();
  if (!shop || !SHOP_DOMAIN_PATTERN.test(shop)) {
    throw badRequest("Invalid shop domain");
  }

  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    throw badRequest("Invalid JSON payload");
  }

  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw badRequest("Invalid webhook payload");
  }

  return {
    apiVersion: request.headers.get("x-shopify-api-version"),
    payload: payload as Record<string, unknown>,
    shop,
    topic: "APP_UNINSTALLED",
    webhookId: request.headers.get("x-shopify-webhook-id"),
  };
}

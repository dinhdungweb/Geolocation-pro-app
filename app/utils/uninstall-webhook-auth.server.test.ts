import crypto from "node:crypto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { authenticateUninstallWebhook } from "./uninstall-webhook-auth.server";

const TEST_SECRET = "uninstall-webhook-test-secret";
const TEST_SHOP = "test-shop.myshopify.com";

function signedRequest({
  body = JSON.stringify({ id: 123, myshopify_domain: TEST_SHOP }),
  hmac,
  method = "POST",
  shop = TEST_SHOP,
  topic = "app/uninstalled",
}: {
  body?: string;
  hmac?: string;
  method?: string;
  shop?: string;
  topic?: string;
} = {}) {
  const signature =
    hmac ??
    crypto.createHmac("sha256", TEST_SECRET).update(body).digest("base64");

  return new Request("https://app.example.test/webhooks/app/uninstalled", {
    body: method === "POST" ? body : undefined,
    headers: {
      "content-type": "application/json",
      "x-shopify-api-version": "2026-04",
      "x-shopify-hmac-sha256": signature,
      "x-shopify-shop-domain": shop,
      "x-shopify-topic": topic,
      "x-shopify-webhook-id": "test-webhook-id",
    },
    method,
  });
}

async function thrownResponse(request: Request) {
  try {
    await authenticateUninstallWebhook(request);
  } catch (error) {
    return error;
  }

  throw new Error("Expected webhook authentication to fail");
}

beforeEach(() => {
  process.env.SHOPIFY_API_SECRET = TEST_SECRET;
});

afterEach(() => {
  delete process.env.SHOPIFY_API_SECRET;
});

describe("authenticateUninstallWebhook", () => {
  it("authenticates a valid uninstall webhook without a session", async () => {
    await expect(authenticateUninstallWebhook(signedRequest())).resolves.toEqual({
      apiVersion: "2026-04",
      payload: { id: 123, myshopify_domain: TEST_SHOP },
      shop: TEST_SHOP,
      topic: "APP_UNINSTALLED",
      webhookId: "test-webhook-id",
    });
  });

  it("rejects an invalid HMAC before trusting Shopify headers", async () => {
    const error = await thrownResponse(signedRequest({ hmac: "invalid" }));

    expect(error).toBeInstanceOf(Response);
    expect((error as Response).status).toBe(401);
  });

  it("rejects a validly signed request for another topic", async () => {
    const error = await thrownResponse(
      signedRequest({ topic: "products/update" }),
    );

    expect(error).toBeInstanceOf(Response);
    expect((error as Response).status).toBe(400);
  });

  it("rejects an invalid shop domain", async () => {
    const error = await thrownResponse(
      signedRequest({ shop: "attacker.example.com" }),
    );

    expect(error).toBeInstanceOf(Response);
    expect((error as Response).status).toBe(400);
  });

  it("rejects malformed JSON with a valid signature", async () => {
    const error = await thrownResponse(signedRequest({ body: "not-json" }));

    expect(error).toBeInstanceOf(Response);
    expect((error as Response).status).toBe(400);
  });

  it("allows only POST requests", async () => {
    const error = await thrownResponse(signedRequest({ method: "GET" }));

    expect(error).toBeInstanceOf(Response);
    expect((error as Response).status).toBe(405);
  });
});

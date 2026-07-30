import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  authenticateWebhook: vi.fn(),
  deleteSessions: vi.fn(),
  invalidateMarkets: vi.fn(),
  invalidateThemeEmbed: vi.fn(),
}));

vi.mock("../shopify.server", () => ({
  authenticate: {
    webhook: mocks.authenticateWebhook,
  },
}));

vi.mock("../db.server", () => ({
  default: {
    session: {
      deleteMany: mocks.deleteSessions,
    },
  },
}));

vi.mock("./shopify-markets.server", () => ({
  invalidateShopifyMarketsCache: mocks.invalidateMarkets,
}));

vi.mock("./theme-app-embed.server", () => ({
  invalidateThemeAppEmbedStatusCache: mocks.invalidateThemeEmbed,
}));

import { action } from "../routes/webhooks.app.scopes_update";

function webhookRequest() {
  return new Request("https://app.test/webhooks/app/scopes_update", {
    method: "POST",
    headers: {
      "x-shopify-api-version": "2026-04",
      "x-shopify-shop-domain": "scope-test.myshopify.com",
      "x-shopify-topic": "app/scopes_update",
      "x-shopify-webhook-id": "webhook-id",
    },
  });
}

describe("scope update webhook", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.authenticateWebhook.mockResolvedValue({
      payload: { current: ["read_orders", "read_products"] },
      shop: "scope-test.myshopify.com",
      topic: "APP_SCOPES_UPDATE",
    });
    mocks.deleteSessions.mockResolvedValue({ count: 1 });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("invalidates sessions and caches before acknowledging the webhook", async () => {
    const response = await action({
      context: {},
      params: {},
      request: webhookRequest(),
    } as never);

    expect(response.status).toBe(200);
    expect(mocks.deleteSessions).toHaveBeenCalledWith({
      where: { shop: "scope-test.myshopify.com" },
    });
    expect(mocks.invalidateThemeEmbed).toHaveBeenCalledWith(
      "scope-test.myshopify.com",
    );
    expect(mocks.invalidateMarkets).toHaveBeenCalledWith(
      "scope-test.myshopify.com",
    );
  });

  it("returns a controlled 500 response when session invalidation fails", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    mocks.deleteSessions.mockRejectedValue(new Error("database unavailable"));

    const response = await action({
      context: {},
      params: {},
      request: webhookRequest(),
    } as never);

    expect(response.status).toBe(500);
    await expect(response.text()).resolves.toBe(
      "Scope update webhook failed",
    );
  });
});

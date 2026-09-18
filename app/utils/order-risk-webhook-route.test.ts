import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  authenticateWebhook: vi.fn(),
  getOrderIdFromWebhookPayload: vi.fn(),
  syncOrderRisk: vi.fn(),
}));

vi.mock("../shopify.server", () => ({
  authenticate: {
    webhook: mocks.authenticateWebhook,
  },
}));

vi.mock("./order-risk.server", () => ({
  getOrderIdFromWebhookPayload: mocks.getOrderIdFromWebhookPayload,
  syncOrderRisk: mocks.syncOrderRisk,
}));

import { action } from "../routes/webhooks.orders";

const shop = "risk-webhook-test.myshopify.com";

function webhookRequest() {
  return new Request("https://app.test/webhooks/orders", {
    method: "POST",
    headers: {
      "x-shopify-api-version": "2026-04",
      "x-shopify-shop-domain": shop,
      "x-shopify-topic": "orders/create",
      "x-shopify-webhook-id": "order-risk-webhook-id",
    },
  });
}

describe("Order Risk webhook", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getOrderIdFromWebhookPayload.mockReturnValue(
      "gid://shopify/Order/123",
    );
  });

  it("acknowledges a valid webhook when its offline session no longer exists", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    mocks.authenticateWebhook.mockResolvedValue({
      admin: undefined,
      payload: { id: 123 },
      session: undefined,
      shop,
      topic: "ORDERS_CREATE",
    });

    const response = await action({
      context: {},
      params: {},
      request: webhookRequest(),
    } as never);

    expect(response.status).toBe(200);
    expect(mocks.syncOrderRisk).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledWith(
      "[OrderRisk] Skipping webhook without an offline Admin API session",
      expect.objectContaining({
        shop,
        topic: "ORDERS_CREATE",
        webhookId: "order-risk-webhook-id",
      }),
    );
  });

  it("syncs order risk when the webhook has an offline Admin API session", async () => {
    const admin = { graphql: vi.fn() };
    const session = { id: `offline_${shop}`, shop };
    mocks.authenticateWebhook.mockResolvedValue({
      admin,
      payload: { id: 123 },
      session,
      shop,
      topic: "ORDERS_CREATE",
    });
    mocks.syncOrderRisk.mockResolvedValue(undefined);

    const response = await action({
      context: {},
      params: {},
      request: webhookRequest(),
    } as never);

    expect(response.status).toBe(200);
    expect(mocks.syncOrderRisk).toHaveBeenCalledWith({
      admin,
      orderId: "gid://shopify/Order/123",
      publishAssessment: false,
      shop,
    });
  });
});

import type { ActionFunctionArgs } from "react-router";

import { authenticate, unauthenticated } from "../shopify.server";
import {
  getOrderIdFromWebhookPayload,
  syncOrderRisk,
} from "../utils/order-risk.server";

function webhookMeta(request: Request) {
  return {
    apiVersion: request.headers.get("x-shopify-api-version"),
    shop: request.headers.get("x-shopify-shop-domain"),
    topic: request.headers.get("x-shopify-topic"),
    webhookId: request.headers.get("x-shopify-webhook-id"),
  };
}

export const action = async ({ request }: ActionFunctionArgs) => {
  let stage = "authenticate";

  try {
    const { admin, payload, session, shop, topic } =
      await authenticate.webhook(request);
    console.log(`[OrderRisk] Received ${topic} webhook for ${shop}`);

    stage = "resolve_order";
    const orderId = getOrderIdFromWebhookPayload(payload);
    if (!orderId) {
      console.warn("[OrderRisk] Webhook did not include an order ID", {
        ...webhookMeta(request),
        payloadKeys:
          payload && typeof payload === "object"
            ? Object.keys(payload as Record<string, unknown>)
            : [],
      });
      return new Response(null, { status: 200 });
    }

    stage = "load_offline_admin";
    const adminContext = admin
      ? { admin, session }
      : await unauthenticated.admin(shop);

    stage = "sync_order_risk";
    await syncOrderRisk({
      admin: adminContext.admin,
      orderId,
      publishAssessment: false,
      shop,
    });

    return new Response(null, { status: 200 });
  } catch (error) {
    console.error(
      `[OrderRisk] Webhook failed during ${stage}:`,
      webhookMeta(request),
      error,
    );
    if (error instanceof Response) return error;
    return new Response("Order risk webhook failed", { status: 500 });
  }
};

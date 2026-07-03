import type { ActionFunctionArgs } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import db from "../db.server";
import { FREE_PLAN } from "../billing.config";
import { enqueueShopCleanupJob } from "../utils/cleanup.server";
import { invalidateStorefrontConfigCache } from "../utils/storefront-config-cache.server";

function webhookMeta(request: Request) {
  return {
    webhookId: request.headers.get("x-shopify-webhook-id"),
    topic: request.headers.get("x-shopify-topic"),
    shop: request.headers.get("x-shopify-shop-domain"),
    apiVersion: request.headers.get("x-shopify-api-version"),
  };
}

export const action = async ({ request }: ActionFunctionArgs) => {
  let stage = "authenticate";

  try {
    const { shop, topic } = await authenticate.webhook(request);

    console.log(`Received ${topic} webhook for ${shop}`);
    invalidateStorefrontConfigCache(shop);

    stage = "enqueue_cleanup";
    await enqueueShopCleanupJob(shop, "app_uninstalled");

    // Keep the webhook fast. Do only lightweight deactivation here; the heavy
    // deletes run in the background cleanup job.
    stage = "quick_cleanup";
    const results = await Promise.allSettled([
      db.session.deleteMany({ where: { shop } }),
      db.settings.updateMany({
        where: { shop },
        data: {
          isEnabled: false,
          currentPlan: FREE_PLAN,
          blockVpn: false,
          billingPlanName: null,
          billingPeriodKey: null,
          billingPeriodStart: null,
          billingPeriodEnd: null,
          billingSubscriptionId: null,
          billingUsageLineItemId: null,
        },
      }),
    ]);

    const failures = results.filter((r) => r.status === "rejected");
    if (failures.length > 0) {
      console.error(`[Uninstall] ${failures.length} quick cleanup step(s) failed for ${shop}:`, failures);
      return new Response("Uninstall quick cleanup failed", { status: 500 });
    }

    console.log(`[Uninstall] Queued cleanup job for ${shop}`);

    return new Response(null, { status: 200 });
  } catch (error) {
    console.error(`[Uninstall] Webhook failed during ${stage}:`, webhookMeta(request), error);
    if (error instanceof Response) return error;
    return new Response("Uninstall webhook failed", { status: 500 });
  }
};

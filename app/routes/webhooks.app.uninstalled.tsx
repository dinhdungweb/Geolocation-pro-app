import type { ActionFunctionArgs } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import db from "../db.server";
import { FREE_PLAN } from "../billing.config";
import { enqueueShopCleanupJob } from "../utils/cleanup.server";
import { invalidateStorefrontConfigCache } from "../utils/storefront-config-cache.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, topic } = await authenticate.webhook(request);

  console.log(`Received ${topic} webhook for ${shop}`);
  invalidateStorefrontConfigCache(shop);

  await enqueueShopCleanupJob(shop, "app_uninstalled");

  // Keep the webhook fast. Do only lightweight deactivation here; the heavy
  // deletes run in the background cleanup job.
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
};

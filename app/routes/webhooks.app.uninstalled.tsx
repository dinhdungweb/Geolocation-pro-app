import type { ActionFunctionArgs } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import db from "../db.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, topic } = await authenticate.webhook(request);

  console.log(`Received ${topic} webhook for ${shop}`);

  // Webhook requests can trigger multiple times and may arrive after the session is gone.
  // Always clean by shop so uninstall remains idempotent.
  // Use allSettled so a single table-delete failure does not prevent the others.
  const results = await Promise.allSettled([
    db.session.deleteMany({ where: { shop } }),
    db.settings.deleteMany({ where: { shop } }),
    db.redirectRule.deleteMany({ where: { shop } }),
    db.analyticsCountry.deleteMany({ where: { shop } }),
    db.analyticsRule.deleteMany({ where: { shop } }),
    db.monthlyUsage.deleteMany({ where: { shop } }),
    db.usageChargeAttempt.deleteMany({ where: { shop } }),
    db.billableUsageEvent.deleteMany({ where: { shop } }),
    db.billableUsageActionEvent.deleteMany({ where: { shop } }),
    db.visitorLog.deleteMany({ where: { shop } }),
    db.storefrontAnalyticsEventQueue.deleteMany({ where: { shop } }),
    db.adminEmailLog.deleteMany({ where: { shop } }),
    db.automation.deleteMany({ where: { shop } }),
    db.emailTemplate.deleteMany({ where: { shop } }),
    db.campaign.deleteMany({ where: { shop } }),
    db.emailBlacklist.deleteMany({ where: { shop } }),
  ]);
  const failures = results.filter((r) => r.status === "rejected");
  if (failures.length > 0) {
    console.error(`[Uninstall] ${failures.length} delete(s) failed for ${shop}:`, failures);
  }
  console.log(`[Uninstall] Cleaned up all data for ${shop}`);

  return new Response();
};

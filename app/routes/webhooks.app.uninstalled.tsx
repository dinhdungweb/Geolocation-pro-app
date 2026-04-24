import type { ActionFunctionArgs } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import db from "../db.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, topic } = await authenticate.webhook(request);

  console.log(`Received ${topic} webhook for ${shop}`);

  // Webhook requests can trigger multiple times and may arrive after the session is gone.
  // Always clean by shop so uninstall remains idempotent.
  await Promise.all([
    db.session.deleteMany({ where: { shop } }),
    db.settings.deleteMany({ where: { shop } }),
    db.redirectRule.deleteMany({ where: { shop } }),
    db.analyticsCountry.deleteMany({ where: { shop } }),
    db.analyticsRule.deleteMany({ where: { shop } }),
    db.monthlyUsage.deleteMany({ where: { shop } }),
    db.billableUsageEvent.deleteMany({ where: { shop } }),
    db.visitorLog.deleteMany({ where: { shop } }),
    db.adminEmailLog.deleteMany({ where: { shop } }),
    db.automation.deleteMany({ where: { shop } }),
    db.emailTemplate.deleteMany({ where: { shop } }),
    db.campaign.deleteMany({ where: { shop } }),
    db.emailBlacklist.deleteMany({ where: { shop } }),
  ]);
  console.log(`[Uninstall] Cleaned up all data for ${shop}`);

  return new Response();
};

import type { ActionFunctionArgs } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import db from "../db.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, session, topic } = await authenticate.webhook(request);

  console.log(`Received ${topic} webhook for ${shop}`);

  // Webhook requests can trigger multiple times and after an app has already been uninstalled.
  // If this webhook already ran, the session may have been deleted previously.
  if (session) {
    // Delete all app data for this shop
    await Promise.all([
      db.session.deleteMany({ where: { shop } }),
      (db as any).settings.deleteMany({ where: { shop } }),
      (db as any).redirectRule.deleteMany({ where: { shop } }),
      (db as any).analyticsCountry.deleteMany({ where: { shop } }),
      (db as any).analyticsRule.deleteMany({ where: { shop } }),
      (db as any).monthlyUsage.deleteMany({ where: { shop } }),
      (db as any).visitorLog.deleteMany({ where: { shop } }),
    ]);
    console.log(`[Uninstall] Cleaned up all data for ${shop}`);
  }

  return new Response();
};

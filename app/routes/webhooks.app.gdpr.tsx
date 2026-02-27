import type { ActionFunctionArgs } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import { json } from "@remix-run/node";
import prisma from "../db.server";

/**
 * Mandatory GDPR Webhooks for Shopify Apps
 * 
 * 1. customers/data_request: Request to view stored customer data
 * 2. customers/redact: Request to delete customer data
 * 3. shop/redact: Request to delete shop data (48h after uninstall)
 */
export const action = async ({ request }: ActionFunctionArgs) => {
    const { topic, shop, payload } = await authenticate.webhook(request);

    console.log(`[GDPR] Received ${topic} webhook for ${shop}`);

    switch (topic) {
        case "customers/data_request":
            // This app stores visitor IPs and user agents in VisitorLog.
            // These could be considered personal data under GDPR.
            console.log(`[GDPR] Customer Data Request received from ${shop}.`);
            break;

        case "customers/redact":
            // This app doesn't directly link data to Shopify customer IDs,
            // but VisitorLog contains IP addresses which are PII.
            // No customer-specific data to redact since we don't store customer IDs.
            console.log(`[GDPR] Customer Redact Request received from ${shop}. No customer-linked data stored.`);
            break;

        case "shop/redact":
            // Shop data deletion request (48 hours after uninstall)
            // Must delete ALL data associated with this shop
            console.log(`[GDPR] Shop Redact Request received for ${shop}. Deleting all shop data...`);
            try {
                await Promise.all([
                    (prisma as any).settings.deleteMany({ where: { shop } }),
                    (prisma as any).redirectRule.deleteMany({ where: { shop } }),
                    (prisma as any).analyticsCountry.deleteMany({ where: { shop } }),
                    (prisma as any).analyticsRule.deleteMany({ where: { shop } }),
                    (prisma as any).monthlyUsage.deleteMany({ where: { shop } }),
                    (prisma as any).visitorLog.deleteMany({ where: { shop } }),
                    prisma.session.deleteMany({ where: { shop } }),
                ]);
                console.log(`[GDPR] All data deleted for ${shop}`);
            } catch (error) {
                console.error(`[GDPR] Failed to delete data for ${shop}:`, error);
            }
            break;

        default:
            console.log(`[GDPR] Unhandled topic: ${topic}`);
    }

    return json({ success: true }, { status: 200 });
};

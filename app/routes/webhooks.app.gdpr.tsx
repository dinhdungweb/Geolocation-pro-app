import type { ActionFunctionArgs } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import { json } from "@remix-run/node";
import prisma from "../db.server";
import { FREE_PLAN } from "../billing.config";
import { enqueueShopCleanupJob } from "../utils/cleanup.server";

/**
 * Mandatory GDPR Webhooks for Shopify Apps
 * 
 * 1. customers/data_request: Request to view stored customer data
 * 2. customers/redact: Request to delete customer data
 * 3. shop/redact: Request to delete shop data (48h after uninstall)
 */
export const action = async ({ request }: ActionFunctionArgs) => {
    const { topic, shop } = await authenticate.webhook(request);

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
            console.log(`[GDPR] Shop Redact Request received for ${shop}. Queueing cleanup job...`);
            await enqueueShopCleanupJob(shop, "shop_redact");
            await Promise.allSettled([
                prisma.session.deleteMany({ where: { shop } }),
                prisma.settings.updateMany({
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
            console.log(`[GDPR] Queued cleanup job for ${shop}`);
            break;

        default:
            console.log(`[GDPR] Unhandled topic: ${topic}`);
    }

    return json({ success: true }, { status: 200 });
};

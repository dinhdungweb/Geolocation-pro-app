import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { FREE_PLAN } from "../billing.config";
import { enqueueShopCleanupJob } from "../utils/cleanup.server";
import { recordCustomerDataRequest, redactCustomerData } from "../utils/gdpr.server";

function responseData<T>(payload: T, status = 200) {
    return Response.json(payload, { status });
}

function webhookMeta(request: Request) {
    return {
        webhookId: request.headers.get("x-shopify-webhook-id"),
        topic: request.headers.get("x-shopify-topic"),
        shop: request.headers.get("x-shopify-shop-domain"),
        apiVersion: request.headers.get("x-shopify-api-version"),
    };
}

/**
 * Mandatory GDPR Webhooks for Shopify Apps
 * 
 * 1. customers/data_request: Request to view stored customer data
 * 2. customers/redact: Request to delete customer data
 * 3. shop/redact: Request to delete shop data (48h after uninstall)
 */
export const action = async ({ request }: ActionFunctionArgs) => {
    let stage = "authenticate";

    try {
        const { payload, topic, shop } = await authenticate.webhook(request);

        console.log(`[GDPR] Received ${topic} webhook for ${shop}`);

        switch (topic) {
            case "CUSTOMERS_DATA_REQUEST":
            case "customers/data_request": {
                // Stores an encrypted export of the order risk data and visitor
                // logs linked to the requested orders, for hand-over to the
                // merchant within Shopify's 30-day window.
                stage = "record_data_request";
                const result = await recordCustomerDataRequest(shop, payload);
                console.log(
                    `[GDPR] Customer Data Request from ${shop} recorded: ${result.orders} order(s), ${result.records} order risk record(s), ${result.visitorLogs} visitor log(s).`,
                );
                break;
            }

            case "CUSTOMERS_REDACT":
            case "customers/redact":
                // Order risk records avoid names, email, phone and address fields.
                // Shopify supplies orders_to_redact; their records and the visitor
                // logs of the orders' IP addresses are deleted.
                {
                    stage = "redact_customer";
                    const result = await redactCustomerData(shop, payload);
                    console.log(
                        `[GDPR] Customer Redact Request from ${shop}: redacted ${result.orders} linked order(s) and ${result.visitorLogs} visitor log(s).`,
                    );
                }
                break;

            case "SHOP_REDACT":
            case "shop/redact": {
                console.log(`[GDPR] Shop Redact Request received for ${shop}. Queueing cleanup job...`);
                stage = "enqueue_cleanup";
                await enqueueShopCleanupJob(shop, "shop_redact");
                stage = "quick_cleanup";
                const cleanupResults = await Promise.allSettled([
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
                const cleanupFailures = cleanupResults.filter(
                    (result) => result.status === "rejected",
                );
                if (cleanupFailures.length > 0) {
                    console.error(
                        `[GDPR] ${cleanupFailures.length} quick cleanup step(s) failed for ${shop}; queued cleanup will retry:`,
                        cleanupFailures,
                    );
                }
                console.log(`[GDPR] Queued cleanup job for ${shop}`);
                break;
            }

            default:
                console.log(`[GDPR] Unhandled topic: ${topic}`);
        }

        return responseData({ success: true });
    } catch (error) {
        console.error(`[GDPR] Webhook failed during ${stage}:`, webhookMeta(request), error);
        if (error instanceof Response) return error;
        return responseData({ success: false }, 500);
    }
};

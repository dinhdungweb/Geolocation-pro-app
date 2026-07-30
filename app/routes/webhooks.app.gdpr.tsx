import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { FREE_PLAN } from "../billing.config";
import { enqueueShopCleanupJob } from "../utils/cleanup.server";
import { hashProtectedData } from "../utils/secret-crypto.server";

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
            case "customers/data_request":
                // This app stores visitor IPs and user agents in VisitorLog.
                // These could be considered personal data under GDPR.
                console.log(`[GDPR] Customer Data Request received from ${shop}.`);
                break;

            case "CUSTOMERS_REDACT":
            case "customers/redact":
                // Order risk records avoid names, email, phone and address fields.
                // Shopify supplies orders_to_redact when linked order metadata must go.
                {
                    const orderIds = Array.isArray((payload as any)?.orders_to_redact)
                        ? (payload as any).orders_to_redact.map((id: unknown) => String(id))
                        : [];
                    if (orderIds.length > 0) {
                        const storedOrderIds = [
                            ...orderIds,
                            ...orderIds.map((id: string) => hashProtectedData(id)),
                        ];
                        await prisma.orderRiskRecord.deleteMany({
                            where: {
                                shop,
                                legacyOrderId: { in: storedOrderIds },
                            },
                        });
                    }
                    console.log(
                        `[GDPR] Customer Redact Request received from ${shop}. Redacted ${orderIds.length} linked order(s).`,
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

import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import db from "../db.server";
import { FREE_PLAN } from "../billing.config";
import { fetchShopifyUsagePeriod, syncUsagePeriodForShop } from "../utils/billing-period.server";
import { invalidateStorefrontConfigCache } from "../utils/storefront-config-cache.server";
import { normalizePlanName } from "../utils/effective-plan.server";

type WebhookAdmin = {
    graphql: (query: string) => Promise<Response>;
};

type ActiveSubscription = {
    id?: string;
    name?: string;
    status?: string;
};

async function fetchActiveSubscription(admin: WebhookAdmin): Promise<ActiveSubscription | null> {
    const response = await admin.graphql(`
        #graphql
        query ActiveAppSubscription {
            currentAppInstallation {
                activeSubscriptions {
                    id
                    name
                    status
                }
            }
        }
    `);
    const data: any = await response.json();

    if (!response.ok || data?.errors?.length) {
        const message = data?.errors
            ?.map((error: { message?: string }) => error.message)
            .filter(Boolean)
            .join("; ");
        throw new Error(message || `Shopify active subscription query failed (${response.status})`);
    }

    const activeSubscriptions = data?.data?.currentAppInstallation?.activeSubscriptions;
    if (!Array.isArray(activeSubscriptions)) {
        throw new Error("Shopify active subscription query returned an invalid response");
    }

    return activeSubscriptions.find((subscription) => subscription?.status === "ACTIVE") || null;
}

export const action = async ({ request }: ActionFunctionArgs) => {
    let webhookShop = request.headers.get("x-shopify-shop-domain") || "unknown";

    try {
        const { admin, payload, topic, shop } = await authenticate.webhook(request);
        webhookShop = shop;
        console.log(`Received ${topic} webhook for ${shop}`);

        // A webhook describes one subscription, not the shop's complete billing
        // state. For example, declining a pending Elite upgrade emits an inactive
        // Elite event while the existing Plus subscription remains active.
        const appSubscription = (payload as any).app_subscription;
        const existingSettings = await db.settings.findUnique({ where: { shop } });

        // Without an offline session Shopify cannot provide the authoritative
        // activeSubscriptions list. APP_UNINSTALLED owns deactivation in that
        // case, so never downgrade an existing shop from this partial event.
        if (!admin) {
            invalidateStorefrontConfigCache(shop);
            console.log(`[Subscription Update] Ignored update without an Admin API session for ${shop}`);
            return new Response();
        }

        const activeSubscription = await fetchActiveSubscription(admin);
        const eventStatus = String(appSubscription?.status || "").toUpperCase();
        const eventPlan = normalizePlanName(appSubscription?.name);
        const storedPlan = normalizePlanName(existingSettings?.currentPlan);
        const shouldPreserveStoredPaidPlan = Boolean(
            !activeSubscription &&
            existingSettings &&
            storedPlan !== FREE_PLAN &&
            (
                ["PENDING", "DECLINED", "EXPIRED"].includes(eventStatus) ||
                (eventPlan !== FREE_PLAN && eventPlan !== storedPlan)
            ),
        );

        if (!existingSettings && !activeSubscription) {
            invalidateStorefrontConfigCache(shop);
            console.log(`[Subscription Update] Ignored inactive subscription update for unknown shop ${shop}`);
            return new Response();
        }

        const currentPlan = activeSubscription
            ? normalizePlanName(activeSubscription.name)
            : shouldPreserveStoredPaidPlan
                ? storedPlan
                : FREE_PLAN;
        const hasBillingOverride = Boolean(existingSettings?.billingOverrideEnabled && existingSettings?.billingOverridePlan);

        console.log(
            `[Subscription Update] Shop ${shop} authoritative plan: ${currentPlan} ` +
            `(Event: ${appSubscription?.name || "unknown"} ${appSubscription?.status || "unknown"}, ` +
            `source: ${activeSubscription ? "activeSubscriptions" : shouldPreserveStoredPaidPlan ? "stored-plan-grace" : "no-active-subscription"})`,
        );

        await db.settings.upsert({
            where: { shop },
            update: activeSubscription || shouldPreserveStoredPaidPlan
                ? { currentPlan }
                : {
                    currentPlan,
                    blockVpn: hasBillingOverride ? existingSettings?.blockVpn : false,
                    billingPlanName: null,
                    billingPeriodKey: null,
                    billingPeriodStart: null,
                    billingPeriodEnd: null,
                    billingSubscriptionId: null,
                    billingUsageLineItemId: null,
                },
            create: { shop, currentPlan },
        });

        if (activeSubscription) {
            const shopifyPeriod = await fetchShopifyUsagePeriod(shop, existingSettings);
            if (shopifyPeriod?.period) {
                await syncUsagePeriodForShop(shop, shopifyPeriod.plan || currentPlan, shopifyPeriod.period);
            } else if (existingSettings?.currentPlan !== currentPlan) {
                await db.settings.update({
                    where: { shop },
                    data: {
                        billingPlanName: null,
                        billingPeriodKey: null,
                        billingPeriodStart: null,
                        billingPeriodEnd: null,
                        billingSubscriptionId: null,
                        billingUsageLineItemId: null,
                    },
                });
            }
        }

        invalidateStorefrontConfigCache(shop);
        console.log(`[Subscription Update] Successfully synced plan for ${shop}`);
    } catch (error) {
        console.error(`[Subscription Update] Failed to sync plan for ${webhookShop}:`, error);
        if (error instanceof Response) return error;
        return new Response("Subscription update failed", { status: 500 });
    }

    return new Response();
};

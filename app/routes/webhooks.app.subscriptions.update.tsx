import type { ActionFunctionArgs } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import db from "../db.server";
import { FREE_PLAN } from "../billing.config";

export const action = async ({ request }: ActionFunctionArgs) => {
    const { payload, topic, shop } = await authenticate.webhook(request);
    console.log(`Received ${topic} webhook for ${shop}`);

    // Payload for app_subscriptions_update includes app_subscription object
    // https://shopify.dev/docs/api/admin-rest/2024-04/resources/webhook-events#event-types-app-subscriptions-update
    const appSubscription = (payload as any).app_subscription;

    // Determine the current plan based on the subscription status
    // If status is ACTIVE, use the subscription name, otherwise fallback to FREE_PLAN
    let currentPlan = FREE_PLAN;
    if (appSubscription && appSubscription.status === "ACTIVE") {
        currentPlan = appSubscription.name;
    }

    console.log(`[Subscription Update] Shop ${shop} plan updated to: ${currentPlan} (Status: ${appSubscription?.status})`);

    try {
        await (db as any).settings.upsert({
            where: { shop },
            update: { currentPlan },
            create: { shop, currentPlan },
        });
        console.log(`[Subscription Update] Successfully synced plan for ${shop}`);
    } catch (error) {
        console.error(`[Subscription Update] Failed to sync plan for ${shop}:`, error);
    }

    return new Response();
};

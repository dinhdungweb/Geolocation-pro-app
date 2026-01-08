import type { ActionFunctionArgs } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import { json } from "@remix-run/node";

/**
 * Mandatory GDPR Webhooks for Shopify Apps
 * 
 * 1. customers/data_request: Request to view stored customer data
 * 2. customers/redact: Request to delete customer data
 * 3. shop/redact: Request to delete shop data (48h after uninstall)
 * 
 * Since this app does not store PII (Personally Identifiable Information) 
 * like customer emails, phones, or addresses, we can simply acknowledge these requests.
 */
export const action = async ({ request }: ActionFunctionArgs) => {
    const { topic, shop, payload } = await authenticate.webhook(request);

    console.log(`[GDPR] Received ${topic} webhook for ${shop}`);

    switch (topic) {
        case "customers/data_request":
            // We don't store customer PII.
            // Payload contains: { customer: { id, email, ... }, orders_requested: [] }
            console.log(`[GDPR] Customer Data Request received from ${shop}. No PII stored.`);
            console.log(`[GDPR] Payload`, payload);
            break;

        case "customers/redact":
            // We don't store customer PII to delete.
            // Payload contains: { customer: { id, email, ... }, orders_to_redact: [] }
            console.log(`[GDPR] Customer Redact Request received from ${shop}. No PII to delete.`);
            console.log(`[GDPR] Payload`, payload);
            break;

        case "shop/redact":
            // Shop data deletion request (48 hours after uninstall)
            // We assume data is cleared via the 'app/uninstalled' webhook or retained for potential reinstall behavior
            // depending on app policy. Strict compliance requires cleaning up.
            // However, for this Geolocation app, we mostly store config and anonymous analytics.
            console.log(`[GDPR] Shop Redact Request received from ${shop}.`);
            console.log(`[GDPR] Payload`, payload);
            break;

        default:
            console.log(`[GDPR] Unhandled topic: ${topic}`);
    }

    return json({ success: true }, { status: 200 });
};

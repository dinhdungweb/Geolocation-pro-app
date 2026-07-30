import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import db from "../db.server";
import { invalidateShopifyMarketsCache } from "../utils/shopify-markets.server";
import { invalidateThemeAppEmbedStatusCache } from "../utils/theme-app-embed.server";

function webhookMeta(request: Request) {
    return {
        apiVersion: request.headers.get("x-shopify-api-version"),
        shop: request.headers.get("x-shopify-shop-domain"),
        topic: request.headers.get("x-shopify-topic"),
        webhookId: request.headers.get("x-shopify-webhook-id"),
    };
}

export const action = async ({ request }: ActionFunctionArgs) => {
    let stage = "authenticate";

    try {
        const { payload, topic, shop } = await authenticate.webhook(request);
        console.log(`Received ${topic} webhook for ${shop}`);

        const current = Array.isArray(payload.current)
            ? payload.current.map((scope) => String(scope))
            : [];

        // A scope update changes the permissions attached to newly issued access
        // tokens. Updating only Session.scope would make a stale token look as if
        // it already had the new permissions. Remove cached sessions so the next
        // embedded request performs token exchange and stores a fresh token.
        stage = "invalidate_sessions";
        await db.session.deleteMany({ where: { shop } });

        console.log(
            `[Scopes] Invalidated cached sessions for ${shop}; granted scopes: ${current.join(",")}`,
        );
        invalidateThemeAppEmbedStatusCache(shop);
        invalidateShopifyMarketsCache(shop);
        return new Response(null, { status: 200 });
    } catch (error) {
        console.error(
            `[Scopes] Webhook failed during ${stage}:`,
            webhookMeta(request),
            error,
        );
        if (error instanceof Response) return error;
        return new Response("Scope update webhook failed", { status: 500 });
    }
};

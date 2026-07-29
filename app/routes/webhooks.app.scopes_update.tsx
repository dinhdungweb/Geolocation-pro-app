import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import db from "../db.server";
import { invalidateShopifyMarketsCache } from "../utils/shopify-markets.server";
import { invalidateThemeAppEmbedStatusCache } from "../utils/theme-app-embed.server";

export const action = async ({ request }: ActionFunctionArgs) => {
    const { payload, topic, shop } = await authenticate.webhook(request);
    console.log(`Received ${topic} webhook for ${shop}`);

    const current = payload.current as string[];

    // A scope update changes the permissions attached to newly issued access
    // tokens. Updating only Session.scope would make a stale token look as if
    // it already had the new permissions. Remove cached sessions so the next
    // embedded request performs token exchange and stores a fresh token.
    await db.session.deleteMany({ where: { shop } });

    console.log(
        `[Scopes] Invalidated cached sessions for ${shop}; granted scopes: ${current.join(",")}`,
    );
    invalidateThemeAppEmbedStatusCache(shop);
    invalidateShopifyMarketsCache(shop);
    return new Response();
};

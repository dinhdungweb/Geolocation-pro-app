import { apiVersion } from "../shopify.server";
import { createExpiringAsyncCache } from "./expiring-async-cache.server";

export interface ShopIdentity {
  ownerName: string;
  shopName: string;
}

const SHOP_IDENTITY_TIMEOUT_MS = 8_000;
const shopIdentityCache = createExpiringAsyncCache<ShopIdentity>();

function formatShopFallbackName(shop: string) {
  return shop
    .replace(".myshopify.com", "")
    .split("-")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ") || "there";
}

async function loadShopIdentity({
  shop,
  accessToken,
}: {
  shop: string;
  accessToken: string;
}): Promise<ShopIdentity> {
  const fallbackName = formatShopFallbackName(shop);

  try {
    // GraphQL Admin API: public apps may not use the REST Admin API.
    const response = await fetch(`https://${shop}/admin/api/${apiVersion}/graphql.json`, {
      method: "POST",
      headers: {
        "X-Shopify-Access-Token": accessToken,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        query: `#graphql
          query GeoShopIdentity {
            shop {
              name
              shopOwnerName
            }
          }`,
      }),
      signal: AbortSignal.timeout(SHOP_IDENTITY_TIMEOUT_MS),
    });

    if (!response.ok) {
      throw new Error(`Shop request failed with ${response.status}`);
    }

    const data = await response.json() as {
      data?: {
        shop?: {
          name?: string | null;
          shopOwnerName?: string | null;
        };
      };
      errors?: Array<{ message?: string }>;
    };
    if (data.errors?.length) {
      throw new Error(data.errors.map((error) => error.message).join("; "));
    }

    return {
      ownerName: data.data?.shop?.shopOwnerName || data.data?.shop?.name || fallbackName,
      shopName: data.data?.shop?.name || fallbackName,
    };
  } catch (error) {
    console.error("[Dashboard] Failed to read shop identity:", error);
    return {
      ownerName: fallbackName,
      shopName: fallbackName,
    };
  }
}

export function getShopIdentity(args: {
  shop: string;
  accessToken: string;
}) {
  return shopIdentityCache.get(
    args.shop,
    () => loadShopIdentity(args),
    15 * 60_000,
  );
}

export function invalidateShopIdentityCache(shop?: string) {
  shopIdentityCache.invalidate(shop);
}

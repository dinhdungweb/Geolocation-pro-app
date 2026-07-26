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
    const response = await fetch(
      `https://${shop}/admin/api/${apiVersion}/shop.json?fields=name,shop_owner`,
      {
        headers: {
          "X-Shopify-Access-Token": accessToken,
          Accept: "application/json",
        },
        signal: AbortSignal.timeout(SHOP_IDENTITY_TIMEOUT_MS),
      },
    );

    if (!response.ok) {
      throw new Error(`Shop request failed with ${response.status}`);
    }

    const data = await response.json() as {
      shop?: {
        name?: string | null;
        shop_owner?: string | null;
      };
    };

    return {
      ownerName: data.shop?.shop_owner || data.shop?.name || fallbackName,
      shopName: data.shop?.name || fallbackName,
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

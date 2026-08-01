import prisma from "../db.server";
import { createExpiringAsyncCache } from "./expiring-async-cache.server";
import { invalidateStorefrontConfigCache } from "./storefront-config-cache.server";
import {
  DEFAULT_SHOP_TIME_ZONE,
  normalizeShopTimeZone,
} from "./shop-timezone";

const SHOP_TIME_ZONE_SYNC_INTERVAL_MS = 24 * 60 * 60 * 1000;
const SHOP_TIME_ZONE_CACHE_TTL_MS = 15 * 60 * 1000;

type ShopifyAdminClient = {
  graphql: (query: string) => Promise<Response>;
};

const shopTimeZoneCache = createExpiringAsyncCache<string>();

function shouldSync(syncedAt: Date | null | undefined) {
  return (
    !syncedAt ||
    Date.now() - syncedAt.getTime() >= SHOP_TIME_ZONE_SYNC_INTERVAL_MS
  );
}

async function fetchShopifyTimeZone(admin: ShopifyAdminClient) {
  const response = await admin.graphql(`#graphql
    query GeoShopTimeZone {
      shop {
        ianaTimezone
      }
    }
  `);
  const payload = (await response.json()) as {
    data?: { shop?: { ianaTimezone?: string | null } | null };
  };
  const timeZone = payload.data?.shop?.ianaTimezone?.trim();
  if (!timeZone) {
    throw new Error("Shopify did not return shop.ianaTimezone");
  }
  new Intl.DateTimeFormat("en-US", { timeZone }).format(0);
  return normalizeShopTimeZone(timeZone);
}

export async function ensureShopTimeZone({
  admin,
  shop,
}: {
  admin: ShopifyAdminClient;
  shop: string;
}) {
  return shopTimeZoneCache.get(
    shop,
    async () => {
      const settings = await prisma.settings.findUnique({
        where: { shop },
        select: { shopTimezone: true, shopTimezoneSyncedAt: true },
      });
      const storedTimeZone = normalizeShopTimeZone(settings?.shopTimezone);
      if (settings && !shouldSync(settings.shopTimezoneSyncedAt)) {
        return storedTimeZone;
      }

      try {
        const shopTimezone = await fetchShopifyTimeZone(admin);
        await prisma.settings.upsert({
          where: { shop },
          update: {
            shopTimezone,
            shopTimezoneSyncedAt: new Date(),
          },
          create: {
            shop,
            shopTimezone,
            shopTimezoneSyncedAt: new Date(),
          },
        });

        if (shopTimezone !== storedTimeZone) {
          invalidateStorefrontConfigCache(shop);
        }
        return shopTimezone;
      } catch (error) {
        console.warn(`[ShopTimeZone] Could not sync timezone for ${shop}`, error);
        return settings ? storedTimeZone : DEFAULT_SHOP_TIME_ZONE;
      }
    },
    SHOP_TIME_ZONE_CACHE_TTL_MS,
  );
}

export function invalidateShopTimeZoneCache(shop?: string) {
  shopTimeZoneCache.invalidate(shop);
}

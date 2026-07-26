import { createExpiringAsyncCache } from "./expiring-async-cache.server";

export interface ShopifyMarketOption {
  id: string;
  numericId: string;
  handle: string;
  name: string;
  status: string;
  label: string;
  countryCodes: string[];
}

export interface ShopifyMarketsResult {
  markets: ShopifyMarketOption[];
  error: string | null;
}

type AdminGraphqlClient = {
  graphql: (query: string, options?: Record<string, unknown>) => Promise<Response>;
};

const marketsCache = createExpiringAsyncCache<ShopifyMarketsResult>();

function numericIdFromGid(id: string) {
  const match = id.match(/\/(\d+)$/);
  return match?.[1] || id;
}

async function loadShopifyMarkets(
  admin: AdminGraphqlClient,
): Promise<ShopifyMarketsResult> {
  try {
    const response = await admin.graphql(
      `#graphql
      query GeoMarketRuleTargets {
        markets(first: 100) {
          nodes {
            id
            handle
            name
            status
            conditions {
              regionsCondition {
                regions(first: 250) {
                  nodes {
                    id
                    name
                    ... on MarketRegionCountry {
                      code
                    }
                  }
                }
              }
            }
          }
        }
      }`,
    );

    const payload = await response.json();
    const graphqlErrors = payload?.errors;
    if (graphqlErrors?.length) {
      const firstMessage = graphqlErrors[0]?.message || "Unable to load Shopify Markets.";
      return { markets: [], error: firstMessage };
    }

    const markets = (payload?.data?.markets?.nodes || [])
      .map((market: any) => {
        const id = typeof market?.id === "string" ? market.id : "";
        const handle = typeof market?.handle === "string" ? market.handle : "";
        const name = typeof market?.name === "string" ? market.name : handle;
        const status = typeof market?.status === "string" ? market.status : "";
        const countryCodes = (market?.conditions?.regionsCondition?.regions?.nodes || [])
          .map((region: any) => typeof region?.code === "string" ? region.code.toUpperCase() : "")
          .filter(Boolean);
        if (!id || !handle) return null;
        return {
          id,
          numericId: numericIdFromGid(id),
          handle,
          name,
          status,
          label: `${name} (${handle})${status === "INACTIVE" ? " - inactive" : ""}`,
          countryCodes,
        } satisfies ShopifyMarketOption;
      })
      .filter(Boolean) as ShopifyMarketOption[];

    return { markets, error: null };
  } catch (error: any) {
    const message = error?.message || "Unable to load Shopify Markets.";
    return { markets: [], error: message };
  }
}

export function getShopifyMarkets(
  admin: AdminGraphqlClient,
  shop: string,
) {
  return marketsCache.get(
    shop,
    () => loadShopifyMarkets(admin),
    (result) => result.error ? 10_000 : 5 * 60_000,
  );
}

export function invalidateShopifyMarketsCache(shop?: string) {
  marketsCache.invalidate(shop);
}

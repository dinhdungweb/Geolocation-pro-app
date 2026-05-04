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

function numericIdFromGid(id: string) {
  const match = id.match(/\/(\d+)$/);
  return match?.[1] || id;
}

export async function getShopifyMarkets(
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

import type { LoaderFunctionArgs } from "react-router";
import { data as responseData } from "react-router";
import { authenticate } from "../shopify.server";
import { getShopifyMarkets } from "../utils/shopify-markets.server";
export { shopifyBoundaryHeaders as headers } from "../utils/shopify-boundary.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const loaderStartedAt = performance.now();
  const { admin, session } = await authenticate.admin(request);
  const result = await getShopifyMarkets(admin, session.shop);

  return responseData(result, {
    headers: {
      "Cache-Control": "private, max-age=30",
      "Server-Timing": `geo-markets;dur=${(performance.now() - loaderStartedAt).toFixed(1)}`,
    },
  });
};

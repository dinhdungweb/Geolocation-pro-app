import type { LoaderFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
export { shopifyBoundaryHeaders as headers } from "../utils/shopify-boundary.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticate.admin(request);

  return null;
};

import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
export { shopifyBoundaryHeaders as headers } from "../utils/shopify-boundary.server";

const METRIC_NAMES = new Set(["CLS", "FCP", "INP", "LCP", "ROUTE"]);

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);

  try {
    const payload = await request.json() as {
      name?: unknown;
      path?: unknown;
      value?: unknown;
    };
    const name = typeof payload.name === "string" ? payload.name : "";
    const path = typeof payload.path === "string" ? payload.path.slice(0, 200) : "";
    const value = typeof payload.value === "number" ? payload.value : Number.NaN;

    if (!METRIC_NAMES.has(name) || !Number.isFinite(value) || value < 0) {
      return Response.json({ error: "Invalid metric" }, { status: 400 });
    }

    console.info("[WebVital]", {
      name,
      path,
      shop: session.shop,
      value,
    });
    return new Response(null, { status: 204 });
  } catch {
    return Response.json({ error: "Invalid payload" }, { status: 400 });
  }
};

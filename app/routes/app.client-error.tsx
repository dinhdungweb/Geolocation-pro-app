import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
export { shopifyBoundaryHeaders as headers } from "../utils/shopify-boundary.server";

const BOUNDARIES = new Set(["root", "route", "await"]);

function text(value: unknown, maxLength: number) {
  return typeof value === "string" ? value.slice(0, maxLength) : undefined;
}

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);

  try {
    const payload = await request.json() as Record<string, unknown>;
    const boundary = text(payload.boundary, 20) || "";
    const message = text(payload.message, 500) || "";

    if (!BOUNDARIES.has(boundary) || !message) {
      return Response.json({ error: "Invalid error report" }, { status: 400 });
    }

    console.error("[ClientError]", {
      boundary,
      message,
      name: text(payload.name, 100),
      path: text(payload.path, 200),
      shop: session.shop,
      stack: text(payload.stack, 2000),
      status: typeof payload.status === "number" ? payload.status : undefined,
      userAgent: request.headers.get("user-agent")?.slice(0, 200),
    });
    return new Response(null, { status: 204 });
  } catch {
    return Response.json({ error: "Invalid payload" }, { status: 400 });
  }
};

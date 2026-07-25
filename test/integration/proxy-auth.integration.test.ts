import { afterEach, describe, expect, it, vi } from "vitest";
import prisma from "../../app/db.server";
import { authenticate } from "../../app/shopify.server";
import { action as analyticsAction } from "../../app/routes/proxy.analytics";
import {
  action as configAction,
  loader as configLoader,
} from "../../app/routes/proxy.config";

vi.mock("../../app/shopify.server", () => ({
  authenticate: {
    public: {
      appProxy: vi.fn(),
    },
  },
}));

vi.mock("../../app/utils/maxmind.server", () => ({
  getGeoFromIP: async () => ({
    city: "",
    countryCode: "US",
    regionCode: "CA",
    regionName: "California",
  }),
}));

const SHOP = "proxy-auth.integration.test";
const appProxyAuth = vi.mocked(authenticate.public.appProxy);

async function responseJson(response: Response) {
  return response.json() as Promise<Record<string, unknown>>;
}

afterEach(async () => {
  vi.clearAllMocks();
  await prisma.settings.deleteMany({ where: { shop: SHOP } });
});

describe("app proxy authentication integration", () => {
  it("answers proxy CORS preflight requests without authentication", async () => {
    const analyticsResponse = await analyticsAction({
      context: {},
      params: {},
      request: new Request("https://app.test/proxy/analytics", {
        method: "OPTIONS",
      }),
    } as never);
    const configResponse = await configAction({
      context: {},
      params: {},
      request: new Request("https://app.test/proxy/config", {
        method: "OPTIONS",
      }),
    } as never);

    expect(analyticsResponse.status).toBe(204);
    expect(analyticsResponse.headers.get("access-control-allow-origin")).toBe("*");
    expect(configResponse.status).toBe(204);
    expect(configResponse.headers.get("access-control-allow-origin")).toBe("*");
    expect(appProxyAuth).not.toHaveBeenCalled();
  });

  it("rejects config requests without a shop before authentication", async () => {
    const response = await configLoader({
      context: {},
      params: {},
      request: new Request("https://app.test/proxy/config"),
    } as never);

    expect(response.status).toBe(400);
    expect(appProxyAuth).not.toHaveBeenCalled();
    expect(await responseJson(response)).toMatchObject({
      action: "none",
      error: "Missing shop parameter",
    });
  });

  it("rejects config requests when Shopify signature verification fails", async () => {
    appProxyAuth.mockRejectedValue(new Error("invalid signature"));
    const response = await configLoader({
      context: {},
      params: {},
      request: new Request(`https://app.test/proxy/config?shop=${SHOP}`),
    } as never);

    expect(response.status).toBe(401);
    expect(await responseJson(response)).toMatchObject({
      action: "none",
      error: "Unauthorized: Invalid signature",
    });
  });

  it("accepts a verified config request and returns a safe no-op for an unknown shop", async () => {
    appProxyAuth.mockResolvedValue({} as never);
    const response = await configLoader({
      context: {},
      params: {},
      request: new Request(`https://app.test/proxy/config?shop=${SHOP}&country=US`, {
        headers: { "x-forwarded-for": "203.0.113.30" },
      }),
    } as never);

    expect(response.status).toBe(200);
    expect(appProxyAuth).toHaveBeenCalledOnce();
    expect(await responseJson(response)).toMatchObject({
      action: "none",
      currentPlan: "free",
    });
  });

  it("rejects analytics requests before reading untrusted event data", async () => {
    appProxyAuth.mockRejectedValue(new Error("invalid signature"));
    const response = await analyticsAction({
      context: {},
      params: {},
      request: new Request(`https://app.test/proxy/analytics?shop=${SHOP}`, {
        body: JSON.stringify({ type: "visit" }),
        headers: { "content-type": "application/json" },
        method: "POST",
      }),
    } as never);

    expect(response.status).toBe(401);
    expect(await responseJson(response)).toEqual({
      error: "Unauthorized: Invalid signature",
    });
  });

  it("requires a signed analytics event token for a verified, enabled shop", async () => {
    await prisma.settings.create({ data: { shop: SHOP } });
    appProxyAuth.mockResolvedValue({} as never);
    const response = await analyticsAction({
      context: {},
      params: {},
      request: new Request(`https://app.test/proxy/analytics?shop=${SHOP}`, {
        body: JSON.stringify({ type: "visit" }),
        headers: {
          "content-type": "application/json",
          "x-forwarded-for": "203.0.113.31",
        },
        method: "POST",
      }),
    } as never);

    expect(response.status).toBe(401);
    expect(await responseJson(response)).toEqual({
      error: "Missing or invalid analytics token",
    });
  });
});

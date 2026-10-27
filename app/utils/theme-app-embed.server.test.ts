import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../shopify.server", () => ({ apiVersion: "2026-04" }));

import {
  getThemeAppEmbedStatus,
  invalidateThemeAppEmbedStatusCache,
} from "./theme-app-embed.server";

function themeResponse(content: string | null, name = "Dawn") {
  return Response.json({
    data: {
      themes: {
        nodes: [
          {
            id: "gid://shopify/OnlineStoreTheme/1",
            name,
            files: { nodes: content === null ? [] : [{ body: { content } }] },
          },
        ],
      },
    },
  });
}

const args = { shop: "embed-test.myshopify.com", accessToken: "token", scopeString: "read_themes" };

afterEach(() => {
  vi.unstubAllGlobals();
  invalidateThemeAppEmbedStatusCache();
});

describe("theme app embed status (GraphQL)", () => {
  it("queries the GraphQL Admin API, not REST", async () => {
    const fetchMock = vi.fn(async () => themeResponse(null));
    vi.stubGlobal("fetch", fetchMock);

    await getThemeAppEmbedStatus(args);

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://embed-test.myshopify.com/admin/api/2026-04/graphql.json");
    expect(init.method).toBe("POST");
    expect(String(init.body)).toContain("roles: [MAIN]");
  });

  it("detects an enabled embed, including settings files with a comment header", async () => {
    const settings = `/*\n * IMPORTANT: auto-generated\n */\n${JSON.stringify({
      current: {
        blocks: {
          abc: { type: "shopify://apps/geo/blocks/geolocation-popup/123", disabled: false },
        },
      },
    })}`;
    vi.stubGlobal("fetch", vi.fn(async () => themeResponse(settings)));

    expect(await getThemeAppEmbedStatus(args)).toMatchObject({ state: "enabled", themeName: "Dawn" });
  });

  it("reports a disabled embed and missing permission", async () => {
    const disabled = JSON.stringify({
      current: { blocks: { abc: { type: "shopify://apps/geo/blocks/geolocation-popup/1", disabled: true } } },
    });
    vi.stubGlobal("fetch", vi.fn(async () => themeResponse(disabled)));
    expect((await getThemeAppEmbedStatus(args)).state).toBe("disabled");

    invalidateThemeAppEmbedStatusCache();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({ errors: [{ message: "Access denied", extensions: { code: "ACCESS_DENIED" } }] }),
      ),
    );
    expect((await getThemeAppEmbedStatus(args)).state).toBe("missing_scope");
  });
});

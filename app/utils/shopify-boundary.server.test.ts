import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { Dirent } from "node:fs";
import type { HeadersArgs } from "react-router";
import { describe, expect, it } from "vitest";

import { shopifyBoundaryHeaders } from "./shopify-boundary.server";

const REAUTHORIZE_HEADER =
  "X-Shopify-API-Request-Failure-Reauthorize-Url";

function routeFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap(
    (entry: Dirent) => {
      const path = `${directory}/${entry.name}`;

      if (entry.isDirectory()) return routeFiles(path);
      if (!/\.(ts|tsx)$/.test(entry.name)) return [];

      return [path];
    },
  );
}

describe("shopifyBoundaryHeaders", () => {
  it("preserves Shopify redirect headers from Single Fetch actions", () => {
    const confirmationUrl =
      "https://admin.shopify.com/store/test/charges/confirm";
    const headers = new Headers(
      shopifyBoundaryHeaders({
        parentHeaders: new Headers({
          "Content-Security-Policy": "frame-ancestors test",
        }),
        loaderHeaders: new Headers(),
        actionHeaders: new Headers({ [REAUTHORIZE_HEADER]: confirmationUrl }),
        errorHeaders: undefined,
      } satisfies HeadersArgs),
    );

    expect(headers.get(REAUTHORIZE_HEADER)).toBe(confirmationUrl);
    expect(headers.get("Content-Security-Policy")).toBe(
      "frame-ancestors test",
    );
  });

  it("requires every route calling authenticate.admin to export headers", () => {
    const routesDirectory = fileURLToPath(
      new URL("../routes", import.meta.url),
    );
    const missingHeaders = routeFiles(routesDirectory)
      .filter((file) =>
        readFileSync(file, "utf8").includes("authenticate.admin(request)"),
      )
      .filter((file) => {
        const source = readFileSync(file, "utf8");
        return !(
          /export\s+const\s+headers\b/.test(source) ||
          /export\s*\{[^}]*\bas\s+headers\b[^}]*\}/s.test(source)
        );
      })
      .map((file) => file.replaceAll("\\", "/").split("/app/routes/").at(-1));

    expect(missingHeaders).toEqual([]);
  });

  it("prevents authenticated routes from using the generic React Router redirect", () => {
    const routesDirectory = fileURLToPath(
      new URL("../routes", import.meta.url),
    );
    const invalidRedirectImports = routeFiles(routesDirectory)
      .filter((file) =>
        readFileSync(file, "utf8").includes("authenticate.admin(request)"),
      )
      .filter((file) => {
        const source = readFileSync(file, "utf8");
        return /import\s*\{[^}]*\bredirect\b[^}]*\}\s*from\s*["']react-router["']/s.test(
          source,
        );
      })
      .map((file) => file.replaceAll("\\", "/").split("/app/routes/").at(-1));

    expect(invalidRedirectImports).toEqual([]);
  });
});

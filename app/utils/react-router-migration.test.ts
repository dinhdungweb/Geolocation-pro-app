import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { Dirent } from "node:fs";
import { describe, expect, it } from "vitest";

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap(
    (entry: Dirent) => {
      const path = `${directory}/${entry.name}`;

      if (entry.isDirectory()) return sourceFiles(path);
      if (
        !/\.(ts|tsx)$/.test(entry.name) ||
        /\.test\.(ts|tsx)$/.test(entry.name)
      ) {
        return [];
      }

      return [path];
    },
  );
}

describe("React Router migration", () => {
  it("does not reintroduce deprecated Remix runtime imports or APIs", () => {
    const appDirectory = fileURLToPath(new URL("../", import.meta.url));
    const deprecatedPatterns = [
      ["Remix runtime import", /@remix-run\//],
      ["Shopify Remix adapter", /@shopify\/shopify-app-remix/],
      ["Remix defer helper", /\bdefer\s*\(/],
      ["legacy embedded provider prop", /\bisEmbeddedApp\b/],
    ] as const;
    const violations = sourceFiles(appDirectory).flatMap((file) => {
      const source = readFileSync(file, "utf8");

      return deprecatedPatterns
        .filter(([, pattern]) => pattern.test(source))
        .map(([label]) => `${file}: ${label}`);
    });

    expect(violations).toEqual([]);
  });

  it("uses only the React Router Shopify adapter in package dependencies", () => {
    const packageJsonPath = fileURLToPath(
      new URL("../../package.json", import.meta.url),
    );
    const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf8")) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
    const packages = {
      ...packageJson.dependencies,
      ...packageJson.devDependencies,
    };

    expect(packages["@shopify/shopify-app-react-router"]).toBe("2.0.0");
    expect(packages["react-router"]).toBe("7.18.2");
    expect(packages["@shopify/shopify-app-remix"]).toBeUndefined();
    expect(packages["@remix-run/react"]).toBeUndefined();
    expect(packages["@remix-run/node"]).toBeUndefined();
  });

  it("keeps Support page navigation inside the React Router app", () => {
    const supportRoutePath = fileURLToPath(
      new URL("../routes/app.support.tsx", import.meta.url),
    );
    const supportRoute = readFileSync(supportRoutePath, "utf8");

    expect(supportRoute).toContain("const navigate = useNavigate()");
    expect(supportRoute).toContain("onClick={() => navigate(item.url)}");
    expect(supportRoute).toContain('onClick={() => navigate("/app/logs")}');
    expect(supportRoute).not.toContain("<Button url={item.url}>");
    expect(supportRoute).not.toContain('<Button url="/app/logs"');
  });

  it("lets App Bridge own authenticated fetch and authentication recovery", () => {
    const appRoutePath = fileURLToPath(
      new URL("../routes/app.tsx", import.meta.url),
    );
    const appRoute = readFileSync(appRoutePath, "utf8");

    expect(appRoute).not.toContain("window.fetch =");
    expect(appRoute).not.toContain("__geoShopifyFetchPatched");
    expect(appRoute).not.toContain("geo_auth_recovery");
    expect(appRoute).not.toContain("EmbeddedAuthRecovery");
    expect(appRoute).not.toContain("window.location.replace(");
    expect(appRoute).toContain("return boundary.error(useRouteError());");
  });

  it("keeps a user-friendly root error boundary", () => {
    const rootRoutePath = fileURLToPath(new URL("../root.tsx", import.meta.url));
    const rootRoute = readFileSync(rootRoutePath, "utf8");

    expect(rootRoute).toContain("export function ErrorBoundary()");
    expect(rootRoute).toContain("We couldn't load this page");
    expect(rootRoute).not.toContain("error.statusText");
  });
});

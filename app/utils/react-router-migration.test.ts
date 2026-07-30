import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { Dirent } from "node:fs";
import { describe, expect, it } from "vitest";

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap(
    (entry: Dirent) => {
      const path = `${directory}/${entry.name}`;

      if (entry.isDirectory()) return sourceFiles(path);
      if (!/\.(ts|tsx)$/.test(entry.name) || /\.test\.(ts|tsx)$/.test(entry.name)) {
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

    expect(packages["@shopify/shopify-app-react-router"]).toBe("1.2.1");
    expect(packages["react-router"]).toBe("7.18.1");
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
    expect(supportRoute).toContain(
      'onClick={() => navigate("/app/logs")}',
    );
    expect(supportRoute).not.toContain("<Button url={item.url}>");
    expect(supportRoute).not.toContain(
      '<Button url="/app/logs"',
    );
  });
});

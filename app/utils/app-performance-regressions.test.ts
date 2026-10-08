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

describe("embedded app performance regressions", () => {
  it("uses deterministic locale formatting in server-rendered source", () => {
    const appDirectory = fileURLToPath(new URL("../", import.meta.url));
    const implicitLocalePattern =
      /\.toLocale(?:String|DateString|TimeString)\(\)/;
    const violations = sourceFiles(appDirectory)
      .filter((file) => implicitLocalePattern.test(readFileSync(file, "utf8")))
      .map((file) => file.replaceAll("\\", "/").split("/app/").at(-1));

    expect(violations).toEqual([]);
  });

  it("keeps non-critical dashboard analytics out of the critical loader wait", () => {
    const routePath = fileURLToPath(
      new URL("../routes/app._index.tsx", import.meta.url),
    );
    const source = readFileSync(routePath, "utf8");
    const criticalWaitStart = source.indexOf("] = await Promise.all([");
    const criticalWaitEnd = source.indexOf("]);", criticalWaitStart);
    const criticalWait = source.slice(criticalWaitStart, criticalWaitEnd);

    expect(criticalWait).not.toContain("analyticsPromise");
    expect(source).toContain("analytics: analyticsPromise");
    expect(source).toContain("<Await");
    expect(source).toContain("resolve={analytics}");
  });

  it("does not load an unused timezone in the authenticated app layout", () => {
    const routePath = fileURLToPath(
      new URL("../routes/app.tsx", import.meta.url),
    );
    const source = readFileSync(routePath, "utf8");

    expect(source).not.toContain("ensureShopTimeZone");
    expect(source).toContain("await authenticate.admin(request)");
  });

  it("deduplicates and briefly caches theme app embed checks", () => {
    const utilityPath = fileURLToPath(
      new URL("./theme-app-embed.server.ts", import.meta.url),
    );
    const source = readFileSync(utilityPath, "utf8");

    expect(source).toContain("createExpiringAsyncCache<AppEmbedStatus>()");
    expect(source).toContain("THEME_STATUS_TIMEOUT_MS = 3_000");
    expect(source).toContain("themeAppEmbedStatusCache.invalidate(shop)");
  });
});

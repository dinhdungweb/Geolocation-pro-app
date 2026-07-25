import { describe, expect, it } from "vitest";
import { loader } from "../../app/routes/healthz";

describe("health endpoint", () => {
  it("reports ok when the application database is reachable", async () => {
    const response = await loader({
      request: new Request("http://localhost/healthz"),
      context: {},
      params: {},
    });

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    await expect(response.json()).resolves.toEqual({ status: "ok" });
  });
});

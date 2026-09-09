import { describe, expect, it, vi } from "vitest";

import { sendWebVital } from "./web-vitals.client";

describe("sendWebVital", () => {
  it("waits for an ID token before sending an authenticated metric", async () => {
    const fetchImpl = vi.fn(async () => new Response(null, { status: 204 }));

    const sent = await sendWebVital(
      { name: "LCP", path: "/app", value: 123.456 },
      {
        getIdToken: async () => "fresh-token",
        fetchImpl,
      },
    );

    expect(sent).toBe(true);
    expect(fetchImpl).toHaveBeenCalledWith(
      "/app/performance",
      expect.objectContaining({
        method: "POST",
        headers: {
          Authorization: "Bearer fresh-token",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ name: "LCP", path: "/app", value: 123.46 }),
      }),
    );
  });

  it("does not send a metric when App Bridge cannot provide a token", async () => {
    const fetchImpl = vi.fn();

    const sent = await sendWebVital(
      { name: "CLS", path: "/app", value: 0.1 },
      {
        getIdToken: async () => undefined,
        fetchImpl,
      },
    );

    expect(sent).toBe(false);
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

import { describe, expect, it } from "vitest";

import { hasDuplicateAppProxyAuthParams } from "./app-proxy-auth.server";

describe("hasDuplicateAppProxyAuthParams", () => {
  it.each(["hmac", "shop", "signature", "timestamp"])(
    "rejects a repeated %s parameter",
    (param) => {
      const searchParams = new URLSearchParams(
        `${param}=first&${param}=second`,
      );

      expect(hasDuplicateAppProxyAuthParams(searchParams)).toBe(true);
    },
  );

  it("allows a single value for every authentication parameter", () => {
    const searchParams = new URLSearchParams(
      "shop=test.myshopify.com&timestamp=123&signature=abc",
    );

    expect(hasDuplicateAppProxyAuthParams(searchParams)).toBe(false);
  });

  it("allows repeated non-authentication parameters", () => {
    const searchParams = new URLSearchParams("country=US&country=CA");

    expect(hasDuplicateAppProxyAuthParams(searchParams)).toBe(false);
  });
});

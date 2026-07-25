import { describe, expect, it } from "vitest";
import { getVisitorIP } from "./request-ip.server";

function requestWithHeaders(headers: HeadersInit = {}) {
  return new Request("https://app.example/proxy", { headers });
}

describe("getVisitorIP", () => {
  it("uses the first public forwarded address and skips private hops", () => {
    const request = requestWithHeaders({
      "x-forwarded-for": "10.0.0.4, 203.0.113.42, 198.51.100.10",
      "cf-connecting-ip": "192.0.2.20",
    });

    expect(getVisitorIP(request)).toBe("203.0.113.42");
  });

  it("normalizes brackets around a forwarded IPv6 address", () => {
    const request = requestWithHeaders({
      "x-forwarded-for": "[2001:db8::7]",
    });

    expect(getVisitorIP(request)).toBe("2001:db8::7");
  });

  it("falls back through trusted single-IP headers", () => {
    const request = requestWithHeaders({
      "cf-connecting-ip": "198.51.100.12",
      "x-real-ip": "198.51.100.99",
    });

    expect(getVisitorIP(request)).toBe("198.51.100.12");
  });

  it("returns a safe sentinel when no address is available", () => {
    expect(getVisitorIP(requestWithHeaders())).toBe("0.0.0.0");
  });
});

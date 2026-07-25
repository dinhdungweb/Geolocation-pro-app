import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  analyticsEventAllowedForToken,
  createAnalyticsEvent,
  getYearMonth,
  hashIP,
  isBillableAnalyticsEvent,
  verifyAnalyticsToken,
  type AnalyticsTokenPayload,
  type RuleSource,
  type StorefrontAction,
} from "./analytics-token.server";

const basePayload = {
  shop: "unit-test.myshopify.com",
  yearMonth: "2026-07",
  billingPeriodKey: "period-1",
  ruleId: "rule-1",
  action: "popup" as const,
  source: "country" as const,
  path: "/products/example",
  countryCode: "US",
  regionCode: "CA",
  regionName: "California",
  ipHash: "hashed-ip",
};

function eventPayload(
  action: StorefrontAction,
  source: RuleSource = "country",
  ruleId = "rule-1",
): AnalyticsTokenPayload {
  return {
    ...basePayload,
    action,
    source,
    ruleId,
    iat: Date.now(),
    eventKey: "event-1",
  };
}

beforeEach(() => {
  vi.stubEnv("SHOPIFY_API_SECRET", "unit-test-secret");
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-07-25T10:00:00.000Z"));
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

describe("analytics token signing", () => {
  it("creates a signed token that round-trips its payload", () => {
    const event = createAnalyticsEvent(basePayload, { eventKey: "stable-event-key" });
    const verified = verifyAnalyticsToken(event.token);

    expect(verified).toEqual(event.payload);
    expect(verified?.eventKey).toBe("stable-event-key");
    expect(verified?.iat).toBe(Date.now());
  });

  it("rejects a modified signature", () => {
    const { token } = createAnalyticsEvent(basePayload);
    const [payload, signature] = token.split(".");
    const replacement = signature.endsWith("a") ? "b" : "a";

    expect(verifyAnalyticsToken(`${payload}.${signature.slice(0, -1)}${replacement}`)).toBeNull();
  });

  it("rejects malformed and expired tokens", () => {
    const { token } = createAnalyticsEvent(basePayload);
    expect(verifyAnalyticsToken("not-a-token")).toBeNull();

    vi.advanceTimersByTime(30 * 60 * 1000 + 1);
    expect(verifyAnalyticsToken(token)).toBeNull();
  });

  it("requires a signing secret", () => {
    vi.stubEnv("SHOPIFY_API_SECRET", "");
    expect(() => hashIP("203.0.113.10")).toThrow(
      "SHOPIFY_API_SECRET is required to sign analytics tokens",
    );
  });

  it("hashes an IP deterministically without exposing it", () => {
    const first = hashIP("203.0.113.10");
    expect(first).toBe(hashIP("203.0.113.10"));
    expect(first).not.toContain("203.0.113.10");
    expect(first).toHaveLength(64);
  });

  it("formats the local year and month", () => {
    expect(getYearMonth(new Date(2026, 0, 15))).toBe("2026-01");
  });
});

describe("analytics event authorization", () => {
  it.each([
    ["popup_shown", "popup", "country", true],
    ["redirected", "popup", "country", true],
    ["dismissed", "popup", "country", true],
    ["blocked", "popup", "country", false],
    ["ip_redirected", "auto_redirect", "ip", true],
    ["auto_redirected", "auto_redirect", "country", true],
    ["auto_redirected", "auto_redirect", "ip", false],
    ["ip_blocked", "block", "ip", true],
    ["vpn_blocked", "block", "vpn", true],
    ["blocked", "block", "country", true],
  ] as const)(
    "allows=%s for action=%s source=%s: %s",
    (eventType, action, source, expected) => {
      expect(analyticsEventAllowedForToken(eventType, eventPayload(action, source))).toBe(expected);
    },
  );

  it("only permits visit for a no-action visit token", () => {
    const payload = eventPayload("none", "country", "visit");
    expect(analyticsEventAllowedForToken("visit", payload)).toBe(true);
    expect(analyticsEventAllowedForToken("popup_shown", payload)).toBe(false);
  });

  it.each([
    ["popup_shown", true],
    ["ip_blocked", true],
    ["vpn_blocked", true],
    ["visit", false],
    ["dismissed", false],
  ])("classifies %s billable=%s", (eventType, expected) => {
    expect(isBillableAnalyticsEvent(eventType)).toBe(expected);
  });
});

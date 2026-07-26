import { describe, expect, it } from "vitest";
import {
  detectCrossRuleConflicts,
  detectRuleConflicts,
  type ConflictRule,
} from "./rule-conflicts";

function rule(overrides: Partial<ConflictRule> = {}): ConflictRule {
  return {
    id: "rule-1",
    name: "Rule 1",
    matchType: "country",
    countryCodes: "US",
    isActive: true,
    priority: 10,
    ruleType: "redirect",
    pageTargetingType: "all",
    ...overrides,
  };
}

describe("detectRuleConflicts", () => {
  it("reports one deterministic conflict for two overlapping country rules", () => {
    const summary = detectRuleConflicts([
      rule(),
      rule({ id: "rule-2", name: "Rule 2", countryCodes: "US,CA" }),
    ], "country");

    expect(summary.total).toBe(1);
    expect(summary.byRuleId["rule-1"]).toHaveLength(1);
    expect(summary.byRuleId["rule-2"]).toHaveLength(1);
    expect(summary.byRuleId["rule-1"][0]).toMatchObject({
      otherRuleId: "rule-2",
      severity: "critical",
    });
  });

  it("ignores inactive rules, separate targets, and different priorities", () => {
    const candidates = [
      rule(),
      rule({ id: "inactive", isActive: false }),
      rule({ id: "canada", countryCodes: "CA" }),
      rule({ id: "lower-priority", priority: 9 }),
    ];

    expect(detectRuleConflicts(candidates, "country").total).toBe(0);
  });

  it("does not conflict when included page patterns are separate", () => {
    const summary = detectRuleConflicts([
      rule({ pageTargetingType: "include", pagePaths: "/products/*" }),
      rule({
        id: "rule-2",
        pageTargetingType: "include",
        pagePaths: "/blogs/*",
      }),
    ], "country");

    expect(summary.total).toBe(0);
  });

  it("detects overlapping wildcard page patterns", () => {
    const summary = detectRuleConflicts([
      rule({ pageTargetingType: "include", pagePaths: "/products/*" }),
      rule({
        id: "rule-2",
        pageTargetingType: "include",
        pagePaths: "/products/sale/*",
      }),
    ], "country");

    expect(summary.total).toBe(1);
    expect(summary.byRuleId["rule-1"][0].scope).toContain("page /products/*");
  });

  it("respects separate schedule days and times", () => {
    const mondayMorning = rule({
      scheduleEnabled: true,
      daysOfWeek: "1",
      startTime: "09:00",
      endTime: "10:00",
    });
    const tuesdayMorning = rule({
      id: "rule-2",
      scheduleEnabled: true,
      daysOfWeek: "2",
      startTime: "09:00",
      endTime: "10:00",
    });
    const mondayEvening = rule({
      id: "rule-3",
      scheduleEnabled: true,
      daysOfWeek: "1",
      startTime: "18:00",
      endTime: "20:00",
    });

    expect(detectRuleConflicts([mondayMorning, tuesdayMorning, mondayEvening], "country").total)
      .toBe(0);
  });

  it("detects overlap across an overnight schedule", () => {
    const summary = detectRuleConflicts([
      rule({
        scheduleEnabled: true,
        daysOfWeek: "1",
        startTime: "22:00",
        endTime: "02:00",
      }),
      rule({
        id: "rule-2",
        scheduleEnabled: true,
        daysOfWeek: "1",
        startTime: "01:00",
        endTime: "03:00",
      }),
    ], "country");

    expect(summary.total).toBe(1);
  });

  it("detects overlapping IPv4 and CIDR rules", () => {
    const summary = detectRuleConflicts([
      rule({
        matchType: "ip",
        ipAddresses: "203.0.113.0/24",
      }),
      rule({
        id: "rule-2",
        matchType: "ip",
        ipAddresses: "203.0.113.42",
      }),
    ], "ip");

    expect(summary.total).toBe(1);
    expect(summary.byRuleId["rule-1"][0].scope).toContain("203.0.113.0/24");
  });

  it("detects market overlap through shared country coverage", () => {
    const summary = detectRuleConflicts([
      rule({
        matchType: "market",
        countryCodes: "",
        marketHandles: "north-america",
        marketCountryCodes: "US,CA",
      }),
      rule({
        id: "rule-2",
        matchType: "market",
        countryCodes: "",
        marketHandles: "usa",
        marketCountryCodes: "US",
      }),
    ], "market");

    expect(summary.total).toBe(1);
  });

  it("detects duplicate city targets in the same scoped location", () => {
    const summary = detectRuleConflicts([
      rule({
        matchType: "city",
        countryCodes: "",
        cityNames: "Los Angeles, San Francisco",
        cityCountryCode: "US",
        cityRegionCode: "US-CA",
      }),
      rule({
        id: "rule-2",
        matchType: "city",
        countryCodes: "",
        cityNames: "los angeles",
        cityCountryCode: "US",
        cityRegionCode: "US-CA",
      }),
    ], "city");

    expect(summary.total).toBe(1);
  });
});

describe("detectCrossRuleConflicts", () => {
  it("detects country and state rules covering the same location", () => {
    const summary = detectCrossRuleConflicts([
      rule({ countryCodes: "US" }),
      rule({
        id: "state-rule",
        name: "California",
        matchType: "state",
        countryCodes: "",
        stateCodes: "US-CA",
      }),
    ]);

    expect(summary.total).toBe(1);
    expect(summary.byRuleId["rule-1"][0].otherRuleId).toBe("state-rule");
  });

  it("detects market and state rules with shared country coverage", () => {
    const summary = detectCrossRuleConflicts([
      rule({
        matchType: "market",
        countryCodes: "",
        marketHandles: "us-market",
        marketCountryCodes: "US",
      }),
      rule({
        id: "state-rule",
        matchType: "state",
        countryCodes: "",
        stateCodes: "US-NY",
      }),
    ]);

    expect(summary.total).toBe(1);
  });

  it("ignores cross-type rules with different priorities", () => {
    const summary = detectCrossRuleConflicts([
      rule({ countryCodes: "US" }),
      rule({
        id: "state-rule",
        matchType: "state",
        countryCodes: "",
        stateCodes: "US-CA",
        priority: 5,
      }),
    ]);

    expect(summary.total).toBe(0);
  });

  it("detects country and city rules covering the same country", () => {
    const summary = detectCrossRuleConflicts([
      rule({ countryCodes: "US" }),
      rule({
        id: "city-rule",
        name: "Los Angeles",
        matchType: "city",
        countryCodes: "",
        cityNames: "Los Angeles",
        cityCountryCode: "US",
        cityRegionCode: "US-CA",
      }),
    ]);

    expect(summary.total).toBe(1);
    expect(summary.byRuleId["rule-1"][0].otherRuleId).toBe("city-rule");
  });
});

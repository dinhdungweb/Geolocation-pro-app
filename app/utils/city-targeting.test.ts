import { describe, expect, it } from "vitest";
import {
  cityMatchesRule,
  normalizeCityName,
  normalizeCityNamesForStorage,
} from "./city-targeting";

describe("city targeting", () => {
  it("normalizes accents, punctuation, and whitespace", () => {
    expect(normalizeCityName("  Hồ-Chí Minh  ")).toBe("ho chi minh");
  });

  it("stores unique city names while preserving readable labels", () => {
    expect(
      normalizeCityNamesForStorage("Hanoi\nDa Nang, hanoi, Hồ Chí Minh"),
    ).toBe("Hanoi,Da Nang,Hồ Chí Minh");
  });

  it("matches a city inside the configured country and optional region", () => {
    const rule = {
      cityCountryCode: "US",
      cityNames: "Los Angeles, San Francisco",
      cityRegionCode: "US-CA",
    };

    expect(
      cityMatchesRule(rule, {
        city: "Los Angeles",
        countryCode: "US",
        regionCode: "US-CA",
      }),
    ).toBe(true);
    expect(
      cityMatchesRule(rule, {
        city: "Los Angeles",
        countryCode: "US",
        regionCode: "US-TX",
      }),
    ).toBe(false);
    expect(
      cityMatchesRule(rule, {
        city: "Los Angeles",
        countryCode: "CA",
        regionCode: "CA-ON",
      }),
    ).toBe(false);
  });
});

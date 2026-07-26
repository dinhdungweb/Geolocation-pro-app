import { describe, expect, it } from "vitest";
import { resolveMarketCountryCodes } from "./market-rule-backfill.server";

describe("market rule backfill", () => {
  it("resolves and deduplicates country coverage for selected markets", () => {
    expect(resolveMarketCountryCodes("north-america, usa", [
      { handle: "north-america", countryCodes: ["CA", "US"] },
      { handle: "usa", countryCodes: ["us"] },
    ])).toEqual(["CA", "US"]);
  });

  it("ignores missing or blank market handles", () => {
    expect(resolveMarketCountryCodes("unknown, ", [
      { handle: "usa", countryCodes: ["US"] },
    ])).toEqual([]);
  });
});

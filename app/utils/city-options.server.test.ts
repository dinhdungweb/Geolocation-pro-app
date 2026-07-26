import { describe, expect, it } from "vitest";
import { searchCityOptions } from "./city-options.server";

describe("searchCityOptions", () => {
  it("returns cities for the selected country and state", () => {
    expect(
      searchCityOptions({
        countryCode: "VN",
        regionCode: "VN-21",
        query: "thanh hoa",
      }),
    ).toContain("Thanh Hóa");
  });

  it("searches city names without requiring accents", () => {
    expect(
      searchCityOptions({
        countryCode: "VN",
        regionCode: "VN-21",
        query: "biM son",
      }),
    ).toContain("Bỉm Sơn");
  });

  it("limits the number of returned options", () => {
    expect(
      searchCityOptions({
        countryCode: "US",
        regionCode: "US-CA",
        limit: 5,
      }),
    ).toHaveLength(5);
  });
});

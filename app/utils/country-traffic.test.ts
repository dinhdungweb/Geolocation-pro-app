import { describe, expect, it } from "vitest";
import {
  resolveCountryActionTotal,
  resolveCountryTrafficTotal,
} from "./country-traffic";

describe("resolveCountryTrafficTotal", () => {
  it("uses the recorded visitor count when it is the strongest signal", () => {
    expect(
      resolveCountryTrafficTotal({
        visitors: 12,
        popupShown: 8,
        redirected: 5,
        blocked: 1,
      }),
    ).toBe(12);
  });

  it("falls back to action data when visitor events are missing", () => {
    expect(
      resolveCountryTrafficTotal({
        visitors: 0,
        popupShown: 9,
        redirected: 6,
        blocked: 2,
      }),
    ).toBe(9);
  });

  it("does not add overlapping popup and redirect events together", () => {
    expect(
      resolveCountryTrafficTotal({
        visitors: 0,
        popupShown: 7,
        redirected: 7,
        blocked: 0,
      }),
    ).toBe(7);
  });

  it("ignores missing and invalid negative counters", () => {
    expect(
      resolveCountryTrafficTotal({
        visitors: null,
        popupShown: -2,
      }),
    ).toBe(0);
  });
});

describe("resolveCountryActionTotal", () => {
  it("adds popup, redirect, and block actions without counting visits", () => {
    expect(
      resolveCountryActionTotal({
        visitors: 100,
        popupShown: 3,
        redirected: 2,
        blocked: 4,
      }),
    ).toBe(9);
  });

  it("normalizes missing and negative action counters", () => {
    expect(
      resolveCountryActionTotal({
        popupShown: null,
        redirected: -3,
        blocked: 2,
      }),
    ).toBe(2);
  });
});

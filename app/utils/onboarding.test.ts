import { describe, expect, it } from "vitest";

import { getOnboardingStorageKeys } from "./onboarding";

describe("getOnboardingStorageKeys", () => {
  it("keeps setup state scoped to one app installation", () => {
    const firstInstall = getOnboardingStorageKeys(
      "example.myshopify.com",
      "2026-08-01T00:00:00.000Z",
    );
    const reinstalled = getOnboardingStorageKeys(
      "example.myshopify.com",
      "2026-08-12T00:00:00.000Z",
    );

    expect(reinstalled.confirmed).not.toBe(firstInstall.confirmed);
    expect(reinstalled.dismissed).not.toBe(firstInstall.dismissed);
  });

  it("does not share setup state between shops", () => {
    const installId = "2026-08-12T00:00:00.000Z";

    expect(
      getOnboardingStorageKeys("one.myshopify.com", installId),
    ).not.toEqual(getOnboardingStorageKeys("two.myshopify.com", installId));
  });
});

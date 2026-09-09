import { describe, expect, it } from "vitest";

import {
  buildEmbeddedAuthRecoveryUrl,
  EMBEDDED_AUTH_RECOVERY_COOLDOWN_MS,
  shouldAttemptEmbeddedAuthRecovery,
} from "./embedded-auth-recovery";

describe("embedded auth recovery", () => {
  it("adds a fresh ID token and a loop-prevention marker", () => {
    const url = buildEmbeddedAuthRecoveryUrl(
      "https://app.example.com/app/analytics?shop=test.myshopify.com#report",
      "fresh-token",
      1234,
    );

    expect(url).toBe(
      "/app/analytics?shop=test.myshopify.com&id_token=fresh-token&geo_auth_recovery=1234#report",
    );
  });

  it("allows one recovery attempt per cooldown window", () => {
    const now = 100_000;

    expect(shouldAttemptEmbeddedAuthRecovery(null, now)).toBe(true);
    expect(shouldAttemptEmbeddedAuthRecovery("invalid", now)).toBe(true);
    expect(shouldAttemptEmbeddedAuthRecovery(String(now - 1_000), now)).toBe(
      false,
    );
    expect(
      shouldAttemptEmbeddedAuthRecovery(
        String(now - EMBEDDED_AUTH_RECOVERY_COOLDOWN_MS),
        now,
      ),
    ).toBe(true);
  });
});

export const EMBEDDED_AUTH_RECOVERY_PARAM = "geo_auth_recovery";
export const EMBEDDED_AUTH_RECOVERY_COOLDOWN_MS = 30_000;

export function shouldAttemptEmbeddedAuthRecovery(
  lastRecoveryAt: string | null,
  now = Date.now(),
) {
  if (!lastRecoveryAt) return true;

  const timestamp = Number(lastRecoveryAt);
  return (
    !Number.isFinite(timestamp) ||
    now - timestamp >= EMBEDDED_AUTH_RECOVERY_COOLDOWN_MS
  );
}

export function buildEmbeddedAuthRecoveryUrl(
  currentHref: string,
  idToken: string,
  recoveryStartedAt = Date.now(),
) {
  const url = new URL(currentHref);
  url.searchParams.set("id_token", idToken);
  url.searchParams.set(EMBEDDED_AUTH_RECOVERY_PARAM, String(recoveryStartedAt));

  return `${url.pathname}${url.search}${url.hash}`;
}

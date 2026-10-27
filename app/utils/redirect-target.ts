// Shared by the server (checkout protection) and the rules form, so both decide
// "same store vs. another store" exactly like the storefront script does.

export const REDIRECT_FREQUENCIES = ["always", "once"] as const;
export type RedirectFrequency = (typeof REDIRECT_FREQUENCIES)[number];

/**
 * Form value meaning "leave this legacy rule's frequency unset". The rules form
 * sends it when a rule saved before the option existed is edited without
 * touching the frequency, so its real (visitor-domain dependent) behavior is
 * preserved instead of being replaced by a best guess.
 */
export const KEEP_LEGACY_REDIRECT_FREQUENCY = "legacy";

/** Stored value for a submitted frequency. Only auto redirects have one. */
export function normalizeRedirectFrequency(redirectMode: string, value: unknown) {
  if (redirectMode !== "auto_redirect") return null;
  if (value === KEEP_LEGACY_REDIRECT_FREQUENCY) return null;
  return (REDIRECT_FREQUENCIES as readonly string[]).includes(String(value))
    ? (String(value) as RedirectFrequency)
    : "always";
}

/**
 * Allowlist check for merchant-entered URLs (redirect targets, logo, support
 * link): only http(s) and relative paths, plus mailto where allowed. Parsed
 * like a browser would, so "java\tscript:" or leading control characters can't
 * slip past the way they could with a /^javascript:/ denylist.
 */
export function isSafeMerchantUrl(value: string | null | undefined, { allowMailto = false } = {}) {
  const raw = String(value || "").trim();
  if (!raw) return true; // empty is allowed (e.g. block rules have no target)
  try {
    const protocol = new URL(raw, "https://example.invalid").protocol;
    return protocol === "http:" || protocol === "https:" || (allowMailto && protocol === "mailto:");
  } catch {
    return false;
  }
}

export function normalizeHost(host: string | null | undefined) {
  return String(host || "").trim().toLowerCase().replace(/^www\./, "");
}

/**
 * True when a redirect sends visitors to a different store. Targets on this
 * store (relative paths like "/en-ca", or any of its own domains) are internal.
 * Parsed the same way the storefront does: relative to the current store.
 */
export function isExternalRedirectTarget(
  targetUrl: string | null | undefined,
  shop: string,
  ownHosts: Iterable<string>,
) {
  const raw = String(targetUrl || "").trim();
  if (!raw) return false;

  let url: URL;
  try {
    url = new URL(raw, `https://${shop}`);
  } catch {
    return false;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return false;

  const hosts = new Set(Array.from(ownHosts, normalizeHost));
  hosts.add(normalizeHost(shop));
  return !hosts.has(normalizeHost(url.hostname));
}

/** Sensible default for a target: stay-friendly within the store, strict elsewhere. */
export function defaultRedirectFrequency(
  targetUrl: string | null | undefined,
  shop: string,
  ownHosts: Iterable<string>,
): RedirectFrequency {
  return isExternalRedirectTarget(targetUrl, shop, ownHosts) ? "always" : "once";
}

/**
 * What an auto redirect actually does. Rules saved before the frequency option
 * existed (null) keep their old behavior, which matches the default.
 */
export function effectiveRedirectFrequency(
  rule: { redirectFrequency?: string | null; targetUrl: string },
  shop: string,
  ownHosts: Iterable<string>,
): RedirectFrequency {
  const stored = rule.redirectFrequency;
  if (stored && (REDIRECT_FREQUENCIES as readonly string[]).includes(stored)) {
    return stored as RedirectFrequency;
  }
  return defaultRedirectFrequency(rule.targetUrl, shop, ownHosts);
}

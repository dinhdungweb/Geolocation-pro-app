const PAGE_PATH_SPLIT_PATTERN = /[\n,]+/;

export function normalizePagePathPattern(value: string | null | undefined) {
  const trimmed = (value || "").trim();
  if (!trimmed) return "";

  const hasProtocol = /^[a-z][a-z\d+\-.]*:\/\//i.test(trimmed);
  const isDomainLike = !trimmed.startsWith("/") && /^[^/\s]+\.[^/\s]+(\/|$)/.test(trimmed);

  if (hasProtocol || isDomainLike || trimmed.startsWith("/")) {
    try {
      const url = new URL(
        hasProtocol || trimmed.startsWith("/") ? trimmed : `https://${trimmed}`,
        "https://example.invalid",
      );
      return url.pathname || "/";
    } catch {
      // Fall through and normalize the raw pattern.
    }
  }

  return trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
}

export function splitPagePathPatterns(value: string | null | undefined) {
  return (value || "")
    .split(PAGE_PATH_SPLIT_PATTERN)
    .map(normalizePagePathPattern)
    .filter(Boolean);
}

export function normalizePagePathPatterns(value: string | null | undefined) {
  return splitPagePathPatterns(value).join("\n");
}

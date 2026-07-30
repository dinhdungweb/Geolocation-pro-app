import { isIP } from "node:net";

function normalizeIP(value: string | null | undefined) {
  const normalized = value?.trim().replace(/^\[|\]$/g, "") || "";
  return normalized.startsWith("::ffff:") && isIP(normalized.slice(7)) === 4
    ? normalized.slice(7)
    : normalized;
}

function isPrivateOrLocalIP(ip: string) {
  if (!isIP(ip)) return true;

  if (
    ip === "0.0.0.0" ||
    ip === "127.0.0.1" ||
    ip === "::1" ||
    ip.toLowerCase().startsWith("fc") ||
    ip.toLowerCase().startsWith("fd") ||
    ip.toLowerCase().startsWith("fe80:")
  ) {
    return true;
  }

  const parts = ip.split(".").map((part) => Number.parseInt(part, 10));
  if (parts.length !== 4 || parts.some((part) => Number.isNaN(part))) {
    return false;
  }

  const [a, b] = parts;
  return (
    a === 10 ||
    a === 127 ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 169 && b === 254)
  );
}

function firstPublicForwardedIP(value: string | null) {
  return value
    ?.split(",")
    .map(normalizeIP)
    .find((ip): ip is string => Boolean(ip && !isPrivateOrLocalIP(ip)));
}

export function getVisitorIP(request: Request): string {
  const fallbackHeaders = [
    "cf-connecting-ip",
    "true-client-ip",
    "x-shopify-client-ip",
    "x-real-ip",
  ];
  const fallbackIp = fallbackHeaders
    .map((header) => normalizeIP(request.headers.get(header)))
    .find((ip) => Boolean(ip && !isPrivateOrLocalIP(ip)));

  return (
    firstPublicForwardedIP(request.headers.get("x-forwarded-for")) ||
    fallbackIp ||
    "0.0.0.0"
  );
}

function firstForwardedIP(value: string | null) {
  return value
    ?.split(",")
    .map((ip) => ip.trim())
    .find(Boolean);
}

export function getVisitorIP(request: Request): string {
  return (
    request.headers.get("x-shopify-client-ip") ||
    firstForwardedIP(request.headers.get("x-forwarded-for")) ||
    request.headers.get("cf-connecting-ip") ||
    request.headers.get("true-client-ip") ||
    request.headers.get("x-client-ip") ||
    request.headers.get("x-real-ip") ||
    "0.0.0.0"
  );
}

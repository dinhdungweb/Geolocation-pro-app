const SINGLE_VALUE_APP_PROXY_PARAMS = [
  "hmac",
  "shop",
  "signature",
  "timestamp",
] as const;

export function hasDuplicateAppProxyAuthParams(
  searchParams: URLSearchParams,
) {
  return SINGLE_VALUE_APP_PROXY_PARAMS.some(
    (param) => searchParams.getAll(param).length > 1,
  );
}

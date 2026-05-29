type CacheEntry<T> = {
  expiresAt: number;
  value: T;
};

const DEFAULT_TTL_MS = Number.parseInt(process.env.STOREFRONT_CONFIG_CACHE_TTL_MS || "15000", 10);
const cache = new Map<string, CacheEntry<unknown>>();

function ttlMs() {
  return Number.isFinite(DEFAULT_TTL_MS) && DEFAULT_TTL_MS > 0 ? DEFAULT_TTL_MS : 15_000;
}

export function getStorefrontConfigCache<T>(shop: string) {
  const cached = cache.get(shop) as CacheEntry<T> | undefined;
  if (!cached) return null;

  if (cached.expiresAt <= Date.now()) {
    cache.delete(shop);
    return null;
  }

  return cached.value;
}

export function setStorefrontConfigCache<T>(shop: string, value: T) {
  cache.set(shop, {
    expiresAt: Date.now() + ttlMs(),
    value,
  });
  return value;
}

export function invalidateStorefrontConfigCache(shop?: string) {
  if (shop) {
    cache.delete(shop);
    return;
  }

  cache.clear();
}

type CacheEntry<T> = {
  expiresAt: number;
  value: T;
};

type TtlResolver<T> = number | ((value: T) => number);

export function createExpiringAsyncCache<T>() {
  const values = new Map<string, CacheEntry<T>>();
  const inFlight = new Map<string, Promise<T>>();
  const keyVersions = new Map<string, number>();
  let generation = 0;

  const get = async (
    key: string,
    load: () => Promise<T>,
    ttl: TtlResolver<T>,
  ) => {
    const now = Date.now();
    const cached = values.get(key);
    if (cached && cached.expiresAt > now) {
      return cached.value;
    }
    if (cached) values.delete(key);

    const pending = inFlight.get(key);
    if (pending) return pending;

    const requestGeneration = generation;
    const requestKeyVersion = keyVersions.get(key) || 0;
    let request!: Promise<T>;
    request = load()
      .then((value) => {
        const resolvedTtl = typeof ttl === "function" ? ttl(value) : ttl;
        const cacheIsStillCurrent =
          generation === requestGeneration &&
          (keyVersions.get(key) || 0) === requestKeyVersion;
        if (cacheIsStillCurrent && Number.isFinite(resolvedTtl) && resolvedTtl > 0) {
          values.set(key, {
            expiresAt: Date.now() + resolvedTtl,
            value,
          });
        }
        return value;
      })
      .finally(() => {
        if (inFlight.get(key) === request) {
          inFlight.delete(key);
        }
      });

    inFlight.set(key, request);
    return request;
  };

  const invalidate = (key?: string) => {
    if (key) {
      keyVersions.set(key, (keyVersions.get(key) || 0) + 1);
      values.delete(key);
      inFlight.delete(key);
      return;
    }
    generation += 1;
    keyVersions.clear();
    values.clear();
    inFlight.clear();
  };

  return { get, invalidate };
}

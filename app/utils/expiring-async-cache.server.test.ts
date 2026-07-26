import { describe, expect, it, vi } from "vitest";
import { createExpiringAsyncCache } from "./expiring-async-cache.server";

describe("createExpiringAsyncCache", () => {
  it("reuses a cached value until the TTL expires", async () => {
    vi.useFakeTimers();
    const cache = createExpiringAsyncCache<number>();
    const load = vi.fn(async () => 42);

    await expect(cache.get("shop", load, 1_000)).resolves.toBe(42);
    await expect(cache.get("shop", load, 1_000)).resolves.toBe(42);
    expect(load).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(1_001);
    await expect(cache.get("shop", load, 1_000)).resolves.toBe(42);
    expect(load).toHaveBeenCalledTimes(2);
    vi.useRealTimers();
  });

  it("deduplicates concurrent loads for the same key", async () => {
    const cache = createExpiringAsyncCache<number>();
    let resolveLoad!: (value: number) => void;
    const load = vi.fn(() => new Promise<number>((resolve) => {
      resolveLoad = resolve;
    }));

    const first = cache.get("shop", load, 1_000);
    const second = cache.get("shop", load, 1_000);
    resolveLoad(7);

    await expect(Promise.all([first, second])).resolves.toEqual([7, 7]);
    expect(load).toHaveBeenCalledTimes(1);
  });

  it("supports invalidating one key", async () => {
    const cache = createExpiringAsyncCache<number>();
    const load = vi.fn(async () => 1);

    await cache.get("one", load, 1_000);
    await cache.get("two", load, 1_000);
    cache.invalidate("one");
    await cache.get("one", load, 1_000);
    await cache.get("two", load, 1_000);

    expect(load).toHaveBeenCalledTimes(3);
  });

  it("does not restore an invalidated in-flight value", async () => {
    const cache = createExpiringAsyncCache<number>();
    let resolveFirst!: (value: number) => void;
    const firstLoad = vi.fn(() => new Promise<number>((resolve) => {
      resolveFirst = resolve;
    }));

    const first = cache.get("shop", firstLoad, 1_000);
    cache.invalidate("shop");
    await expect(cache.get("shop", async () => 2, 1_000)).resolves.toBe(2);
    resolveFirst(1);
    await expect(first).resolves.toBe(1);
    await expect(cache.get("shop", async () => 3, 1_000)).resolves.toBe(2);
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const fsMock = vi.hoisted(() => ({
  existsSync: vi.fn(),
  statSync: vi.fn(),
}));

const maxmindOpen = vi.hoisted(() => vi.fn());
const checkAndRunLiteUpdate = vi.hoisted(() => vi.fn());

vi.mock("fs", () => ({ default: fsMock, ...fsMock }));
vi.mock("maxmind", () => ({ default: { open: maxmindOpen } }));
vi.mock("../services/geoip-updater.server", () => ({ checkAndRunLiteUpdate }));

import { getCountryFromIP } from "./maxmind.server";

describe("MaxMind reader recovery", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    checkAndRunLiteUpdate.mockResolvedValue(undefined);
    fsMock.statSync.mockReturnValue({ mtimeMs: 1 });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("retries loading after the database was missing at startup", async () => {
    fsMock.existsSync.mockReturnValue(false);

    expect(await getCountryFromIP("203.0.113.10")).toBe("");
    expect(maxmindOpen).not.toHaveBeenCalled();

    // The database appears (e.g. the updater finished downloading it).
    fsMock.existsSync.mockReturnValue(true);
    maxmindOpen.mockResolvedValue({
      get: () => ({ country: { iso_code: "CA" } }),
    });

    // Retries are throttled, so an immediate lookup still has no reader...
    expect(await getCountryFromIP("203.0.113.10")).toBe("");

    // ...but once the retry interval passes the reader recovers.
    vi.advanceTimersByTime(61_000);
    expect(await getCountryFromIP("203.0.113.10")).toBe("CA");
    expect(maxmindOpen).toHaveBeenCalledTimes(1);
  });
});

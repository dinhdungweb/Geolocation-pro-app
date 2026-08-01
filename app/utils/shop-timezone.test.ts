import { describe, expect, it } from "vitest";
import {
  addDaysToDateKey,
  getAnalyticsDate,
  getDateKeyInTimeZone,
  getUtcRangeForDateKey,
  normalizeShopTimeZone,
} from "./shop-timezone";

describe("shop timezone utilities", () => {
  it("uses the shop calendar date instead of the server calendar date", () => {
    const instant = new Date("2026-08-01T05:44:00.000Z");

    expect(getDateKeyInTimeZone(instant, "Asia/Ho_Chi_Minh")).toBe("2026-08-01");
    expect(getDateKeyInTimeZone(instant, "America/Los_Angeles")).toBe("2026-07-31");
    expect(getAnalyticsDate(instant, "Asia/Ho_Chi_Minh").toISOString()).toBe(
      "2026-08-01T00:00:00.000Z",
    );
  });

  it("builds exact UTC boundaries across daylight saving changes", () => {
    const range = getUtcRangeForDateKey("2026-03-08", "America/New_York");

    expect(range?.start.toISOString()).toBe("2026-03-08T05:00:00.000Z");
    expect(range?.end.toISOString()).toBe("2026-03-09T04:00:00.000Z");
  });

  it("validates timezones and advances calendar keys without local timezone math", () => {
    expect(normalizeShopTimeZone("Invalid/Zone")).toBe("UTC");
    expect(addDaysToDateKey("2026-02-28", 1)).toBe("2026-03-01");
  });
});

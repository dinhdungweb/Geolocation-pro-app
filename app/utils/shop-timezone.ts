const DEFAULT_SHOP_TIME_ZONE = "UTC";

export function normalizeShopTimeZone(
  value: string | null | undefined,
  fallback = DEFAULT_SHOP_TIME_ZONE,
) {
  const candidate = value?.trim();
  if (!candidate) return fallback;

  try {
    new Intl.DateTimeFormat("en-US", { timeZone: candidate }).format(0);
    return candidate;
  } catch {
    return fallback;
  }
}

function zonedDateParts(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: normalizeShopTimeZone(timeZone),
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const values = Object.fromEntries(
    parts
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, Number(part.value)]),
  );

  return {
    year: values.year,
    month: values.month,
    day: values.day,
    hour: values.hour,
    minute: values.minute,
    second: values.second,
  };
}

export function getDateKeyInTimeZone(date: Date, timeZone: string) {
  const parts = zonedDateParts(date, timeZone);
  return `${parts.year}-${String(parts.month).padStart(2, "0")}-${String(
    parts.day,
  ).padStart(2, "0")}`;
}

export function parseDateKey(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));

  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }

  return { year, month, day };
}

export function dateFromDateKey(value: string) {
  const parts = parseDateKey(value);
  return parts
    ? new Date(Date.UTC(parts.year, parts.month - 1, parts.day))
    : null;
}

export function addDaysToDateKey(value: string, days: number) {
  const date = dateFromDateKey(value);
  if (!date) return value;
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function timeZoneOffsetMs(date: Date, timeZone: string) {
  const parts = zonedDateParts(date, timeZone);
  const displayedAsUtc = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second,
  );
  return displayedAsUtc - Math.floor(date.getTime() / 1000) * 1000;
}

export function startOfDateKeyInTimeZone(value: string, timeZone: string) {
  const parts = parseDateKey(value);
  if (!parts) return null;

  const normalizedTimeZone = normalizeShopTimeZone(timeZone);
  const desiredUtc = Date.UTC(parts.year, parts.month - 1, parts.day);
  let result = new Date(desiredUtc);

  // Re-evaluate the offset because it can change at a DST boundary.
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const next = new Date(desiredUtc - timeZoneOffsetMs(result, normalizedTimeZone));
    if (next.getTime() === result.getTime()) break;
    result = next;
  }

  return result;
}

export function getUtcRangeForDateKey(value: string, timeZone: string) {
  const start = startOfDateKeyInTimeZone(value, timeZone);
  const end = startOfDateKeyInTimeZone(addDaysToDateKey(value, 1), timeZone);
  return start && end ? { start, end } : null;
}

export function getAnalyticsDate(date: Date, timeZone: string) {
  return dateFromDateKey(getDateKeyInTimeZone(date, timeZone))!;
}

export function getCalendarDateInTimeZone(date: Date, timeZone: string) {
  const parts = parseDateKey(getDateKeyInTimeZone(date, timeZone))!;
  return new Date(parts.year, parts.month - 1, parts.day);
}

export { DEFAULT_SHOP_TIME_ZONE };

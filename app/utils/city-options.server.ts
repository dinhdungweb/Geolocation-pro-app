import { CityLite, StateLite } from "country-state-city-js";

const cityScopeCache = new Map<string, string[]>();
const readStates = StateLite as unknown as (
  countryCode: string,
) => Array<{ iso: string; name: string }>;
const readCities = CityLite as unknown as (
  countryCode: string,
  subdivisionCode: string,
) => string[];

function normalizeSearchValue(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLocaleLowerCase("en");
}

function getSubdivisionCode(countryCode: string, regionCode: string) {
  const prefix = `${countryCode}-`;
  return regionCode.startsWith(prefix) ? regionCode.slice(prefix.length) : regionCode;
}

function getCitiesForScope(countryCode: string, regionCode: string) {
  const cacheKey = `${countryCode}:${regionCode || "*"}`;
  const cached = cityScopeCache.get(cacheKey);
  if (cached) return cached;

  const subdivisionCodes = regionCode
    ? [getSubdivisionCode(countryCode, regionCode)]
    : (readStates(countryCode) || []).map((state) => state.iso);

  const cities = Array.from(
    new Set(
      subdivisionCodes.flatMap((subdivisionCode) => {
        const values = readCities(countryCode, subdivisionCode);
        return Array.isArray(values) ? values : [];
      }),
    ),
  ).sort((left, right) => left.localeCompare(right));

  cityScopeCache.set(cacheKey, cities);
  return cities;
}

export function searchCityOptions({
  countryCode,
  regionCode = "",
  query = "",
  limit = 100,
}: {
  countryCode: string;
  regionCode?: string;
  query?: string;
  limit?: number;
}) {
  const normalizedCountryCode = countryCode.trim().toUpperCase();
  const normalizedRegionCode = regionCode.trim().toUpperCase();
  const normalizedQuery = normalizeSearchValue(query);
  const safeLimit = Math.min(Math.max(limit, 1), 100);

  return getCitiesForScope(normalizedCountryCode, normalizedRegionCode)
    .filter((city) => !normalizedQuery || normalizeSearchValue(city).includes(normalizedQuery))
    .slice(0, safeLimit);
}

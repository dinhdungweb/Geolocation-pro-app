export type CityTargetRule = {
  cityNames?: string | null;
  cityCountryCode?: string | null;
  cityRegionCode?: string | null;
};

export type VisitorCityLocation = {
  city?: string | null;
  countryCode?: string | null;
  regionCode?: string | null;
  regionName?: string | null;
};

export function normalizeCityName(value: string | null | undefined) {
  return (value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/gi, " ")
    .trim()
    .toLowerCase();
}

export function splitCityNames(value: string | null | undefined) {
  return (value || "")
    .split(/[\n,]+/)
    .map((city) => city.trim())
    .filter(Boolean);
}

export function normalizeCityNamesForStorage(value: string | null | undefined) {
  const unique = new Map<string, string>();

  splitCityNames(value).forEach((city) => {
    const normalized = normalizeCityName(city);
    if (normalized && !unique.has(normalized)) {
      unique.set(normalized, city.slice(0, 120));
    }
  });

  return Array.from(unique.values()).join(",");
}

export function cityMatchesRule(
  rule: CityTargetRule,
  visitor: VisitorCityLocation,
  options: {
    regionMatches?: (
      configuredRegion: string,
      visitorRegion: string,
      visitorRegionName?: string | null,
    ) => boolean;
  } = {},
) {
  const visitorCity = normalizeCityName(visitor.city);
  const visitorCountry = visitor.countryCode?.trim().toUpperCase() || "";
  const visitorRegion = visitor.regionCode?.trim().toUpperCase() || "";
  const ruleCountry = rule.cityCountryCode?.trim().toUpperCase() || "";
  const ruleRegion = rule.cityRegionCode?.trim().toUpperCase() || "";

  if (!visitorCity || !visitorCountry || !ruleCountry || visitorCountry !== ruleCountry) {
    return false;
  }
  if (
    ruleRegion &&
    visitorRegion !== ruleRegion &&
    !options.regionMatches?.(ruleRegion, visitorRegion, visitor.regionName)
  ) {
    return false;
  }

  return splitCityNames(rule.cityNames).some(
    (city) => normalizeCityName(city) === visitorCity,
  );
}

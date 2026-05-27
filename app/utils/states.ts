import { allCountries } from "country-region-data";

/**
 * ISO 3166-2 subdivision data generated from country-region-data.
 * Format: { [countryCode]: { [subdivisionCode]: "Name" } }
 * subdivisionCode uses the full ISO 3166-2 format: "US-TX", "CA-ON", etc.
 */

type StateMap = Record<string, Record<string, string>>;
type StateCodesByCountry = Record<string, string[]>;

function buildStateMap(): StateMap {
    return allCountries.reduce<StateMap>((map, [, countryCode, regions]) => {
        const countryStates = regions.reduce<Record<string, string>>((states, [regionName, regionShortCode]) => {
            if (!regionShortCode) return states;

            const normalizedCountryCode = countryCode.toUpperCase();
            const normalizedRegionCode = regionShortCode.toUpperCase();
            const stateCode = normalizedRegionCode.startsWith(`${normalizedCountryCode}-`)
                ? normalizedRegionCode
                : `${normalizedCountryCode}-${normalizedRegionCode}`;

            states[stateCode] = regionName;
            return states;
        }, {});

        if (Object.keys(countryStates).length > 0) {
            map[countryCode.toUpperCase()] = countryStates;
        }

        return map;
    }, {});
}

const COUNTRY_LABELS = allCountries.reduce<Record<string, string>>((labels, [countryName, countryCode]) => {
    labels[countryCode.toUpperCase()] = countryName;
    return labels;
}, {});

export const STATE_MAP: StateMap = buildStateMap();

const STATE_CODES_BY_COUNTRY: StateCodesByCountry = Object.entries(STATE_MAP).reduce<StateCodesByCountry>(
    (codesByCountry, [countryCode, states]) => {
        codesByCountry[countryCode] = Object.keys(states).sort((a, b) =>
            (states[a] || a).localeCompare(states[b] || b),
        );
        return codesByCountry;
    },
    {},
);

/** Countries that have state/region data available */
export const COUNTRIES_WITH_STATES = Object.keys(STATE_MAP).sort((a, b) =>
    (COUNTRY_LABELS[a] || a).localeCompare(COUNTRY_LABELS[b] || b),
);

/** Country labels for the state selector dropdown */
export const STATE_COUNTRY_LABELS: Record<string, string> = COUNTRY_LABELS;

/**
 * Get the state/region name from its ISO 3166-2 code
 * @param code - Full ISO 3166-2 code, e.g. "US-TX"
 */
export function getStateName(code: string): string {
    const normalizedCode = code.trim().toUpperCase();
    const [country] = normalizedCode.split("-");
    return STATE_MAP[country]?.[normalizedCode] || code;
}

/**
 * Get the ISO 3166-2 state/region code from a country code and region name.
 * Useful for API providers that return "New York" instead of "US-NY".
 */
export function getStateCodeByName(countryCode: string, regionName: string): string | null {
    const normalizedCountryCode = countryCode.trim().toUpperCase();
    const normalizedRegionName = regionName.trim();
    if (!normalizedCountryCode || !normalizedRegionName) return null;

    const countryStates = STATE_MAP[normalizedCountryCode];
    if (!countryStates) return null;

    const directCode = normalizedRegionName.toUpperCase();
    const fullDirectCode = directCode.startsWith(`${normalizedCountryCode}-`)
        ? directCode
        : `${normalizedCountryCode}-${directCode}`;
    if (countryStates[fullDirectCode]) return fullDirectCode;

    const normalizedName = normalizeRegionName(normalizedRegionName);
    const match = Object.entries(countryStates).find(
        ([, stateName]) => normalizeRegionName(stateName) === normalizedName,
    );

    return match?.[0] || null;
}

function normalizeRegionName(value: string): string {
    return value
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-z0-9]+/gi, " ")
        .trim()
        .toLowerCase();
}

/**
 * Match a configured state code against the region returned by MaxMind.
 *
 * MaxMind and country-region-data do not always use the same subdivision code
 * for a country. For example, country-region-data may expose Costa Rica as
 * CR-1 while MaxMind returns CR-SJ. When codes differ, compare names for the
 * same country so state/region rules still work.
 */
export function stateCodeMatchesRegion(
    configuredCode: string,
    visitorRegionCode: string,
    visitorRegionName?: string | null,
): boolean {
    const configured = configuredCode.trim().toUpperCase();
    const visitorCode = visitorRegionCode.trim().toUpperCase();
    if (!configured || !visitorCode) return false;
    if (configured === visitorCode) return true;

    const [configuredCountry] = configured.split("-");
    const [visitorCountry] = visitorCode.split("-");
    if (!configuredCountry || configuredCountry !== visitorCountry) return false;

    const configuredName = getStateName(configured);
    const visitorName = visitorRegionName?.trim() || getStateName(visitorCode);
    if (!configuredName || !visitorName) return false;
    if (configuredName === configured && visitorName === visitorCode) return false;

    return normalizeRegionName(configuredName) === normalizeRegionName(visitorName);
}

/**
 * Get the country code from a state code
 * @param stateCode - Full ISO 3166-2 code, e.g. "US-TX"
 * @returns Country code, e.g. "US"
 */
export function getCountryFromStateCode(stateCode: string): string {
    return stateCode.trim().split("-")[0]?.toUpperCase() || "";
}

/**
 * Get all state codes for a given country
 */
export function getStatesForCountry(countryCode: string): string[] {
    const normalizedCountryCode = countryCode.trim().toUpperCase();
    return [...(STATE_CODES_BY_COUNTRY[normalizedCountryCode] || [])];
}

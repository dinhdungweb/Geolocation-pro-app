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

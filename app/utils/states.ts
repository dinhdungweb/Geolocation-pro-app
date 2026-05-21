/**
 * ISO 3166-2 Subdivision (State/Region) data for major countries.
 * Format: { [countryCode]: { [subdivisionCode]: "Name" } }
 * subdivisionCode uses the full ISO 3166-2 format: "US-TX", "CA-ON", etc.
 */

export const STATE_MAP: Record<string, Record<string, string>> = {
    US: {
        "US-AL": "Alabama", "US-AK": "Alaska", "US-AZ": "Arizona", "US-AR": "Arkansas",
        "US-CA": "California", "US-CO": "Colorado", "US-CT": "Connecticut", "US-DE": "Delaware",
        "US-DC": "District of Columbia", "US-FL": "Florida", "US-GA": "Georgia", "US-HI": "Hawaii",
        "US-ID": "Idaho", "US-IL": "Illinois", "US-IN": "Indiana", "US-IA": "Iowa",
        "US-KS": "Kansas", "US-KY": "Kentucky", "US-LA": "Louisiana", "US-ME": "Maine",
        "US-MD": "Maryland", "US-MA": "Massachusetts", "US-MI": "Michigan", "US-MN": "Minnesota",
        "US-MS": "Mississippi", "US-MO": "Missouri", "US-MT": "Montana", "US-NE": "Nebraska",
        "US-NV": "Nevada", "US-NH": "New Hampshire", "US-NJ": "New Jersey", "US-NM": "New Mexico",
        "US-NY": "New York", "US-NC": "North Carolina", "US-ND": "North Dakota", "US-OH": "Ohio",
        "US-OK": "Oklahoma", "US-OR": "Oregon", "US-PA": "Pennsylvania", "US-RI": "Rhode Island",
        "US-SC": "South Carolina", "US-SD": "South Dakota", "US-TN": "Tennessee", "US-TX": "Texas",
        "US-UT": "Utah", "US-VT": "Vermont", "US-VA": "Virginia", "US-WA": "Washington",
        "US-WV": "West Virginia", "US-WI": "Wisconsin", "US-WY": "Wyoming",
        "US-AS": "American Samoa", "US-GU": "Guam", "US-MP": "Northern Mariana Islands",
        "US-PR": "Puerto Rico", "US-VI": "U.S. Virgin Islands",
    },
    CA: {
        "CA-AB": "Alberta", "CA-BC": "British Columbia", "CA-MB": "Manitoba",
        "CA-NB": "New Brunswick", "CA-NL": "Newfoundland and Labrador", "CA-NS": "Nova Scotia",
        "CA-NT": "Northwest Territories", "CA-NU": "Nunavut", "CA-ON": "Ontario",
        "CA-PE": "Prince Edward Island", "CA-QC": "Quebec", "CA-SK": "Saskatchewan",
        "CA-YT": "Yukon",
    },
    AU: {
        "AU-ACT": "Australian Capital Territory", "AU-NSW": "New South Wales",
        "AU-NT": "Northern Territory", "AU-QLD": "Queensland", "AU-SA": "South Australia",
        "AU-TAS": "Tasmania", "AU-VIC": "Victoria", "AU-WA": "Western Australia",
    },
    GB: {
        "GB-ENG": "England", "GB-SCT": "Scotland", "GB-WLS": "Wales", "GB-NIR": "Northern Ireland",
    },
    DE: {
        "DE-BW": "Baden-Württemberg", "DE-BY": "Bavaria", "DE-BE": "Berlin",
        "DE-BB": "Brandenburg", "DE-HB": "Bremen", "DE-HH": "Hamburg", "DE-HE": "Hesse",
        "DE-MV": "Mecklenburg-Vorpommern", "DE-NI": "Lower Saxony", "DE-NW": "North Rhine-Westphalia",
        "DE-RP": "Rhineland-Palatinate", "DE-SL": "Saarland", "DE-SN": "Saxony",
        "DE-ST": "Saxony-Anhalt", "DE-SH": "Schleswig-Holstein", "DE-TH": "Thuringia",
    },
    FR: {
        "FR-ARA": "Auvergne-Rhône-Alpes", "FR-BFC": "Bourgogne-Franche-Comté",
        "FR-BRE": "Brittany", "FR-CVL": "Centre-Val de Loire", "FR-COR": "Corsica",
        "FR-GES": "Grand Est", "FR-HDF": "Hauts-de-France", "FR-IDF": "Île-de-France",
        "FR-NOR": "Normandy", "FR-NAQ": "Nouvelle-Aquitaine", "FR-OCC": "Occitania",
        "FR-PDL": "Pays de la Loire", "FR-PAC": "Provence-Alpes-Côte d'Azur",
    },
    IN: {
        "IN-AP": "Andhra Pradesh", "IN-AR": "Arunachal Pradesh", "IN-AS": "Assam",
        "IN-BR": "Bihar", "IN-CT": "Chhattisgarh", "IN-GA": "Goa", "IN-GJ": "Gujarat",
        "IN-HR": "Haryana", "IN-HP": "Himachal Pradesh", "IN-JH": "Jharkhand",
        "IN-KA": "Karnataka", "IN-KL": "Kerala", "IN-MP": "Madhya Pradesh",
        "IN-MH": "Maharashtra", "IN-MN": "Manipur", "IN-ML": "Meghalaya", "IN-MZ": "Mizoram",
        "IN-NL": "Nagaland", "IN-OR": "Odisha", "IN-PB": "Punjab", "IN-RJ": "Rajasthan",
        "IN-SK": "Sikkim", "IN-TN": "Tamil Nadu", "IN-TG": "Telangana", "IN-TR": "Tripura",
        "IN-UP": "Uttar Pradesh", "IN-UK": "Uttarakhand", "IN-WB": "West Bengal",
        "IN-AN": "Andaman and Nicobar Islands", "IN-CH": "Chandigarh",
        "IN-DN": "Dadra and Nagar Haveli and Daman and Diu", "IN-DL": "Delhi",
        "IN-JK": "Jammu and Kashmir", "IN-LA": "Ladakh", "IN-LD": "Lakshadweep",
        "IN-PY": "Puducherry",
    },
    BR: {
        "BR-AC": "Acre", "BR-AL": "Alagoas", "BR-AP": "Amapá", "BR-AM": "Amazonas",
        "BR-BA": "Bahia", "BR-CE": "Ceará", "BR-DF": "Distrito Federal",
        "BR-ES": "Espírito Santo", "BR-GO": "Goiás", "BR-MA": "Maranhão",
        "BR-MT": "Mato Grosso", "BR-MS": "Mato Grosso do Sul", "BR-MG": "Minas Gerais",
        "BR-PA": "Pará", "BR-PB": "Paraíba", "BR-PR": "Paraná", "BR-PE": "Pernambuco",
        "BR-PI": "Piauí", "BR-RJ": "Rio de Janeiro", "BR-RN": "Rio Grande do Norte",
        "BR-RS": "Rio Grande do Sul", "BR-RO": "Rondônia", "BR-RR": "Roraima",
        "BR-SC": "Santa Catarina", "BR-SP": "São Paulo", "BR-SE": "Sergipe",
        "BR-TO": "Tocantins",
    },
    IT: {
        "IT-65": "Abruzzo", "IT-77": "Basilicata", "IT-78": "Calabria", "IT-72": "Campania",
        "IT-45": "Emilia-Romagna", "IT-36": "Friuli Venezia Giulia", "IT-62": "Lazio",
        "IT-42": "Liguria", "IT-25": "Lombardy", "IT-57": "Marche", "IT-67": "Molise",
        "IT-21": "Piedmont", "IT-75": "Apulia", "IT-88": "Sardinia", "IT-82": "Sicily",
        "IT-52": "Tuscany", "IT-32": "Trentino-South Tyrol", "IT-55": "Umbria",
        "IT-23": "Aosta Valley", "IT-34": "Veneto",
    },
    ES: {
        "ES-AN": "Andalusia", "ES-AR": "Aragon", "ES-AS": "Asturias",
        "ES-IB": "Balearic Islands", "ES-PV": "Basque Country", "ES-CN": "Canary Islands",
        "ES-CB": "Cantabria", "ES-CL": "Castile and León", "ES-CM": "Castilla-La Mancha",
        "ES-CT": "Catalonia", "ES-CE": "Ceuta", "ES-EX": "Extremadura",
        "ES-GA": "Galicia", "ES-RI": "La Rioja", "ES-MD": "Madrid", "ES-ML": "Melilla",
        "ES-MC": "Murcia", "ES-NC": "Navarre", "ES-VC": "Valencian Community",
    },
    JP: {
        "JP-01": "Hokkaido", "JP-02": "Aomori", "JP-03": "Iwate", "JP-04": "Miyagi",
        "JP-05": "Akita", "JP-06": "Yamagata", "JP-07": "Fukushima", "JP-08": "Ibaraki",
        "JP-09": "Tochigi", "JP-10": "Gunma", "JP-11": "Saitama", "JP-12": "Chiba",
        "JP-13": "Tokyo", "JP-14": "Kanagawa", "JP-15": "Niigata", "JP-16": "Toyama",
        "JP-17": "Ishikawa", "JP-18": "Fukui", "JP-19": "Yamanashi", "JP-20": "Nagano",
        "JP-21": "Gifu", "JP-22": "Shizuoka", "JP-23": "Aichi", "JP-24": "Mie",
        "JP-25": "Shiga", "JP-26": "Kyoto", "JP-27": "Osaka", "JP-28": "Hyogo",
        "JP-29": "Nara", "JP-30": "Wakayama", "JP-31": "Tottori", "JP-32": "Shimane",
        "JP-33": "Okayama", "JP-34": "Hiroshima", "JP-35": "Yamaguchi", "JP-36": "Tokushima",
        "JP-37": "Kagawa", "JP-38": "Ehime", "JP-39": "Kochi", "JP-40": "Fukuoka",
        "JP-41": "Saga", "JP-42": "Nagasaki", "JP-43": "Kumamoto", "JP-44": "Oita",
        "JP-45": "Miyazaki", "JP-46": "Kagoshima", "JP-47": "Okinawa",
    },
    MX: {
        "MX-AGU": "Aguascalientes", "MX-BCN": "Baja California", "MX-BCS": "Baja California Sur",
        "MX-CAM": "Campeche", "MX-CHP": "Chiapas", "MX-CHH": "Chihuahua",
        "MX-CMX": "Mexico City", "MX-COA": "Coahuila", "MX-COL": "Colima",
        "MX-DUR": "Durango", "MX-GUA": "Guanajuato", "MX-GRO": "Guerrero",
        "MX-HID": "Hidalgo", "MX-JAL": "Jalisco", "MX-MEX": "State of Mexico",
        "MX-MIC": "Michoacán", "MX-MOR": "Morelos", "MX-NAY": "Nayarit",
        "MX-NLE": "Nuevo León", "MX-OAX": "Oaxaca", "MX-PUE": "Puebla",
        "MX-QUE": "Querétaro", "MX-ROO": "Quintana Roo", "MX-SLP": "San Luis Potosí",
        "MX-SIN": "Sinaloa", "MX-SON": "Sonora", "MX-TAB": "Tabasco",
        "MX-TAM": "Tamaulipas", "MX-TLA": "Tlaxcala", "MX-VER": "Veracruz",
        "MX-YUC": "Yucatán", "MX-ZAC": "Zacatecas",
    },
};

/** Countries that have state/region data available */
export const COUNTRIES_WITH_STATES = Object.keys(STATE_MAP);

/** Country labels for the state selector dropdown */
export const STATE_COUNTRY_LABELS: Record<string, string> = {
    US: "United States",
    CA: "Canada",
    AU: "Australia",
    GB: "United Kingdom",
    DE: "Germany",
    FR: "France",
    IN: "India",
    BR: "Brazil",
    IT: "Italy",
    ES: "Spain",
    JP: "Japan",
    MX: "Mexico",
};

/**
 * Get the state/region name from its ISO 3166-2 code
 * @param code - Full ISO 3166-2 code, e.g. "US-TX"
 */
export function getStateName(code: string): string {
    const [country] = code.split("-");
    return STATE_MAP[country]?.[code] || code;
}

/**
 * Get the country code from a state code
 * @param stateCode - Full ISO 3166-2 code, e.g. "US-TX"
 * @returns Country code, e.g. "US"
 */
export function getCountryFromStateCode(stateCode: string): string {
    return stateCode.split("-")[0] || "";
}

/**
 * Get all state codes for a given country
 */
export function getStatesForCountry(countryCode: string): string[] {
    return Object.keys(STATE_MAP[countryCode] || {});
}

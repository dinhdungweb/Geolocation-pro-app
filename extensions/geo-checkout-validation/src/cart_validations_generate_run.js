const DEFAULT_MESSAGE =
  "We cannot accept orders with a shipping or billing address in this country.";

// Must match normalizeCityName in app/utils/city-targeting.ts, which the app
// uses to write the allowed city names into the configuration.
function normalizeCityName(value) {
  let text = String(value || "");
  try {
    text = text.normalize("NFD").replace(/[̀-ͯ]/g, "");
  } catch {
    // keep the raw text if the runtime lacks Unicode normalization
  }
  return text
    .replace(/[^a-z0-9]+/gi, " ")
    .trim()
    .toLowerCase();
}

function normalizeRegion(value, countryCode) {
  const region = String(value || "").trim().toUpperCase();
  return region.startsWith(`${countryCode}-`)
    ? region.slice(countryCode.length + 1)
    : region;
}

function normalizedRestrictedCountries(value) {
  const restricted = new Map();
  if (!value || typeof value !== "object" || Array.isArray(value)) return restricted;

  for (const [rawCountry, policy] of Object.entries(value)) {
    const country = String(rawCountry).trim().toUpperCase();
    if (!/^[A-Z]{2}$/.test(country) || !policy || typeof policy !== "object") continue;

    const regions = new Set(
      (Array.isArray(policy.regions) ? policy.regions : [])
        .map((region) => normalizeRegion(region, country))
        .filter(Boolean),
    );
    const cities = (Array.isArray(policy.cities) ? policy.cities : [])
      .map((city) => ({
        name: normalizeCityName(city?.name),
        region: normalizeRegion(city?.region, country),
      }))
      .filter((city) => city.name);

    if (regions.size > 0 || cities.length > 0) {
      restricted.set(country, { regions, cities });
    }
  }
  return restricted;
}

function normalizedConfiguration(input) {
  const value = input?.validation?.metafield?.jsonValue;
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;

  const blockedCountries = Array.isArray(value.blockedCountries)
    ? value.blockedCountries
        .map((code) => String(code).trim().toUpperCase())
        .filter((code) => /^[A-Z]{2}$/.test(code))
    : [];

  return {
    blockedCountries: new Set(blockedCountries),
    restrictedCountries: normalizedRestrictedCountries(value.restrictedCountries),
    message:
      typeof value.message === "string" && value.message.trim()
        ? value.message.trim().slice(0, 255)
        : DEFAULT_MESSAGE,
  };
}

/**
 * The address field to flag, or null when the address may order.
 * In a restricted country only an allowed state or city may order. While the
 * buyer hasn't typed a city yet, the address is rejected only once its state
 * already rules out every allowed state and city.
 */
function rejectedField(address, configuration) {
  const country = String(address?.countryCode || "").trim().toUpperCase();
  if (!country) return null;
  if (configuration.blockedCountries.has(country)) return "countryCode";

  const policy = configuration.restrictedCountries.get(country);
  if (!policy) return null;

  const region = normalizeRegion(address?.provinceCode, country);
  const city = normalizeCityName(address?.city);

  if (region && policy.regions.has(region)) return null;
  if (city) {
    const allowed = policy.cities.some(
      (entry) => entry.name === city && (!entry.region || !region || entry.region === region),
    );
    return allowed ? null : "city";
  }
  if (!region) return null;
  const regionCanStillMatch = policy.cities.some(
    (entry) => !entry.region || entry.region === region,
  );
  return regionCanStillMatch ? null : "provinceCode";
}

export function cartValidationsGenerateRun(input) {
  const configuration = normalizedConfiguration(input);
  const errors = [];

  if (
    configuration &&
    (configuration.blockedCountries.size > 0 || configuration.restrictedCountries.size > 0)
  ) {
    const billingField = rejectedField(input?.cart?.billingAddress, configuration);

    if (billingField) {
      errors.push({
        message: configuration.message,
        target: `$.cart.billingAddress.${billingField}`,
      });
    } else {
      const deliveryGroups = input?.cart?.deliveryGroups || [];
      for (let index = 0; index < deliveryGroups.length; index++) {
        const field = rejectedField(deliveryGroups[index]?.deliveryAddress, configuration);
        if (field) {
          errors.push({
            message: configuration.message,
            target: `$.cart.deliveryGroups[${index}].deliveryAddress.${field}`,
          });
          break;
        }
      }
    }
  }

  return {
    operations: [
      {
        validationAdd: { errors },
      },
    ],
  };
}

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
    message:
      typeof value.message === "string" && value.message.trim()
        ? value.message.trim().slice(0, 255)
        : "We cannot accept orders with a shipping or billing address in this country.",
  };
}

export function cartValidationsGenerateRun(input) {
  const configuration = normalizedConfiguration(input);
  const errors = [];

  if (configuration && configuration.blockedCountries.size > 0) {
    const billingCountry = input?.cart?.billingAddress?.countryCode;

    if (
      billingCountry &&
      configuration.blockedCountries.has(String(billingCountry).toUpperCase())
    ) {
      errors.push({
        message: configuration.message,
        target: "$.cart.billingAddress.countryCode",
      });
    } else {
      const deliveryGroups = input?.cart?.deliveryGroups || [];
      const blockedIndex = deliveryGroups.findIndex((group) => {
        const countryCode = group?.deliveryAddress?.countryCode;
        return (
          countryCode &&
          configuration.blockedCountries.has(String(countryCode).toUpperCase())
        );
      });

      if (blockedIndex >= 0) {
        errors.push({
          message: configuration.message,
          target: `$.cart.deliveryGroups[${blockedIndex}].deliveryAddress.countryCode`,
        });
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

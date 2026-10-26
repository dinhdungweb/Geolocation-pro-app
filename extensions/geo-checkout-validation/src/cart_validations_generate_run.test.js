import { describe, expect, it } from "vitest";

import { cartValidationsGenerateRun } from "./cart_validations_generate_run.js";

function input({ billingCountry = null, deliveryCountries = [], config } = {}) {
  return {
    validation: {
      metafield: config === undefined ? null : { jsonValue: config },
    },
    cart: {
      billingAddress: billingCountry ? { countryCode: billingCountry } : null,
      deliveryGroups: deliveryCountries.map((countryCode) => ({
        deliveryAddress: countryCode ? { countryCode } : null,
      })),
    },
  };
}

describe("cartValidationsGenerateRun", () => {
  it("allows checkout when no configuration exists", () => {
    expect(
      cartValidationsGenerateRun(input()).operations[0].validationAdd.errors,
    ).toEqual([]);
  });

  it("blocks a restricted delivery country", () => {
    const result = cartValidationsGenerateRun(
      input({
        deliveryCountries: ["US", "CN"],
        config: { blockedCountries: ["CN"], message: "Country not supported" },
      }),
    );

    expect(result.operations[0].validationAdd.errors).toEqual([
      {
        message: "Country not supported",
        target: "$.cart.deliveryGroups[1].deliveryAddress.countryCode",
      },
    ]);
  });

  it("blocks a restricted billing country", () => {
    const result = cartValidationsGenerateRun(
      input({
        billingCountry: "CN",
        deliveryCountries: ["US"],
        config: { blockedCountries: ["CN"] },
      }),
    );

    expect(result.operations[0].validationAdd.errors[0].target).toBe(
      "$.cart.billingAddress.countryCode",
    );
  });

  it("allows countries outside the blocked list", () => {
    const result = cartValidationsGenerateRun(
      input({
        billingCountry: "US",
        deliveryCountries: ["GB"],
        config: { blockedCountries: ["CN"] },
      }),
    );

    expect(result.operations[0].validationAdd.errors).toEqual([]);
  });
});

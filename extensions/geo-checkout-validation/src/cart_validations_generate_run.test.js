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

  describe("restricted countries (state/city allow rules)", () => {
    const config = {
      blockedCountries: ["CN"],
      restrictedCountries: {
        US: {
          regions: ["OK"],
          cities: [
            { name: "houston", region: "TX" },
            { name: "san antonio", region: "TX" },
            { name: "springfield", region: "" },
          ],
        },
      },
      message: "Not available in your area",
    };
    const run = ({ billing, delivery = [] }) =>
      cartValidationsGenerateRun({
        validation: { metafield: { jsonValue: config } },
        cart: {
          billingAddress: billing || null,
          deliveryGroups: delivery.map((deliveryAddress) => ({ deliveryAddress })),
        },
      }).operations[0].validationAdd.errors;

    it("allows an allowed city in its state, ignoring case and accents", () => {
      expect(run({ delivery: [{ countryCode: "US", provinceCode: "TX", city: "Houston" }] })).toEqual([]);
      expect(run({ delivery: [{ countryCode: "US", provinceCode: "TX", city: " SAN  antónio " }] })).toEqual([]);
    });

    it("allows any city in an allowed state, and a region-less city anywhere", () => {
      expect(run({ delivery: [{ countryCode: "US", provinceCode: "OK", city: "Tulsa" }] })).toEqual([]);
      expect(run({ delivery: [{ countryCode: "US", provinceCode: "IL", city: "Springfield" }] })).toEqual([]);
    });

    it("rejects other cities of the country on the city field", () => {
      expect(run({ delivery: [{ countryCode: "US", provinceCode: "TX", city: "El Paso" }] })).toEqual([
        {
          message: "Not available in your area",
          target: "$.cart.deliveryGroups[0].deliveryAddress.city",
        },
      ]);
    });

    it("rejects an allowed city name in the wrong state", () => {
      expect(run({ delivery: [{ countryCode: "US", provinceCode: "FL", city: "Houston" }] })[0].target).toBe(
        "$.cart.deliveryGroups[0].deliveryAddress.city",
      );
    });

    it("waits for the city unless the state already rules it out", () => {
      // Only a region-less city could still match, so the state can't decide.
      expect(run({ delivery: [{ countryCode: "US", provinceCode: "CA" }] })).toEqual([]);
      expect(run({ delivery: [{ countryCode: "US" }] })).toEqual([]);
    });

    it("rejects a restricted billing address", () => {
      expect(
        run({
          billing: { countryCode: "US", provinceCode: "TX", city: "Dallas" },
          delivery: [{ countryCode: "US", provinceCode: "TX", city: "Houston" }],
        })[0].target,
      ).toBe("$.cart.billingAddress.city");
    });

    it("still blocks blocked countries and ignores unlisted ones", () => {
      expect(run({ delivery: [{ countryCode: "CN", city: "Beijing" }] })[0].target).toBe(
        "$.cart.deliveryGroups[0].deliveryAddress.countryCode",
      );
      expect(run({ delivery: [{ countryCode: "GB", city: "London" }] })).toEqual([]);
    });
  });

  it("rejects on the state once no allowed city can be in it", () => {
    const errors = cartValidationsGenerateRun({
      validation: {
        metafield: {
          jsonValue: {
            restrictedCountries: { US: { regions: [], cities: [{ name: "austin", region: "TX" }] } },
          },
        },
      },
      cart: {
        billingAddress: null,
        deliveryGroups: [{ deliveryAddress: { countryCode: "US", provinceCode: "NY" } }],
      },
    }).operations[0].validationAdd.errors;

    expect(errors[0].target).toBe("$.cart.deliveryGroups[0].deliveryAddress.provinceCode");
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

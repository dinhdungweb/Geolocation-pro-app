import { describe, expect, it } from "vitest";
import {
  getStableShopifyPlanFromBillingCheck,
  getShopifyPlanFromBillingCheck,
  normalizePlanName,
  resolveEffectivePlan,
} from "./effective-plan.server";

function billingCheck(...plans: string[]) {
  return {
    appSubscriptions: plans.map((name) => ({ name, status: "ACTIVE" })),
    hasActivePayment: plans.length > 0,
  };
}

describe("billing plan reconciliation", () => {
  it("reads an active Shopify subscription", () => {
    expect(getShopifyPlanFromBillingCheck(billingCheck("Elite"))).toBe("elite");
  });

  it("keeps a stored paid plan during a transient empty billing check", () => {
    expect(getStableShopifyPlanFromBillingCheck(billingCheck(), "plus")).toBe("plus");
  });

  it("keeps Free when both Shopify and storage report Free", () => {
    expect(getStableShopifyPlanFromBillingCheck(billingCheck(), "free")).toBe("free");
  });

  it("uses a new active paid plan instead of the stored plan", () => {
    expect(getStableShopifyPlanFromBillingCheck(billingCheck("Elite"), "plus")).toBe("elite");
  });

  it("normalizes the legacy Pro name to Premium and rejects unknown plans", () => {
    expect(normalizePlanName("Pro")).toBe("premium");
    expect(normalizePlanName("not-a-real-plan")).toBe("free");
  });

  it("uses an enabled billing override as the effective plan", () => {
    expect(
      resolveEffectivePlan({
        settings: {
          billingOverrideEnabled: true,
          billingOverridePlan: "elite",
          currentPlan: "plus",
        },
      }),
    ).toMatchObject({
      currentPlan: "plus",
      effectivePlan: "elite",
      isBillingOverridden: true,
      overridePlan: "elite",
    });
  });

  it("ignores a disabled billing override", () => {
    expect(
      resolveEffectivePlan({
        settings: {
          billingOverrideEnabled: false,
          billingOverridePlan: "elite",
          currentPlan: "plus",
        },
      }),
    ).toMatchObject({
      currentPlan: "plus",
      effectivePlan: "plus",
      isBillingOverridden: false,
      overridePlan: null,
    });
  });
});

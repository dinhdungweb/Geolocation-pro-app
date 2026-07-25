import { describe, expect, it } from "vitest";
import {
  getStableShopifyPlanFromBillingCheck,
  getShopifyPlanFromBillingCheck,
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
});

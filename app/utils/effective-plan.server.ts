import {
  ALL_PLANS,
  FREE_PLAN,
  PREMIUM_PLAN,
  PLUS_PLAN,
  ELITE_PLAN,
  UNLIMITED_PLAN,
  CUSTOM_PLAN,
  type PlanName,
} from "../billing.config";

export const BILLING_OVERRIDE_PLANS = [
  PREMIUM_PLAN,
  PLUS_PLAN,
  ELITE_PLAN,
  UNLIMITED_PLAN,
  CUSTOM_PLAN,
] as const;

export type BillingOverridePlan = (typeof BILLING_OVERRIDE_PLANS)[number];

type BillingOverrideSettings = {
  currentPlan?: string | null;
  billingOverrideEnabled?: boolean | null;
  billingOverridePlan?: string | null;
};

export function normalizePlanName(plan?: string | null): PlanName {
  return ALL_PLANS.includes(plan as PlanName) ? (plan as PlanName) : FREE_PLAN;
}

export function normalizeBillingOverridePlan(plan?: string | null): BillingOverridePlan | null {
  return BILLING_OVERRIDE_PLANS.includes(plan as BillingOverridePlan)
    ? (plan as BillingOverridePlan)
    : null;
}

export function getShopifyPlanFromBillingCheck(billingCheck: any): PlanName {
  return normalizePlanName(billingCheck?.appSubscriptions?.[0]?.name || FREE_PLAN);
}

export function resolveEffectivePlan({
  settings,
  shopifyPlan,
}: {
  settings?: BillingOverrideSettings | null;
  shopifyPlan?: string | null;
}) {
  const currentPlan = normalizePlanName(shopifyPlan || settings?.currentPlan || FREE_PLAN);
  const overridePlan = settings?.billingOverrideEnabled
    ? normalizeBillingOverridePlan(settings.billingOverridePlan)
    : null;
  const effectivePlan = overridePlan || currentPlan;

  return {
    currentPlan,
    effectivePlan,
    isBillingOverridden: Boolean(overridePlan),
    overridePlan,
  };
}

export function hasPaidPlanAccess(plan: string) {
  return normalizePlanName(plan) !== FREE_PLAN;
}

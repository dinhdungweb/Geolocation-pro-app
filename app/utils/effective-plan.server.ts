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
  const normalized = plan?.trim().toLowerCase();
  if (normalized === "pro") return PREMIUM_PLAN;
  if (normalized === "custom plan") return CUSTOM_PLAN;
  return ALL_PLANS.includes(normalized as PlanName) ? (normalized as PlanName) : FREE_PLAN;
}

export function normalizeBillingOverridePlan(plan?: string | null): BillingOverridePlan | null {
  return BILLING_OVERRIDE_PLANS.includes(plan as BillingOverridePlan)
    ? (plan as BillingOverridePlan)
    : null;
}

export function getShopifyPlanFromBillingCheck(billingCheck: any): PlanName {
  return normalizePlanName(billingCheck?.appSubscriptions?.[0]?.name || FREE_PLAN);
}

export function getStableShopifyPlanFromBillingCheck(
  billingCheck: any,
  storedPlan?: string | null,
): PlanName {
  const checkedPlan = getShopifyPlanFromBillingCheck(billingCheck);
  const normalizedStoredPlan = normalizePlanName(storedPlan);

  // Shopify can briefly return an empty active-subscription list while a
  // merchant is leaving a replacement-plan confirmation page. Explicit Free
  // actions and subscription webhooks own paid-to-Free transitions, so a
  // request loader must not erase a known paid plan from one empty read.
  if (checkedPlan === FREE_PLAN && normalizedStoredPlan !== FREE_PLAN) {
    return normalizedStoredPlan;
  }

  return checkedPlan;
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

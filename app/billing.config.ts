// Billing plan constants - shared between server and client
export const FREE_PLAN = "free";
export const PREMIUM_PLAN = "premium";
export const PLUS_PLAN = "plus";
export const ELITE_PLAN = "elite";
export const UNLIMITED_PLAN = "unlimited";
export const CUSTOM_PLAN = "custom";

export const ALL_PAID_PLANS = [PREMIUM_PLAN, PLUS_PLAN, ELITE_PLAN, UNLIMITED_PLAN, CUSTOM_PLAN];
export const ALL_PLANS = [FREE_PLAN, PREMIUM_PLAN, PLUS_PLAN, ELITE_PLAN, UNLIMITED_PLAN, CUSTOM_PLAN];
export const STANDARD_PAID_PLANS = [PREMIUM_PLAN, PLUS_PLAN, ELITE_PLAN];
export const DEFAULT_TRIAL_DAYS = 3;

// Visitor limits per plan
export const PLAN_LIMITS = {
    [FREE_PLAN]: 100,
    [PREMIUM_PLAN]: 1000,
    [PLUS_PLAN]: 2500,
    [ELITE_PLAN]: 6000,
    [UNLIMITED_PLAN]: Number.MAX_SAFE_INTEGER,
    [CUSTOM_PLAN]: Number.MAX_SAFE_INTEGER,
};

// Overage pricing: $100 per 50,000 visitors = $0.002 per visitor
export const OVERAGE_RATE = 100 / 50000; // $0.002 per visitor
export const OVERAGE_MONTHLY_CAP_AMOUNT = 99.99;
export const OVERAGE_MONTHLY_CAP_VISITORS = 49995;

export type PlanName = typeof ALL_PLANS[number];

export interface CustomPlanLimitSettings {
    customPlanVisitorLimit?: number | null;
    customPlanNoOverage?: boolean | null;
}

export function getPlanLimit(plan: string, settings?: CustomPlanLimitSettings | null) {
    if (plan === CUSTOM_PLAN) {
        const customLimit = settings?.customPlanVisitorLimit;
        if (settings?.customPlanNoOverage || !customLimit || customLimit <= 0) {
            return Number.MAX_SAFE_INTEGER;
        }
        return customLimit;
    }

    return PLAN_LIMITS[plan as keyof typeof PLAN_LIMITS] || PLAN_LIMITS[FREE_PLAN];
}

export function hasUnlimitedUsage(plan: string, settings?: CustomPlanLimitSettings | null) {
    return getPlanLimit(plan, settings) >= Number.MAX_SAFE_INTEGER;
}

export function isStandardPaidPlan(plan: string) {
    return STANDARD_PAID_PLANS.includes(plan);
}

export function getBillableOverageVisitors(plan: string, totalVisitors: number, planLimit: number) {
    const overageVisitors = Math.max(0, totalVisitors - planLimit);

    if (!isStandardPaidPlan(plan)) {
        return overageVisitors;
    }

    return Math.min(overageVisitors, OVERAGE_MONTHLY_CAP_VISITORS);
}

export function getUnchargedBillableOverageVisitors(
    plan: string,
    totalVisitors: number,
    planLimit: number,
    chargedVisitors: number,
) {
    const billableOverageVisitors = getBillableOverageVisitors(plan, totalVisitors, planLimit);
    return Math.max(0, billableOverageVisitors - Math.max(0, chargedVisitors));
}

export function hasMonthlyUnlimitedReward(plan: string, chargedVisitors?: number | null) {
    return isStandardPaidPlan(plan) && (chargedVisitors || 0) >= OVERAGE_MONTHLY_CAP_VISITORS;
}

export function isFinalMonthlyOverageCapCharge(plan: string, chargedVisitors: number, overageVisitors: number) {
    return (
        isStandardPaidPlan(plan) &&
        chargedVisitors < OVERAGE_MONTHLY_CAP_VISITORS &&
        chargedVisitors + overageVisitors >= OVERAGE_MONTHLY_CAP_VISITORS
    );
}

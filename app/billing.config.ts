// Billing plan constants - shared between server and client
export const FREE_PLAN = "free";
export const PREMIUM_PLAN = "premium";
export const PLUS_PLAN = "plus";
export const ELITE_PLAN = "elite";
export const UNLIMITED_PLAN = "unlimited";
export const CUSTOM_PLAN = "custom";

export const ALL_PAID_PLANS = [PREMIUM_PLAN, PLUS_PLAN, ELITE_PLAN, UNLIMITED_PLAN, CUSTOM_PLAN];
export const ALL_PLANS = [FREE_PLAN, PREMIUM_PLAN, PLUS_PLAN, ELITE_PLAN, UNLIMITED_PLAN, CUSTOM_PLAN];

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

// Maximum visitors allowed per month before halting overage billing (Hard Cap)
export const OVERAGE_HARD_LIMIT = 70000;

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

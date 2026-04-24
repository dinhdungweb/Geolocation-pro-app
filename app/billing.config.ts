// Billing plan constants - shared between server and client
export const FREE_PLAN = "free";
export const PREMIUM_PLAN = "premium";
export const PLUS_PLAN = "plus";
export const ELITE_PLAN = "elite";

export const ALL_PAID_PLANS = [PREMIUM_PLAN, PLUS_PLAN, ELITE_PLAN];
export const ALL_PLANS = [FREE_PLAN, PREMIUM_PLAN, PLUS_PLAN, ELITE_PLAN];

// Visitor limits per plan
export const PLAN_LIMITS = {
    [FREE_PLAN]: 100,
    [PREMIUM_PLAN]: 1000,
    [PLUS_PLAN]: 2500,
    [ELITE_PLAN]: 6000,
};

// Overage pricing: $100 per 50,000 visitors = $0.002 per visitor
export const OVERAGE_RATE = 100 / 50000; // $0.002 per visitor

// Maximum visitors allowed per month before halting overage billing (Hard Cap)
export const OVERAGE_HARD_LIMIT = 70000;

export type PlanName = typeof ALL_PLANS[number];

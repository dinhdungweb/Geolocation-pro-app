// Billing plan constants - shared between server and client
export const FREE_PLAN = "free";
export const PREMIUM_PLAN = "premium";
export const PLUS_PLAN = "plus";

export const ALL_PAID_PLANS = [PREMIUM_PLAN, PLUS_PLAN];
export const ALL_PLANS = [FREE_PLAN, PREMIUM_PLAN, PLUS_PLAN];

// Visitor limits per plan
export const PLAN_LIMITS = {
    [FREE_PLAN]: 100,
    [PREMIUM_PLAN]: 750,
    [PLUS_PLAN]: 1500,
};

// Overage pricing: $100 per 50,000 visitors = $0.002 per visitor
export const OVERAGE_RATE = 100 / 50000; // $0.002 per visitor
export const OVERAGE_BLOCK_SIZE = 1000; // Charge per 1000 visitors block  
export const OVERAGE_BLOCK_PRICE = OVERAGE_RATE * OVERAGE_BLOCK_SIZE; // ~$1.67 per 1000 visitors

export type PlanName = typeof ALL_PLANS[number];

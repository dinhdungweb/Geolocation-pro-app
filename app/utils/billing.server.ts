import prisma from "../db.server";
import { ALL_PAID_PLANS, FREE_PLAN, PLAN_LIMITS, OVERAGE_RATE } from "../billing.config";

/**
 * Check and charge overage for a shop.
 * This should be called from any admin loader that has access to billing.
 * It ensures overage is charged even if the admin doesn't visit the dashboard.
 */
export async function checkAndChargeOverage(
    shop: string,
    billing: any,
    isTest: boolean,
) {
    try {
        // Check for active subscription
        const billingConfig = await billing.check({
            plans: ALL_PAID_PLANS as any,
            isTest,
        });

        const hasProPlan = billingConfig.hasActivePayment;
        if (!hasProPlan) return; // No overage for free plans

        const currentPlan = billingConfig.appSubscriptions[0]?.name || FREE_PLAN;
        const planLimit = PLAN_LIMITS[currentPlan as keyof typeof PLAN_LIMITS] || PLAN_LIMITS[FREE_PLAN];

        // Get current month usage
        const now = new Date();
        const yearMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
        const monthlyUsage = await (prisma as any).monthlyUsage.findUnique({
            where: { shop_yearMonth: { shop, yearMonth } },
        });

        const currentUsage = monthlyUsage?.totalVisitors || 0;
        const chargedVisitors = monthlyUsage?.chargedVisitors || 0;

        if (currentUsage <= planLimit) return; // Within limits

        const overageVisitors = currentUsage - planLimit - chargedVisitors;
        if (overageVisitors <= 0) return; // Already charged

        const chargeAmount = overageVisitors * OVERAGE_RATE;

        // Create usage record in Shopify
        await billing.createUsageRecord({
            description: `Overage: ${overageVisitors} visitors beyond ${planLimit} limit`,
            price: {
                amount: chargeAmount,
                currencyCode: "USD",
            },
            isTest,
        });

        // Update chargedVisitors atomically to prevent double charging
        await (prisma as any).$transaction(async (tx: any) => {
            const current = await tx.monthlyUsage.findUnique({
                where: { shop_yearMonth: { shop, yearMonth } },
            });
            if (current) {
                await tx.monthlyUsage.update({
                    where: { shop_yearMonth: { shop, yearMonth } },
                    data: { chargedVisitors: current.chargedVisitors + overageVisitors },
                });
            }
        });

        console.log(`[Billing] Charged ${shop} $${chargeAmount.toFixed(2)} for ${overageVisitors} overage visitors`);
    } catch (error) {
        console.error("[Billing] Failed to check/charge overage:", error);
    }
}

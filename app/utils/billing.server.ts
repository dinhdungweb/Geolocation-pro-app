import prisma from "../db.server";
import { ALL_PAID_PLANS, FREE_PLAN, PLAN_LIMITS, OVERAGE_RATE } from "../billing.config";
import { unauthenticated } from "../shopify.server";

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

        const chargeAmount = Number((overageVisitors * OVERAGE_RATE).toFixed(2));
        
        // Enforce a minimum charge of $1.00 to avoid spamming Shopify API with micro-charges (e.g., $0.01 or $0.002)
        // This effectively batches overage charges in increments of 500 visitors.
        if (chargeAmount < 1.00) return;

        // Reserve the charge by updating the database FIRST using optimistic locking
        const updateResult = await (prisma as any).monthlyUsage.updateMany({
            where: { 
                shop_yearMonth: { shop, yearMonth },
                chargedVisitors: chargedVisitors // Optimistic lock: ensure no one else modified it
            },
            data: {
                chargedVisitors: chargedVisitors + overageVisitors
            }
        });

        if (updateResult.count === 0) {
            console.log(`[Billing] Race condition prevented for ${shop}. Overage already processed.`);
            return; // Another process already charged this overage
        }

        try {
            // Create usage record in Shopify
            await billing.createUsageRecord({
                description: `Overage: ${overageVisitors} visitors beyond ${planLimit} limit`,
                price: {
                    amount: chargeAmount,
                    currencyCode: "USD",
                },
                isTest,
            });
            console.log(`[Billing] Charged ${shop} $${chargeAmount.toFixed(2)} for ${overageVisitors} overage visitors`);
        } catch (error: any) {
            console.error("[Billing] Failed to create usage record in Shopify:", error);
            
            // If the error is about exceeding the capped amount (spending limit), DO NOT rollback.
            // If we rollback, the system will infinitely retry charging the exact same amount on every page load.
            const errorMsg = String(error?.message || error).toLowerCase();
            if (errorMsg.includes("capped") || errorMsg.includes("exceed")) {
                console.log(`[Billing] Shop ${shop} hit their spending limit. Skipping DB rollback to prevent retry loops.`);
                return;
            }

            // For other errors (like network failures), rollback the DB reservation so we can try again later.
            console.log(`[Billing] Rolling back DB reservation for ${shop}`);
            await (prisma as any).monthlyUsage.updateMany({
                where: { shop_yearMonth: { shop, yearMonth } },
                data: {
                    chargedVisitors: chargedVisitors // Revert back to the original value
                }
            });
            throw error; // Rethrow to be caught by the outer catch block
        }
    } catch (error) {
        console.error("[Billing] Failed to check/charge overage:", error);
    }
}

/**
 * Issue an application credit to a shop (Refund).
 */
export async function issueApplicationCredit(shop: string, amount: number, description: string) {
    try {
        const { session } = await unauthenticated.admin(shop);

        const response = await fetch(`https://${shop}/admin/api/2025-01/application_credits.json`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "X-Shopify-Access-Token": session.accessToken || "",
            },
            body: JSON.stringify({
                application_credit: {
                    description,
                    amount: amount.toString(),
                    test: process.env.NODE_ENV !== "production"
                }
            })
        });

        const data = await response.json();
        
        if (!response.ok) {
            console.error("[Billing] Error from REST API:", data);
            throw new Error(data.errors || "Failed to create application credit");
        }

        console.log(`[Billing] Issued $${amount} credit to ${shop}: ${description}`);
        return { success: true, credit: data.application_credit };
    } catch (error: any) {
        console.error(`[Billing] Failed to issue credit to ${shop}:`, error);
        return { success: false, error: error.message };
    }
}

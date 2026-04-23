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

        const chargeAmount = overageVisitors * OVERAGE_RATE;

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
        } catch (error) {
            // If Shopify fails, rollback the reservation
            console.error("[Billing] Failed to create usage record in Shopify, rolling back DB:", error);
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
        const { admin } = await unauthenticated.admin(shop);

        const response = await admin.graphql(
            `#graphql
            mutation applicationCreditCreate($description: String!, $amount: MoneyInput!) {
              applicationCreditCreate(description: $description, amount: $amount) {
                userErrors {
                  field
                  message
                }
                applicationCredit {
                  id
                  amount {
                    amount
                    currencyCode
                  }
                }
              }
            }`,
            {
                variables: {
                    description,
                    amount: {
                        amount: amount.toString(),
                        currencyCode: "USD",
                    },
                },
            }
        );

        const data = await response.json();
        if (data.data?.applicationCreditCreate?.userErrors?.length > 0) {
            throw new Error(data.data.applicationCreditCreate.userErrors[0].message);
        }

        console.log(`[Billing] Issued $${amount} credit to ${shop}: ${description}`);
        return { success: true, credit: data.data.applicationCreditCreate.applicationCredit };
    } catch (error: any) {
        console.error(`[Billing] Failed to issue credit to ${shop}:`, error);
        return { success: false, error: error.message };
    }
}

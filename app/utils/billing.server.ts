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
        const monthlyUsage = await prisma.monthlyUsage.findUnique({
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
        const updateResult = await prisma.monthlyUsage.updateMany({
            where: { 
                shop,
                yearMonth,
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
            await prisma.monthlyUsage.updateMany({
                where: { shop, yearMonth },
                data: {
                    chargedVisitors: chargedVisitors // Revert back to the original value
                }
            });
            throw error; // Rethrow to be caught by the outer catch block
        }
    } catch (error: any) {
        console.error("[Billing] Failed to check/charge overage:", error);
    }
}

/**
 * Issue an application credit to a shop (Refund) using Partner API.
 */
export async function issueApplicationCredit(shop: string, amount: number, description: string) {
    try {
        const orgId = process.env.PARTNER_ORGANIZATION_ID;
        const partnerToken = process.env.PARTNER_ACCESS_TOKEN;
        const appId = process.env.PARTNER_APP_ID;

        if (!orgId || !partnerToken || !appId) {
            throw new Error("Missing Partner API credentials in environment variables.");
        }

        // 1. Get the shop's Global ID using Admin API
        let admin; try { const context = await unauthenticated.admin(shop); admin = context.admin; } catch (error: any) { if (error.name === 'SessionNotFoundError') { console.warn('[Cron Billing] Skipping ' + shop + ': Session not found'); return; } throw error; }
        const shopInfoResponse = await admin.graphql(`
            #graphql
            query {
                shop {
                    id
                }
            }
        `);
        const shopInfoData = await shopInfoResponse.json();
        const shopGlobalId = shopInfoData?.data?.shop?.id;

        if (!shopGlobalId) {
            throw new Error("Failed to retrieve shop's global ID for Partner API.");
        }

        // 2. Call the Partner API
        const partnerUrl = `https://partners.shopify.com/${orgId}/api/2024-01/graphql.json`;
        const partnerResponse = await fetch(partnerUrl, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "X-Shopify-Access-Token": partnerToken,
            },
            body: JSON.stringify({
                query: `
                    mutation appCreditCreate($appId: ID!, $shopId: ID!, $amount: MoneyInput!, $description: String!, $test: Boolean!) {
                        appCreditCreate(appId: $appId, shopId: $shopId, input: {amount: $amount, description: $description, test: $test}) {
                            appCredit {
                                id
                                amount {
                                    amount
                                    currencyCode
                                }
                            }
                            userErrors {
                                field
                                message
                            }
                        }
                    }
                `,
                variables: {
                    appId: appId,
                    shopId: shopGlobalId,
                    amount: {
                        amount: amount.toString(),
                        currencyCode: "USD"
                    },
                    description,
                    test: process.env.NODE_ENV !== "production"
                }
            })
        });

        const partnerData = await partnerResponse.json();

        // Check for HTTP errors
        if (!partnerResponse.ok) {
            console.error("[Billing] Error from Partner API Network:", partnerData);
            throw new Error("Failed to connect to Partner API");
        }

        // Check for GraphQL errors
        if (partnerData.errors) {
            console.error("[Billing] GraphQL Errors from Partner API:", partnerData.errors);
            throw new Error(partnerData.errors[0]?.message || "GraphQL error from Partner API");
        }

        // Check for userErrors in the mutation
        const userErrors = partnerData.data?.appCreditCreate?.userErrors;
        if (userErrors && userErrors.length > 0) {
            console.error("[Billing] UserErrors from appCreditCreate:", userErrors);
            throw new Error(userErrors[0].message);
        }

        const creditResult = partnerData.data?.appCreditCreate?.appCredit;
        console.log(`[Billing] Issued $${amount} Partner API credit to ${shop}: ${description}`);
        return { success: true, credit: creditResult };
    } catch (error: any) {
        console.error(`[Billing] Failed to issue credit to ${shop}:`, error);
        return { success: false, error: error.message };
    }
}

/**
 * Query the REAL active plan from Shopify API for a shop.
 * Returns the plan name (e.g., "premium", "plus", "elite") or FREE_PLAN if no subscription.
 * Returns null if unable to determine (session error, API failure, etc.)
 */
export async function getShopActivePlan(shop: string): Promise<string | null> {
    try {
        const context = await unauthenticated.admin(shop);
        const admin = context.admin;
        if (!admin) return null;

        const subResponse = await admin.graphql(`
            #graphql
            query {
                currentAppInstallation {
                    activeSubscriptions {
                        name
                        status
                    }
                }
            }
        `);

        const subData = await subResponse.json();
        const activeSubscriptions = subData?.data?.currentAppInstallation?.activeSubscriptions;

        if (!activeSubscriptions || activeSubscriptions.length === 0) return FREE_PLAN;

        return activeSubscriptions[0].name || FREE_PLAN;
    } catch (error: any) {
        // Session not found, shop deleted, etc. - return null to signal "use fallback"
        return null;
    }
}

/**
 * Background Auto-Billing: Check and charge overage for a shop via GraphQL Admin API.
 * This is designed to be called by a cron job without an active HTTP request session.
 */
export async function checkAndChargeOverageBackground(shop: string) {
    try {
        const context = await unauthenticated.admin(shop);
        const admin = context.admin;
        if (!admin) return;

        // 1. Fetch active subscription and find the usage line item
        const subResponse = await admin.graphql(`
            #graphql
            query {
                currentAppInstallation {
                    activeSubscriptions {
                        id
                        name
                        status
                        lineItems {
                            id
                            plan {
                                pricingDetails {
                                    __typename
                                }
                            }
                        }
                    }
                }
            }
        `);
        
        const subData = await subResponse.json();
        const activeSubscriptions = subData?.data?.currentAppInstallation?.activeSubscriptions;
        
        if (!activeSubscriptions || activeSubscriptions.length === 0) return; // No active subscription

        const subscription = activeSubscriptions[0];
        const currentPlan = subscription.name;
        
        // Find the line item that handles usage pricing
        const usageLineItem = subscription.lineItems.find((item: any) => 
            item.plan?.pricingDetails?.__typename === 'AppUsagePricing'
        );
        
        if (!usageLineItem) return; // No usage pricing attached to this plan

        const planLimit = PLAN_LIMITS[currentPlan as keyof typeof PLAN_LIMITS] || PLAN_LIMITS[FREE_PLAN];

        // 2. Get current month usage from DB
        const now = new Date();
        const yearMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
        const monthlyUsage = await prisma.monthlyUsage.findUnique({
            where: { shop_yearMonth: { shop, yearMonth } },
        });

        const currentUsage = monthlyUsage?.totalVisitors || 0;
        const chargedVisitors = monthlyUsage?.chargedVisitors || 0;

        if (currentUsage <= planLimit) return; // Within limits

        const overageVisitors = currentUsage - planLimit - chargedVisitors;
        if (overageVisitors <= 0) return; // Already charged

        const chargeAmount = Number((overageVisitors * OVERAGE_RATE).toFixed(2));
        
        // Enforce minimum charge batching ($1.00 minimum)
        if (chargeAmount < 1.00) return;

        // Reserve the charge by updating the database FIRST using optimistic locking
        const updateResult = await prisma.monthlyUsage.updateMany({
            where: { 
                shop,
                yearMonth,
                chargedVisitors: chargedVisitors
            },
            data: {
                chargedVisitors: chargedVisitors + overageVisitors
            }
        });

        if (updateResult.count === 0) {
            console.log(`[Cron Billing] Race condition prevented for ${shop}. Overage already processed.`);
            return; 
        }

        try {
            // 3. Create usage record in Shopify via GraphQL Mutation
            const chargeResponse = await admin.graphql(`
                #graphql
                mutation appUsageRecordCreate($description: String!, $price: MoneyInput!, $subscriptionLineItemId: ID!) {
                    appUsageRecordCreate(description: $description, price: $price, subscriptionLineItemId: $subscriptionLineItemId) {
                        appUsageRecord {
                            id
                        }
                        userErrors {
                            field
                            message
                        }
                    }
                }
            `, {
                variables: {
                    description: `Overage: ${overageVisitors} visitors beyond ${planLimit} limit`,
                    price: {
                        amount: chargeAmount.toFixed(2),
                        currencyCode: "USD"
                    },
                    subscriptionLineItemId: usageLineItem.id
                }
            });
            
            const chargeData = await chargeResponse.json();
            const userErrors = chargeData?.data?.appUsageRecordCreate?.userErrors;
            
            if (userErrors && userErrors.length > 0) {
                throw new Error(userErrors[0].message);
            }
            
            console.log(`[Cron Billing] Auto-Charged ${shop} $${chargeAmount.toFixed(2)} for ${overageVisitors} overage visitors`);
        } catch (error: any) {
            console.error(`[Cron Billing] Failed to create usage record for ${shop}:`, error);
            
            // Handle capped amount errors safely
            const errorMsg = String(error?.message || error).toLowerCase();
            if (errorMsg.includes("capped") || errorMsg.includes("exceed")) {
                console.log(`[Cron Billing] Shop ${shop} hit their spending limit. Skipping DB rollback.`);
                return;
            }

            // Rollback the DB reservation on network/temporary errors
            console.log(`[Cron Billing] Rolling back DB reservation for ${shop}`);
            await prisma.monthlyUsage.updateMany({
                where: { shop, yearMonth },
                data: {
                    chargedVisitors: chargedVisitors
                }
            });
        }
    } catch (error: any) {
        const statusCode = error?.response?.code || error?.networkStatusCode;
        const errorStr = String(error).toLowerCase();
        const isSessionError = errorStr.includes('session'); // Cực kỳ bao quát

        if (statusCode === 402 || statusCode === 404 || isSessionError) {
            let reason = "Unknown";
            if (statusCode === 402) reason = "Payment Required (Frozen)";
            else if (statusCode === 404) reason = "Not Found (Deleted)";
            else if (isSessionError) reason = "Session Issue (Uninstalled)";
            
            console.warn(`[Cron Billing] Skipping ${shop}: ${reason}.`);
            return;
        }
        console.error(`[Cron Billing] Critical error processing background billing for ${shop}:`, error);
    }
}


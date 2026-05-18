import prisma from "../db.server";
import crypto from "crypto";
import {
    FREE_PLAN,
    OVERAGE_RATE,
    getPlanLimit,
    getUnchargedBillableOverageVisitors,
    hasMonthlyOverageCapReached,
    hasUnlimitedUsage,
    isFinalMonthlyOverageCapCharge,
} from "../billing.config";
import { unauthenticated } from "../shopify.server";
import {
    syncUsagePeriodForShop,
    usagePeriodFromSubscription,
} from "./billing-period.server";

function usageChargeIdempotencyKey(
    shop: string,
    billingPeriodKey: string,
    fromChargedVisitors: number,
    toChargedVisitors: number,
) {
    return crypto
        .createHash("sha256")
        .update(`${shop}:${billingPeriodKey}:${fromChargedVisitors}:${toChargedVisitors}`)
        .digest("hex");
}

function graphQLErrorMessage(errors: any[] | undefined) {
    return errors?.map((error: any) => error.message).filter(Boolean).join("; ") || "Unknown GraphQL error";
}

const CHARGE_STATUS = {
    PENDING: "pending",
    SHOPIFY_CHARGED: "shopify_charged",
    SUCCEEDED: "succeeded",
    DB_UPDATE_FAILED: "db_update_failed",
    CAPPED: "capped",
    FAILED: "failed",
} as const;

function isCappedAmountError(error: unknown) {
    const errorMsg = String((error as any)?.message || error).toLowerCase();
    return errorMsg.includes("capped") || errorMsg.includes("exceed");
}

async function markChargeAttempt(
    idempotencyKey: string,
    data: {
        status: string;
        shopifyUsageRecordId?: string | null;
        error?: string | null;
    },
) {
    await prisma.usageChargeAttempt.update({
        where: { idempotencyKey },
        data,
    });
}

async function reconcilePendingChargeAttempt(shop: string, usagePeriod: {
    key: string;
    yearMonth: string;
    billingPeriodStart: Date | null;
    billingPeriodEnd: Date | null;
    billingSubscriptionId: string | null;
    billingUsageLineItemId: string | null;
}) {
    const attempt = await prisma.usageChargeAttempt.findFirst({
        where: {
            shop,
            billingPeriodKey: usagePeriod.key,
            status: { in: [CHARGE_STATUS.SHOPIFY_CHARGED, CHARGE_STATUS.DB_UPDATE_FAILED] },
            shopifyUsageRecordId: { not: null },
        },
        orderBy: { createdAt: "asc" },
    });

    if (!attempt) return false;

    const updateResult = await prisma.monthlyUsage.updateMany({
        where: {
            shop,
            billingPeriodKey: usagePeriod.key,
            chargedVisitors: { lt: attempt.toChargedVisitors },
        },
        data: {
            chargedVisitors: attempt.toChargedVisitors,
            billingPeriodStart: usagePeriod.billingPeriodStart,
            billingPeriodEnd: usagePeriod.billingPeriodEnd,
            billingSubscriptionId: usagePeriod.billingSubscriptionId,
            billingUsageLineItemId: usagePeriod.billingUsageLineItemId,
        },
    });

    if (updateResult.count === 0) {
        const current = await prisma.monthlyUsage.findUnique({
            where: { shop_billingPeriodKey: { shop, billingPeriodKey: usagePeriod.key } },
        });
        if (!current || current.chargedVisitors < attempt.toChargedVisitors) {
            console.error(`[Cron Billing] Pending Shopify charge could not be reconciled for ${shop}. Attempt: ${attempt.idempotencyKey}`);
            return false;
        }
    }

    await markChargeAttempt(attempt.idempotencyKey, {
        status: CHARGE_STATUS.SUCCEEDED,
        error: null,
    });
    console.log(`[Cron Billing] Reconciled prior Shopify charge for ${shop}: ${attempt.overageVisitors} visitors`);
    return true;
}

export async function chargeOverageUsageRecord({
    admin,
    chargedVisitors,
    currentPlan,
    currentUsage,
    minimumChargeAmount = 1,
    planLimit,
    shop,
    usageLineItemId,
    usagePeriod,
}: {
    admin: any;
    shop: string;
    currentPlan: string;
    usagePeriod: {
        key: string;
        yearMonth: string;
        billingPeriodStart: Date | null;
        billingPeriodEnd: Date | null;
        billingSubscriptionId: string | null;
        billingUsageLineItemId: string | null;
    };
    usageLineItemId?: string | null;
    planLimit: number;
    currentUsage: number;
    chargedVisitors: number;
    minimumChargeAmount?: number;
}) {
    // Reconcile ANY unresolved attempts for this period before calculating new overages
    // This prevents double-charging if an old attempt failed to update DB but traffic increased
    const unresolvedAttempts = await prisma.usageChargeAttempt.findMany({
        where: {
            shop,
            billingPeriodKey: usagePeriod.key,
            status: { in: [CHARGE_STATUS.SHOPIFY_CHARGED, CHARGE_STATUS.DB_UPDATE_FAILED] }
        }
    });

    if (unresolvedAttempts.length > 0) {
        let reconciled = false;
        for (let attemptIndex = 0; attemptIndex < unresolvedAttempts.length; attemptIndex++) {
            if (await reconcilePendingChargeAttempt(shop, usagePeriod)) {
                reconciled = true;
            }
        }
        if (reconciled) {
            console.log(`[Billing] Reconciled unresolved charge attempts for ${shop}. Deferring new charge to next cycle.`);
            return { status: "reconciled" as const };
        }
    }

    if (hasMonthlyOverageCapReached(currentPlan, chargedVisitors)) {
        console.log(`[Billing] Shop ${shop} reached monthly overage cap. Overage charging completed.`);
        return { status: "cap_reached" as const };
    }

    if (currentUsage <= planLimit) return { status: "within_limit" as const };

    const overageVisitors = getUnchargedBillableOverageVisitors(
        currentPlan,
        currentUsage,
        planLimit,
        chargedVisitors,
    );
    if (overageVisitors <= 0) return { status: "already_charged" as const };

    const chargeAmount = Number((overageVisitors * OVERAGE_RATE).toFixed(2));
    const isFinalCapCharge = isFinalMonthlyOverageCapCharge(currentPlan, chargedVisitors, overageVisitors);

    if (chargeAmount < minimumChargeAmount && !isFinalCapCharge) {
        return { status: "below_threshold" as const, overageVisitors, chargeAmount };
    }

    const subscriptionLineItemId = usageLineItemId || usagePeriod.billingUsageLineItemId;
    if (!subscriptionLineItemId) {
        throw new Error("Missing Shopify usage subscription line item id.");
    }

    const toChargedVisitors = chargedVisitors + overageVisitors;
    const idempotencyKey = usageChargeIdempotencyKey(
        shop,
        usagePeriod.key,
        chargedVisitors,
        toChargedVisitors,
    );

    const existingAttempt = await prisma.usageChargeAttempt.findUnique({
        where: { idempotencyKey },
    });

    if (existingAttempt?.status === CHARGE_STATUS.SUCCEEDED) {
        return { status: "already_charged" as const };
    }

    if (existingAttempt?.status === CHARGE_STATUS.CAPPED) {
        return { status: "capped" as const };
    }

    if (
        existingAttempt?.status === CHARGE_STATUS.SHOPIFY_CHARGED ||
        existingAttempt?.status === CHARGE_STATUS.DB_UPDATE_FAILED
    ) {
        await reconcilePendingChargeAttempt(shop, usagePeriod);
        return { status: "reconciled" as const };
    }

    if (existingAttempt) {
        await prisma.usageChargeAttempt.update({
            where: { idempotencyKey },
            data: {
                status: CHARGE_STATUS.PENDING,
                error: null,
                billingUsageLineItemId: subscriptionLineItemId,
                amount: chargeAmount,
            },
        });
    } else {
        await prisma.usageChargeAttempt.create({
            data: {
                shop,
                billingPeriodKey: usagePeriod.key,
                billingUsageLineItemId: subscriptionLineItemId,
                fromChargedVisitors: chargedVisitors,
                toChargedVisitors,
                overageVisitors,
                amount: chargeAmount,
                idempotencyKey,
                status: CHARGE_STATUS.PENDING,
            },
        });
    }

    try {
        const chargeResponse = await admin.graphql(`
            #graphql
            mutation appUsageRecordCreate($description: String!, $price: MoneyInput!, $subscriptionLineItemId: ID!, $idempotencyKey: String) {
                appUsageRecordCreate(description: $description, price: $price, subscriptionLineItemId: $subscriptionLineItemId, idempotencyKey: $idempotencyKey) {
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
                    currencyCode: "USD",
                },
                subscriptionLineItemId,
                idempotencyKey,
            },
        });

        const chargeData: any = await chargeResponse.json();
        if (chargeData?.errors?.length) {
            throw new Error(`Shopify usage record mutation failed: ${graphQLErrorMessage(chargeData.errors)}`);
        }

        const userErrors = chargeData?.data?.appUsageRecordCreate?.userErrors;
        if (userErrors && userErrors.length > 0) {
            throw new Error(userErrors[0].message);
        }

        const usageRecordId = chargeData?.data?.appUsageRecordCreate?.appUsageRecord?.id;
        if (!usageRecordId) {
            throw new Error("Shopify did not return an app usage record id.");
        }

        await markChargeAttempt(idempotencyKey, {
            status: CHARGE_STATUS.SHOPIFY_CHARGED,
            shopifyUsageRecordId: usageRecordId,
            error: null,
        });

        const MAX_DB_RETRIES = 3;
        let dbUpdated = false;
        for (let attempt = 1; attempt <= MAX_DB_RETRIES; attempt++) {
            const updateResult = await prisma.monthlyUsage.updateMany({
                where: {
                    shop,
                    billingPeriodKey: usagePeriod.key,
                    chargedVisitors,
                },
                data: {
                    chargedVisitors: toChargedVisitors,
                    billingPeriodStart: usagePeriod.billingPeriodStart,
                    billingPeriodEnd: usagePeriod.billingPeriodEnd,
                    billingSubscriptionId: usagePeriod.billingSubscriptionId,
                    billingUsageLineItemId: usagePeriod.billingUsageLineItemId,
                },
            });

            if (updateResult.count > 0) {
                dbUpdated = true;
                break;
            }

            const current = await prisma.monthlyUsage.findUnique({
                where: { shop_billingPeriodKey: { shop, billingPeriodKey: usagePeriod.key } },
            });
            if (current && current.chargedVisitors >= toChargedVisitors) {
                dbUpdated = true;
                break;
            }

            if (attempt < MAX_DB_RETRIES) {
                await new Promise((resolve) => setTimeout(resolve, 200 * attempt));
            }
        }

        if (!dbUpdated) {
            await markChargeAttempt(idempotencyKey, {
                status: CHARGE_STATUS.DB_UPDATE_FAILED,
                shopifyUsageRecordId: usageRecordId,
                error: `DB update failed after ${MAX_DB_RETRIES} retries`,
            });
            console.error(`[Cron Billing] CRITICAL: Shopify charged $${chargeAmount.toFixed(2)} for ${shop} but DB update failed after ${MAX_DB_RETRIES} retries. Attempt: ${idempotencyKey}`);
            return { status: "db_update_failed" as const, overageVisitors, chargeAmount };
        }

        await markChargeAttempt(idempotencyKey, {
            status: CHARGE_STATUS.SUCCEEDED,
            shopifyUsageRecordId: usageRecordId,
            error: null,
        });

        console.log(`[Cron Billing] Auto-Charged ${shop} $${chargeAmount.toFixed(2)} for ${overageVisitors} overage visitors`);
        return { status: "charged" as const, overageVisitors, chargeAmount };
    } catch (error: any) {
        const status = isCappedAmountError(error) ? CHARGE_STATUS.CAPPED : CHARGE_STATUS.FAILED;
        await markChargeAttempt(idempotencyKey, {
            status,
            error: String(error?.message || error),
        });

        if (status === CHARGE_STATUS.CAPPED) {
            console.log(`[Cron Billing] Shop ${shop} hit their spending limit. Attempt marked capped.`);
            return { status: "capped" as const, overageVisitors, chargeAmount };
        }

        throw error;
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

        const subData: any = await subResponse.json();
        if (subData?.errors?.length) {
            throw new Error(`Shopify subscription query failed: ${graphQLErrorMessage(subData.errors)}`);
        }

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
                        createdAt
                        currentPeriodEnd
                        lineItems {
                            id
                            usageRecords(first: 100, reverse: true, sortKey: CREATED_AT) {
                                nodes {
                                    createdAt
                                    price {
                                        amount
                                        currencyCode
                                    }
                                }
                            }
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
        
        const subData: any = await subResponse.json();
        if (subData?.errors?.length) {
            throw new Error(`Shopify subscription query failed: ${graphQLErrorMessage(subData.errors)}`);
        }

        const activeSubscriptions = subData?.data?.currentAppInstallation?.activeSubscriptions;
        
        if (!activeSubscriptions || activeSubscriptions.length === 0) return; // No active subscription

        const settings = await prisma.settings.findUnique({
            where: { shop },
            select: {
                customPlanVisitorLimit: true,
                customPlanNoOverage: true,
                billingPeriodKey: true,
                billingPeriodStart: true,
                billingPeriodEnd: true,
                billingSubscriptionId: true,
                billingUsageLineItemId: true,
                billingPlanName: true,
            },
        });

        const subscription =
            activeSubscriptions.find((sub: any) => usagePeriodFromSubscription(sub, settings)) ||
            activeSubscriptions[0];
        const currentPlan = subscription.name;
        const usagePeriod = usagePeriodFromSubscription(subscription, settings);
        if (!usagePeriod) return;
        await syncUsagePeriodForShop(shop, currentPlan, usagePeriod);
        
        // Find the line item that handles usage pricing
        const usageLineItem = subscription.lineItems.find((item: any) => 
            item.plan?.pricingDetails?.__typename === 'AppUsagePricing'
        );
        
        if (!usageLineItem) return; // No usage pricing attached to this plan

        if (hasUnlimitedUsage(currentPlan, settings)) return;

        const planLimit = getPlanLimit(currentPlan, settings);

        // 2. Get current Shopify billing period usage from DB
        const monthlyUsage = await prisma.monthlyUsage.findUnique({
            where: {
                shop_billingPeriodKey: {
                    shop,
                    billingPeriodKey: usagePeriod.key,
                },
            },
        });

        const currentUsage = monthlyUsage?.totalVisitors || 0;
        const chargedVisitors = monthlyUsage?.chargedVisitors || 0;

        await chargeOverageUsageRecord({
            admin,
            chargedVisitors,
            currentPlan,
            currentUsage,
            planLimit,
            shop,
            usageLineItemId: usageLineItem.id,
            usagePeriod,
        });
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


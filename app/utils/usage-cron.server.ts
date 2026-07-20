import cron from 'node-cron';
import crypto from 'crypto';
import { Prisma } from '@prisma/client';
import prisma from '../db.server';
import { sendAdminEmail, hasSentEmail } from './email.server';
import { getLimit80EmailHtml, getLimit100EmailHtml, getLimitUnlimitedEmailHtml, getLimitFreeReminderEmailHtml, getReview3DaysEmailHtml } from './email-templates';
import { FREE_PLAN, getPlanLimit, hasMonthlyUnlimitedReward, hasUnlimitedUsage } from '../billing.config';
import { checkAndChargeOverageBackground, getShopActivePlan } from './billing.server';
import { getUsagePeriodForShop, type UsagePeriod } from './billing-period.server';
import { cleanupOldLogs, processPendingShopCleanupJobs } from './cleanup.server';
import { resolveEffectivePlan } from './effective-plan.server';

const USAGE_JOB_LOCK_KEY = 'usage-cron:check-all-shops';
const USAGE_JOB_LOCK_TTL_MS = 5 * 60 * 60 * 1000;

async function acquireJobLock(key: string, ttlMs: number) {
    const owner = crypto.randomUUID();
    const now = new Date();
    const lockedUntil = new Date(now.getTime() + ttlMs);

    try {
        await prisma.jobLock.create({
            data: { key, owner, lockedUntil },
        });
        return { key, owner };
    } catch (error) {
        if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002') {
            throw error;
        }
    }

    const updated = await prisma.jobLock.updateMany({
        where: {
            key,
            lockedUntil: { lt: now },
        },
        data: {
            owner,
            lockedUntil,
        },
    });

    return updated.count > 0 ? { key, owner } : null;
}

async function releaseJobLock(lock: { key: string; owner: string }) {
    await prisma.jobLock.updateMany({
        where: {
            key: lock.key,
            owner: lock.owner,
        },
        data: {
            lockedUntil: new Date(),
        },
    });
}

export async function hasSentUsageEmail(shop: string, type: 'limit_80' | 'limit_100' | 'limit_unlimited' | 'limit_free_reminder', usagePeriod: UsagePeriod) {
    const directSent = await hasSentEmail(shop, type, usagePeriod.key);
    if (directSent) return true;

    const legacyCalendarKey = `calendar:${usagePeriod.yearMonth}`;
    if (legacyCalendarKey !== usagePeriod.key && await hasSentEmail(shop, type, legacyCalendarKey)) {
        return true;
    }

    if (!usagePeriod.billingPeriodStart || !usagePeriod.billingPeriodEnd) {
        return false;
    }

    const previousPeriodLog = await prisma.adminEmailLog.findFirst({
        where: {
            shop,
            status: { in: ['sent', 'simulated'] },
            type: { startsWith: `${type}:` },
            createdAt: {
                gte: usagePeriod.billingPeriodStart,
                lt: usagePeriod.billingPeriodEnd,
            },
        },
    });

    return Boolean(previousPeriodLog);
}

export async function getUsageEmailSentAt(shop: string, type: 'limit_80' | 'limit_100' | 'limit_unlimited' | 'limit_free_reminder', usagePeriod: UsagePeriod): Promise<Date | null> {
    const directLog = await prisma.adminEmailLog.findFirst({
        where: {
            shop,
            type: `${type}:${usagePeriod.key}`,
            status: { in: ['sent', 'simulated'] },
        },
        orderBy: { createdAt: 'desc' },
    });
    if (directLog) return directLog.createdAt;

    const legacyCalendarKey = `calendar:${usagePeriod.yearMonth}`;
    if (legacyCalendarKey !== usagePeriod.key) {
        const legacyLog = await prisma.adminEmailLog.findFirst({
            where: {
                shop,
                type: `${type}:${legacyCalendarKey}`,
                status: { in: ['sent', 'simulated'] },
            },
            orderBy: { createdAt: 'desc' },
        });
        if (legacyLog) return legacyLog.createdAt;
    }

    if (!usagePeriod.billingPeriodStart || !usagePeriod.billingPeriodEnd) {
        return null;
    }

    const rangeLog = await prisma.adminEmailLog.findFirst({
        where: {
            shop,
            status: { in: ['sent', 'simulated'] },
            type: { startsWith: `${type}:` },
            createdAt: {
                gte: usagePeriod.billingPeriodStart,
                lt: usagePeriod.billingPeriodEnd,
            },
        },
        orderBy: { createdAt: 'desc' },
    });

    return rangeLog ? rangeLog.createdAt : null;
}

/**
 * Checks usage for all shops and sends warning emails if needed.
 */
export async function checkAllShopsUsage() {
    const lock = await acquireJobLock(USAGE_JOB_LOCK_KEY, USAGE_JOB_LOCK_TTL_MS);
    if (!lock) {
        console.log('[Cron] Usage check skipped because another worker holds the lock.');
        return;
    }

    console.log('[Cron] Starting usage check for all shops...');

    try {
        // Get all settings to find active shops
        const allSettings = await prisma.settings.findMany({
            where: {
                NOT: { shop: 'GLOBAL' }
            }
        });

        for (const settings of allSettings) {
            const shop = settings.shop;

            try {
                let shopifyPlan = settings.currentPlan || FREE_PLAN;
                const hasBillingOverride = Boolean(settings.billingOverrideEnabled && settings.billingOverridePlan);

            // For paid shops: query Shopify API for the REAL active plan to avoid stale DB data
            if (shopifyPlan !== FREE_PLAN) {
                const actualPlan = await getShopActivePlan(shop);
                if (actualPlan !== null && actualPlan !== shopifyPlan) {
                    console.log(`[Cron] Plan sync for ${shop}: DB="${shopifyPlan}" -> Shopify="${actualPlan}"`);
                    shopifyPlan = actualPlan;
                    // Sync corrected plan back to DB so proxy.config uses the right limit
                    try {
                        const planSyncData = actualPlan === FREE_PLAN
                            ? {
                                currentPlan: actualPlan,
                                blockVpn: hasBillingOverride ? settings.blockVpn : false,
                                billingPlanName: null,
                                billingPeriodKey: null,
                                billingPeriodStart: null,
                                billingPeriodEnd: null,
                                billingSubscriptionId: null,
                                billingUsageLineItemId: null,
                            }
                            : { currentPlan: actualPlan };

                        await prisma.settings.update({
                            where: { shop },
                            data: planSyncData,
                        });
                    } catch (err) {
                        console.error(`[Cron] Failed to sync plan for ${shop}:`, err);
                    }
                } else if (actualPlan !== null) {
                    shopifyPlan = actualPlan; // Use Shopify's value even if same, to be safe
                }
                // If actualPlan is null (API failed), fall back to DB value
            }

            const effectiveSettings = { ...settings, currentPlan: shopifyPlan };
            const { effectivePlan: currentPlan } = resolveEffectivePlan({
                settings: effectiveSettings,
                shopifyPlan,
            });
            const planLimit = getPlanLimit(currentPlan, effectiveSettings);
            const hasPlanUnlimitedUsage = hasUnlimitedUsage(currentPlan, effectiveSettings);

            // Auto-bill accumulated overage first so reward emails reflect the latest charged state.
            // Skip Free plan shops - they have no subscription, so billing API calls would be wasted.
            if (currentPlan !== FREE_PLAN && !hasPlanUnlimitedUsage) {
                await checkAndChargeOverageBackground(shop);
            }

            const usagePeriod = await getUsagePeriodForShop({ shop, currentPlan, settings: effectiveSettings });

            // Get current billing period usage
            const monthlyUsage = await prisma.monthlyUsage.findUnique({
                where: {
                    shop_billingPeriodKey: {
                        shop,
                        billingPeriodKey: usagePeriod.key,
                    },
                }
            });

            const currentUsage = monthlyUsage?.totalVisitors || 0;
            const chargedVisitors = monthlyUsage?.chargedVisitors || 0;
            const hasMonthlyReward = hasMonthlyUnlimitedReward(currentPlan, chargedVisitors);
            const isUnlimitedPlan = hasPlanUnlimitedUsage || hasMonthlyReward;
            const usagePercent = isUnlimitedPlan ? 0 : (currentUsage / planLimit) * 100;

            // 0. Check for monthly overage cap (Unlimited Reward)
            if (hasMonthlyReward) {
                const sentUnlimited = await hasSentUsageEmail(shop, 'limit_unlimited', usagePeriod);
                if (!sentUnlimited) {
                    console.log(`[Cron] Sending Unlimited Reward email to ${shop}`);
                    await sendAdminEmail({
                        shop,
                        type: 'limit_unlimited',
                        subject: `CONGRATULATIONS: ${shop} granted UNLIMITED usage this month!`,
                        html: getLimitUnlimitedEmailHtml(shop, currentUsage),
                        dedupeKey: usagePeriod.key,
                        variables: { usage: currentUsage },
                    });
                }
            }
            // 1. Check for 100% threshold
            else if (usagePercent >= 100) {
                const sent100 = await hasSentUsageEmail(shop, 'limit_100', usagePeriod);
                if (!sent100) {
                    console.log(`[Cron] Sending 100% usage email to ${shop}`);
                    await sendAdminEmail({
                        shop,
                        type: 'limit_100',
                        subject: `ACTION REQUIRED: ${shop} reached 100% limit - Geo: Redirect & Country Block`,
                        html: getLimit100EmailHtml(shop, currentUsage, planLimit),
                        dedupeKey: usagePeriod.key,
                        variables: { usage: currentUsage, limit: planLimit },
                    });
                } else if (currentPlan === FREE_PLAN) {
                    const sentReminder = await hasSentUsageEmail(shop, 'limit_free_reminder', usagePeriod);
                    if (!sentReminder) {
                        const sent100At = await getUsageEmailSentAt(shop, 'limit_100', usagePeriod);
                        const oneDayMs = 24 * 60 * 60 * 1000;
                        if (sent100At && (Date.now() - sent100At.getTime()) >= oneDayMs) {
                            console.log(`[Cron] Sending Free plan 1-day reminder email to ${shop}`);
                            await sendAdminEmail({
                                shop,
                                type: 'limit_free_reminder',
                                subject: `[Reminder] ${shop}: Free plan limit reached - Upgrade to keep geo-redirects active`,
                                html: getLimitFreeReminderEmailHtml(shop, currentUsage, planLimit),
                                dedupeKey: usagePeriod.key,
                                variables: { usage: currentUsage, limit: planLimit },
                            });
                        }
                    }
                }
            }
            // 2. Check for 80% threshold
            else if (usagePercent >= 80) {
                const sent80 = await hasSentUsageEmail(shop, 'limit_80', usagePeriod);
                if (!sent80) {
                    console.log(`[Cron] Sending 80% usage email to ${shop}`);
                    await sendAdminEmail({
                        shop,
                        type: 'limit_80',
                        subject: `${shop}: Usage Warning (80%) - Geo: Redirect & Country Block`,
                        html: getLimit80EmailHtml(shop, currentUsage, planLimit),
                        dedupeKey: usagePeriod.key,
                        variables: { usage: currentUsage, limit: planLimit },
                    });
                }
            }
            // 3. Check for 3-day app review request email
            const sentReview = await hasSentEmail(shop, 'review_3_days');
            if (!sentReview) {
                const welcomeLog = await prisma.adminEmailLog.findFirst({
                    where: { shop, type: 'welcome', status: { in: ['sent', 'simulated'] } },
                    orderBy: { createdAt: 'asc' },
                });
                const installDate = welcomeLog ? welcomeLog.createdAt : settings.createdAt;
                const threeDaysMs = 3 * 24 * 60 * 60 * 1000;
                if (installDate && (Date.now() - installDate.getTime()) >= threeDaysMs) {
                    console.log(`[Cron] Sending 3-day app review request email to ${shop}`);
                    await sendAdminEmail({
                        shop,
                        type: 'review_3_days',
                        subject: `How is your experience with Geo: Redirect & Country Block?`,
                        html: getReview3DaysEmailHtml(shop),
                    });
                }
            }
            } catch (error) {
                console.error(`[Cron] Failed to check usage for ${shop}:`, error);
            }
        }

        console.log('[Cron] Usage check completed.');
    } finally {
        await releaseJobLock(lock);
    }
}

/**
 * Checks usage for a single shop and sends warning emails if needed.
 * This is designed to be run in real-time when usage is recorded.
 */
export async function checkAndSendLimitEmailIfNeeded({
    shop,
    usagePeriod,
    currentPlan,
    planLimit,
    settings,
}: {
    shop: string;
    usagePeriod: UsagePeriod;
    currentPlan: string;
    planLimit: number;
    settings: any;
}) {
    try {
        const hasPlanUnlimitedUsage = hasUnlimitedUsage(currentPlan, settings);
        if (hasPlanUnlimitedUsage) return;

        // Fetch monthlyUsage to get totalVisitors and chargedVisitors in DB
        const monthlyUsage = await prisma.monthlyUsage.findUnique({
            where: {
                shop_billingPeriodKey: {
                    shop,
                    billingPeriodKey: usagePeriod.key,
                },
            }
        });

        const currentUsage = monthlyUsage?.totalVisitors || 0;
        const chargedVisitors = monthlyUsage?.chargedVisitors || 0;
        const hasMonthlyReward = hasMonthlyUnlimitedReward(currentPlan, chargedVisitors);

        if (hasMonthlyReward) {
            const sentUnlimited = await hasSentUsageEmail(shop, 'limit_unlimited', usagePeriod);
            if (!sentUnlimited) {
                console.log(`[Realtime Limit Check] Sending Unlimited Reward email to ${shop}`);
                await sendAdminEmail({
                    shop,
                    type: 'limit_unlimited',
                    subject: `CONGRATULATIONS: ${shop} granted UNLIMITED usage this month!`,
                    html: getLimitUnlimitedEmailHtml(shop, currentUsage),
                    dedupeKey: usagePeriod.key,
                    variables: { usage: currentUsage },
                });
            }
            return;
        }

        const usagePercent = (currentUsage / planLimit) * 100;

        if (usagePercent >= 100) {
            const sent100 = await hasSentUsageEmail(shop, 'limit_100', usagePeriod);
            if (!sent100) {
                console.log(`[Realtime Limit Check] Sending 100% usage email to ${shop}`);
                await sendAdminEmail({
                    shop,
                    type: 'limit_100',
                    subject: `ACTION REQUIRED: ${shop} reached 100% limit - Geo: Redirect & Country Block`,
                    html: getLimit100EmailHtml(shop, currentUsage, planLimit),
                    dedupeKey: usagePeriod.key,
                    variables: { usage: currentUsage, limit: planLimit },
                });
            } else if (currentPlan === FREE_PLAN) {
                const sentReminder = await hasSentUsageEmail(shop, 'limit_free_reminder', usagePeriod);
                if (!sentReminder) {
                    const sent100At = await getUsageEmailSentAt(shop, 'limit_100', usagePeriod);
                    const oneDayMs = 24 * 60 * 60 * 1000;
                    if (sent100At && (Date.now() - sent100At.getTime()) >= oneDayMs) {
                        console.log(`[Realtime Limit Check] Sending Free plan 1-day reminder email to ${shop}`);
                        await sendAdminEmail({
                            shop,
                            type: 'limit_free_reminder',
                            subject: `[Reminder] ${shop}: Free plan limit reached - Upgrade to keep geo-redirects active`,
                            html: getLimitFreeReminderEmailHtml(shop, currentUsage, planLimit),
                            dedupeKey: usagePeriod.key,
                            variables: { usage: currentUsage, limit: planLimit },
                        });
                    }
                }
            }
        } else if (usagePercent >= 80) {
            const sent80 = await hasSentUsageEmail(shop, 'limit_80', usagePeriod);
            if (!sent80) {
                console.log(`[Realtime Limit Check] Sending 80% usage email to ${shop}`);
                await sendAdminEmail({
                    shop,
                    type: 'limit_80',
                    subject: `${shop}: Usage Warning (80%) - Geo: Redirect & Country Block`,
                    html: getLimit80EmailHtml(shop, currentUsage, planLimit),
                    dedupeKey: usagePeriod.key,
                    variables: { usage: currentUsage, limit: planLimit },
                });
            }
        }
    } catch (error) {
        console.error(`[Realtime Limit Check] Failed to check usage/send email for ${shop}:`, error);
    }
}

/**
 * Initializes the cron job scheduler.
 * Uses a global variable to ensure only one instance runs during development.
 */
export function initUsageCron() {
    const globalAny: any = global;
    
    if (globalAny.__usageCronStarted) {
        return;
    }

    // Schedule every 6 hours
    // '0 */6 * * *'
    // For testing/demonstration, you might want to run it more frequently (e.g., every minute: '* * * * *')
    // but 6 hours is reasonable for production usage warnings.
    cron.schedule('0 */6 * * *', () => {
        checkAllShopsUsage().catch(err => {
            console.error('[Cron Error] Failed to check usage:', err);
        });
    });

    // Schedule GeoIP database update daily at 3:00 AM
    cron.schedule('0 3 * * *', async () => {
        try {
            const { checkAndRunLiteUpdate } = await import('../services/geoip-updater.server');
            await checkAndRunLiteUpdate();
        } catch (err) {
            console.error('[Cron Error] Failed to update GeoIP database:', err);
        }
    });

    cron.schedule('30 2 * * *', () => {
        cleanupOldLogs().catch(err => {
            console.error('[Cron Error] Failed to clean old logs:', err);
        });
    });

    cron.schedule('*/5 * * * *', () => {
        processPendingShopCleanupJobs().catch(err => {
            console.error('[Cron Error] Failed to process shop cleanup jobs:', err);
        });
    });

    globalAny.__usageCronStarted = true;
    console.log('[Cron] Usage monitoring scheduled (every 6 hours).');
    console.log('[Cron] GeoIP auto-update scheduled (daily at 3:00 AM).');
    console.log('[Cron] Cleanup scheduled (daily at 2:30 AM).');
    console.log('[Cron] Shop cleanup scheduled (every 5 minutes).');
    
    // Run initial check after a short delay to avoid API spam during rolling deploys.
    setTimeout(() => {
        checkAllShopsUsage().catch(err => {
            console.error('[Cron Startup Error] Failed to running initial check:', err);
        });
    }, 30_000);

    setTimeout(() => {
        cleanupOldLogs().catch(err => {
            console.error('[Cron Startup Error] Failed to clean old logs:', err);
        });
    }, 60_000);

    setTimeout(() => {
        processPendingShopCleanupJobs().catch(err => {
            console.error('[Cron Startup Error] Failed to process shop cleanup jobs:', err);
        });
    }, 90_000);
}

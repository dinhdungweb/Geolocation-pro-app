import cron from 'node-cron';
import prisma from '../db.server';
import { sendAdminEmail, hasSentEmail } from './email.server';
import { getLimit80EmailHtml, getLimit100EmailHtml, getLimitUnlimitedEmailHtml } from './email-templates';
import { PLAN_LIMITS, FREE_PLAN, OVERAGE_HARD_LIMIT } from '../billing.config';
import { checkAndChargeOverageBackground, getShopActivePlan } from './billing.server';

/**
 * Checks usage for all shops and sends warning emails if needed.
 */
export async function checkAllShopsUsage() {
    console.log('[Cron] Starting usage check for all shops...');
    
    // Get all settings to find active shops
    const allSettings = await prisma.settings.findMany({
        where: {
            NOT: { shop: 'GLOBAL' }
        }
    });

    const now = new Date();
    const yearMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

    for (const settings of allSettings) {
        const shop = settings.shop;
        let currentPlan = settings.currentPlan || FREE_PLAN;

        // For paid shops: query Shopify API for the REAL active plan to avoid stale DB data
        if (currentPlan !== FREE_PLAN) {
            const actualPlan = await getShopActivePlan(shop);
            if (actualPlan !== null && actualPlan !== currentPlan) {
                console.log(`[Cron] Plan sync for ${shop}: DB="${currentPlan}" → Shopify="${actualPlan}"`);
                currentPlan = actualPlan;
                // Sync corrected plan back to DB so proxy.config uses the right limit
                try {
                    await prisma.settings.update({
                        where: { shop },
                        data: { currentPlan: actualPlan },
                    });
                } catch (err) {
                    console.error(`[Cron] Failed to sync plan for ${shop}:`, err);
                }
            } else if (actualPlan !== null) {
                currentPlan = actualPlan; // Use Shopify's value even if same, to be safe
            }
            // If actualPlan is null (API failed), fall back to DB value
        }

        const planLimit = PLAN_LIMITS[currentPlan as keyof typeof PLAN_LIMITS] || PLAN_LIMITS[FREE_PLAN];

        // Get monthly usage
        const monthlyUsage = await prisma.monthlyUsage.findUnique({
            where: {
                shop_yearMonth: { shop, yearMonth }
            }
        });

        const currentUsage = monthlyUsage?.totalVisitors || 0;
        const usagePercent = (currentUsage / planLimit) * 100;

        // 0. Check for Hard Limit (Unlimited Reward)
        if (currentUsage >= OVERAGE_HARD_LIMIT) {
            const sentUnlimited = await hasSentEmail(shop, 'limit_unlimited', yearMonth);
            if (!sentUnlimited) {
                console.log(`[Cron] Sending Unlimited Reward email to ${shop}`);
                await sendAdminEmail({
                    shop,
                    type: 'limit_unlimited',
                    subject: `CONGRATULATIONS: ${shop} granted UNLIMITED usage this month!`,
                    html: getLimitUnlimitedEmailHtml(shop, currentUsage),
                    dedupeKey: yearMonth,
                });
            }
        } 
        // 1. Check for 100% threshold
        else if (usagePercent >= 100) {
            const sent100 = await hasSentEmail(shop, 'limit_100', yearMonth);
            if (!sent100) {
                console.log(`[Cron] Sending 100% usage email to ${shop}`);
                await sendAdminEmail({
                    shop,
                    type: 'limit_100',
                    subject: `ACTION REQUIRED: ${shop} reached 100% limit - Geo: Redirect & Country Block`,
                    html: getLimit100EmailHtml(shop, currentUsage, planLimit),
                    dedupeKey: yearMonth,
                });
            }
        } 
        // 2. Check for 80% threshold
        else if (usagePercent >= 80) {
            const sent80 = await hasSentEmail(shop, 'limit_80', yearMonth);
            if (!sent80) {
                console.log(`[Cron] Sending 80% usage email to ${shop}`);
                await sendAdminEmail({
                    shop,
                    type: 'limit_80',
                    subject: `${shop}: Usage Warning (80%) - Geo: Redirect & Country Block`,
                    html: getLimit80EmailHtml(shop, currentUsage, planLimit),
                    dedupeKey: yearMonth,
                });
            }
        }

        // 3. Auto-bill any accumulated overage in the background
        // Skip Free plan shops - they have no subscription, so billing API calls would be wasted
        if (currentPlan !== FREE_PLAN) {
            await checkAndChargeOverageBackground(shop);
        }
    }
    
    console.log('[Cron] Usage check completed.');
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

    globalAny.__usageCronStarted = true;
    console.log('[Cron] Usage monitoring scheduled (every 6 hours).');
    console.log('[Cron] GeoIP auto-update scheduled (daily at 3:00 AM).');
    
    // Also run once immediately on startup to catch any missed windows
    checkAllShopsUsage().catch(err => {
        console.error('[Cron Startup Error] Failed to running initial check:', err);
    });
}

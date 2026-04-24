import cron from 'node-cron';
import prisma from '../db.server';
import { sendAdminEmail, hasSentEmail } from './email.server';
import { getLimit80EmailHtml, getLimit100EmailHtml } from './email-templates';
import { PLAN_LIMITS, FREE_PLAN } from '../billing.config';
import { checkAndChargeOverageBackground } from './billing.server';

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
        const currentPlan = settings.currentPlan || FREE_PLAN;
        const planLimit = PLAN_LIMITS[currentPlan as keyof typeof PLAN_LIMITS] || PLAN_LIMITS[FREE_PLAN];

        // Get monthly usage
        const monthlyUsage = await (prisma as any).monthlyUsage.findUnique({
            where: {
                shop_yearMonth: { shop, yearMonth }
            }
        });

        const currentUsage = monthlyUsage?.totalVisitors || 0;
        const usagePercent = (currentUsage / planLimit) * 100;

        // 1. Check for 100% threshold
        if (usagePercent >= 100) {
            const sent100 = await hasSentEmail(shop, 'limit_100');
            if (!sent100) {
                console.log(`[Cron] Sending 100% usage email to ${shop}`);
                await sendAdminEmail({
                    shop,
                    type: 'limit_100',
                    subject: `ACTION REQUIRED: ${shop} reached 100% limit - Geo: Redirect & Country Block`,
                    html: getLimit100EmailHtml(shop, currentUsage, planLimit)
                });
            }
        } 
        // 2. Check for 80% threshold
        else if (usagePercent >= 80) {
            const sent80 = await hasSentEmail(shop, 'limit_80');
            if (!sent80) {
                console.log(`[Cron] Sending 80% usage email to ${shop}`);
                await sendAdminEmail({
                    shop,
                    type: 'limit_80',
                    subject: `${shop}: Usage Warning (80%) - Geo: Redirect & Country Block`,
                    html: getLimit80EmailHtml(shop, currentUsage, planLimit)
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

    globalAny.__usageCronStarted = true;
    console.log('[Cron] Usage monitoring scheduled (every 6 hours).');
    
    // Also run once immediately on startup to catch any missed windows
    checkAllShopsUsage().catch(err => {
        console.error('[Cron Startup Error] Failed to running initial check:', err);
    });
}

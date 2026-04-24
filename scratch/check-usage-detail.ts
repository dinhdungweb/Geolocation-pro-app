/**
 * Debug: Xem toàn bộ MonthlyUsage tháng này
 */
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

const PLAN_LIMITS: Record<string, number> = {
    free: 100, premium: 1000, plus: 2500, elite: 6000,
};

async function main() {
    const now = new Date();
    const yearMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

    // All usage this month
    const usage = await (prisma as any).monthlyUsage.findMany({
        where: { yearMonth },
        orderBy: { totalVisitors: 'desc' },
    });

    // All settings for plan info
    const settings = await prisma.settings.findMany({
        where: { NOT: { shop: 'GLOBAL' } },
    });
    const planMap = new Map(settings.map(s => [s.shop, s.currentPlan || 'free']));

    console.log(`\n📅 Monthly Usage for ${yearMonth} (${usage.length} shops with data)\n`);
    console.log('Shop'.padEnd(45), 'Plan'.padEnd(10), 'Limit'.padEnd(8), 'Total'.padEnd(10), 'Charged'.padEnd(10), 'Status');
    console.log('-'.repeat(110));

    for (const u of usage) {
        const plan = planMap.get(u.shop) || 'free';
        const limit = PLAN_LIMITS[plan] || 100;
        const overage = Math.max(0, u.totalVisitors - limit);
        const uncharged = Math.max(0, u.totalVisitors - limit - u.chargedVisitors);
        
        let status = '✅ OK';
        if (overage > 0 && uncharged <= 0) status = '✅ Charged';
        if (uncharged > 0) status = `⚠️  Uncharged: ${uncharged}`;

        console.log(
            u.shop.padEnd(45),
            plan.padEnd(10),
            limit.toString().padEnd(8),
            u.totalVisitors.toString().padEnd(10),
            u.chargedVisitors.toString().padEnd(10),
            status
        );
    }

    await prisma.$disconnect();
}
main().catch(console.error);

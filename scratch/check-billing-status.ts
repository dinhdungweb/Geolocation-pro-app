/**
 * Debug script: Kiểm tra trạng thái billing overage của tất cả shops
 * Chạy: npx tsx scratch/check-billing-status.ts
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const PLAN_LIMITS: Record<string, number> = {
    free: 100,
    premium: 1000,
    plus: 2500,
    elite: 6000,
};
const OVERAGE_RATE = 100 / 50000; // $0.002

async function main() {
    const now = new Date();
    const yearMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    
    console.log(`\n📅 Checking billing status for: ${yearMonth}`);
    console.log('='.repeat(100));

    // Get all shops with their settings and usage
    const allSettings = await prisma.settings.findMany({
        where: { NOT: { shop: 'GLOBAL' } },
    });

    const allUsage = await (prisma as any).monthlyUsage.findMany({
        where: { yearMonth },
    });

    const usageMap = new Map(allUsage.map((u: any) => [u.shop, u]));

    let totalUncharged = 0;

    for (const settings of allSettings) {
        const shop = settings.shop;
        const plan = settings.currentPlan || 'free';
        const limit = PLAN_LIMITS[plan] || PLAN_LIMITS.free;
        const usage = usageMap.get(shop) as any;

        if (!usage) continue; // No usage this month

        const total = usage.totalVisitors || 0;
        const charged = usage.chargedVisitors || 0;

        if (total <= limit) continue; // Within limit, skip

        const overage = total - limit - charged;
        const pendingCharge = Number((overage * OVERAGE_RATE).toFixed(2));

        totalUncharged += Math.max(0, overage);

        console.log(`\n🏪 ${shop}`);
        console.log(`   Plan: ${plan} | Limit: ${limit.toLocaleString()}`);
        console.log(`   Total Visitors: ${total.toLocaleString()}`);
        console.log(`   Already Charged: ${charged.toLocaleString()} visitors`);
        console.log(`   Uncharged Overage: ${overage.toLocaleString()} visitors`);
        console.log(`   Pending Charge: $${pendingCharge.toFixed(2)}`);
        
        if (overage <= 0) {
            console.log(`   ✅ Status: Fully charged`);
        } else if (pendingCharge < 1.00) {
            console.log(`   ⏳ Status: Below $1.00 minimum — waiting for more traffic`);
        } else {
            console.log(`   ⚠️  Status: SHOULD BE CHARGED — $${pendingCharge.toFixed(2)} pending!`);
        }
    }

    console.log('\n' + '='.repeat(100));
    console.log(`📊 Summary: ${totalUncharged.toLocaleString()} total uncharged overage visitors across all shops`);
    console.log(`💰 Total pending: $${(totalUncharged * OVERAGE_RATE).toFixed(2)}`);

    await prisma.$disconnect();
}

main().catch(console.error);

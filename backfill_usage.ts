
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function backfill() {
  console.log("Starting backfill of MonthlyUsage from AnalyticsCountry...");
  
  // 1. Get all analytics records
  const allAnalytics = await prisma.analyticsCountry.findMany();
  console.log(`Found ${allAnalytics.length} analytics records.`);

  // 2. Group by shop and month
  const grouped: Record<string, { totalVisitors: number, redirected: number, blocked: number, popupShown: number }> = {};

  for (const record of allAnalytics) {
    const date = new Date(record.date);
    const yearMonth = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    const key = `${record.shop}#${yearMonth}`;

    if (!grouped[key]) {
      grouped[key] = { totalVisitors: 0, redirected: 0, blocked: 0, popupShown: 0 };
    }

    grouped[key].totalVisitors += record.visitors;
    grouped[key].redirected += record.redirected;
    grouped[key].blocked += record.blocked;
    grouped[key].popupShown += record.popupShown;
  }

  // 3. Upsert into MonthlyUsage
  console.log(`Aggregated into ${Object.keys(grouped).length} monthly buckets. Upserting...`);

  for (const [key, data] of Object.entries(grouped)) {
    const [shop, yearMonth] = key.split("#");
    
    await prisma.monthlyUsage.upsert({
      where: {
        shop_yearMonth: {
          shop,
          yearMonth
        }
      },
      update: {
        totalVisitors: data.totalVisitors,
        redirected: data.redirected,
        blocked: data.blocked,
        popupShown: data.popupShown
      },
      create: {
        shop,
        yearMonth,
        totalVisitors: data.totalVisitors,
        redirected: data.redirected,
        blocked: data.blocked,
        popupShown: data.popupShown
      }
    });
  }

  console.log("Backfill completed successfully!");
}

backfill()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

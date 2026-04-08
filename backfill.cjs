
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

async function backfill() {
  console.log("Starting backfill (JS version)...");
  const allAnalytics = await prisma.analyticsCountry.findMany();
  console.log(`Processing ${allAnalytics.length} records...`);

  const grouped = {};
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

  for (const [key, data] of Object.entries(grouped)) {
    const [shop, yearMonth] = key.split("#");
    await prisma.monthlyUsage.upsert({
      where: { shop_yearMonth: { shop, yearMonth } },
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
  console.log("Backfill DONE.");
}

backfill().finally(() => prisma.$disconnect());

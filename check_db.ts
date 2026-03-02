import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

async function checkUsage() {
    console.log("Checking MonthlyUsage table...");
    try {
        const usage = await (prisma as any).monthlyUsage.findMany({
            take: 1
        });
        console.log("MonthlyUsage data:", JSON.stringify(usage, null, 2));
    } catch (error: any) {
        console.error("Error querying MonthlyUsage:", error.message);
    }
}

checkUsage().finally(() => prisma.$disconnect());

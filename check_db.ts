import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

async function listShops() {
    const settings = await prisma.settings.findMany({
        select: { shop: true, currentPlan: true }
    });
    console.log("All shops in settings table:");
    settings.forEach(s => {
        console.log(`- Shop: ${s.shop}, Plan: ${s.currentPlan}`);
    });
}

listShops().finally(() => prisma.$disconnect());

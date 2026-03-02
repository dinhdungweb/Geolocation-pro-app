import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

async function main() {
    console.log("Checking if 'popupShown' column exists in 'MonthlyUsage'...");
    try {
        // Try to add the column. If it fails because it already exists, that's fine.
        await prisma.$executeRawUnsafe(
            `ALTER TABLE "MonthlyUsage" ADD COLUMN IF NOT EXISTS "popupShown" INTEGER DEFAULT 0;`
        );
        console.log("Successfully ensured 'popupShown' column exists.");

        // Also ensure totalVisitors comment is clear (Optional, just metadata)
        console.log("Database update complete.");
    } catch (error) {
        console.error("Error updating database:", error);
        process.exit(1);
    } finally {
        await prisma.$disconnect();
    }
}

main();

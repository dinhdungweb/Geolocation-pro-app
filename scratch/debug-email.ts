import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    console.log("Checking recent sessions...");
    const sessions = await prisma.session.findMany({
        orderBy: { expires: 'desc' },
        take: 5,
        select: {
            shop: true,
            email: true,
            expires: true
        }
    });
    
    console.table(sessions);
    
    console.log("\nChecking recent email logs...");
    const logs = await (prisma as any).adminEmailLog.findMany({
        orderBy: { createdAt: 'desc' },
        take: 5
    });
    
    console.table(logs);
}

main()
  .catch(e => console.error(e))
  .finally(async () => await prisma.$disconnect());

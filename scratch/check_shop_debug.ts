
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function listSessions() {
  const sessions = await prisma.session.findMany({ 
    select: { shop: true },
    take: 20
  });
  console.log('--- Sessions ---');
  console.log(JSON.stringify(sessions, null, 2));
}

listSessions().catch(console.error).finally(() => prisma.$disconnect());

import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  const settings = await prisma.settings.findMany({
    select: {
      shop: true,
      blockVpn: true,
      isEnabled: true,
      mode: true,
      excludedIPs: true
    }
  });
  console.log('Shop Settings:');
  console.log(JSON.stringify(settings, null, 2));
}

main()
  .catch(e => console.error(e))
  .finally(async () => await prisma.$disconnect());

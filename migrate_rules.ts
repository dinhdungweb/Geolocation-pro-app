import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function migrate() {
  console.log('Starting migration...');
  
  const shops = await prisma.settings.findMany();
  
  for (const shopSettings of shops) {
    const { shop, mode } = shopSettings;
    
    // Determine the status from old mode
    const isEnabled = mode !== 'disabled';
    
    console.log(`Migrating shop: ${shop}, Old Mode: ${mode}, IsEnabled: ${isEnabled}`);
    
    // Update isEnabled field
    await prisma.settings.update({
      where: { shop },
      data: { isEnabled }
    });
    
    // Update all rules for this shop to match the old global mode
    // (excluding 'disabled' which is now handled by isEnabled)
    const ruleMode = mode === 'auto_redirect' ? 'auto_redirect' : 'popup';
    
    const result = await prisma.redirectRule.updateMany({
      where: { 
        shop,
        ruleType: 'redirect'
      },
      data: {
        redirectMode: ruleMode
      }
    });
    
    console.log(`Updated ${result.count} rules for ${shop} to ${ruleMode}`);
  }
  
  console.log('Migration completed!');
}

migrate()
  .catch(e => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

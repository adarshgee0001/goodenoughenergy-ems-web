const { PrismaClient } = require('@prisma/client');


if (process.env.NODE_ENV === "production" || process.env.DATABASE_URL?.includes("ems?schema")) {
  throw new Error("This script cannot run against a production environment.");
}

const prisma = new PrismaClient();

async function run() {
  try {
    const pcs = await prisma.device.findFirst({ where: { componentId: 'pcs' } });
    
    if (pcs) {
      await prisma.device.create({
        data: {
          type: 'BMS',
          name: 'Battery Management System',
          emuId: pcs.emuId,
          componentId: 'bcms',
          bessAssetId: pcs.bessAssetId
        }
      });
      console.log('Created bcms device successfully!');
    } else {
      console.log('PCS device not found, cannot link bcms.');
    }
  } catch (err) {
    console.error(err);
  } finally {
    await prisma.$disconnect();
  }
}
run();

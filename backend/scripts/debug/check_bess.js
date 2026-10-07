const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function check() {
  try {
    const asset = await prisma.bESSAsset.findUnique({
      where: { id: '34613990-46bb-4e2f-a340-09ce773b73f1' }
    });
    console.log("Asset DB Record:");
    console.log(JSON.stringify(asset, null, 2));
  } catch(e) {
    console.error(e);
  } finally {
    await prisma.$disconnect();
  }
}
check();

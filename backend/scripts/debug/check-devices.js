const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function run() {
  try {
    const assets = await prisma.bESSAsset.findMany({
      include: { devices: true }
    });
    console.log('Assets and Devices:', JSON.stringify(assets, null, 2));

    const allDevices = await prisma.device.findMany();
    console.log('All Devices:', JSON.stringify(allDevices, null, 2));
  } catch (err) {
    console.error(err);
  } finally {
    await prisma.$disconnect();
  }
}
run();

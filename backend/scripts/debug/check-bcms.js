const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function run() {
  try {
    const bcmsDevice = await prisma.device.findFirst({
      where: { componentId: 'bcms' }
    });
    console.log('Device bcms:', bcmsDevice);

    if (bcmsDevice) {
      const tel = await prisma.telemetryHistory.findFirst({
        where: { deviceId: bcmsDevice.id },
        orderBy: { timestamp: 'desc' }
      });
      console.log('Latest Telemetry:', tel);
    }
  } catch (err) {
    console.error(err);
  } finally {
    await prisma.$disconnect();
  }
}
run();

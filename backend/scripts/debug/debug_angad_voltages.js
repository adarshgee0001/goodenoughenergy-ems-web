const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
async function main() {
  const asset = await prisma.bESSAsset.findUnique({ where: { emuId: '2410031073' }});
  if (!asset) return console.log('Asset not found');
  
  const devices = await prisma.device.findMany({ where: { bessAssetId: asset.id } });
  for (const device of devices) {
    const tel = await prisma.telemetryHistory.findFirst({
      where: { deviceId: device.id },
      orderBy: { timestamp: 'desc' }
    });
    if (tel) {
      console.log(`\nDevice: ${device.componentId} | voltageA: ${tel.voltageA} | gridSideLoad: ${tel.gridSideLoad}`);
    }
  }
}
main().catch(console.error).finally(() => prisma.$disconnect());

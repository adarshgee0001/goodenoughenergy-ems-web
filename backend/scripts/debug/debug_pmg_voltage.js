const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
async function main() {
  const assets = await prisma.bESSAsset.findMany();
  for (const asset of assets) {
    console.log('\nAsset:', asset.name);
    // Find device 'pmg'
    const pmg = await prisma.device.findUnique({ where: { bessAssetId_componentId: { bessAssetId: asset.id, componentId: 'pmg' } }});
    if (pmg) {
      const tel = await prisma.telemetryHistory.findFirst({
        where: { deviceId: pmg.id },
        orderBy: { timestamp: 'desc' }
      });
      if (tel) {
        console.log('PMG TelemetryHistory voltageA:', tel.voltageA);
      } else {
        console.log('No PMG telemetry found');
      }
    }
  }
}
main().catch(console.error).finally(() => prisma.$disconnect());

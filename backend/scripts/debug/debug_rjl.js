const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
async function main() {
  const assets = await prisma.bESSAsset.findMany();
  for (const asset of assets) {
    console.log('\nAsset:', asset.name);
    // Find device 'rjl'
    const rjl = await prisma.device.findUnique({ where: { bessAssetId_componentId: { bessAssetId: asset.id, componentId: 'rjl' } }});
    if (rjl) {
      const tel = await prisma.telemetryHistory.findFirst({
        where: { deviceId: rjl.id },
        orderBy: { timestamp: 'desc' }
      });
      if (tel && tel.rawPayload) {
        console.log('RJL keys:', Object.keys(tel.rawPayload));
        // print keys that contain 'u' or 'v'
        console.log('RJL voltage keys:', Object.keys(tel.rawPayload).filter(k => k.includes('u') || k.includes('v')));
      }
    }
  }
}
main().catch(console.error).finally(() => prisma.$disconnect());

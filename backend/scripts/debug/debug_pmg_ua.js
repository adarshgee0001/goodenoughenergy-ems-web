const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
async function main() {
  const asset = await prisma.bESSAsset.findUnique({ where: { emuId: '2410031073' }});
  const pmg = await prisma.device.findUnique({ where: { bessAssetId_componentId: { bessAssetId: asset.id, componentId: 'pmg' } }});
  const records = await prisma.telemetryHistory.findMany({
    where: { deviceId: pmg.id },
    orderBy: { timestamp: 'desc' },
    take: 3
  });
  for (const tel of records) {
    if (tel.rawPayload) {
      const ua = tel.rawPayload.find(s => s.m === 'ai_ua');
      console.log('Timestamp:', tel.timestamp, 'ua:', ua);
    }
  }
}
main().catch(console.error).finally(() => prisma.$disconnect());

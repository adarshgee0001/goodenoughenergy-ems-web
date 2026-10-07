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
      if (tel && tel.rawPayload) {
        console.log('PMG rawPayload:', Object.keys(tel.rawPayload).filter(k => k.includes('u') || k.includes('vol') || k === 'ai_ua' || k === 'ai_sum_p'));
        console.log('ai_ua in PMG?', tel.rawPayload.ai_ua);
      }
    }
    
    // Find device 'rjl'
    const rjl = await prisma.device.findUnique({ where: { bessAssetId_componentId: { bessAssetId: asset.id, componentId: 'rjl' } }});
    if (rjl) {
      const tel = await prisma.telemetryHistory.findFirst({
        where: { deviceId: rjl.id },
        orderBy: { timestamp: 'desc' }
      });
      if (tel && tel.rawPayload) {
        console.log('RJL rawPayload ai_ua:', tel.rawPayload.ai_ua);
      }
      if (tel) {
        console.log('RJL TelemetryHistory voltageA:', tel.voltageA);
      }
    }
  }
}
main().catch(console.error).finally(() => prisma.$disconnect());

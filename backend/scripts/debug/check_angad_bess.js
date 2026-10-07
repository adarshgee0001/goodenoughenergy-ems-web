const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function check() {
  try {
    const besses = await prisma.bESSAsset.findMany({
      include: {
        site: { include: { client: true } },
        devices: true,
        _count: { select: { telemetrySnapshots: true } }
      }
    });
    
    console.log("ALL BESS ASSETS:");
    for (const b of besses) {
      console.log(`BESS: ${b.name} (${b.id}) | Client: ${b.site.client.name}`);
      console.log(`emuId: ${b.emuId} | mqttTopic: ${b.mqttTopic}`);
      console.log(`Devices: ${b.devices.length}, Snapshots: ${b._count.telemetrySnapshots}`);
      
      const devicesWithCount = await prisma.device.findMany({
        where: { bessAssetId: b.id },
        include: { _count: { select: { telemetry: true } } }
      });
      console.log("Device telemetry counts:", JSON.stringify(devicesWithCount.map(d => ({ comp: d.componentId, telCount: d._count.telemetry }))));
      
      const latestTelemetry = await prisma.telemetryHistory.findFirst({
        where: { device: { bessAssetId: b.id } },
        orderBy: { timestamp: 'desc' }
      });
      console.log(`Latest telemetry: ${latestTelemetry ? latestTelemetry.timestamp : 'NONE'}`);
      console.log('---');
    }

  } catch(e) {
    console.error(e);
  } finally {
    await prisma.$disconnect();
  }
}
check();

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function check() {
  try {
    const assets = await prisma.bESSAsset.findMany();
    console.log("Assets:", assets.length);
    for (const a of assets) {
      console.log(` - ID: ${a.id}, Site: ${a.siteId}, EMU: ${a.emuId}`);
    }

    const rawHistory = await prisma.$queryRaw`SELECT "timestamp", "deviceId", "solarPower" FROM "TelemetryHistory" WHERE "solarPower" IS NOT NULL ORDER BY "timestamp" DESC LIMIT 10`;
    console.log("\nTelemetryHistory (Raw):", rawHistory);

    const snapshots = await prisma.telemetrySnapshot15m.findMany({
      where: { solarPower: { not: null } },
      take: 10,
      orderBy: { bucketTimestamp: 'desc' }
    });
    console.log("\nTelemetrySnapshot15m:", snapshots.map(s => ({ time: s.bucketTimestamp, asset: s.bessAssetId, solar: s.solarPower })));
  } catch(e) {
    console.error(e);
  } finally {
    await prisma.$disconnect();
  }
}
check();

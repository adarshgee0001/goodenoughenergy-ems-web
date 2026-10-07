import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  const earliest = await prisma.telemetryHistory.findFirst({ orderBy: { timestamp: 'asc' }, include: { device: { include: { bessAsset: { include: { site: { include: { client: true } } } } } } } });
  const latest = await prisma.telemetryHistory.findFirst({ orderBy: { timestamp: 'desc' }, include: { device: { include: { bessAsset: { include: { site: { include: { client: true } } } } } } } });
  const count = await prisma.telemetryHistory.count();

  console.log('Earliest:', earliest?.timestamp, earliest?.device.bessAsset.name);
  console.log('Latest:', latest?.timestamp, latest?.device.bessAsset.name);
  console.log('Count:', count);

  // Find Greater Noida Test Plant / StorEDGE 5.0 Test
  const testBess = await prisma.bESSAsset.findFirst({
    where: { assetIdentifier: 'STOREDGE5-TEST-001' }
  });

  if (testBess) {
      console.log('Found test BESS:', testBess.id);
      const bessCount = await prisma.telemetryHistory.count({ where: { device: { bessAssetId: testBess.id } } });
      console.log('Test BESS Telemetry count:', bessCount);
      
      const bessEarliest = await prisma.telemetryHistory.findFirst({ where: { device: { bessAssetId: testBess.id } }, orderBy: { timestamp: 'asc' } });
      const bessLatest = await prisma.telemetryHistory.findFirst({ where: { device: { bessAssetId: testBess.id } }, orderBy: { timestamp: 'desc' } });
      console.log('Test BESS Earliest:', bessEarliest?.timestamp);
      console.log('Test BESS Latest:', bessLatest?.timestamp);
  }
}

main().finally(() => prisma.$disconnect());

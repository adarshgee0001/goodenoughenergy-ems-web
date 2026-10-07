import { PrismaClient } from '@prisma/client';
import { telemetrySnapshotService } from './src/services/telemetry-snapshot.service';

const prisma = new PrismaClient();

async function runControlledTest() {
  console.log('--- Controlled Snapshot Test ---');

  // Find latest telemetry
  const latestRow = await prisma.telemetryHistory.findFirst({
    orderBy: { timestamp: 'desc' },
    include: { device: true }
  });

  if (!latestRow) {
    console.log('No telemetry found in DB.');
    return;
  }

  const bessId = latestRow.device.bessAssetId;
  console.log(`Using BESS: ${bessId}`);

  const windowEnd = latestRow.timestamp;
  // Let's take a 1-day window ending at the latest telemetry
  const windowStart = new Date(windowEnd.getTime() - 24 * 60 * 60 * 1000);

  console.log(`Window: ${windowStart.toISOString()} to ${windowEnd.toISOString()}`);

  const upsertCount = await telemetrySnapshotService.generateSnapshotsForWindow(bessId, windowStart, windowEnd);
  console.log(`Upserted ${upsertCount} snapshot buckets.`);

  const snapshots = await prisma.telemetrySnapshot15m.findMany({
    where: { bessAssetId: bessId },
    orderBy: { bucketTimestamp: 'desc' },
    take: 5
  });

  for (const s of snapshots) {
    console.log(`[${s.bucketTimestamp.toISOString()}] pcsActivePower=${s.pcsActivePower} gridSideLoad=${s.gridSideLoad} soc=${s.soc}`);
  }
}

runControlledTest().finally(() => prisma.$disconnect());

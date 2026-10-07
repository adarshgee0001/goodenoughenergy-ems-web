import { PrismaClient } from '@prisma/client';
import { telemetrySnapshotService } from '../../src/services/telemetry-snapshot.service';

const prisma = new PrismaClient();



if (process.env.NODE_ENV === "production" || process.env.DATABASE_URL?.includes("ems?schema")) {
  throw new Error("This script cannot run against a production environment.");
}

async function runFullBackfill() {
  console.log('--- Full Historical Backfill ---');

  const earliest = await prisma.telemetryHistory.findFirst({ orderBy: { timestamp: 'asc' } });
  const latest = await prisma.telemetryHistory.findFirst({ orderBy: { timestamp: 'desc' } });

  if (!earliest || !latest) {
    console.log('No data.');
    return;
  }

  console.log(`Available history: ${earliest.timestamp.toISOString()} to ${latest.timestamp.toISOString()}`);

  const besses = await prisma.bESSAsset.findMany();
  let totalSnapshotsGenerated = 0;

  for (const bess of besses) {
    console.log(`Processing BESS: ${bess.name} (${bess.id})`);
    
    // Find min and max for this BESS
    const bessEarliest = await prisma.telemetryHistory.findFirst({ where: { device: { bessAssetId: bess.id } }, orderBy: { timestamp: 'asc' } });
    const bessLatest = await prisma.telemetryHistory.findFirst({ where: { device: { bessAssetId: bess.id } }, orderBy: { timestamp: 'desc' } });
    
    if (!bessEarliest || !bessLatest) {
        console.log(`No telemetry for BESS: ${bess.name}`);
        continue;
    }

    let currentStart = new Date(bessEarliest.timestamp);
    currentStart.setUTCHours(0, 0, 0, 0); // start of day

    const absoluteEnd = new Date(bessLatest.timestamp);
    absoluteEnd.setUTCHours(23, 59, 59, 999);

    while (currentStart < absoluteEnd) {
      const currentEnd = new Date(currentStart.getTime() + 24 * 60 * 60 * 1000);
      
      const rawCount = await prisma.telemetryHistory.count({
        where: { device: { bessAssetId: bess.id }, timestamp: { gte: currentStart, lt: currentEnd } }
      });

      if (rawCount > 0) {
        process.stdout.write(`  Backfilling ${currentStart.toISOString().split('T')[0]} (raw rows: ${rawCount})... `);
        const upserts = await telemetrySnapshotService.generateSnapshotsForWindow(bess.id, currentStart, currentEnd);
        console.log(`Generated ${upserts} buckets.`);
        totalSnapshotsGenerated += upserts;
      }

      currentStart = currentEnd;
    }
  }

  console.log(`\nFull backfill complete. Total snapshots generated/upserted: ${totalSnapshotsGenerated}`);
}

runFullBackfill().finally(() => prisma.$disconnect());

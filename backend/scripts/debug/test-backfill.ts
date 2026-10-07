import { PrismaClient } from '@prisma/client';
import { telemetrySnapshotService } from '../../src/services/telemetry-snapshot.service';

const prisma = new PrismaClient();

async function runBackfillTest() {
  console.log('--- Controlled Backfill Test ---');

  const bessId = 'c4ed25cf-0758-4a2e-aae5-91712982a29a'; // StorEDGE 5.0 Test
  const startWindow = new Date('2026-09-13T12:00:00.000Z');
  const endWindow = new Date('2026-09-14T12:00:00.000Z');

  const rawCount = await prisma.telemetryHistory.count({
    where: {
      device: { bessAssetId: bessId },
      timestamp: { gte: startWindow, lt: endWindow }
    }
  });

  console.log(`Raw rows in window: ${rawCount}`);

  const snapshotsBefore = await prisma.telemetrySnapshot15m.count();

  // 1. Run backfill
  console.log('Running backfill...');
  await telemetrySnapshotService.generateSnapshotsForWindow(bessId, startWindow, endWindow);
  
  const snapshotsAfterFirstRun = await prisma.telemetrySnapshot15m.count();
  const generated = snapshotsAfterFirstRun - snapshotsBefore;
  console.log(`Generated snapshots: ${generated}`);

  // 2. Idempotency test
  console.log('Rerunning for idempotency...');
  await telemetrySnapshotService.generateSnapshotsForWindow(bessId, startWindow, endWindow);
  const snapshotsAfterSecondRun = await prisma.telemetrySnapshot15m.count();

  if (snapshotsAfterFirstRun === snapshotsAfterSecondRun) {
    console.log('✅ PASS: Idempotency confirmed.');
  } else {
    console.error(`❌ FAIL: Snapshots count changed from ${snapshotsAfterFirstRun} to ${snapshotsAfterSecondRun}`);
  }

  // 3. Raw vs Snapshot Validation
  console.log('--- Raw vs Snapshot Validation ---');
  // Get generated snapshots
  const snapshots = await prisma.telemetrySnapshot15m.findMany({
    where: { bessAssetId: bessId, bucketTimestamp: { gte: startWindow, lt: endWindow } },
    orderBy: { bucketTimestamp: 'asc' },
    take: 5
  });

  for (const s of snapshots) {
    const bucketStart = s.bucketTimestamp;
    const bucketEnd = new Date(bucketStart.getTime() + 15 * 60 * 1000);

    const rawRows = await prisma.telemetryHistory.findMany({
      where: {
        device: { bessAssetId: bessId },
        timestamp: { gte: bucketStart, lt: bucketEnd }
      },
      include: { device: true },
      orderBy: { timestamp: 'asc' }
    });

    // Calculate expected PCS active power
    const pcsRows = rawRows.filter(r => r.device.componentId === 'pcs' && r.pcsActivePower !== null);
    const expectedPcs = pcsRows.length > 0 ? pcsRows.reduce((sum, r) => sum + r.pcsActivePower!, 0) / pcsRows.length : null;

    // Calculate expected grid average
    const pmgRows = rawRows.filter(r => r.device.componentId === 'pmg' && r.gridSideLoad !== null);
    const expectedGrid = pmgRows.length > 0 ? pmgRows.reduce((sum, r) => sum + r.gridSideLoad!, 0) / pmgRows.length : null;

    // Calculate expected latest SOC
    const bmsRows = rawRows.filter(r => r.device.componentId === 'bcms' && r.soc !== null);
    const expectedSoc = bmsRows.length > 0 ? bmsRows[bmsRows.length - 1].soc : null;

    const matchPcs = expectedPcs === s.pcsActivePower;
    const matchGrid = expectedGrid === s.gridSideLoad;
    const matchSoc = expectedSoc === s.soc;

    const pass = matchPcs && matchGrid && matchSoc;

    console.log(`Bucket: ${bucketStart.toISOString()} | Raw records: ${rawRows.length} | Expected PCS: ${expectedPcs} | Snapshot PCS: ${s.pcsActivePower} | Expected Grid: ${expectedGrid} | Snapshot Grid: ${s.gridSideLoad} | Expected SOC: ${expectedSoc} | Snapshot SOC: ${s.soc} | Result: ${pass ? 'PASS' : 'FAIL'}`);
  }

  // 4. Fragmentation Verification
  console.log('--- Fragmentation Example ---');
  if (snapshots.length > 0) {
    const s = snapshots[0];
    const bucketStart = s.bucketTimestamp;
    const bucketEnd = new Date(bucketStart.getTime() + 15 * 60 * 1000);
    const rawRows = await prisma.telemetryHistory.findMany({
      where: {
        device: { bessAssetId: bessId },
        timestamp: { gte: bucketStart, lt: bucketEnd }
      },
      include: { device: true },
      orderBy: { timestamp: 'asc' }
    });

    rawRows.forEach(r => {
      console.log(`Raw: ${r.timestamp.toISOString()} -> ${r.device.componentId} (PCS: ${r.pcsActivePower}, PMG: ${r.gridSideLoad}, SOC: ${r.soc})`);
    });
    console.log(`Snapshot: ${s.bucketTimestamp.toISOString()} -> Consolidated (PCS: ${s.pcsActivePower}, PMG: ${s.gridSideLoad}, SOC: ${s.soc})`);
  }

}

runBackfillTest().finally(() => prisma.$disconnect());

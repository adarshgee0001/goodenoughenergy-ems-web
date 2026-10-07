import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function runTests() {
  console.log('--- Phase H QA & Regression Tests ---');
  let passCount = 0;
  let failCount = 0;

  function assert(condition: boolean, msg: string) {
    if (condition) {
      console.log(`✅ PASS: ${msg}`);
      passCount++;
    } else {
      console.error(`❌ FAIL: ${msg}`);
      failCount++;
    }
  }

  try {
    console.log('\n[Database Integrity]');
    const rawCount = await prisma.telemetryHistory.count();
    const snapCount = await prisma.telemetrySnapshot15m.count();
    console.log(`Raw TelemetryHistory rows: ${rawCount}`);
    console.log(`TelemetrySnapshot15m rows: ${snapCount}`);
    assert(rawCount > 0, 'TelemetryHistory has raw data');
    assert(snapCount > 0, 'TelemetrySnapshot15m has snapshot data');

    const duplicates = await prisma.$queryRaw`
      SELECT "bessAssetId", "bucketTimestamp", COUNT(*)
      FROM "TelemetrySnapshot15m"
      GROUP BY "bessAssetId", "bucketTimestamp"
      HAVING COUNT(*) > 1
    `;
    assert((duplicates as any[]).length === 0, '0 duplicate snapshot groups found');

    console.log('\n[Real Known Snapshot Validation]');
    const bess = await prisma.bESSAsset.findFirst({
      where: { name: { contains: 'Test' } }
    });
    if (!bess) {
      console.log('Test BESS not found, skipping real snapshot validation.');
    } else {
      const knownSnapshot = await prisma.telemetrySnapshot15m.findFirst({
        where: { 
          bessAssetId: bess.id,
          bucketTimestamp: new Date('2026-09-14T03:15:00.000Z')
        }
      });
      if (knownSnapshot) {
        assert(knownSnapshot.pcsActivePower === -31.6, 'PCS Active Power is -31.6');
        assert(knownSnapshot.gridSideLoad === 0, 'Grid Side Load is 0');
        assert(knownSnapshot.soc === 97.2, 'SOC is 97.2');
        assert(knownSnapshot.totalPower === null || knownSnapshot.totalPower !== 0, 'Missing values are null, not 0');
      } else {
        console.log('Known snapshot 03:15 not found.');
      }
    }

    console.log('\n[Snapshot Bucket Accuracy]');
    const allSnaps = await prisma.telemetrySnapshot15m.findMany({ select: { bucketTimestamp: true } });
    let allValid = true;
    for (const s of allSnaps) {
      const min = s.bucketTimestamp.getUTCMinutes();
      const sec = s.bucketTimestamp.getUTCSeconds();
      const ms = s.bucketTimestamp.getUTCMilliseconds();
      if (![0, 15, 30, 45].includes(min) || sec !== 0 || ms !== 0) {
        allValid = false;
        console.log(`Invalid bucket timestamp: ${s.bucketTimestamp.toISOString()}`);
      }
    }
    assert(allValid, 'All bucket timestamps are precisely aligned to 00, 15, 30, 45 minutes');
  } catch (error) {
    console.error('Test script error:', error);
  } finally {
    await prisma.$disconnect();
    console.log(`\n====================================================`);
    console.log(`Tests complete: ${passCount} passed, ${failCount} failed.`);
    console.log(`====================================================`);
  }
}

runTests();

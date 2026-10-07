// One-shot backfill: generates TelemetrySnapshot15m from existing TelemetryHistory
// Dev-only, runs against the configured DATABASE_URL
const { PrismaClient } = require('./node_modules/@prisma/client');

const prisma = new PrismaClient();

const avg = (values) => {
  const valid = values.filter(v => v !== null && v !== undefined);
  if (valid.length === 0) return null;
  return valid.reduce((a, b) => a + b, 0) / valid.length;
};

const max = (values) => {
  const valid = values.filter(v => v !== null && v !== undefined);
  if (valid.length === 0) return null;
  return Math.max(...valid);
};

const min = (values) => {
  const valid = values.filter(v => v !== null && v !== undefined);
  if (valid.length === 0) return null;
  return Math.min(...valid);
};

function getBucketStart(timestamp) {
  const ms = timestamp.getTime();
  const bucketMs = 15 * 60 * 1000;
  return new Date(Math.floor(ms / bucketMs) * bucketMs);
}

function aggregateBucket(bessAssetId, bucketStart, rows) {
  const meterRows = rows.filter(r => r.device.componentId === 'rjl' || r.device.componentId === 'jl');
  const pcsRows = rows.filter(r => r.device.componentId === 'pcs');
  const pmgRows = rows.filter(r => r.device.componentId === 'pmg');
  const bmsRows = rows.filter(r => r.device.componentId === 'bcms');

  const latestValid = (componentRows, field) => {
    for (let i = componentRows.length - 1; i >= 0; i--) {
      const val = componentRows[i][field];
      if (val !== null && val !== undefined) return val;
    }
    return null;
  };

  return {
    bessAssetId,
    bucketTimestamp: bucketStart,
    voltageA: avg(meterRows.map(r => r.voltageA)),
    voltageB: avg(meterRows.map(r => r.voltageB)),
    voltageC: avg(meterRows.map(r => r.voltageC)),
    currentA: avg(meterRows.map(r => r.currentA)),
    currentB: avg(meterRows.map(r => r.currentB)),
    currentC: avg(meterRows.map(r => r.currentC)),
    totalPower: avg(meterRows.map(r => r.totalPower)),
    pcsActivePower: avg(pcsRows.map(r => r.pcsActivePower)),
    dcVoltage: avg(pcsRows.map(r => r.dcVoltage)),
    ambientTemp: avg(pcsRows.map(r => r.ambientTemp)),
    todayChargeEnergy: latestValid(pcsRows, 'todayChargeEnergy'),
    todayDischargeEnergy: latestValid(pcsRows, 'todayDischargeEnergy'),
    accumChargeEnergy: latestValid(pcsRows, 'accumChargeEnergy'),
    accumDischargeEnergy: latestValid(pcsRows, 'accumDischargeEnergy'),
    soc: latestValid(bmsRows, 'soc'),
    soh: latestValid(bmsRows, 'soh'),
    bmsCurrent: avg(bmsRows.map(r => r.bmsCurrent)),
    cellVMax: max(bmsRows.map(r => r.cellVMax)),
    cellVMin: min(bmsRows.map(r => r.cellVMin)),
    cellTempMax: max(bmsRows.map(r => r.cellTempMax)),
    gridSideLoad: avg(pmgRows.map(r => r.gridSideLoad)),
  };
}

async function main() {
  console.log('--- One-shot Snapshot Backfill ---');

  const earliest = await prisma.telemetryHistory.findFirst({ orderBy: { timestamp: 'asc' } });
  const latest = await prisma.telemetryHistory.findFirst({ orderBy: { timestamp: 'desc' } });

  if (!earliest || !latest) {
    console.log('No TelemetryHistory data found. Nothing to backfill.');
    return;
  }

  console.log(`History range: ${earliest.timestamp.toISOString()} to ${latest.timestamp.toISOString()}`);

  const besses = await prisma.bESSAsset.findMany();
  let totalGenerated = 0;

  for (const bess of besses) {
    console.log(`\nProcessing BESS: ${bess.name} (${bess.id})`);

    const bessEarliest = await prisma.telemetryHistory.findFirst({
      where: { device: { bessAssetId: bess.id } },
      orderBy: { timestamp: 'asc' }
    });
    const bessLatest = await prisma.telemetryHistory.findFirst({
      where: { device: { bessAssetId: bess.id } },
      orderBy: { timestamp: 'desc' }
    });

    if (!bessEarliest || !bessLatest) {
      console.log(`  No history for this BESS. Skipping.`);
      continue;
    }

    let currentStart = new Date(bessEarliest.timestamp);
    currentStart.setUTCHours(0, 0, 0, 0);

    const absoluteEnd = new Date(bessLatest.timestamp);
    absoluteEnd.setUTCHours(23, 59, 59, 999);

    while (currentStart < absoluteEnd) {
      const currentEnd = new Date(currentStart.getTime() + 24 * 60 * 60 * 1000);

      const rawCount = await prisma.telemetryHistory.count({
        where: { device: { bessAssetId: bess.id }, timestamp: { gte: currentStart, lt: currentEnd } }
      });

      if (rawCount > 0) {
        const dateStr = currentStart.toISOString().split('T')[0];
        process.stdout.write(`  Day ${dateStr} (${rawCount} rows)... `);

        // Fetch rows for this day
        const rows = await prisma.telemetryHistory.findMany({
          where: { device: { bessAssetId: bess.id }, timestamp: { gte: currentStart, lt: currentEnd } },
          include: { device: { select: { componentId: true, type: true } } },
          orderBy: { timestamp: 'asc' }
        });

        // Group by 15m bucket
        const buckets = new Map();
        for (const row of rows) {
          const bt = getBucketStart(row.timestamp).getTime();
          if (!buckets.has(bt)) buckets.set(bt, []);
          buckets.get(bt).push(row);
        }

        // Upsert each bucket
        for (const [bucketTime, bucketRows] of buckets.entries()) {
          const bucketStart = new Date(bucketTime);
          const snapshot = aggregateBucket(bess.id, bucketStart, bucketRows);
          await prisma.telemetrySnapshot15m.upsert({
            where: { bessAssetId_bucketTimestamp: { bessAssetId: bess.id, bucketTimestamp: bucketStart } },
            create: snapshot,
            update: {
              voltageA: snapshot.voltageA, voltageB: snapshot.voltageB, voltageC: snapshot.voltageC,
              currentA: snapshot.currentA, currentB: snapshot.currentB, currentC: snapshot.currentC,
              totalPower: snapshot.totalPower, pcsActivePower: snapshot.pcsActivePower,
              dcVoltage: snapshot.dcVoltage, ambientTemp: snapshot.ambientTemp,
              todayChargeEnergy: snapshot.todayChargeEnergy, todayDischargeEnergy: snapshot.todayDischargeEnergy,
              accumChargeEnergy: snapshot.accumChargeEnergy, accumDischargeEnergy: snapshot.accumDischargeEnergy,
              soc: snapshot.soc, soh: snapshot.soh, bmsCurrent: snapshot.bmsCurrent,
              cellVMax: snapshot.cellVMax, cellVMin: snapshot.cellVMin, cellTempMax: snapshot.cellTempMax,
              gridSideLoad: snapshot.gridSideLoad,
            }
          });
          totalGenerated++;
        }
        console.log(`${buckets.size} buckets.`);
      }

      currentStart = currentEnd;
    }
  }

  console.log(`\nBackfill complete. Total snapshot buckets upserted: ${totalGenerated}`);
}

main().catch(console.error).finally(() => prisma.$disconnect());

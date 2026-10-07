import { PrismaClient, TelemetryHistory, Prisma } from '@prisma/client';

const prisma = new PrismaClient();

// Aggregation helpers
const avg = (values: (number | null)[]) => {
  const valid = values.filter((v) => v !== null && v !== undefined) as number[];
  if (valid.length === 0) return null;
  const sum = valid.reduce((acc, val) => acc + val, 0);
  return sum / valid.length;
};

const max = (values: (number | null)[]) => {
  const valid = values.filter((v) => v !== null && v !== undefined) as number[];
  if (valid.length === 0) return null;
  return Math.max(...valid);
};

const min = (values: (number | null)[]) => {
  const valid = values.filter((v) => v !== null && v !== undefined) as number[];
  if (valid.length === 0) return null;
  return Math.min(...valid);
};

export class TelemetrySnapshotService {
  /**
   * Calculates the 15-minute bucket start time in UTC.
   */
  public getBucketStart(timestamp: Date): Date {
    const ms = timestamp.getTime();
    const bucketMs = 15 * 60 * 1000; // 15 minutes
    return new Date(Math.floor(ms / bucketMs) * bucketMs);
  }

  /**
   * Generates and upserts snapshots for a specific BESS asset within a specific time window.
   * This is idempotent.
   */
  public async generateSnapshotsForWindow(bessAssetId: string, windowStart: Date, windowEnd: Date) {
    // 1. Align window to bucket boundaries to ensure complete buckets
    const startBucket = this.getBucketStart(windowStart);
    // Ensure we fetch up to the end of the last requested bucket
    const endMs = windowEnd.getTime();
    const endBucket = new Date(Math.ceil(endMs / (15 * 60 * 1000)) * (15 * 60 * 1000));

    // 2. Fetch raw telemetry
    const rows = await prisma.telemetryHistory.findMany({
      where: {
        timestamp: { gte: startBucket, lt: endBucket },
        device: { bessAssetId }
      },
      include: {
        device: { select: { componentId: true, type: true } }
      },
      orderBy: { timestamp: 'asc' }
    });

    if (rows.length === 0) return 0;

    // 3. Group by bucket
    const buckets = new Map<number, (TelemetryHistory & { device: { componentId: string | null } })[]>();
    for (const row of rows) {
      const bucketTime = this.getBucketStart(row.timestamp).getTime();
      if (!buckets.has(bucketTime)) buckets.set(bucketTime, []);
      buckets.get(bucketTime)!.push(row);
    }

    // 4. Aggregate and upsert each bucket
    let upsertCount = 0;
    for (const [bucketTime, bucketRows] of buckets.entries()) {
      const bucketStart = new Date(bucketTime);
      const snapshot = this.aggregateBucket(bessAssetId, bucketStart, bucketRows);
      
      // Upsert
      await prisma.telemetrySnapshot15m.upsert({
        where: {
          bessAssetId_bucketTimestamp: {
            bessAssetId,
            bucketTimestamp: bucketStart
          }
        },
        create: snapshot,
        update: {
          // Avoid overwriting createdAt, etc.
          voltageA: snapshot.voltageA,
          voltageB: snapshot.voltageB,
          voltageC: snapshot.voltageC,
          currentA: snapshot.currentA,
          currentB: snapshot.currentB,
          currentC: snapshot.currentC,
          totalPower: snapshot.totalPower,
          pcsActivePower: snapshot.pcsActivePower,
          dcVoltage: snapshot.dcVoltage,
          ambientTemp: snapshot.ambientTemp,
          todayChargeEnergy: snapshot.todayChargeEnergy,
          todayDischargeEnergy: snapshot.todayDischargeEnergy,
          accumChargeEnergy: snapshot.accumChargeEnergy,
          accumDischargeEnergy: snapshot.accumDischargeEnergy,
          soc: snapshot.soc,
          soh: snapshot.soh,
          bmsCurrent: snapshot.bmsCurrent,
          cellVMax: snapshot.cellVMax,
          cellVMin: snapshot.cellVMin,
          cellTempMax: snapshot.cellTempMax,
          gridSideLoad: snapshot.gridSideLoad,
          solarPower: (snapshot as any).solarPower,
          solarFrequency: (snapshot as any).solarFrequency,
          solarPowerFactor: (snapshot as any).solarPowerFactor,
          powerFactor: snapshot.powerFactor,
          bessFrequency: (snapshot as any).bessFrequency,
          bessPowerFactor: (snapshot as any).bessPowerFactor,
        }
      });
      upsertCount++;
    }

    return upsertCount;
  }

  private aggregateBucket(bessAssetId: string, bucketStart: Date, rows: (TelemetryHistory & { device: { componentId: string | null } })[]) {
    // Split rows by verified component sources
    const meterRows = rows.filter(r => r.device.componentId === 'rjl' || r.device.componentId === 'jl');
    const pcsRows = rows.filter(r => r.device.componentId === 'pcs');
    const pmgRows = rows.filter(r => r.device.componentId === 'pmg');
    const bmsRows = rows.filter(r => r.device.componentId === 'bcms');
    const pinvRows = rows.filter(r => r.device.componentId === 'pinv');

    // Helper for "latest valid"
    const latestValid = (componentRows: TelemetryHistory[], field: keyof TelemetryHistory) => {
      // rows are already sorted asc by timestamp
      for (let i = componentRows.length - 1; i >= 0; i--) {
        const val = componentRows[i][field];
        if (val !== null && val !== undefined) return val as number;
      }
      return null;
    };

    return {
      bessAssetId,
      bucketTimestamp: bucketStart,
      
      // Meter (average)
      voltageA: avg(meterRows.map(r => r.voltageA)),
      voltageB: avg(meterRows.map(r => r.voltageB)),
      voltageC: avg(meterRows.map(r => r.voltageC)),
      currentA: avg(meterRows.map(r => r.currentA)),
      currentB: avg(meterRows.map(r => r.currentB)),
      currentC: avg(meterRows.map(r => r.currentC)),
      totalPower: avg(meterRows.map(r => r.totalPower)),
      bessFrequency: avg(meterRows.map(r => (r as any).bessFrequency ?? null)),
      bessPowerFactor: avg(meterRows.map(r => (r as any).bessPowerFactor ?? null)),

      // PCS
      pcsActivePower: avg(pcsRows.map(r => r.pcsActivePower)),
      dcVoltage: avg(pcsRows.map(r => r.dcVoltage)),
      ambientTemp: avg(pcsRows.map(r => r.ambientTemp)),
      todayChargeEnergy: latestValid(pcsRows, 'todayChargeEnergy'),
      todayDischargeEnergy: latestValid(pcsRows, 'todayDischargeEnergy'),
      accumChargeEnergy: latestValid(pcsRows, 'accumChargeEnergy'),
      accumDischargeEnergy: latestValid(pcsRows, 'accumDischargeEnergy'),

      // BMS
      soc: latestValid(bmsRows, 'soc'),
      soh: latestValid(bmsRows, 'soh'),
      bmsCurrent: avg(bmsRows.map(r => r.bmsCurrent)),
      cellVMax: max(bmsRows.map(r => r.cellVMax)),
      cellVMin: min(bmsRows.map(r => r.cellVMin)),
      cellTempMax: max(bmsRows.map(r => r.cellTempMax)),

      // Grid
      gridSideLoad: avg(pmgRows.map(r => r.gridSideLoad)),
      powerFactor: avg(pmgRows.map(r => (r as any).powerFactor ?? null)),

      // Solar PV Inverter (pinv) — average of samples within bucket
      solarPower: avg(pinvRows.map(r => (r as any).solarPower ?? null)),
      solarFrequency: avg(pinvRows.map(r => (r as any).solarFrequency ?? null)),
      solarPowerFactor: avg(pinvRows.map(r => (r as any).solarPowerFactor ?? null)),
    };
  }
}

export const telemetrySnapshotService = new TelemetrySnapshotService();

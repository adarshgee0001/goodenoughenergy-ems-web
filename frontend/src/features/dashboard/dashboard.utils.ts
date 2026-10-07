import type { HistoricalTelemetryRow, PowerTrendPoint } from './dashboard.types';

/**
 * Consolidates fragmented historical telemetry rows (which have separate grid and bess readings
 * due to separate device rows) into unified chart points.
 * Groups points by a time window (e.g. 1 minute) so Recharts can draw connected lines.
 */
export function consolidatePowerTrendData(
  rows: HistoricalTelemetryRow[], 
  bucketMs: number = 60000
): PowerTrendPoint[] {
  if (!rows || rows.length === 0) return [];

  const buckets = new Map<number, PowerTrendPoint & { socSum: number; socCount: number }>();

  for (const row of rows) {
    const ts = new Date(row.timestamp).getTime();
    // Group into logical time windows (default 1 minute)
    const bucketTs = Math.floor(ts / bucketMs) * bucketMs;

    let bucket = buckets.get(bucketTs);
    if (!bucket) {
      bucket = { timestamp: bucketTs, grid: undefined, bess: undefined, solar: undefined, socSum: 0, socCount: 0 };
      buckets.set(bucketTs, bucket);
    }

    if (row.gridSideLoad !== null && row.gridSideLoad !== undefined) {
      bucket.grid = row.gridSideLoad;
    }
    if (row.pcsActivePower !== null && row.pcsActivePower !== undefined) {
      bucket.bess = (bucket.bess ?? 0) + row.pcsActivePower;
    }
    // Solar: use the latest non-null value within the bucket (point-in-time, not a sum)
    if (row.solarPower !== null && row.solarPower !== undefined) {
      bucket.solar = row.solarPower;
    }
    if (typeof row.soc === 'number' && Number.isFinite(row.soc)) {
      bucket.socSum += row.soc;
      bucket.socCount += 1;
    }
  }

  // Sort chronologically
  return Array.from(buckets.values()).map(b => {
    if (b.socCount > 0) {
      b.soc = b.socSum / b.socCount;
    }
    const { socSum, socCount, ...point } = b;
    return point;
  }).sort((a, b) => a.timestamp - b.timestamp);
}

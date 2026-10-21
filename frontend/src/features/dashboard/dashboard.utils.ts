import type { HistoricalTelemetryRow, PowerTrendPoint, DashboardDevice } from './dashboard.types';

export interface ConsolidatePowerTrendOptions {
  bucketMs?: number;
  devices?: DashboardDevice[];
  selectedBessId?: string | null;
}

export interface LiveTrendBucket {
  timestamp: number;
  grid?: number;
  solar?: number;
  bess: Record<string, { power?: number; soc?: number }>;
}

/**
 * Resolves a single live bucket point into a PowerTrendPoint respecting the BESS selector.
 * - All BESS (selectedBessId === null): sum power, average SOC across reporting assets.
 * - Individual BESS (selectedBessId !== null): selected asset only.
 * - Grid and Solar remain site-level in all modes.
 */
export function resolveLivePoint(
  bucket: LiveTrendBucket,
  selectedBessId: string | null
): PowerTrendPoint {
  let bess: number | undefined;
  let soc: number | undefined;
  let bessCharge: number | undefined;
  let bessDischarge: number | undefined;

  if (selectedBessId !== null) {
    const asset = bucket.bess[selectedBessId];
    const hasPower = asset?.power !== undefined && Number.isFinite(asset.power);
    bess = hasPower ? asset.power : undefined;
    soc = asset?.soc !== undefined && Number.isFinite(asset.soc) ? asset.soc : undefined;
    if (hasPower) {
      bessCharge = asset.power! > 0 ? asset.power : 0;
      bessDischarge = asset.power! < 0 ? asset.power : 0;
    }
  } else {
    let powerSum = 0;
    let powerCount = 0;
    let chargeSum = 0;
    let dischargeSum = 0;
    let socSum = 0;
    let socCount = 0;

    for (const asset of Object.values(bucket.bess)) {
      if (asset.power !== undefined && Number.isFinite(asset.power)) {
        powerSum += asset.power;
        if (asset.power > 0) chargeSum += asset.power;
        if (asset.power < 0) dischargeSum += asset.power;
        powerCount++;
      }
      if (asset.soc !== undefined && Number.isFinite(asset.soc)) {
        socSum += asset.soc;
        socCount++;
      }
    }

    bess = powerCount > 0 ? powerSum : undefined;
    soc = socCount > 0 ? socSum / socCount : undefined;
    if (powerCount > 0) {
      bessCharge = chargeSum;
      bessDischarge = dischargeSum;
    }
  }

  return {
    timestamp: bucket.timestamp,
    grid: bucket.grid !== undefined && Number.isFinite(bucket.grid) ? bucket.grid : undefined,
    solar: bucket.solar !== undefined && Number.isFinite(bucket.solar) ? bucket.solar : undefined,
    bess,
    soc,
    bessCharge,
    bessDischarge,
  };
}

interface BucketAssetReadings {
  latestPower?: number;
  latestPowerTs?: number;
  latestSoc?: number;
  latestSocTs?: number;
}

interface BucketData {
  timestamp: number;
  latestGrid?: number;
  latestGridTs?: number;
  latestSolar?: number;
  latestSolarTs?: number;
  assets: Map<string, BucketAssetReadings>;
}

/**
 * Consolidates fragmented historical telemetry rows into unified chart points.
 * 
 * Rules:
 * - 1-minute time windows (default bucketMs = 60000).
 * - Per-BESS separate latest readings for PCS active power and SOC, tracked with independent timestamps.
 * - All BESS mode: BESS Power = algebraic sum across unique reporting BESS assets; BESS SOC = arithmetic average across reporting BESS assets.
 * - Individual BESS mode: selected BESS only; other BESS assets do not contribute.
 * - Grid Power and Solar Power remain strictly site-level across all selector choices.
 * - Preserves legitimate 0 values, treats missing/non-finite values as gaps (undefined).
 * - Out-of-order rows resolved by timestamp.
 */
export function consolidatePowerTrendData(
  rows: HistoricalTelemetryRow[],
  options?: number | ConsolidatePowerTrendOptions | DashboardDevice[],
  legacySelectedBessId?: string | null
): PowerTrendPoint[] {
  if (!rows || rows.length === 0) return [];

  let bucketMs = 60000;
  let devices: DashboardDevice[] | undefined;
  let selectedBessId: string | null = null;

  if (typeof options === 'number') {
    bucketMs = options;
    selectedBessId = legacySelectedBessId ?? null;
  } else if (Array.isArray(options)) {
    devices = options;
    selectedBessId = legacySelectedBessId ?? null;
  } else if (typeof options === 'object' && options !== null) {
    bucketMs = options.bucketMs ?? 60000;
    devices = options.devices;
    selectedBessId = options.selectedBessId !== undefined ? options.selectedBessId : (legacySelectedBessId ?? null);
  }

  const deviceToBessMap = new Map<string, string>();
  if (devices && Array.isArray(devices)) {
    for (const dev of devices) {
      if (dev.id && dev.bessAssetId) {
        deviceToBessMap.set(dev.id, dev.bessAssetId);
      }
    }
  }

  const resolveBessAssetId = (row: HistoricalTelemetryRow): string | undefined => {
    // 1. Direct field on row or row.device
    if (row.device?.bessAssetId) return row.device.bessAssetId;
    if (row.bessAssetId) return row.bessAssetId;
    if ((row as any).bessAssetId) return (row as any).bessAssetId;

    // 2. Lookup via deviceId in deviceToBessMap
    if (row.deviceId && deviceToBessMap.has(row.deviceId)) {
      return deviceToBessMap.get(row.deviceId);
    }

    // 3. Fallback: If only 1 BESS asset is represented across devices, map to it
    if (devices && devices.length > 0) {
      const uniqueBessIds = Array.from(new Set(devices.map(d => d.bessAssetId).filter(Boolean)));
      if (uniqueBessIds.length === 1) {
        return uniqueBessIds[0] as string;
      }
    }

    // 4. Default for standalone or single-BESS tests without device metadata
    return row.deviceId || 'default';
  };

  const buckets = new Map<number, BucketData>();

  for (const row of rows) {
    const rowTs = new Date(row.timestamp).getTime();
    if (Number.isNaN(rowTs)) continue;

    const bucketTs = Math.floor(rowTs / bucketMs) * bucketMs;

    let bucket = buckets.get(bucketTs);
    if (!bucket) {
      bucket = {
        timestamp: bucketTs,
        latestGrid: undefined,
        latestGridTs: undefined,
        latestSolar: undefined,
        latestSolarTs: undefined,
        assets: new Map<string, BucketAssetReadings>(),
      };
      buckets.set(bucketTs, bucket);
    }

    // 1. Site-level Grid Power: latest valid reading by timestamp
    if (
      row.gridSideLoad !== null &&
      row.gridSideLoad !== undefined &&
      typeof row.gridSideLoad === 'number' &&
      Number.isFinite(row.gridSideLoad)
    ) {
      if (bucket.latestGridTs === undefined || rowTs >= bucket.latestGridTs) {
        bucket.latestGrid = row.gridSideLoad;
        bucket.latestGridTs = rowTs;
      }
    }

    // 2. Site-level Solar Power: latest valid reading by timestamp
    if (
      row.solarPower !== null &&
      row.solarPower !== undefined &&
      typeof row.solarPower === 'number' &&
      Number.isFinite(row.solarPower)
    ) {
      if (bucket.latestSolarTs === undefined || rowTs >= bucket.latestSolarTs) {
        bucket.latestSolar = row.solarPower;
        bucket.latestSolarTs = rowTs;
      }
    }

    // 3. BESS readings: PCS Active Power and SOC
    const hasPcsPower =
      row.pcsActivePower !== null &&
      row.pcsActivePower !== undefined &&
      typeof row.pcsActivePower === 'number' &&
      Number.isFinite(row.pcsActivePower);

    const hasSoc =
      row.soc !== null &&
      row.soc !== undefined &&
      typeof row.soc === 'number' &&
      Number.isFinite(row.soc);

    if (hasPcsPower || hasSoc) {
      const assetId = resolveBessAssetId(row);
      if (assetId) {
        let assetData = bucket.assets.get(assetId);
        if (!assetData) {
          assetData = {};
          bucket.assets.set(assetId, assetData);
        }

        // Independent latest timestamp tracking for PCS Active Power
        if (hasPcsPower) {
          if (assetData.latestPowerTs === undefined || rowTs >= assetData.latestPowerTs) {
            assetData.latestPower = row.pcsActivePower!;
            assetData.latestPowerTs = rowTs;
          }
        }

        // Independent latest timestamp tracking for SOC
        if (hasSoc) {
          if (assetData.latestSocTs === undefined || rowTs >= assetData.latestSocTs) {
            assetData.latestSoc = row.soc!;
            assetData.latestSocTs = rowTs;
          }
        }
      }
    }
  }

  // Convert buckets to sorted PowerTrendPoint[]
  const points: PowerTrendPoint[] = [];

  for (const bucket of buckets.values()) {
    let bess: number | undefined;
    let soc: number | undefined;
    let bessCharge: number | undefined;
    let bessDischarge: number | undefined;

    if (selectedBessId !== null) {
      // Individual BESS mode: strictly the selected asset
      const assetData = bucket.assets.get(selectedBessId);
      const hasPower = assetData?.latestPower !== undefined && Number.isFinite(assetData.latestPower);
      bess = hasPower ? assetData!.latestPower : undefined;
      soc = assetData?.latestSoc !== undefined && Number.isFinite(assetData.latestSoc)
        ? assetData!.latestSoc
        : undefined;
      if (hasPower) {
        bessCharge = assetData!.latestPower! > 0 ? assetData!.latestPower : 0;
        bessDischarge = assetData!.latestPower! < 0 ? assetData!.latestPower : 0;
      }
    } else {
      // All BESS mode:
      // BESS Power = algebraic sum of latest valid PCS reading for each unique asset represented
      // BESS SOC = arithmetic average of latest valid SOC reading for each unique reporting asset
      // Total Charge = sum of positive readings from each unique reporting BESS asset
      // Total Discharge = sum of negative readings from each unique reporting BESS asset (negative sign convention)
      let powerSum = 0;
      let powerCount = 0;
      let chargeSum = 0;
      let dischargeSum = 0;
      let socSum = 0;
      let socCount = 0;

      for (const assetData of bucket.assets.values()) {
        if (assetData.latestPower !== undefined && Number.isFinite(assetData.latestPower)) {
          powerSum += assetData.latestPower;
          if (assetData.latestPower > 0) chargeSum += assetData.latestPower;
          if (assetData.latestPower < 0) dischargeSum += assetData.latestPower;
          powerCount++;
        }
        if (assetData.latestSoc !== undefined && Number.isFinite(assetData.latestSoc)) {
          socSum += assetData.latestSoc;
          socCount++;
        }
      }

      bess = powerCount > 0 ? powerSum : undefined;
      soc = socCount > 0 ? socSum / socCount : undefined;
      if (powerCount > 0) {
        bessCharge = chargeSum;
        bessDischarge = dischargeSum;
      }
    }

    points.push({
      timestamp: bucket.timestamp,
      grid: bucket.latestGrid,
      solar: bucket.latestSolar,
      bess,
      soc,
      bessCharge,
      bessDischarge,
    });
  }

  return points.sort((a, b) => a.timestamp - b.timestamp);
}

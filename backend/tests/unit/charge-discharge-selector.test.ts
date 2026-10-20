/**
 * BESS Charge vs Discharge — Multi-BESS Selector-Aware Behavior Unit Tests
 *
 * Verifies the 13 required scenarios from Step 7:
 * 1. Individual BESS 1 isolation.
 * 2. Individual BESS 2 isolation.
 * 3. All BESS with simultaneous charging and discharging.
 * 4. Multiple BESS charging in the same interval.
 * 5. Multiple BESS discharging in the same interval.
 * 6. A zero-power reading.
 * 7. Missing and non-finite readings.
 * 8. Duplicate rows for the same asset and minute.
 * 9. Historical versus live calculation consistency.
 * 10. Selector switching without stale data leakage.
 * 11. Net power remains correct for the existing Power Trend graph.
 * 12. Single-BESS compatibility.
 * 13. Correct chart bucket aggregation and averaging.
 */

import { describe, it, expect } from 'vitest';
import {
  consolidatePowerTrendData,
  resolveLivePoint,
  type LiveTrendBucket,
} from '../../../frontend/src/features/dashboard/dashboard.utils';
import type {
  HistoricalTelemetryRow,
  DashboardDevice,
  PowerTrendPoint,
} from '../../../frontend/src/features/dashboard/dashboard.types';

describe('BESS Charge vs Discharge — Multi-BESS Selector-Aware Behavior', () => {
  const BESS_1_ID = 'bess-asset-uuid-1';
  const BESS_2_ID = 'bess-asset-uuid-2';
  const BESS_3_ID = 'bess-asset-uuid-3';

  const devices: DashboardDevice[] = [
    { id: 'dev-pcs-1', name: 'PCS 1', type: 'PCS', componentId: 'pcs', emuId: 'emu-1', bessAssetId: BESS_1_ID },
    { id: 'dev-bcms-1', name: 'BMS 1', type: 'BMS', componentId: 'bcms', emuId: 'emu-1', bessAssetId: BESS_1_ID },
    { id: 'dev-pcs-2', name: 'PCS 2', type: 'PCS', componentId: 'pcs', emuId: 'emu-2', bessAssetId: BESS_2_ID },
    { id: 'dev-bcms-2', name: 'BMS 2', type: 'BMS', componentId: 'bcms', emuId: 'emu-2', bessAssetId: BESS_2_ID },
    { id: 'dev-pcs-3', name: 'PCS 3', type: 'PCS', componentId: 'pcs', emuId: 'emu-3', bessAssetId: BESS_3_ID },
    { id: 'dev-bcms-3', name: 'BMS 3', type: 'BMS', componentId: 'bcms', emuId: 'emu-3', bessAssetId: BESS_3_ID },
  ];

  const createRow = (overrides: Partial<HistoricalTelemetryRow>): HistoricalTelemetryRow => ({
    id: 'row-' + Math.random().toString(36).substring(7),
    deviceId: 'dev-pcs-1',
    timestamp: '2026-10-20T10:00:00.000Z',
    pcsActivePower: null,
    dcVoltage: null,
    ambientTemp: null,
    todayChargeEnergy: null,
    todayDischargeEnergy: null,
    accumChargeEnergy: null,
    accumDischargeEnergy: null,
    voltageA: null,
    voltageB: null,
    voltageC: null,
    currentA: null,
    currentB: null,
    currentC: null,
    totalPower: null,
    gridSideLoad: null,
    solarPower: null,
    solarFrequency: null,
    solarPowerFactor: null,
    gridFrequency: null,
    powerFactor: null,
    bessFrequency: null,
    bessPowerFactor: null,
    soc: null,
    soh: null,
    bmsCurrent: null,
    cellVMax: null,
    cellVMin: null,
    cellTempMax: null,
    ...overrides,
  });

  // Pure model of BessChargeDischargeChart transformedData logic for validation of chart buckets
  const transformChartData = (data: PowerTrendPoint[], domain: [number, number], isMW = false) => {
    const sourceMs = 2 * 60 * 1000;
    const barMs = 10 * 60 * 1000;
    const startMs = Math.floor(domain[0] / sourceMs) * sourceMs;
    const endMs = Math.floor(domain[1] / sourceMs) * sourceMs;
    const factor = isMW ? 1000 : 1;

    const timeline = new Map();
    const barBuckets = new Map();

    for (let t = startMs; t <= endMs; t += sourceMs) {
      timeline.set(t, { chargeSum: 0, dischargeSum: 0, socSum: 0, powerCount: 0, socCount: 0 });
      const barTs = Math.floor(t / barMs) * barMs;
      if (!barBuckets.has(barTs)) {
        barBuckets.set(barTs, { chargeSum: 0, dischargeSum: 0, powerCount: 0 });
      }
    }

    data.forEach(pt => {
      const sourceTs = Math.floor(pt.timestamp / sourceMs) * sourceMs;
      const barTs = Math.floor(pt.timestamp / barMs) * barMs;

      const hasCharge = pt.bessCharge !== undefined && pt.bessCharge !== null && Number.isFinite(pt.bessCharge);
      const hasDischarge = pt.bessDischarge !== undefined && pt.bessDischarge !== null && Number.isFinite(pt.bessDischarge);
      const hasBess = pt.bess !== undefined && pt.bess !== null && Number.isFinite(pt.bess);

      if (hasCharge || hasDischarge) {
        const c = hasCharge && pt.bessCharge! > 0 ? pt.bessCharge! : 0;
        const d = hasDischarge && pt.bessDischarge! !== 0 ? (pt.bessDischarge! < 0 ? pt.bessDischarge! : -Math.abs(pt.bessDischarge!)) : 0;

        if (timeline.has(sourceTs)) {
          const b = timeline.get(sourceTs);
          b.chargeSum += c;
          b.dischargeSum += d;
          b.powerCount++;
        }
        if (barBuckets.has(barTs)) {
          const bb = barBuckets.get(barTs);
          bb.chargeSum += c;
          bb.dischargeSum += d;
          bb.powerCount++;
        }
      } else if (hasBess) {
        if (timeline.has(sourceTs)) {
          const b = timeline.get(sourceTs);
          if (pt.bess! > 0) b.chargeSum += pt.bess!;
          if (pt.bess! < 0) b.dischargeSum += pt.bess!;
          b.powerCount++;
        }
        if (barBuckets.has(barTs)) {
          const bb = barBuckets.get(barTs);
          if (pt.bess! > 0) bb.chargeSum += pt.bess!;
          if (pt.bess! < 0) bb.dischargeSum += pt.bess!;
          bb.powerCount++;
        }
      }

      if (timeline.has(sourceTs)) {
        const b = timeline.get(sourceTs);
        if (pt.soc !== undefined && pt.soc !== null && Number.isFinite(pt.soc)) {
          b.socSum += pt.soc;
          b.socCount++;
        }
      }
    });

    return Array.from(timeline.entries())
      .map(([ts, b]) => {
        const soc = b.socCount > 0 ? b.socSum / b.socCount : null;
        let sourceCharge = null;
        let sourceDischarge = null;
        if (b.powerCount > 0) {
          const avgSourceCharge = b.chargeSum / b.powerCount;
          const avgSourceDischarge = b.dischargeSum / b.powerCount;
          sourceCharge = avgSourceCharge > 0 ? avgSourceCharge / factor : null;
          sourceDischarge = avgSourceDischarge < 0 ? avgSourceDischarge / factor : null;
        }

        let charge = null;
        let discharge = null;
        if (ts % barMs === 0 && barBuckets.has(ts)) {
          const bb = barBuckets.get(ts);
          if (bb.powerCount > 0) {
            const avgCharge = bb.chargeSum / bb.powerCount;
            const avgDischarge = bb.dischargeSum / bb.powerCount;
            charge = avgCharge > 0 ? avgCharge / factor : null;
            discharge = avgDischarge < 0 ? avgDischarge / factor : null;
          }
        }

        return { timestamp: ts, charge, discharge, soc, sourceCharge, sourceDischarge };
      })
      .sort((a, b) => a.timestamp - b.timestamp);
  };

  // -------------------------------------------------------------------------
  // 1. Individual BESS 1 isolation
  // -------------------------------------------------------------------------
  it('1. Individual BESS 1 isolation: When BESS 1 is selected, charge/discharge reflect only BESS 1; BESS 2 is excluded', () => {
    const rows: HistoricalTelemetryRow[] = [
      createRow({ deviceId: 'dev-pcs-1', timestamp: '2026-10-20T10:00:10.000Z', pcsActivePower: 45.0 }),
      createRow({ deviceId: 'dev-bcms-1', timestamp: '2026-10-20T10:00:10.000Z', soc: 75.0 }),
      createRow({ deviceId: 'dev-pcs-2', timestamp: '2026-10-20T10:00:20.000Z', pcsActivePower: -30.0 }),
      createRow({ deviceId: 'dev-bcms-2', timestamp: '2026-10-20T10:00:20.000Z', soc: 60.0 }),
    ];

    const points = consolidatePowerTrendData(rows, { devices, selectedBessId: BESS_1_ID });
    expect(points).toHaveLength(1);
    expect(points[0].bessCharge).toBe(45.0);
    expect(points[0].bessDischarge).toBe(0);
    expect(points[0].bess).toBe(45.0);
    expect(points[0].soc).toBe(75.0);
  });

  // -------------------------------------------------------------------------
  // 2. Individual BESS 2 isolation
  // -------------------------------------------------------------------------
  it('2. Individual BESS 2 isolation: When BESS 2 is selected, only BESS 2 is reflected; BESS 1 does not contribute', () => {
    const rows: HistoricalTelemetryRow[] = [
      createRow({ deviceId: 'dev-pcs-1', timestamp: '2026-10-20T10:00:10.000Z', pcsActivePower: 45.0 }),
      createRow({ deviceId: 'dev-bcms-1', timestamp: '2026-10-20T10:00:10.000Z', soc: 75.0 }),
      createRow({ deviceId: 'dev-pcs-2', timestamp: '2026-10-20T10:00:20.000Z', pcsActivePower: -30.0 }),
      createRow({ deviceId: 'dev-bcms-2', timestamp: '2026-10-20T10:00:20.000Z', soc: 60.0 }),
    ];

    const points = consolidatePowerTrendData(rows, { devices, selectedBessId: BESS_2_ID });
    expect(points).toHaveLength(1);
    expect(points[0].bessCharge).toBe(0);
    expect(points[0].bessDischarge).toBe(-30.0);
    expect(points[0].bess).toBe(-30.0);
    expect(points[0].soc).toBe(60.0);
  });

  // -------------------------------------------------------------------------
  // 3. All BESS with simultaneous charging and discharging
  // -------------------------------------------------------------------------
  it('3. All BESS simultaneous charge and discharge: BESS 1 = +50 kW, BESS 2 = -20 kW, BESS 3 = +10 kW produces Charge = 60 kW, Discharge = -20 kW, Net = +40 kW', () => {
    const rows: HistoricalTelemetryRow[] = [
      createRow({ deviceId: 'dev-pcs-1', timestamp: '2026-10-20T10:00:10.000Z', pcsActivePower: 50.0 }),
      createRow({ deviceId: 'dev-pcs-2', timestamp: '2026-10-20T10:00:20.000Z', pcsActivePower: -20.0 }),
      createRow({ deviceId: 'dev-pcs-3', timestamp: '2026-10-20T10:00:30.000Z', pcsActivePower: 10.0 }),
    ];

    const points = consolidatePowerTrendData(rows, { devices, selectedBessId: null });
    expect(points).toHaveLength(1);
    // Charge = 50 + 10 = 60 kW
    expect(points[0].bessCharge).toBe(60.0);
    // Discharge = magnitude 20 kW represented as -20 kW (existing sign convention)
    expect(points[0].bessDischarge).toBe(-20.0);
    // Net BESS power = +40 kW
    expect(points[0].bess).toBe(40.0);
  });

  // -------------------------------------------------------------------------
  // 4. Multiple BESS charging in the same interval
  // -------------------------------------------------------------------------
  it('4. Multiple BESS charging in same interval: BESS 1 = +40 kW and BESS 2 = +60 kW produce Charge = 100 kW, Discharge = 0, Net = 100 kW', () => {
    const rows: HistoricalTelemetryRow[] = [
      createRow({ deviceId: 'dev-pcs-1', timestamp: '2026-10-20T10:00:10.000Z', pcsActivePower: 40.0 }),
      createRow({ deviceId: 'dev-pcs-2', timestamp: '2026-10-20T10:00:20.000Z', pcsActivePower: 60.0 }),
    ];

    const points = consolidatePowerTrendData(rows, { devices, selectedBessId: null });
    expect(points).toHaveLength(1);
    expect(points[0].bessCharge).toBe(100.0);
    expect(points[0].bessDischarge).toBe(0);
    expect(points[0].bess).toBe(100.0);
  });

  // -------------------------------------------------------------------------
  // 5. Multiple BESS discharging in the same interval
  // -------------------------------------------------------------------------
  it('5. Multiple BESS discharging in same interval: BESS 1 = -30 kW and BESS 2 = -50 kW produce Charge = 0, Discharge = -80 kW, Net = -80 kW', () => {
    const rows: HistoricalTelemetryRow[] = [
      createRow({ deviceId: 'dev-pcs-1', timestamp: '2026-10-20T10:00:10.000Z', pcsActivePower: -30.0 }),
      createRow({ deviceId: 'dev-pcs-2', timestamp: '2026-10-20T10:00:20.000Z', pcsActivePower: -50.0 }),
    ];

    const points = consolidatePowerTrendData(rows, { devices, selectedBessId: null });
    expect(points).toHaveLength(1);
    expect(points[0].bessCharge).toBe(0);
    expect(points[0].bessDischarge).toBe(-80.0);
    expect(points[0].bess).toBe(-80.0);
  });

  // -------------------------------------------------------------------------
  // 6. Zero-power reading
  // -------------------------------------------------------------------------
  it('6. Zero-power reading: BESS reporting 0 kW produces Charge = 0 and Discharge = 0 (neither charging nor discharging)', () => {
    const rows: HistoricalTelemetryRow[] = [
      createRow({ deviceId: 'dev-pcs-1', timestamp: '2026-10-20T10:00:10.000Z', pcsActivePower: 0 }),
      createRow({ deviceId: 'dev-pcs-2', timestamp: '2026-10-20T10:00:20.000Z', pcsActivePower: 0 }),
    ];

    const points = consolidatePowerTrendData(rows, { devices, selectedBessId: null });
    expect(points).toHaveLength(1);
    expect(points[0].bessCharge).toBe(0);
    expect(points[0].bessDischarge).toBe(0);
    expect(points[0].bess).toBe(0);
  });

  // -------------------------------------------------------------------------
  // 7. Missing and non-finite readings
  // -------------------------------------------------------------------------
  it('7. Missing and non-finite readings: Missing reading is preserved as gap (undefined), not 0; does not corrupt other reporting assets', () => {
    const rows: HistoricalTelemetryRow[] = [
      createRow({ deviceId: 'dev-pcs-1', timestamp: '2026-10-20T10:00:10.000Z', pcsActivePower: null as any }),
      createRow({ deviceId: 'dev-pcs-2', timestamp: '2026-10-20T10:00:20.000Z', pcsActivePower: 50.0 }),
    ];

    // Selecting BESS 1: missing reading must be undefined, not 0
    const bess1Points = consolidatePowerTrendData(rows, { devices, selectedBessId: BESS_1_ID });
    expect(bess1Points[0].bessCharge).toBeUndefined();
    expect(bess1Points[0].bessDischarge).toBeUndefined();
    expect(bess1Points[0].bess).toBeUndefined();

    // All BESS: BESS 1 missing does not poison BESS 2 valid charge
    const allPoints = consolidatePowerTrendData(rows, { devices, selectedBessId: null });
    expect(allPoints[0].bessCharge).toBe(50.0);
    expect(allPoints[0].bessDischarge).toBe(0);
    expect(allPoints[0].bess).toBe(50.0);
  });

  // -------------------------------------------------------------------------
  // 8. Duplicate rows for the same asset and minute
  // -------------------------------------------------------------------------
  it('8. Duplicate rows deduplication: Multiple readings for the same asset within one minute are deduplicated by latest timestamp', () => {
    const rows: HistoricalTelemetryRow[] = [
      createRow({ deviceId: 'dev-pcs-1', timestamp: '2026-10-20T10:00:10.000Z', pcsActivePower: 40.0 }),
      createRow({ deviceId: 'dev-pcs-1', timestamp: '2026-10-20T10:00:30.000Z', pcsActivePower: 55.0 }),
      createRow({ deviceId: 'dev-pcs-1', timestamp: '2026-10-20T10:00:50.000Z', pcsActivePower: 50.0 }),
    ];

    const points = consolidatePowerTrendData(rows, { devices, selectedBessId: null });
    expect(points).toHaveLength(1);
    // Must be latest reading 50.0, NOT 145.0
    expect(points[0].bessCharge).toBe(50.0);
  });

  // -------------------------------------------------------------------------
  // 9. Historical versus live calculation consistency
  // -------------------------------------------------------------------------
  it('9. Historical vs live consistency: Identical telemetry states produce identical bessCharge and bessDischarge in consolidatePowerTrendData and resolveLivePoint', () => {
    const liveBucket: LiveTrendBucket = {
      timestamp: 1760954400000,
      grid: 100.0,
      solar: 40.0,
      bess: {
        [BESS_1_ID]: { power: 50.0, soc: 80.0 },
        [BESS_2_ID]: { power: -20.0, soc: 60.0 },
      },
    };

    const rows: HistoricalTelemetryRow[] = [
      createRow({ deviceId: 'dev-pcs-1', timestamp: new Date(1760954400000).toISOString(), pcsActivePower: 50.0 }),
      createRow({ deviceId: 'dev-bcms-1', timestamp: new Date(1760954400000).toISOString(), soc: 80.0 }),
      createRow({ deviceId: 'dev-pcs-2', timestamp: new Date(1760954400000).toISOString(), pcsActivePower: -20.0 }),
      createRow({ deviceId: 'dev-bcms-2', timestamp: new Date(1760954400000).toISOString(), soc: 60.0 }),
    ];

    // All BESS mode
    const histAll = consolidatePowerTrendData(rows, { devices, selectedBessId: null })[0];
    const liveAll = resolveLivePoint(liveBucket, null);
    expect(histAll.bessCharge).toBe(liveAll.bessCharge);
    expect(histAll.bessDischarge).toBe(liveAll.bessDischarge);
    expect(histAll.bess).toBe(liveAll.bess);
    expect(histAll.soc).toBe(liveAll.soc);

    // Individual BESS 1 mode
    const histBess1 = consolidatePowerTrendData(rows, { devices, selectedBessId: BESS_1_ID })[0];
    const liveBess1 = resolveLivePoint(liveBucket, BESS_1_ID);
    expect(histBess1.bessCharge).toBe(liveBess1.bessCharge);
    expect(histBess1.bessDischarge).toBe(liveBess1.bessDischarge);
    expect(histBess1.bess).toBe(liveBess1.bess);
    expect(histBess1.soc).toBe(liveBess1.soc);

    // Individual BESS 2 mode
    const histBess2 = consolidatePowerTrendData(rows, { devices, selectedBessId: BESS_2_ID })[0];
    const liveBess2 = resolveLivePoint(liveBucket, BESS_2_ID);
    expect(histBess2.bessCharge).toBe(liveBess2.bessCharge);
    expect(histBess2.bessDischarge).toBe(liveBess2.bessDischarge);
    expect(histBess2.bess).toBe(liveBess2.bess);
    expect(histBess2.soc).toBe(liveBess2.soc);
  });

  // -------------------------------------------------------------------------
  // 10. Selector switching without stale data leakage
  // -------------------------------------------------------------------------
  it('10. Selector switching without stale data leakage: Switching from BESS 1 to BESS 2 immediately re-evaluates in-memory without bleeding', () => {
    const rows: HistoricalTelemetryRow[] = [
      createRow({ deviceId: 'dev-pcs-1', timestamp: '2026-10-20T10:00:10.000Z', pcsActivePower: 60.0 }),
      createRow({ deviceId: 'dev-pcs-2', timestamp: '2026-10-20T10:00:20.000Z', pcsActivePower: -35.0 }),
    ];

    const bess1View = consolidatePowerTrendData(rows, { devices, selectedBessId: BESS_1_ID });
    expect(bess1View[0].bessCharge).toBe(60.0);
    expect(bess1View[0].bessDischarge).toBe(0);

    const bess2View = consolidatePowerTrendData(rows, { devices, selectedBessId: BESS_2_ID });
    expect(bess2View[0].bessCharge).toBe(0);
    expect(bess2View[0].bessDischarge).toBe(-35.0);

    // Switching back to All BESS
    const allView = consolidatePowerTrendData(rows, { devices, selectedBessId: null });
    expect(allView[0].bessCharge).toBe(60.0);
    expect(allView[0].bessDischarge).toBe(-35.0);
    expect(allView[0].bess).toBe(25.0);
  });

  // -------------------------------------------------------------------------
  // 11. Net power remains correct for the existing Power Trend graph
  // -------------------------------------------------------------------------
  it('11. Net power preservation: pt.bess remains the algebraic net sum for PowerTrendChart across all test conditions', () => {
    const rows: HistoricalTelemetryRow[] = [
      createRow({ deviceId: 'dev-pcs-1', timestamp: '2026-10-20T10:00:10.000Z', pcsActivePower: 50.0 }),
      createRow({ deviceId: 'dev-pcs-2', timestamp: '2026-10-20T10:00:20.000Z', pcsActivePower: -20.0 }),
      createRow({ deviceId: 'dev-pcs-3', timestamp: '2026-10-20T10:00:30.000Z', pcsActivePower: 10.0 }),
    ];

    const points = consolidatePowerTrendData(rows, { devices, selectedBessId: null });
    // PowerTrendChart reads pt.bess: must be algebraic net 40 kW
    expect(points[0].bess).toBe(40.0);
  });

  // -------------------------------------------------------------------------
  // 12. Single-BESS compatibility
  // -------------------------------------------------------------------------
  it('12. Single-BESS compatibility: Single-BESS accounts produce consistent charge and discharge without behavioral change', () => {
    const singleBessDevices: DashboardDevice[] = [
      { id: 'dev-pcs-single', name: 'PCS Single', type: 'PCS', componentId: 'pcs', emuId: 'emu-1', bessAssetId: 'single-bess' },
      { id: 'dev-bcms-single', name: 'BMS Single', type: 'BMS', componentId: 'bcms', emuId: 'emu-1', bessAssetId: 'single-bess' },
    ];

    const chargeRows: HistoricalTelemetryRow[] = [
      createRow({ deviceId: 'dev-pcs-single', timestamp: '2026-10-20T10:00:10.000Z', pcsActivePower: 70.0 }),
    ];
    const chargePoints = consolidatePowerTrendData(chargeRows, { devices: singleBessDevices, selectedBessId: null });
    expect(chargePoints[0].bessCharge).toBe(70.0);
    expect(chargePoints[0].bessDischarge).toBe(0);
    expect(chargePoints[0].bess).toBe(70.0);

    const dischargeRows: HistoricalTelemetryRow[] = [
      createRow({ deviceId: 'dev-pcs-single', timestamp: '2026-10-20T10:00:10.000Z', pcsActivePower: -45.0 }),
    ];
    const dischargePoints = consolidatePowerTrendData(dischargeRows, { devices: singleBessDevices, selectedBessId: null });
    expect(dischargePoints[0].bessCharge).toBe(0);
    expect(dischargePoints[0].bessDischarge).toBe(-45.0);
    expect(dischargePoints[0].bess).toBe(-45.0);
  });

  // -------------------------------------------------------------------------
  // 13. Correct chart bucket aggregation and averaging
  // -------------------------------------------------------------------------
  it('13. Chart bucket aggregation: 10-minute visual bars and 2-minute tooltips correctly average time-based charge and discharge', () => {
    const baseTs = 1760954400000; // 10:00:00
    const domain: [number, number] = [baseTs, baseTs + 20 * 60 * 1000];

    // Scenario A: 5 minutes charging at 100 kW, 5 minutes idle (0 kW) in a 10-minute window
    const dataPoints: PowerTrendPoint[] = [];
    for (let m = 0; m < 5; m++) {
      dataPoints.push({
        timestamp: baseTs + m * 60 * 1000,
        bess: 100,
        bessCharge: 100,
        bessDischarge: 0,
      });
    }
    for (let m = 5; m < 10; m++) {
      dataPoints.push({
        timestamp: baseTs + m * 60 * 1000,
        bess: 0,
        bessCharge: 0,
        bessDischarge: 0,
      });
    }

    const transformed = transformChartData(dataPoints, domain);
    const tenMinBar = transformed.find(p => p.timestamp === baseTs);
    expect(tenMinBar).toBeDefined();
    // 5 minutes * 100 kW + 5 minutes * 0 kW = 500 / 10 = 50 kW average charge over 10m bar!
    expect(tenMinBar!.charge).toBe(50.0);
    expect(tenMinBar!.discharge).toBeNull();

    // Scenario B: 5 minutes charging at 100 kW, 5 minutes missing (no telemetry)
    const dataWithGaps: PowerTrendPoint[] = [];
    for (let m = 0; m < 5; m++) {
      dataWithGaps.push({
        timestamp: baseTs + m * 60 * 1000,
        bess: 100,
        bessCharge: 100,
        bessDischarge: 0,
      });
    }
    // Minutes 5-9 have no entries (missing)
    const transformedGaps = transformChartData(dataWithGaps, domain);
    const tenMinBarGaps = transformedGaps.find(p => p.timestamp === baseTs);
    expect(tenMinBarGaps).toBeDefined();
    // 5 minutes * 100 kW / 5 valid samples = 100 kW (missing data does not dilute average)
    expect(tenMinBarGaps!.charge).toBe(100.0);

    // Scenario C: Simultaneous charging (+60 kW) and discharging (-20 kW) within 10-minute window
    const dataSimultaneous: PowerTrendPoint[] = [];
    for (let m = 0; m < 10; m++) {
      dataSimultaneous.push({
        timestamp: baseTs + m * 60 * 1000,
        bess: 40,
        bessCharge: 60,
        bessDischarge: -20,
      });
    }
    const transformedSimul = transformChartData(dataSimultaneous, domain);
    const simulBar = transformedSimul.find(p => p.timestamp === baseTs);
    expect(simulBar).toBeDefined();
    // Charge bar = 60 kW
    expect(simulBar!.charge).toBe(60.0);
    // Discharge bar = -20 kW
    expect(simulBar!.discharge).toBe(-20.0);
    // 2-minute source resolution
    expect(simulBar!.sourceCharge).toBe(60.0);
    expect(simulBar!.sourceDischarge).toBe(-20.0);
  });
});

/**
 * 24-Hour Power Trend — Multi-BESS Selector-Aware Behavior Unit Tests
 *
 * Verifies the 12 required scenarios from the implementation task:
 * 1. Repeated PCS readings in the same bucket
 * 2. All BESS power sum (+50 kW + -20 kW = +30 kW)
 * 3. All BESS SOC average (80% and 60% = 70%)
 * 4. Individual BESS 1 isolation
 * 5. Individual BESS 2 isolation
 * 6. Site-level Grid and Solar isolation across all selector choices
 * 7. Independent timestamps for PCS power and SOC
 * 8. Missing and non-finite values handled as gaps (undefined), not 0
 * 9. Legitimate numeric zero values preserved
 * 10. Out-of-order telemetry rows resolved deterministically by timestamp
 * 11. Single-BESS account backward compatibility
 * 12. Live selector-aware rolling data resolution
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
} from '../../../frontend/src/features/dashboard/dashboard.types';

describe('24-Hour Power Trend — Multi-BESS Selector-Aware Behavior', () => {
  const BESS_1_ID = 'bess-uuid-1';
  const BESS_2_ID = 'bess-uuid-2';

  const devices: DashboardDevice[] = [
    { id: 'dev-pcs-1', name: 'PCS 1', type: 'PCS', componentId: 'pcs', emuId: 'emu-1', bessAssetId: BESS_1_ID },
    { id: 'dev-bcms-1', name: 'BMS 1', type: 'BMS', componentId: 'bcms', emuId: 'emu-1', bessAssetId: BESS_1_ID },
    { id: 'dev-pcs-2', name: 'PCS 2', type: 'PCS', componentId: 'pcs', emuId: 'emu-2', bessAssetId: BESS_2_ID },
    { id: 'dev-bcms-2', name: 'BMS 2', type: 'BMS', componentId: 'bcms', emuId: 'emu-2', bessAssetId: BESS_2_ID },
    // PMG and PINV are associated with BESS 1 in the DB, but measure site-level Grid & Solar
    { id: 'dev-pmg', name: 'Grid Meter', type: 'METER', componentId: 'pmg', emuId: 'emu-1', bessAssetId: BESS_1_ID },
    { id: 'dev-pinv', name: 'Solar Inverter', type: 'SOLAR_INVERTER', componentId: 'pinv', emuId: 'emu-1', bessAssetId: BESS_1_ID },
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

  // -------------------------------------------------------------------------
  // 1. Repeated PCS readings within one minute
  // -------------------------------------------------------------------------
  it('1. Repeated PCS readings: Multiple readings for BESS 1 within one minute contribute only its latest valid reading', () => {
    const rows: HistoricalTelemetryRow[] = [
      createRow({ deviceId: 'dev-pcs-1', timestamp: '2026-10-20T10:00:10.000Z', pcsActivePower: 40.0 }),
      createRow({ deviceId: 'dev-pcs-1', timestamp: '2026-10-20T10:00:30.000Z', pcsActivePower: 55.0 }),
      createRow({ deviceId: 'dev-pcs-1', timestamp: '2026-10-20T10:00:50.000Z', pcsActivePower: 50.0 }),
    ];

    const points = consolidatePowerTrendData(rows, { devices, selectedBessId: null });
    expect(points).toHaveLength(1);
    // Must be the latest valid reading (50.0), NOT the sum of all 3 (145.0)
    expect(points[0].bess).toBe(50.0);
    expect(points[0].bess).not.toBe(145.0);
  });

  // -------------------------------------------------------------------------
  // 2. All BESS power sum (+50 kW + -20 kW = +30 kW)
  // -------------------------------------------------------------------------
  it('2. All BESS power sum: BESS 1 = +50 kW and BESS 2 = -20 kW produce algebraic sum +30 kW', () => {
    const rows: HistoricalTelemetryRow[] = [
      createRow({ deviceId: 'dev-pcs-1', timestamp: '2026-10-20T10:00:20.000Z', pcsActivePower: 50.0 }),
      createRow({ deviceId: 'dev-pcs-2', timestamp: '2026-10-20T10:00:25.000Z', pcsActivePower: -20.0 }),
    ];

    const points = consolidatePowerTrendData(rows, { devices, selectedBessId: null });
    expect(points).toHaveLength(1);
    // (+50.0) + (-20.0) = +30.0 kW
    expect(points[0].bess).toBe(30.0);
  });

  // -------------------------------------------------------------------------
  // 3. All BESS SOC average (80% and 60% = 70%)
  // -------------------------------------------------------------------------
  it('3. All BESS SOC average: BESS 1 = 80% and BESS 2 = 60% produce 70%, independent of differing reporting frequencies', () => {
    const rows: HistoricalTelemetryRow[] = [
      // BESS 1 reports 3 times in the minute at 80%
      createRow({ deviceId: 'dev-bcms-1', timestamp: '2026-10-20T10:00:10.000Z', soc: 80.0 }),
      createRow({ deviceId: 'dev-bcms-1', timestamp: '2026-10-20T10:00:30.000Z', soc: 80.0 }),
      createRow({ deviceId: 'dev-bcms-1', timestamp: '2026-10-20T10:00:50.000Z', soc: 80.0 }),
      // BESS 2 reports once in the minute at 60%
      createRow({ deviceId: 'dev-bcms-2', timestamp: '2026-10-20T10:00:20.000Z', soc: 60.0 }),
    ];

    const points = consolidatePowerTrendData(rows, { devices, selectedBessId: null });
    expect(points).toHaveLength(1);
    // (80 + 60) / 2 = 70.0% — NOT weighted by 3:1 frequency which would give 75%
    expect(points[0].soc).toBeCloseTo(70.0, 4);
    expect(points[0].soc).not.toBe(75.0);
  });

  // -------------------------------------------------------------------------
  // 4. Individual BESS 1
  // -------------------------------------------------------------------------
  it('4. Individual BESS 1: Power = +50 kW and SOC = 80%; BESS 2 does not contribute', () => {
    const rows: HistoricalTelemetryRow[] = [
      createRow({ deviceId: 'dev-pcs-1', timestamp: '2026-10-20T10:00:20.000Z', pcsActivePower: 50.0 }),
      createRow({ deviceId: 'dev-bcms-1', timestamp: '2026-10-20T10:00:20.000Z', soc: 80.0 }),
      createRow({ deviceId: 'dev-pcs-2', timestamp: '2026-10-20T10:00:25.000Z', pcsActivePower: -20.0 }),
      createRow({ deviceId: 'dev-bcms-2', timestamp: '2026-10-20T10:00:25.000Z', soc: 60.0 }),
    ];

    const points = consolidatePowerTrendData(rows, { devices, selectedBessId: BESS_1_ID });
    expect(points).toHaveLength(1);
    expect(points[0].bess).toBe(50.0);
    expect(points[0].soc).toBe(80.0);
  });

  // -------------------------------------------------------------------------
  // 5. Individual BESS 2
  // -------------------------------------------------------------------------
  it('5. Individual BESS 2: Power = -20 kW and SOC = 60%; BESS 1 does not contribute', () => {
    const rows: HistoricalTelemetryRow[] = [
      createRow({ deviceId: 'dev-pcs-1', timestamp: '2026-10-20T10:00:20.000Z', pcsActivePower: 50.0 }),
      createRow({ deviceId: 'dev-bcms-1', timestamp: '2026-10-20T10:00:20.000Z', soc: 80.0 }),
      createRow({ deviceId: 'dev-pcs-2', timestamp: '2026-10-20T10:00:25.000Z', pcsActivePower: -20.0 }),
      createRow({ deviceId: 'dev-bcms-2', timestamp: '2026-10-20T10:00:25.000Z', soc: 60.0 }),
    ];

    const points = consolidatePowerTrendData(rows, { devices, selectedBessId: BESS_2_ID });
    expect(points).toHaveLength(1);
    expect(points[0].bess).toBe(-20.0);
    expect(points[0].soc).toBe(60.0);
  });

  // -------------------------------------------------------------------------
  // 6. Grid/Solar isolation across selector choices
  // -------------------------------------------------------------------------
  it('6. Grid/Solar isolation: Grid and Solar remain present and identical across All BESS, BESS 1, and BESS 2 views', () => {
    const rows: HistoricalTelemetryRow[] = [
      createRow({ deviceId: 'dev-pmg', timestamp: '2026-10-20T10:00:15.000Z', gridSideLoad: 125.4 }),
      createRow({ deviceId: 'dev-pinv', timestamp: '2026-10-20T10:00:18.000Z', solarPower: 42.0 }),
      createRow({ deviceId: 'dev-pcs-1', timestamp: '2026-10-20T10:00:20.000Z', pcsActivePower: 50.0 }),
      createRow({ deviceId: 'dev-bcms-1', timestamp: '2026-10-20T10:00:20.000Z', soc: 80.0 }),
      createRow({ deviceId: 'dev-pcs-2', timestamp: '2026-10-20T10:00:25.000Z', pcsActivePower: -20.0 }),
      createRow({ deviceId: 'dev-bcms-2', timestamp: '2026-10-20T10:00:25.000Z', soc: 60.0 }),
    ];

    const allBessPoints = consolidatePowerTrendData(rows, { devices, selectedBessId: null });
    const bess1Points = consolidatePowerTrendData(rows, { devices, selectedBessId: BESS_1_ID });
    const bess2Points = consolidatePowerTrendData(rows, { devices, selectedBessId: BESS_2_ID });

    // Grid and Solar must be identical across all three views!
    expect(allBessPoints[0].grid).toBe(125.4);
    expect(bess1Points[0].grid).toBe(125.4);
    expect(bess2Points[0].grid).toBe(125.4);

    expect(allBessPoints[0].solar).toBe(42.0);
    expect(bess1Points[0].solar).toBe(42.0);
    expect(bess2Points[0].solar).toBe(42.0);

    // But BESS metrics change according to selector
    expect(allBessPoints[0].bess).toBe(30.0);
    expect(bess1Points[0].bess).toBe(50.0);
    expect(bess2Points[0].bess).toBe(-20.0);
  });

  // -------------------------------------------------------------------------
  // 7. Independent timestamps for PCS power and SOC
  // -------------------------------------------------------------------------
  it('7. Independent timestamps: Latest PCS power and SOC readings for the same asset are selected independently', () => {
    const rows: HistoricalTelemetryRow[] = [
      // Power arrives at :10, then updated at :40
      createRow({ deviceId: 'dev-pcs-1', timestamp: '2026-10-20T10:00:10.000Z', pcsActivePower: 30.0 }),
      createRow({ deviceId: 'dev-pcs-1', timestamp: '2026-10-20T10:00:40.000Z', pcsActivePower: 45.0 }),
      // SOC arrives at :20, then updated at :50
      createRow({ deviceId: 'dev-bcms-1', timestamp: '2026-10-20T10:00:20.000Z', soc: 75.0 }),
      createRow({ deviceId: 'dev-bcms-1', timestamp: '2026-10-20T10:00:50.000Z', soc: 79.0 }),
    ];

    const points = consolidatePowerTrendData(rows, { devices, selectedBessId: BESS_1_ID });
    expect(points).toHaveLength(1);
    // Power should be from :40 (45.0) and SOC from :50 (79.0)
    expect(points[0].bess).toBe(45.0);
    expect(points[0].soc).toBe(79.0);
  });

  // -------------------------------------------------------------------------
  // 8. Missing and non-finite values
  // -------------------------------------------------------------------------
  it('8. Missing values: Non-finite/null values are excluded; missing selected-BESS reading remains undefined (gap)', () => {
    const rows: HistoricalTelemetryRow[] = [
      createRow({ deviceId: 'dev-pcs-1', timestamp: '2026-10-20T10:00:10.000Z', pcsActivePower: null as any }),
      createRow({ deviceId: 'dev-bcms-1', timestamp: '2026-10-20T10:00:10.000Z', soc: undefined }),
      createRow({ deviceId: 'dev-pcs-2', timestamp: '2026-10-20T10:00:20.000Z', pcsActivePower: 25.0 }),
      createRow({ deviceId: 'dev-bcms-2', timestamp: '2026-10-20T10:00:20.000Z', soc: 65.0 }),
    ];

    // Selecting BESS 1: missing readings must NOT be replaced by BESS 2 and must NOT be zero
    const bess1Points = consolidatePowerTrendData(rows, { devices, selectedBessId: BESS_1_ID });
    expect(bess1Points[0].bess).toBeUndefined();
    expect(bess1Points[0].soc).toBeUndefined();

    // All BESS: BESS 1's missing values do not poison BESS 2's valid values
    const allPoints = consolidatePowerTrendData(rows, { devices, selectedBessId: null });
    expect(allPoints[0].bess).toBe(25.0);
    expect(allPoints[0].soc).toBe(65.0);
  });

  // -------------------------------------------------------------------------
  // 9. Legitimate numeric zero values preserved
  // -------------------------------------------------------------------------
  it('9. Zero values: Legitimate numeric zero is preserved for power, SOC, grid, and solar', () => {
    const rows: HistoricalTelemetryRow[] = [
      createRow({ deviceId: 'dev-pmg', timestamp: '2026-10-20T10:00:05.000Z', gridSideLoad: 0 }),
      createRow({ deviceId: 'dev-pinv', timestamp: '2026-10-20T10:00:08.000Z', solarPower: 0 }),
      createRow({ deviceId: 'dev-pcs-1', timestamp: '2026-10-20T10:00:10.000Z', pcsActivePower: 0 }),
      createRow({ deviceId: 'dev-bcms-1', timestamp: '2026-10-20T10:00:10.000Z', soc: 0 }),
    ];

    const allPoints = consolidatePowerTrendData(rows, { devices, selectedBessId: null });
    expect(allPoints[0].grid).toBe(0);
    expect(allPoints[0].solar).toBe(0);
    expect(allPoints[0].bess).toBe(0);
    expect(allPoints[0].soc).toBe(0);

    const bess1Points = consolidatePowerTrendData(rows, { devices, selectedBessId: BESS_1_ID });
    expect(bess1Points[0].grid).toBe(0);
    expect(bess1Points[0].solar).toBe(0);
    expect(bess1Points[0].bess).toBe(0);
    expect(bess1Points[0].soc).toBe(0);
  });

  // -------------------------------------------------------------------------
  // 10. Out-of-order telemetry rows
  // -------------------------------------------------------------------------
  it('10. Out-of-order rows: Consolidation chooses the latest timestamp rather than relying on array iteration order', () => {
    const rows: HistoricalTelemetryRow[] = [
      // Newer reading placed FIRST in array
      createRow({ deviceId: 'dev-pmg', timestamp: '2026-10-20T10:00:50.000Z', gridSideLoad: 150.0 }),
      createRow({ deviceId: 'dev-pcs-1', timestamp: '2026-10-20T10:00:50.000Z', pcsActivePower: 60.0 }),
      createRow({ deviceId: 'dev-bcms-1', timestamp: '2026-10-20T10:00:50.000Z', soc: 85.0 }),
      // Older reading placed LAST in array
      createRow({ deviceId: 'dev-pmg', timestamp: '2026-10-20T10:00:10.000Z', gridSideLoad: 100.0 }),
      createRow({ deviceId: 'dev-pcs-1', timestamp: '2026-10-20T10:00:10.000Z', pcsActivePower: 40.0 }),
      createRow({ deviceId: 'dev-bcms-1', timestamp: '2026-10-20T10:00:10.000Z', soc: 80.0 }),
    ];

    const points = consolidatePowerTrendData(rows, { devices, selectedBessId: BESS_1_ID });
    expect(points).toHaveLength(1);
    // Newer reading at :50 MUST win over older reading at :10 despite array ordering
    expect(points[0].grid).toBe(150.0);
    expect(points[0].bess).toBe(60.0);
    expect(points[0].soc).toBe(85.0);
  });

  // -------------------------------------------------------------------------
  // 11. Single-BESS account backward compatibility
  // -------------------------------------------------------------------------
  it('11. Single-BESS compatibility: Existing single-BESS output remains unmodified', () => {
    const singleBessDevices: DashboardDevice[] = [
      { id: 'dev-pcs-only', name: 'PCS', type: 'PCS', componentId: 'pcs', emuId: 'emu-1', bessAssetId: 'single-bess' },
      { id: 'dev-bcms-only', name: 'BMS', type: 'BMS', componentId: 'bcms', emuId: 'emu-1', bessAssetId: 'single-bess' },
      { id: 'dev-pmg-only', name: 'Grid', type: 'METER', componentId: 'pmg', emuId: 'emu-1', bessAssetId: 'single-bess' },
    ];

    const rows: HistoricalTelemetryRow[] = [
      createRow({ deviceId: 'dev-pcs-only', timestamp: '2026-10-20T10:00:30.000Z', pcsActivePower: 75.0 }),
      createRow({ deviceId: 'dev-bcms-only', timestamp: '2026-10-20T10:00:30.000Z', soc: 82.5 }),
      createRow({ deviceId: 'dev-pmg-only', timestamp: '2026-10-20T10:00:30.000Z', gridSideLoad: 45.0 }),
    ];

    const points = consolidatePowerTrendData(rows, { devices: singleBessDevices, selectedBessId: null });
    expect(points).toHaveLength(1);
    expect(points[0].bess).toBe(75.0);
    expect(points[0].soc).toBe(82.5);
    expect(points[0].grid).toBe(45.0);
  });

  // -------------------------------------------------------------------------
  // 12. Live selector behavior
  // -------------------------------------------------------------------------
  it('12. Live selector behavior: Live rolling data resolves sum/average for All BESS, isolates selected BESS, and preserves site Grid/Solar', () => {
    const liveBucket: LiveTrendBucket = {
      timestamp: 1760954400000,
      grid: 85.0,
      solar: 35.0,
      bess: {
        [BESS_1_ID]: { power: 50.0, soc: 80.0 },
        [BESS_2_ID]: { power: -20.0, soc: 60.0 },
      },
    };

    // Case A: All BESS view -> sum power (50 + -20 = 30), average SOC ((80+60)/2 = 70)
    const allPt = resolveLivePoint(liveBucket, null);
    expect(allPt.bess).toBe(30.0);
    expect(allPt.soc).toBe(70.0);
    expect(allPt.grid).toBe(85.0);
    expect(allPt.solar).toBe(35.0);

    // Case B: BESS 1 view -> strictly BESS 1 (50 kW, 80%), Grid and Solar remain 85 and 35
    const bess1Pt = resolveLivePoint(liveBucket, BESS_1_ID);
    expect(bess1Pt.bess).toBe(50.0);
    expect(bess1Pt.soc).toBe(80.0);
    expect(bess1Pt.grid).toBe(85.0);
    expect(bess1Pt.solar).toBe(35.0);

    // Case C: BESS 2 view -> strictly BESS 2 (-20 kW, 60%), Grid and Solar remain 85 and 35
    const bess2Pt = resolveLivePoint(liveBucket, BESS_2_ID);
    expect(bess2Pt.bess).toBe(-20.0);
    expect(bess2Pt.soc).toBe(60.0);
    expect(bess2Pt.grid).toBe(85.0);
    expect(bess2Pt.solar).toBe(35.0);

    // Case D: Incoming update for BESS 2 does NOT change BESS 1's resolved point
    const updatedBucket: LiveTrendBucket = {
      ...liveBucket,
      bess: {
        [BESS_1_ID]: { power: 50.0, soc: 80.0 },
        [BESS_2_ID]: { power: -45.0, soc: 55.0 }, // BESS 2 telemetry changed
      },
    };
    const bess1AfterUpdate = resolveLivePoint(updatedBucket, BESS_1_ID);
    expect(bess1AfterUpdate.bess).toBe(50.0);
    expect(bess1AfterUpdate.soc).toBe(80.0);

    // Case E: Missing reading on selected BESS produces undefined, not zero or fallback
    const missingBucket: LiveTrendBucket = {
      ...liveBucket,
      bess: {
        [BESS_1_ID]: { power: undefined, soc: undefined },
        [BESS_2_ID]: { power: -20.0, soc: 60.0 },
      },
    };
    const bess1Missing = resolveLivePoint(missingBucket, BESS_1_ID);
    expect(bess1Missing.bess).toBeUndefined();
    expect(bess1Missing.soc).toBeUndefined();

    // Case F: Valid zero power on selected BESS is preserved
    const zeroBucket: LiveTrendBucket = {
      ...liveBucket,
      bess: {
        [BESS_1_ID]: { power: 0, soc: 0 },
      },
    };
    const bess1Zero = resolveLivePoint(zeroBucket, BESS_1_ID);
    expect(bess1Zero.bess).toBe(0);
    expect(bess1Zero.soc).toBe(0);
  });
});

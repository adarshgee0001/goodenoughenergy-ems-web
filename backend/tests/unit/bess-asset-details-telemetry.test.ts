import { describe, it, expect } from 'vitest';
import { mergeAssetTelemetryRows } from '../../../frontend/src/pages/EMSApp/BESSAssetDetailsPage';
import type { LatestTelemetryRow } from '../../../frontend/src/features/dashboard/dashboard.types';

describe('BESSAssetDetailsPage - Telemetry Row Consolidation & PCS Operations Panel', () => {
  const AFFECTED_ASSET_ID = 'ac484173-2220-41ae-bc13-728aa168363d';
  const OTHER_ASSET_ID = '34613990-46bb-4e2f-a340-09ce773b73f1';

  function createMockRow(
    bessAssetId: string,
    componentId: string,
    type: string,
    pcsMetrics: {
      pcsActivePower?: number | null;
      dcVoltage?: number | null;
      ambientTemp?: number | null;
      todayChargeEnergy?: number | null;
      todayDischargeEnergy?: number | null;
      accumChargeEnergy?: number | null;
      accumDischargeEnergy?: number | null;
      powerFactor?: number | null;
      bessPowerFactor?: number | null;
    } = {},
    bmsMetrics: {
      soc?: number | null;
      soh?: number | null;
      bmsCurrent?: number | null;
      cellVMax?: number | null;
      cellVMin?: number | null;
      cellTempMax?: number | null;
    } = {}
  ): LatestTelemetryRow {
    return {
      id: `row-${componentId}-${bessAssetId}`,
      deviceId: `dev-${componentId}`,
      timestamp: '2026-10-21T03:16:59.000Z',
      ingestedAt: '2026-10-21T03:16:59.000Z',
      pcsActivePower: pcsMetrics.pcsActivePower ?? null,
      dcVoltage: pcsMetrics.dcVoltage ?? null,
      ambientTemp: pcsMetrics.ambientTemp ?? null,
      todayChargeEnergy: pcsMetrics.todayChargeEnergy ?? null,
      todayDischargeEnergy: pcsMetrics.todayDischargeEnergy ?? null,
      accumChargeEnergy: pcsMetrics.accumChargeEnergy ?? null,
      accumDischargeEnergy: pcsMetrics.accumDischargeEnergy ?? null,
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
      powerFactor: pcsMetrics.powerFactor ?? null,
      bessFrequency: null,
      bessPowerFactor: pcsMetrics.bessPowerFactor ?? null,
      soc: bmsMetrics.soc ?? null,
      soh: bmsMetrics.soh ?? null,
      bmsCurrent: bmsMetrics.bmsCurrent ?? null,
      cellVMax: bmsMetrics.cellVMax ?? null,
      cellVMin: bmsMetrics.cellVMin ?? null,
      cellTempMax: bmsMetrics.cellTempMax ?? null,
      rawPayload: [],
      device: {
        id: `dev-${componentId}`,
        componentId,
        type,
        name: `Device ${componentId}`,
        bessAssetId,
      },
    };
  }

  it('1. Correctly selects PCS telemetry row containing valid metric values by componentId = "pcs"', () => {
    const rows = [
      createMockRow(AFFECTED_ASSET_ID, 'pcs', 'PCS', {
        pcsActivePower: 12.5,
        dcVoltage: 865.0,
        ambientTemp: 24.5,
        todayChargeEnergy: 10.2,
        todayDischargeEnergy: 45.8,
        accumChargeEnergy: 5400.0,
        accumDischargeEnergy: 4900.0,
        powerFactor: 0.99,
        bessPowerFactor: 0.98,
      }),
    ];

    const merged = mergeAssetTelemetryRows(rows, AFFECTED_ASSET_ID);

    expect(merged.bessPower).toBe(12.5);
    expect(merged.pcsDcVoltage).toBe(865.0);
    expect(merged.pcsTemp).toBe(24.5);
    expect(merged.todayChargeEnergy).toBe(10.2);
    expect(merged.todayDischargeEnergy).toBe(45.8);
    expect(merged.accChargeEnergy).toBe(5400.0);
    expect(merged.accDischargeEnergy).toBe(4900.0);
    expect(merged.powerFactor).toBe(0.99);
    expect(merged.bessPowerFactor).toBe(0.98);
  });

  it('2. Prevents subsequent pack_01 through pack_05 rows with type = "PCS" from overwriting valid PCS values', () => {
    // Replicating the exact Angad Food database state:
    // PCS device row comes first, followed by pack_01..pack_05 with type='PCS' and null PCS metrics
    const rows = [
      createMockRow(AFFECTED_ASSET_ID, 'pcs', 'PCS', {
        pcsActivePower: 0.6,
        dcVoltage: 866.5,
        ambientTemp: 24.7,
        todayChargeEnergy: 2.5,
        todayDischargeEnergy: 56.2,
        accumChargeEnergy: 5450.2,
        accumDischargeEnergy: 4967.3,
        bessPowerFactor: -0.21,
      }),
      createMockRow(AFFECTED_ASSET_ID, 'tms', 'TMS'),
      createMockRow(AFFECTED_ASSET_ID, 'bcms', 'BMS', {}, { soc: 82.5 }),
      createMockRow(AFFECTED_ASSET_ID, 'pmg', 'METER'),
      createMockRow(AFFECTED_ASSET_ID, 'rjl', 'IO'),
      createMockRow(AFFECTED_ASSET_ID, 'pinv', 'PV_INVERTER'),
      // The 5 misclassified battery-pack rows with type = 'PCS'
      createMockRow(AFFECTED_ASSET_ID, 'pack_01', 'PCS', { pcsActivePower: null, dcVoltage: null }),
      createMockRow(AFFECTED_ASSET_ID, 'pack_02', 'PCS', { pcsActivePower: null, dcVoltage: null }),
      createMockRow(AFFECTED_ASSET_ID, 'pack_03', 'PCS', { pcsActivePower: null, dcVoltage: null }),
      createMockRow(AFFECTED_ASSET_ID, 'pack_04', 'PCS', { pcsActivePower: null, dcVoltage: null }),
      createMockRow(AFFECTED_ASSET_ID, 'pack_05', 'PCS', { pcsActivePower: null, dcVoltage: null }),
      createMockRow(AFFECTED_ASSET_ID, 'th', 'TMS'),
    ];

    const merged = mergeAssetTelemetryRows(rows, AFFECTED_ASSET_ID);

    // PCS metrics must remain fully intact and not be overwritten by pack rows
    expect(merged.bessPower).toBe(0.6);
    expect(merged.pcsDcVoltage).toBe(866.5);
    expect(merged.pcsTemp).toBe(24.7);
    expect(merged.todayChargeEnergy).toBe(2.5);
    expect(merged.todayDischargeEnergy).toBe(56.2);
    expect(merged.accChargeEnergy).toBe(5450.2);
    expect(merged.accDischargeEnergy).toBe(4967.3);
    expect(merged.bessPowerFactor).toBe(-0.21);
  });

  it('3. Ensures battery-pack rows are not mistaken for the actual PCS component even if PCS record appears after them', () => {
    // Edge case: pack devices appearing before the pcs device in array order
    const rows = [
      createMockRow(AFFECTED_ASSET_ID, 'pack_01', 'PCS', { pcsActivePower: null }),
      createMockRow(AFFECTED_ASSET_ID, 'pack_02', 'PCS', { pcsActivePower: null }),
      createMockRow(AFFECTED_ASSET_ID, 'pcs', 'PCS', { pcsActivePower: -45.0, dcVoltage: 850.0 }),
      createMockRow(AFFECTED_ASSET_ID, 'pack_03', 'PCS', { pcsActivePower: null }),
    ];

    const merged = mergeAssetTelemetryRows(rows, AFFECTED_ASSET_ID);

    expect(merged.bessPower).toBe(-45.0);
    expect(merged.pcsDcVoltage).toBe(850.0);
  });

  it('4. Existing BMS Health Panel values continue to populate correctly alongside PCS metrics', () => {
    const rows = [
      createMockRow(AFFECTED_ASSET_ID, 'pcs', 'PCS', { pcsActivePower: 10.0, dcVoltage: 800.0 }),
      createMockRow(AFFECTED_ASSET_ID, 'bcms', 'BMS', {}, {
        soc: 75.0,
        soh: 98.2,
        bmsCurrent: 14.3,
        cellVMax: 3.42,
        cellVMin: 3.38,
        cellTempMax: 28.1,
      }),
      createMockRow(AFFECTED_ASSET_ID, 'pack_01', 'PCS', {}),
    ];

    const merged = mergeAssetTelemetryRows(rows, AFFECTED_ASSET_ID);

    // PCS panel fields
    expect(merged.bessPower).toBe(10.0);
    expect(merged.pcsDcVoltage).toBe(800.0);

    // BMS panel fields
    expect(merged.bessSoc).toBe(75.0);
    expect(merged.bmsSoh).toBe(98.2);
    expect(merged.bmsCurrent).toBe(14.3);
    expect(merged.cellVMax).toBe(3.42);
    expect(merged.cellVMin).toBe(3.38);
    expect(merged.cellTempMax).toBe(28.1);
  });

  it('5. A genuinely missing PCS record still produces undefined (empty state) rather than fabricated values', () => {
    // Only BMS and pack rows; no actual 'pcs' component row
    const rows = [
      createMockRow(AFFECTED_ASSET_ID, 'bcms', 'BMS', {}, { soc: 50.0 }),
      createMockRow(AFFECTED_ASSET_ID, 'pack_01', 'PCS', {}),
      createMockRow(AFFECTED_ASSET_ID, 'tms', 'TMS', {}),
    ];

    const merged = mergeAssetTelemetryRows(rows, AFFECTED_ASSET_ID);

    expect(merged.bessPower).toBeUndefined();
    expect(merged.pcsDcVoltage).toBeUndefined();
    expect(merged.pcsTemp).toBeUndefined();
    expect(merged.todayChargeEnergy).toBeUndefined();
    expect(merged.todayDischargeEnergy).toBeUndefined();
    expect(merged.accChargeEnergy).toBeUndefined();
    expect(merged.accDischargeEnergy).toBeUndefined();
    expect(merged.bessPowerFactor).toBeUndefined();

    // BMS still populated
    expect(merged.bessSoc).toBe(50.0);
  });

  it('6. Correctly filters rows by assetId so other assets telemetry is not merged in', () => {
    const rows = [
      createMockRow(AFFECTED_ASSET_ID, 'pcs', 'PCS', { pcsActivePower: 5.0, dcVoltage: 860.0 }),
      createMockRow(OTHER_ASSET_ID, 'pcs', 'PCS', { pcsActivePower: 100.0, dcVoltage: 900.0 }),
    ];

    const affectedMerged = mergeAssetTelemetryRows(rows, AFFECTED_ASSET_ID);
    const otherMerged = mergeAssetTelemetryRows(rows, OTHER_ASSET_ID);

    expect(affectedMerged.bessPower).toBe(5.0);
    expect(affectedMerged.pcsDcVoltage).toBe(860.0);

    expect(otherMerged.bessPower).toBe(100.0);
    expect(otherMerged.pcsDcVoltage).toBe(900.0);
  });
});

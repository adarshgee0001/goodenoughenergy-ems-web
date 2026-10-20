import { describe, it, expect } from 'vitest';
import { calculatePackTemperatures, isRecognizedPackTemperatureSignal } from '../../src/utils/battery-status.util';
import { normalizeComponentSignals } from '../../src/services/mqtt.service';
import { telemetryService, TelemetryWithDevice } from '../../src/services/telemetry.service';
import {
  mergeWsPayload,
  buildStateFromRest,
  evaluateSignalFreshness,
} from '../../../frontend/src/features/dashboard/freshness.utils';
import type { DashboardTelemetryState, LatestTelemetryRow, DashboardDevice } from '../../../frontend/src/features/dashboard/dashboard.types';

describe('Battery Status Temperature Aggregation & Normalization', () => {
  describe('calculatePackTemperatures()', () => {
    it('Scenario 1: Correctly averages eligible readings and excludes trailing zeros', () => {
      // 20 active readings, 10 trailing zeros
      const readings = [
        25.0, 26.0, 24.5, 25.5, 26.2, 25.8, 24.9, 25.1, 26.0, 25.3,
        24.8, 25.4, 25.7, 26.1, 24.6, 25.2, 25.9, 26.3, 25.0, 25.5,
        0, 0, 0, 0, 0, 0, 0, 0, 0, 0
      ];

      const result = calculatePackTemperatures(readings);
      expect(result.eligibleCount).toBe(20);
      expect(result.maxTemp).toBe(26.3);
      // Sum of 20 readings = 508.8 / 20 = 25.44 -> 25.4
      expect(result.avgTemp).toBe(25.4);
    });

    it('Scenario 2: Strictly includes legitimate zeros inside the active sequence', () => {
      // Probe 2 has a legitimate 0.0°C reading, probe 4 has 20.0°C, followed by trailing zeros
      const readings = [10.0, 0.0, 10.0, 20.0, 0, 0, 0];
      const result = calculatePackTemperatures(readings);

      expect(result.eligibleCount).toBe(4);
      // (10 + 0 + 10 + 20) / 4 = 10.0
      expect(result.avgTemp).toBe(10.0);
      expect(result.maxTemp).toBe(20.0);
    });

    it('Scenario 3: Preserves negative temperatures', () => {
      const readings = [-10.0, -5.0, 0.0, 5.0, 0, 0];
      const result = calculatePackTemperatures(readings);

      expect(result.eligibleCount).toBe(4);
      // (-10 + -5 + 0 + 5) / 4 = -2.5
      expect(result.avgTemp).toBe(-2.5);
      expect(result.maxTemp).toBe(5.0);
    });

    it('Scenario 4: Discards null, undefined, NaN, and non-numeric values without zero-coercion', () => {
      const readings = [20.0, null, undefined, NaN, 'invalid', 30.0, 0, 0];
      const result = calculatePackTemperatures(readings);

      // Only 20.0 and 30.0 are valid eligible readings
      expect(result.eligibleCount).toBe(2);
      expect(result.avgTemp).toBe(25.0);
      expect(result.maxTemp).toBe(30.0);
    });

    it('Scenario 5: Returns undefined for all-zero pack (no invented measurement)', () => {
      const readings = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
      const result = calculatePackTemperatures(readings);

      expect(result.eligibleCount).toBe(0);
      expect(result.avgTemp).toBeUndefined();
      expect(result.maxTemp).toBeUndefined();
    });

    it('Scenario 6: Returns undefined for empty array', () => {
      const result = calculatePackTemperatures([]);
      expect(result.eligibleCount).toBe(0);
      expect(result.avgTemp).toBeUndefined();
      expect(result.maxTemp).toBeUndefined();
    });
  });

  describe('isRecognizedPackTemperatureSignal()', () => {
    it('Scenario 7: Identifies confirmed cell probes and pole temperature signals', () => {
      // Cell temperature probes ai_temp_01 .. ai_temp_28
      expect(isRecognizedPackTemperatureSignal('ai_temp_01')).toBe(true);
      expect(isRecognizedPackTemperatureSignal('ai_temp_14')).toBe(true);
      expect(isRecognizedPackTemperatureSignal('ai_temp_28')).toBe(true);
      expect(isRecognizedPackTemperatureSignal('ai_temp_1')).toBe(true);

      // Pole temperatures
      expect(isRecognizedPackTemperatureSignal('ai_negpol_temp')).toBe(true);
      expect(isRecognizedPackTemperatureSignal('ai_pospol_temp')).toBe(true);
    });

    it('Scenario 8: Rejects non-temperature signals, arbitrary keys, and malformed inputs', () => {
      expect(isRecognizedPackTemperatureSignal('ai_vol_01')).toBe(false);
      expect(isRecognizedPackTemperatureSignal('ai_voltage')).toBe(false);
      expect(isRecognizedPackTemperatureSignal('di_status')).toBe(false);
      expect(isRecognizedPackTemperatureSignal('ai_current')).toBe(false);
      expect(isRecognizedPackTemperatureSignal('random_key')).toBe(false);
      expect(isRecognizedPackTemperatureSignal('ai_temp')).toBe(false); // th's signal, not pack probe
      expect(isRecognizedPackTemperatureSignal('temp')).toBe(false);
      expect(isRecognizedPackTemperatureSignal('')).toBe(false);
      expect(isRecognizedPackTemperatureSignal(null)).toBe(false);
      expect(isRecognizedPackTemperatureSignal(undefined)).toBe(false);
      expect(isRecognizedPackTemperatureSignal(123)).toBe(false);
    });
  });

  describe('normalizeComponentSignals() Safe Signal Selection', () => {
    it('Scenario 9: th component populates batteryAmbientTemp and NEVER touches pcs.ambientTemp', () => {
      const thResult = normalizeComponentSignals('th', [
        { m: 'ai_temp', v: 24.8 },
        { m: 'ai_humi', v: 45.2 },
      ]);

      expect(thResult.wsData.batteryAmbientTemp).toBe(24.8);
      // Strict guard: ambientTemp named column must remain undefined
      expect(thResult.ambientTemp).toBeUndefined();
      expect(thResult.wsData.pcsTemp).toBeUndefined();
    });

    it('Scenario 10: pcs component populates ambientTemp and pcsTemp without touching batteryAmbientTemp', () => {
      const pcsResult = normalizeComponentSignals('pcs', [
        { m: 'ai_igbt_temp', v: 42.5 },
        { m: 'ai_p', v: 100.0 },
      ]);

      expect(pcsResult.ambientTemp).toBe(42.5);
      expect(pcsResult.wsData.pcsTemp).toBe(42.5);
      expect(pcsResult.wsData.batteryAmbientTemp).toBeUndefined();
    });

    it('Scenario 11: pack_01 through pack_05 components calculate packAvgTemp and packMaxTemp', () => {
      const signals = [
        { m: 'ai_temp_01', v: 28.0 },
        { m: 'ai_temp_02', v: 32.0 },
        { m: 'ai_temp_03', v: 0.0 }, // legitimate 0
        { m: 'ai_temp_04', v: 30.0 },
        { m: 'ai_temp_05', v: 0.0 }, // trailing 0
        { m: 'ai_temp_06', v: 0.0 }, // trailing 0
      ];

      const pack1Result = normalizeComponentSignals('pack_01', signals);
      expect(pack1Result.wsData.packAvgTemp).toBe(22.5); // (28 + 32 + 0 + 30) / 4 = 22.5
      expect(pack1Result.wsData.packMaxTemp).toBe(32.0);

      const pack5Result = normalizeComponentSignals('pack_05', signals);
      expect(pack5Result.wsData.packAvgTemp).toBe(22.5);
      expect(pack5Result.wsData.packMaxTemp).toBe(32.0);
    });

    it('Scenario 12: pack with all zeros leaves packAvgTemp and packMaxTemp undefined', () => {
      const allZeroSignals = [
        { m: 'ai_temp_01', v: 0 },
        { m: 'ai_temp_02', v: 0 },
        { m: 'ai_temp_03', v: 0 },
      ];

      const result = normalizeComponentSignals('pack_02', allZeroSignals);
      expect(result.wsData.packAvgTemp).toBeUndefined();
      expect(result.wsData.packMaxTemp).toBeUndefined();
    });

    it('Scenario 13: Fix B - unknown-only signals in pack return undefined without falling back to arbitrary values', () => {
      // Signals contain voltages and status flags, but no recognized temperature signals
      const nonTempSignals = [
        { m: 'ai_vol_01', v: 3.2 },
        { m: 'ai_vol_02', v: 3.2 },
        { m: 'di_status', v: 1 },
      ];

      const result = normalizeComponentSignals('pack_01', nonTempSignals);
      // Must NOT average arbitrary values (e.g. 3.2, 1) as a fallback
      expect(result.wsData.packAvgTemp).toBeUndefined();
      expect(result.wsData.packMaxTemp).toBeUndefined();
    });

    it('Scenario 14: Fix B - mixed temperature and non-temperature signals exclude non-temperature values', () => {
      const mixedSignals = [
        { m: 'ai_temp_01', v: 28.0 },
        { m: 'ai_temp_02', v: 32.0 },
        { m: 'ai_vol_01', v: 450.0 }, // Non-temperature: must be excluded!
        { m: 'di_status', v: 1 },     // Non-temperature: must be excluded!
        { m: 'ai_negpol_temp', v: 30.0 },
        { m: 'ai_pospol_temp', v: 30.0 },
      ];

      const result = normalizeComponentSignals('pack_03', mixedSignals);
      // Only 4 temperature signals: 28.0, 32.0, 30.0, 30.0
      // Sum = 120.0 / 4 = 30.0; Max = 32.0
      expect(result.wsData.packAvgTemp).toBe(30.0);
      expect(result.wsData.packMaxTemp).toBe(32.0);
    });
  });

  describe('telemetryService.mapToLivePayload() Cold-Load Replay', () => {
    it('Scenario 15: Fix A - reconstructs th batteryAmbientTemp from persisted rawPayload', () => {
      const mockRow: TelemetryWithDevice = {
        id: 'row-th-1',
        timestamp: new Date('2026-10-16T17:22:58.000Z'),
        deviceId: 'dev-th-1',
        voltageA: null, voltageB: null, voltageC: null,
        currentA: null, currentB: null, currentC: null,
        totalPower: null, pcsActivePower: null, dcVoltage: null,
        ambientTemp: null, todayChargeEnergy: null, todayDischargeEnergy: null,
        accumChargeEnergy: null, accumDischargeEnergy: null,
        soc: null, soh: null, bmsCurrent: null, cellVMax: null, cellVMin: null, cellTempMax: null,
        gridSideLoad: null, solarPower: null, gridFrequency: null, powerFactor: null,
        bessFrequency: null, bessPowerFactor: null, solarFrequency: null, solarPowerFactor: null,
        gridVoltageUab: null, gridVoltageUbc: null, gridVoltageUca: null,
        gridOnState: null, gridOffState: null, bessVoltageUa: null, bessVoltageUb: null, bessVoltageUc: null,
        ingestedAt: new Date(),
        rawPayload: [
          { m: 'ai_humdity', v: 46.9 },
          { m: 'ai_lp', v: 0 },
          { m: 'ai_temp', v: 30.1 },
          { m: 'di_comm_status', v: 0 },
        ],
        device: {
          id: 'dev-th-1',
          componentId: 'th',
          type: 'TMS',
          name: 'Battery Temperature Sensor',
          hardwareId: null,
          createdAt: new Date(),
          updatedAt: new Date(),
          bessAssetId: 'bess-1',
          bessAsset: { emuId: '2412131092' },
        },
      };

      const payload = telemetryService.mapToLivePayload('site-1', mockRow);
      expect(payload.type).toBe('telemetry');
      expect(payload.siteId).toBe('site-1');
      expect(payload.deviceId).toBe('dev-th-1');
      expect(payload.emuId).toBe('2412131092');
      expect(payload.componentId).toBe('th');
      expect(payload.timestamp).toBe('2026-10-16T17:22:58.000Z');
      expect(payload.data.batteryAmbientTemp).toBe(30.1);
      // Must NOT pollute pcsTemp
      expect(payload.data.pcsTemp).toBeUndefined();
    });

    it('Scenario 16: Fix A - reconstructs pack average and max temperature from persisted rawPayload', () => {
      const mockRow: TelemetryWithDevice = {
        id: 'row-pack-1',
        timestamp: new Date('2026-10-16T17:22:57.000Z'),
        deviceId: 'dev-pack-1',
        voltageA: null, voltageB: null, voltageC: null,
        currentA: null, currentB: null, currentC: null,
        totalPower: null, pcsActivePower: null, dcVoltage: null,
        ambientTemp: null, todayChargeEnergy: null, todayDischargeEnergy: null,
        accumChargeEnergy: null, accumDischargeEnergy: null,
        soc: null, soh: null, bmsCurrent: null, cellVMax: null, cellVMin: null, cellTempMax: null,
        gridSideLoad: null, solarPower: null, gridFrequency: null, powerFactor: null,
        bessFrequency: null, bessPowerFactor: null, solarFrequency: null, solarPowerFactor: null,
        gridVoltageUab: null, gridVoltageUbc: null, gridVoltageUca: null,
        gridOnState: null, gridOffState: null, bessVoltageUa: null, bessVoltageUb: null, bessVoltageUc: null,
        ingestedAt: new Date(),
        rawPayload: [
          { m: 'ai_negpol_temp', v: 29.5 },
          { m: 'ai_pospol_temp', v: 29.3 },
          { m: 'ai_temp_01', v: 29.3 },
          { m: 'ai_temp_02', v: 29.4 },
          { m: 'ai_temp_03', v: 29.2 },
          { m: 'ai_temp_04', v: 29.1 },
        ],
        device: {
          id: 'dev-pack-1',
          componentId: 'pack_01',
          type: 'BMS',
          name: 'Battery Pack 01',
          hardwareId: null,
          createdAt: new Date(),
          updatedAt: new Date(),
          bessAssetId: 'bess-1',
          bessAsset: { emuId: '2412131092' },
        },
      };

      const payload = telemetryService.mapToLivePayload('site-1', mockRow);
      expect(payload.type).toBe('telemetry');
      expect(payload.componentId).toBe('pack_01');
      expect(payload.data.packAvgTemp).toBe(29.3); // (29.5 + 29.3 + 29.3 + 29.4 + 29.2 + 29.1) / 6 = 29.3
      expect(payload.data.packMaxTemp).toBe(29.5);
    });

    it('Scenario 17: mapToLivePayload handles null or malformed rawPayload gracefully without inventing values', () => {
      const mockRow: TelemetryWithDevice = {
        id: 'row-pack-empty',
        timestamp: new Date('2026-10-16T17:22:57.000Z'),
        deviceId: 'dev-pack-empty',
        voltageA: null, voltageB: null, voltageC: null,
        currentA: null, currentB: null, currentC: null,
        totalPower: null, pcsActivePower: null, dcVoltage: null,
        ambientTemp: null, todayChargeEnergy: null, todayDischargeEnergy: null,
        accumChargeEnergy: null, accumDischargeEnergy: null,
        soc: null, soh: null, bmsCurrent: null, cellVMax: null, cellVMin: null, cellTempMax: null,
        gridSideLoad: null, solarPower: null, gridFrequency: null, powerFactor: null,
        bessFrequency: null, bessPowerFactor: null, solarFrequency: null, solarPowerFactor: null,
        gridVoltageUab: null, gridVoltageUbc: null, gridVoltageUca: null,
        gridOnState: null, gridOffState: null, bessVoltageUa: null, bessVoltageUb: null, bessVoltageUc: null,
        ingestedAt: new Date(),
        rawPayload: null, // Null rawPayload
        device: {
          id: 'dev-pack-empty',
          componentId: 'pack_02',
          type: 'BMS',
          name: 'Battery Pack 02',
          hardwareId: null,
          createdAt: new Date(),
          updatedAt: new Date(),
          bessAssetId: 'bess-1',
          bessAsset: { emuId: '2412131092' },
        },
      };

      const payload = telemetryService.mapToLivePayload('site-1', mockRow);
      expect(payload.data.packAvgTemp).toBeUndefined();
      expect(payload.data.packMaxTemp).toBeUndefined();
    });
  });

  describe('Frontend Freshness & State Ordering', () => {
    it('Scenario 18: mergeWsPayload rejects older out-of-order packets from overwriting newer measurements', () => {
      const t1 = '2026-10-16T17:20:00.000Z';
      const t2 = '2026-10-16T17:25:00.000Z';

      // Newer packet arrives first
      const state1 = mergeWsPayload({}, 'pack_01', { packAvgTemp: 29.5, packMaxTemp: 30.0 }, t2);
      expect(state1.packTemperatures?.['pack_01']?.avgTemp).toBe(29.5);
      expect(state1.packTemperatures?.['pack_01']?.measuredAt).toBe(t2);

      // Older out-of-order packet arrives second
      const state2 = mergeWsPayload(state1, 'pack_01', { packAvgTemp: 25.0, packMaxTemp: 26.0 }, t1);
      // Newer measurement must NOT be overwritten
      expect(state2.packTemperatures?.['pack_01']?.avgTemp).toBe(29.5);
      expect(state2.packTemperatures?.['pack_01']?.measuredAt).toBe(t2);
    });

    it('Scenario 19: evaluateSignalFreshness marks stale readings as unavailable (renders --)', () => {
      const now = Date.now();
      const tenMinutesAgo = new Date(now - 10 * 60 * 1000).toISOString();

      // TMS ambient freshness check (8-minute threshold)
      const staleAmbient = evaluateSignalFreshness({
        value: 30.1,
        measuredAt: tenMinutesAgo,
        componentType: 'tms',
        decimals: 1,
      });

      expect(staleAmbient.isStale).toBe(true);
      expect(staleAmbient.isFresh).toBe(false);

      // Pack BMS freshness check (8-minute threshold)
      const stalePack = evaluateSignalFreshness({
        value: 29.2,
        measuredAt: tenMinutesAgo,
        componentType: 'bcms',
        decimals: 1,
      });

      expect(stalePack.isStale).toBe(true);
      expect(stalePack.isFresh).toBe(false);
    });

    it('Scenario 20: buildStateFromRest extracts th and pack temperatures from REST rows', () => {
      const mockRows: LatestTelemetryRow[] = [
        {
          id: 'r1',
          deviceId: 'd-th',
          timestamp: '2026-10-16T17:22:58.000Z',
          pcsActivePower: null, dcVoltage: null, ambientTemp: null, todayChargeEnergy: null,
          todayDischargeEnergy: null, accumChargeEnergy: null, accumDischargeEnergy: null,
          voltageA: null, voltageB: null, voltageC: null, currentA: null, currentB: null,
          currentC: null, totalPower: null, gridSideLoad: null, solarPower: null,
          solarFrequency: null, solarPowerFactor: null, gridFrequency: null, powerFactor: null,
          bessFrequency: null, bessPowerFactor: null, soc: null, soh: null, bmsCurrent: null,
          cellVMax: null, cellVMin: null, cellTempMax: null,
          rawPayload: [{ m: 'ai_temp', v: 30.1 }],
          ingestedAt: '2026-10-16T17:23:00.000Z',
          device: { id: 'd-th', componentId: 'th', type: 'TMS', name: 'TH Sensor', bessAssetId: 'bess-1' },
        },
        {
          id: 'r2',
          deviceId: 'd-pack1',
          timestamp: '2026-10-16T17:22:57.000Z',
          pcsActivePower: null, dcVoltage: null, ambientTemp: null, todayChargeEnergy: null,
          todayDischargeEnergy: null, accumChargeEnergy: null, accumDischargeEnergy: null,
          voltageA: null, voltageB: null, voltageC: null, currentA: null, currentB: null,
          currentC: null, totalPower: null, gridSideLoad: null, solarPower: null,
          solarFrequency: null, solarPowerFactor: null, gridFrequency: null, powerFactor: null,
          bessFrequency: null, bessPowerFactor: null, soc: null, soh: null, bmsCurrent: null,
          cellVMax: null, cellVMin: null, cellTempMax: null,
          rawPayload: [
            { m: 'ai_negpol_temp', v: 29.0 },
            { m: 'ai_pospol_temp', v: 29.0 },
            { m: 'ai_temp_01', v: 30.0 },
            { m: 'ai_temp_02', v: 32.0 },
          ],
          ingestedAt: '2026-10-16T17:23:00.000Z',
          device: { id: 'd-pack1', componentId: 'pack_01', type: 'BMS', name: 'Pack 01', bessAssetId: 'bess-1' },
        },
      ];

      const devices: DashboardDevice[] = [
        { id: 'd-th', name: 'TH Sensor', type: 'TMS', componentId: 'th', emuId: '2412131092', bessAssetId: 'bess-1' },
        { id: 'd-pack1', name: 'Pack 01', type: 'BMS', componentId: 'pack_01', emuId: '2412131092', bessAssetId: 'bess-1' },
      ];

      const state = buildStateFromRest(mockRows, devices);
      expect(state['bess-1']?.batteryAmbientTemp).toBe(30.1);
      expect(state['bess-1']?.batteryAmbientTempMeasuredAt).toBe('2026-10-16T17:22:58.000Z');
      expect(state['bess-1']?.packTemperatures?.['pack_01']?.avgTemp).toBe(30.0);
      expect(state['bess-1']?.packTemperatures?.['pack_01']?.maxTemp).toBe(32.0);
    });
  });
});


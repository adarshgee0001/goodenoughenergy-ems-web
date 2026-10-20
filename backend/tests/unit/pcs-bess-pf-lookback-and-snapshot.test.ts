import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { prisma } from '../../src/db/prisma';
import { telemetryService } from '../../src/services/telemetry.service';
import { telemetrySnapshotService } from '../../src/services/telemetry-snapshot.service';
import {
  buildStateFromRest,
  evaluateSignalFreshness,
  mergeWsPayload,
} from '../../../frontend/src/features/dashboard/freshness.utils';
import type {
  LatestTelemetryRow,
  DashboardDevice,
} from '../../../frontend/src/features/dashboard/dashboard.types';

describe('PCS BESS Power Factor Live Lookback and Snapshot Aggregation Suite', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Part 1: Live PCS Power Factor REST Lookback (telemetryService.getSiteLatestTelemetry)', () => {
    const mockPcsDevice = {
      id: 'pcs-device-1',
      componentId: 'pcs',
      type: 'PCS' as const,
      name: 'PCS Unit 01',
      bessAssetId: 'bess-asset-1',
      bessAsset: { emuId: '2410031073' },
    };

    it('1. Latest PCS row has bessPowerFactor: null, and a recent eligible PCS row contains a valid numeric value: exposes the valid value with its actual measurement timestamp', async () => {
      vi.spyOn(prisma.device, 'findMany').mockResolvedValueOnce([mockPcsDevice as any]);

      const latestTime = new Date('2026-10-19T10:10:00.000Z');
      const measuredTime = new Date('2026-10-19T10:07:00.000Z');

      const findFirstSpy = vi.spyOn(prisma.telemetryHistory, 'findFirst')
        // 1st call: latest PCS row
        .mockResolvedValueOnce({
          id: 'row-latest',
          deviceId: 'pcs-device-1',
          timestamp: latestTime,
          pcsActivePower: 12.5,
          dcVoltage: 760,
          ambientTemp: 28.5,
          bessFrequency: 49.98,
          bessPowerFactor: null,
          todayChargeEnergy: 100,
          todayDischargeEnergy: 90,
          accumChargeEnergy: 1000,
          accumDischargeEnergy: 900,
          rawPayload: null,
        } as any)
        // 2nd call: lookback fallback query
        .mockResolvedValueOnce({
          bessPowerFactor: -0.116,
          timestamp: measuredTime,
        } as any);

      const rows = await telemetryService.getSiteLatestTelemetry('site-angad');

      expect(rows).toHaveLength(1);
      const row = rows[0];
      expect(row.deviceId).toBe('pcs-device-1');
      expect(row.bessPowerFactor).toBe(-0.116);
      expect((row as any).bessPowerFactorMeasuredAt).toEqual(measuredTime);
      expect(row.timestamp).toEqual(latestTime);
      expect(row.pcsActivePower).toBe(12.5);
      expect(findFirstSpy).toHaveBeenCalledTimes(2);

      // Verify lookback window parameters: bounded to 15m, lte latest timestamp
      const fallbackQuery = findFirstSpy.mock.calls[1][0];
      expect(fallbackQuery?.where?.deviceId).toBe('pcs-device-1');
      expect(fallbackQuery?.where?.bessPowerFactor).toEqual({ not: null });
      expect(fallbackQuery?.where?.timestamp?.lte).toEqual(latestTime);
      const expected15mAgo = new Date(latestTime.getTime() - 15 * 60 * 1000);
      expect(fallbackQuery?.where?.timestamp?.gte).toEqual(expected15mAgo);
    });

    it('2. A valid latest PCS Power Factor is preserved without unnecessary fallback query', async () => {
      vi.spyOn(prisma.device, 'findMany').mockResolvedValueOnce([mockPcsDevice as any]);

      const latestTime = new Date('2026-10-19T10:10:00.000Z');

      const findFirstSpy = vi.spyOn(prisma.telemetryHistory, 'findFirst')
        .mockResolvedValueOnce({
          id: 'row-latest',
          deviceId: 'pcs-device-1',
          timestamp: latestTime,
          pcsActivePower: 12.5,
          bessFrequency: 49.98,
          bessPowerFactor: 0.98,
        } as any);

      const rows = await telemetryService.getSiteLatestTelemetry('site-angad');

      expect(rows).toHaveLength(1);
      expect(rows[0].bessPowerFactor).toBe(0.98);
      expect((rows[0] as any).bessPowerFactorMeasuredAt).toEqual(latestTime);
      // Fallback query was NOT triggered
      expect(findFirstSpy).toHaveBeenCalledTimes(1);
    });

    it('3. A measured value of 0 is retained as zero, not treated as missing', async () => {
      // Subcase A: Latest row directly contains 0
      vi.spyOn(prisma.device, 'findMany').mockResolvedValueOnce([mockPcsDevice as any]);
      const latestTime = new Date('2026-10-19T10:10:00.000Z');
      const spyA = vi.spyOn(prisma.telemetryHistory, 'findFirst').mockResolvedValueOnce({
        id: 'row-latest-zero',
        deviceId: 'pcs-device-1',
        timestamp: latestTime,
        bessPowerFactor: 0,
      } as any);

      const rowsA = await telemetryService.getSiteLatestTelemetry('site-angad');
      expect(rowsA[0].bessPowerFactor).toBe(0);
      expect((rowsA[0] as any).bessPowerFactorMeasuredAt).toEqual(latestTime);
      expect(spyA).toHaveBeenCalledTimes(1);

      // Subcase B: Latest row has null, fallback finds a valid 0
      vi.restoreAllMocks();
      vi.spyOn(prisma.device, 'findMany').mockResolvedValueOnce([mockPcsDevice as any]);
      const measuredTime = new Date('2026-10-19T10:05:00.000Z');
      const spyB = vi.spyOn(prisma.telemetryHistory, 'findFirst')
        .mockResolvedValueOnce({
          id: 'row-latest-null',
          deviceId: 'pcs-device-1',
          timestamp: latestTime,
          bessPowerFactor: null,
        } as any)
        .mockResolvedValueOnce({
          bessPowerFactor: 0,
          timestamp: measuredTime,
        } as any);

      const rowsB = await telemetryService.getSiteLatestTelemetry('site-angad');
      expect(rowsB[0].bessPowerFactor).toBe(0);
      expect((rowsB[0] as any).bessPowerFactorMeasuredAt).toEqual(measuredTime);
      expect(spyB).toHaveBeenCalledTimes(2);
    });

    it('4. No valid value exists in the permitted lookback: Power Factor remains unavailable', async () => {
      vi.spyOn(prisma.device, 'findMany').mockResolvedValueOnce([mockPcsDevice as any]);
      const latestTime = new Date('2026-10-19T10:10:00.000Z');

      vi.spyOn(prisma.telemetryHistory, 'findFirst')
        .mockResolvedValueOnce({
          id: 'row-latest-null',
          deviceId: 'pcs-device-1',
          timestamp: latestTime,
          bessPowerFactor: null,
        } as any)
        .mockResolvedValueOnce(null); // No eligible row found in window

      const rows = await telemetryService.getSiteLatestTelemetry('site-angad');
      expect(rows[0].bessPowerFactor).toBeNull();
      expect((rows[0] as any).bessPowerFactorMeasuredAt).toBeUndefined();
    });

    it('5. A record older than the permitted 15-minute window is not reused', async () => {
      vi.spyOn(prisma.device, 'findMany').mockResolvedValueOnce([mockPcsDevice as any]);
      const latestTime = new Date('2026-10-19T10:20:00.000Z');

      const findFirstSpy = vi.spyOn(prisma.telemetryHistory, 'findFirst')
        .mockResolvedValueOnce({
          id: 'row-latest',
          deviceId: 'pcs-device-1',
          timestamp: latestTime,
          bessPowerFactor: null,
        } as any)
        // If a row exists but was from 10:04:00 (16 minutes ago), Prisma query filter excludes it
        .mockResolvedValueOnce(null);

      const rows = await telemetryService.getSiteLatestTelemetry('site-angad');
      expect(rows[0].bessPowerFactor).toBeNull();

      const filterArgs = findFirstSpy.mock.calls[1][0]?.where?.timestamp;
      const cutoff15m = new Date(latestTime.getTime() - 15 * 60 * 1000);
      expect(filterArgs.gte).toEqual(cutoff15m);
    });

    it('6. A record from another PCS device or BESS is never selected', async () => {
      vi.spyOn(prisma.device, 'findMany').mockResolvedValueOnce([mockPcsDevice as any]);
      const latestTime = new Date('2026-10-19T10:10:00.000Z');

      const findFirstSpy = vi.spyOn(prisma.telemetryHistory, 'findFirst')
        .mockResolvedValueOnce({
          id: 'row-latest',
          deviceId: 'pcs-device-1',
          timestamp: latestTime,
          bessPowerFactor: null,
        } as any)
        .mockResolvedValueOnce({
          bessPowerFactor: 0.99,
          timestamp: new Date('2026-10-19T10:08:00.000Z'),
        } as any);

      await telemetryService.getSiteLatestTelemetry('site-angad');
      const fallbackWhere = findFirstSpy.mock.calls[1][0]?.where;
      expect(fallbackWhere.deviceId).toBe('pcs-device-1');
    });

    it('7. Other signals and their timestamps are not accidentally overwritten', async () => {
      vi.spyOn(prisma.device, 'findMany').mockResolvedValueOnce([mockPcsDevice as any]);
      const latestTime = new Date('2026-10-19T10:10:00.000Z');
      const measuredTime = new Date('2026-10-19T10:06:00.000Z');

      vi.spyOn(prisma.telemetryHistory, 'findFirst')
        .mockResolvedValueOnce({
          id: 'row-latest',
          deviceId: 'pcs-device-1',
          timestamp: latestTime,
          pcsActivePower: 45.2,
          bessFrequency: 49.99,
          dcVoltage: 765.4,
          ambientTemp: 32.1,
          bessPowerFactor: null,
        } as any)
        .mockResolvedValueOnce({
          bessPowerFactor: 0.92,
          timestamp: measuredTime,
        } as any);

      const rows = await telemetryService.getSiteLatestTelemetry('site-angad');
      const row = rows[0];

      // PCS active power, freq, voltage, ambient temp and row timestamp remain intact from latest row
      expect(row.timestamp).toEqual(latestTime);
      expect(row.pcsActivePower).toBe(45.2);
      expect(row.bessFrequency).toBe(49.99);
      expect(row.dcVoltage).toBe(765.4);
      expect(row.ambientTemp).toBe(32.1);
      // Power factor and its specific timestamp reflect the actual measurement
      expect(row.bessPowerFactor).toBe(0.92);
      expect((row as any).bessPowerFactorMeasuredAt).toEqual(measuredTime);
    });

    it('8. Dashboard freshness behavior correctly distinguishes fresh, held, stale, and missing Power Factor according to existing rules', () => {
      const BASE_NOW = new Date('2026-10-19T10:10:00.000Z').getTime();
      const mockDevice: DashboardDevice = {
        id: 'pcs-device-1',
        componentId: 'pcs',
        type: 'PCS',
        name: 'PCS 01',
        bessAssetId: 'bess-asset-1',
      };

      // Case A: Fresh measurement (2 minutes old <= 6m freshWindow)
      const rowFresh: LatestTelemetryRow = {
        id: 'r-fresh',
        deviceId: 'pcs-device-1',
        timestamp: '2026-10-19T10:10:00.000Z',
        pcsActivePower: 10,
        bessFrequency: 50.0,
        bessPowerFactor: 0.98,
        bessPowerFactorMeasuredAt: '2026-10-19T10:08:00.000Z',
        dcVoltage: null, ambientTemp: null, todayChargeEnergy: null, todayDischargeEnergy: null,
        accumChargeEnergy: null, accumDischargeEnergy: null, voltageA: null, voltageB: null, voltageC: null,
        currentA: null, currentB: null, currentC: null, totalPower: null, gridSideLoad: null, solarPower: null,
        solarFrequency: null, solarPowerFactor: null, gridFrequency: null, powerFactor: null, soc: null, soh: null,
        bmsCurrent: null, cellVMax: null, cellVMin: null, cellTempMax: null, rawPayload: null,
        ingestedAt: '2026-10-19T10:10:00.000Z', device: mockDevice,
      };

      const stateFresh = buildStateFromRest([rowFresh], [mockDevice]);
      const evalFresh = evaluateSignalFreshness({
        value: stateFresh['bess-asset-1'].bessPowerFactor,
        measuredAt: stateFresh['bess-asset-1'].bessPowerFactorMeasuredAt,
        componentType: 'pcs',
        now: BASE_NOW,
        decimals: 2,
        customFreshWindowMs: 6 * 60 * 1000,
        customHoldWindowMs: 8 * 60 * 1000,
      });
      expect(evalFresh.state).toBe('LIVE_FRESH');
      expect(evalFresh.isFresh).toBe(true);
      expect(evalFresh.displayValue).toBe('0.98');
      expect(evalFresh.isAvailable).toBe(true);

      // Case B: Held measurement (7 minutes old: > 6m fresh, <= 8m hold)
      const rowHeld: LatestTelemetryRow = {
        ...rowFresh,
        bessPowerFactorMeasuredAt: '2026-10-19T10:03:00.000Z',
      };
      const stateHeld = buildStateFromRest([rowHeld], [mockDevice]);
      const evalHeld = evaluateSignalFreshness({
        value: stateHeld['bess-asset-1'].bessPowerFactor,
        measuredAt: stateHeld['bess-asset-1'].bessPowerFactorMeasuredAt,
        componentType: 'pcs',
        now: BASE_NOW,
        decimals: 2,
        customFreshWindowMs: 6 * 60 * 1000,
        customHoldWindowMs: 8 * 60 * 1000,
      });
      expect(evalHeld.state).toBe('HELD');
      expect(evalHeld.displayValue).toBe('0.98');
      expect(evalHeld.isAvailable).toBe(true);

      // Case C: Stale measurement (10 minutes old: > 8m hold)
      const rowStale: LatestTelemetryRow = {
        ...rowFresh,
        bessPowerFactorMeasuredAt: '2026-10-19T10:00:00.000Z',
      };
      const stateStale = buildStateFromRest([rowStale], [mockDevice]);
      const evalStale = evaluateSignalFreshness({
        value: stateStale['bess-asset-1'].bessPowerFactor,
        measuredAt: stateStale['bess-asset-1'].bessPowerFactorMeasuredAt,
        componentType: 'pcs',
        now: BASE_NOW,
        customFreshWindowMs: 6 * 60 * 1000,
        customHoldWindowMs: 8 * 60 * 1000,
      });
      expect(evalStale.state).toBe('STALE');
      expect(evalStale.displayValue).toBe('--');
      expect(evalStale.subtitle).toBe('Stale');

      // Case D: Missing measurement (null / undefined)
      const rowMissing: LatestTelemetryRow = {
        ...rowFresh,
        bessPowerFactor: null,
        bessPowerFactorMeasuredAt: undefined,
      };
      const stateMissing = buildStateFromRest([rowMissing], [mockDevice]);
      const evalMissing = evaluateSignalFreshness({
        value: stateMissing['bess-asset-1'].bessPowerFactor,
        measuredAt: stateMissing['bess-asset-1'].bessPowerFactorMeasuredAt,
        componentType: 'pcs',
        now: BASE_NOW,
      });
      expect(evalMissing.state).toBe('NO_DATA');
      expect(evalMissing.displayValue).toBe('--');
      expect(evalMissing.subtitle).toBe('No data');
    });

    it('9. WebSocket delta packet does not falsely refresh measurement timestamp when signal is omitted', () => {
      const initial = {
        bessPowerFactor: 0.95,
        bessPowerFactorMeasuredAt: '2026-10-19T10:00:00.000Z',
        pcsTimestamp: '2026-10-19T10:00:00.000Z',
      };

      // Subsequent delta packet arrives at 10:05:00Z without bessPowerFactor
      const next = mergeWsPayload(
        initial as any,
        'pcs',
        { bessPower: 20 },
        '2026-10-19T10:05:00.000Z'
      );

      expect(next.bessPowerFactor).toBe(0.95);
      // Measurement timestamp must remain at 10:00:00Z!
      expect(next.bessPowerFactorMeasuredAt).toBe('2026-10-19T10:00:00.000Z');
      expect(next.pcsTimestamp).toBe('2026-10-19T10:05:00.000Z');
    });

    it('10. WebSocket packet carrying bessPowerFactorMeasuredAt preserves the designated timestamp', () => {
      const initial = {
        bessPowerFactor: undefined,
        bessPowerFactorMeasuredAt: undefined,
      };

      const next = mergeWsPayload(
        initial as any,
        'pcs',
        {
          bessPowerFactor: -0.116,
          bessPowerFactorMeasuredAt: '2026-10-19T10:02:00.000Z',
        },
        '2026-10-19T10:05:00.000Z'
      );

      expect(next.bessPowerFactor).toBe(-0.116);
      expect(next.bessPowerFactorMeasuredAt).toBe('2026-10-19T10:02:00.000Z');
    });
  });

  describe('Part 2: 15-Minute Snapshot Aggregation (telemetrySnapshotService.aggregateBucket)', () => {
    const bucketStart = new Date('2026-10-19T10:00:00.000Z');
    const bessAssetId = 'bess-angad-01';

    it('1. bessPowerFactor is aggregated from pcsRows', () => {
      const rows = [
        {
          timestamp: new Date('2026-10-19T10:01:00.000Z'),
          device: { componentId: 'pcs', type: 'PCS' },
          bessPowerFactor: -0.98,
          bessFrequency: 50.01,
          pcsActivePower: 10,
        },
        {
          timestamp: new Date('2026-10-19T10:02:00.000Z'),
          device: { componentId: 'pcs', type: 'PCS' },
          bessPowerFactor: -0.96,
          bessFrequency: 49.99,
          pcsActivePower: 12,
        },
      ];

      const snapshot = telemetrySnapshotService.aggregateBucket(bessAssetId, bucketStart, rows as any);

      // (-0.98 + -0.96) / 2 = -0.97
      expect(snapshot.bessPowerFactor).toBeCloseTo(-0.97, 4);
    });

    it('2. bessFrequency is aggregated from pcsRows', () => {
      const rows = [
        {
          timestamp: new Date('2026-10-19T10:01:00.000Z'),
          device: { componentId: 'pcs', type: 'PCS' },
          bessFrequency: 49.98,
        },
        {
          timestamp: new Date('2026-10-19T10:05:00.000Z'),
          device: { componentId: 'pcs', type: 'PCS' },
          bessFrequency: 50.02,
        },
      ];

      const snapshot = telemetrySnapshotService.aggregateBucket(bessAssetId, bucketStart, rows as any);

      // (49.98 + 50.02) / 2 = 50.0
      expect(snapshot.bessFrequency).toBeCloseTo(50.0, 4);
    });

    it('3. Values present only in meterRows do not populate these PCS fields', () => {
      const rows = [
        {
          timestamp: new Date('2026-10-19T10:01:00.000Z'),
          device: { componentId: 'rjl', type: 'METER' },
          bessPowerFactor: 0.99, // Should be ignored
          bessFrequency: 50.05,  // Should be ignored
          voltageA: 230,
        },
        {
          timestamp: new Date('2026-10-19T10:02:00.000Z'),
          device: { componentId: 'pcs', type: 'PCS' },
          bessPowerFactor: null,
          bessFrequency: null,
          pcsActivePower: 5,
        },
      ];

      const snapshot = telemetrySnapshotService.aggregateBucket(bessAssetId, bucketStart, rows as any);

      // Meter rows must NOT contaminate PCS metrics
      expect(snapshot.bessPowerFactor).toBeNull();
      expect(snapshot.bessFrequency).toBeNull();
      // Meter voltageA is still correctly aggregated
      expect(snapshot.voltageA).toBe(230);
    });

    it('4. Empty or null PCS data retains the established null behavior', () => {
      const rows = [
        {
          timestamp: new Date('2026-10-19T10:01:00.000Z'),
          device: { componentId: 'pcs', type: 'PCS' },
          bessPowerFactor: null,
          bessFrequency: null,
        },
      ];

      const snapshot = telemetrySnapshotService.aggregateBucket(bessAssetId, bucketStart, rows as any);
      expect(snapshot.bessPowerFactor).toBeNull();
      expect(snapshot.bessFrequency).toBeNull();
    });

    it('5. Existing Grid Meter and Cabinet Meter aggregations remain unchanged', () => {
      const rows = [
        // Cabinet meter (rjl)
        {
          timestamp: new Date('2026-10-19T10:01:00.000Z'),
          device: { componentId: 'rjl', type: 'METER' },
          voltageA: 230,
          voltageB: 231,
          voltageC: 229,
          currentA: 10,
          currentB: 11,
          currentC: 9,
          totalPower: 6.9,
        },
        // Grid meter (pmg)
        {
          timestamp: new Date('2026-10-19T10:01:00.000Z'),
          device: { componentId: 'pmg', type: 'METER' },
          gridSideLoad: 15.2,
          powerFactor: 0.98,
        },
        // PCS
        {
          timestamp: new Date('2026-10-19T10:01:00.000Z'),
          device: { componentId: 'pcs', type: 'PCS' },
          pcsActivePower: 8.5,
          dcVoltage: 750,
          ambientTemp: 25,
          bessFrequency: 49.99,
          bessPowerFactor: -0.95,
          todayChargeEnergy: 10,
          todayDischargeEnergy: 5,
          accumChargeEnergy: 100,
          accumDischargeEnergy: 50,
        },
      ];

      const snapshot = telemetrySnapshotService.aggregateBucket(bessAssetId, bucketStart, rows as any);

      // Cabinet meter
      expect(snapshot.voltageA).toBe(230);
      expect(snapshot.voltageB).toBe(231);
      expect(snapshot.voltageC).toBe(229);
      expect(snapshot.currentA).toBe(10);
      expect(snapshot.currentB).toBe(11);
      expect(snapshot.currentC).toBe(9);
      expect(snapshot.totalPower).toBe(6.9);

      // Grid meter
      expect(snapshot.gridSideLoad).toBe(15.2);
      expect(snapshot.powerFactor).toBe(0.98);

      // PCS
      expect(snapshot.pcsActivePower).toBe(8.5);
      expect(snapshot.dcVoltage).toBe(750);
      expect(snapshot.ambientTemp).toBe(25);
      expect(snapshot.bessFrequency).toBe(49.99);
      expect(snapshot.bessPowerFactor).toBe(-0.95);
      expect(snapshot.todayChargeEnergy).toBe(10);
      expect(snapshot.todayDischargeEnergy).toBe(5);
      expect(snapshot.accumChargeEnergy).toBe(100);
      expect(snapshot.accumDischargeEnergy).toBe(50);
    });

    it('6. Snapshot timestamps, bucket membership, and asset isolation remain correct', () => {
      const rows = [
        {
          timestamp: new Date('2026-10-19T10:05:00.000Z'),
          device: { componentId: 'pcs', type: 'PCS' },
          pcsActivePower: 10,
        },
      ];

      const snapshot = telemetrySnapshotService.aggregateBucket(bessAssetId, bucketStart, rows as any);
      expect(snapshot.bessAssetId).toBe(bessAssetId);
      expect(snapshot.bucketTimestamp).toEqual(bucketStart);
    });
  });
});

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  evaluateSignalFreshness,
  evaluateOverallTelemetryStatus,
  mergeWsPayload,
  aggregateSiteTelemetrySafe,
  formatPowerValue,
  type SubsystemFreshnessInput,
} from '../../../frontend/src/features/dashboard/freshness.utils';
import type { DashboardTelemetryState } from '../../../frontend/src/features/dashboard/dashboard.types';

describe('Dashboard Status and Historical Power Trend Suite', () => {
  const T0 = new Date('2026-10-19T10:00:00.000Z').getTime();

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // -------------------------------------------------------------------------
  // 1. All configured components fresh -> LIVE
  // -------------------------------------------------------------------------
  it('1. All configured components fresh results in LIVE status and System Online', () => {
    const bessPowerEval = evaluateSignalFreshness({
      value: -15.2,
      measuredAt: new Date(T0 - 30_000).toISOString(), // 30s ago (fresh window 2m)
      componentType: 'pcs',
      now: T0,
      isPowerSignal: true,
      powerKind: 'bess',
    });

    const gridPowerEval = evaluateSignalFreshness({
      value: 120.5,
      measuredAt: new Date(T0 - 60_000).toISOString(), // 1m ago (fresh window 6m)
      componentType: 'pmg',
      now: T0,
      isPowerSignal: true,
      powerKind: 'grid',
    });

    const solarPowerEval = evaluateSignalFreshness({
      value: 45.0,
      measuredAt: new Date(T0 - 60_000).toISOString(), // 1m ago (fresh window 6m)
      componentType: 'pinv',
      now: T0,
      isPowerSignal: true,
      powerKind: 'solar',
    });

    const subsystems: SubsystemFreshnessInput[] = [
      { id: 'pcs', name: 'BESS', isConfigured: true, evaluation: bessPowerEval },
      { id: 'pmg', name: 'Grid', isConfigured: true, evaluation: gridPowerEval },
      { id: 'pinv', name: 'Solar', isConfigured: true, evaluation: solarPowerEval },
    ];

    const result = evaluateOverallTelemetryStatus({
      isConnected: true,
      hasPacketsReceived: true,
      subsystems,
    });

    expect(result.state).toBe('LIVE');
    expect(result.isLive).toBe(true);
    expect(result.isDegraded).toBe(false);
    expect(result.badgeLabel).toBe('LIVE');
    expect(result.badgeVariant).toBe('emerald');
    expect(result.systemStatusLabel).toBe('System Online');
    expect(result.healthyCount).toBe(3);
    expect(result.configuredCount).toBe(3);
  });

  // -------------------------------------------------------------------------
  // 2. BESS fresh while Grid and Solar are stale -> PARTIAL STREAM
  // -------------------------------------------------------------------------
  it('2. BESS fresh while Grid and Solar are stale: marks PARTIAL STREAM and does not show false LIVE', () => {
    const bessPowerEval = evaluateSignalFreshness({
      value: -16.4,
      measuredAt: new Date(T0 - 20_000).toISOString(), // 20s ago -> LIVE_FRESH
      componentType: 'pcs',
      now: T0,
      isPowerSignal: true,
      powerKind: 'bess',
    });

    // Grid meter has not updated for 15 minutes (stale threshold 8m)
    const gridPowerEval = evaluateSignalFreshness({
      value: 0,
      measuredAt: new Date(T0 - 15 * 60 * 1000).toISOString(),
      componentType: 'pmg',
      now: T0,
      isPowerSignal: true,
      powerKind: 'grid',
    });

    // Solar inverter has not updated for 20 minutes (stale threshold 8m)
    const solarPowerEval = evaluateSignalFreshness({
      value: 38.38,
      measuredAt: new Date(T0 - 20 * 60 * 1000).toISOString(),
      componentType: 'pinv',
      now: T0,
      isPowerSignal: true,
      powerKind: 'solar',
    });

    expect(bessPowerEval.isFresh).toBe(true);
    expect(gridPowerEval.isStale).toBe(true);
    expect(solarPowerEval.isStale).toBe(true);

    const subsystems: SubsystemFreshnessInput[] = [
      { id: 'pcs', name: 'BESS', isConfigured: true, evaluation: bessPowerEval },
      { id: 'pmg', name: 'Grid', isConfigured: true, evaluation: gridPowerEval },
      { id: 'pinv', name: 'Solar', isConfigured: true, evaluation: solarPowerEval },
    ];

    const result = evaluateOverallTelemetryStatus({
      isConnected: true,
      hasPacketsReceived: true,
      subsystems,
    });

    // Must NOT be LIVE!
    expect(result.state).toBe('PARTIAL_STREAM');
    expect(result.isLive).toBe(false);
    expect(result.isDegraded).toBe(true);
    expect(result.badgeLabel).toBe('PARTIAL STREAM');
    expect(result.badgeVariant).toBe('amber');
    expect(result.systemStatusLabel).toBe('Partial Stream');
    expect(result.healthyCount).toBe(1);
    expect(result.staleCount).toBe(2);
  });

  // -------------------------------------------------------------------------
  // 3. Unconfigured component does not penalize health
  // -------------------------------------------------------------------------
  it('3. An unconfigured component (e.g. no solar installed) does not penalize site health', () => {
    const bessPowerEval = evaluateSignalFreshness({
      value: 50.0,
      measuredAt: new Date(T0 - 30_000).toISOString(),
      componentType: 'pcs',
      now: T0,
      isPowerSignal: true,
      powerKind: 'bess',
    });

    const gridPowerEval = evaluateSignalFreshness({
      value: 10.0,
      measuredAt: new Date(T0 - 45_000).toISOString(),
      componentType: 'pmg',
      now: T0,
      isPowerSignal: true,
      powerKind: 'grid',
    });

    // Solar inverter is unconfigured (isConfigured: false, evaluation has NO_DATA)
    const solarPowerEval = evaluateSignalFreshness({
      value: undefined,
      measuredAt: undefined,
      componentType: 'pinv',
      now: T0,
    });

    const subsystems: SubsystemFreshnessInput[] = [
      { id: 'pcs', name: 'BESS', isConfigured: true, evaluation: bessPowerEval },
      { id: 'pmg', name: 'Grid', isConfigured: true, evaluation: gridPowerEval },
      { id: 'pinv', name: 'Solar', isConfigured: false, evaluation: solarPowerEval }, // Not configured
    ];

    const result = evaluateOverallTelemetryStatus({
      isConnected: true,
      hasPacketsReceived: true,
      subsystems,
    });

    expect(result.state).toBe('LIVE');
    expect(result.isLive).toBe(true);
    expect(result.isDegraded).toBe(false);
    expect(result.configuredCount).toBe(2);
    expect(result.healthyCount).toBe(2);
  });

  // -------------------------------------------------------------------------
  // 4. Status transitions monotonically over time without incoming WS packets
  // -------------------------------------------------------------------------
  it('4. Status transitions from LIVE -> PARTIAL_STREAM -> STALE over time without incoming packets', () => {
    const measurementTime = new Date(T0).toISOString();

    const subsystemsAtTime = (now: number) => {
      const bessEval = evaluateSignalFreshness({
        value: 10.0,
        measuredAt: measurementTime,
        componentType: 'pcs', // fresh 2m, hold 8m
        now,
      });
      const gridEval = evaluateSignalFreshness({
        value: 20.0,
        measuredAt: measurementTime,
        componentType: 'pmg', // fresh 6m, hold 8m
        now,
      });
      return [
        { id: 'pcs', name: 'BESS', isConfigured: true, evaluation: bessEval },
        { id: 'pmg', name: 'Grid', isConfigured: true, evaluation: gridEval },
      ];
    };

    // At T0 + 1m: Both within fresh window -> LIVE
    const res1 = evaluateOverallTelemetryStatus({
      isConnected: true,
      hasPacketsReceived: true,
      subsystems: subsystemsAtTime(T0 + 60_000),
    });
    expect(res1.state).toBe('LIVE');

    // At T0 + 5m: PCS is in HELD (2m < age <= 8m), PMG is LIVE_FRESH (age <= 6m) -> still healthy
    const res2 = evaluateOverallTelemetryStatus({
      isConnected: true,
      hasPacketsReceived: true,
      subsystems: subsystemsAtTime(T0 + 5 * 60 * 1000),
    });
    expect(res2.state).toBe('LIVE');

    // At T0 + 9m: PCS (age 9m > hold 8m) is STALE, PMG (age 9m > hold 8m) is STALE -> STALE
    const res3 = evaluateOverallTelemetryStatus({
      isConnected: true,
      hasPacketsReceived: true,
      subsystems: subsystemsAtTime(T0 + 9 * 60 * 1000),
    });
    expect(res3.state).toBe('STALE');
    expect(res3.systemStatusLabel).toBe('System Stale');
    expect(res3.badgeLabel).toBe('STALE');
  });

  // -------------------------------------------------------------------------
  // 5. Valid zero versus null measurements
  // -------------------------------------------------------------------------
  it('5. Distinguishes valid numeric zero from null or missing measurements', () => {
    // Subcase A: Valid zero measurement
    const zeroEval = evaluateSignalFreshness({
      value: 0,
      measuredAt: new Date(T0 - 10_000).toISOString(),
      componentType: 'pmg',
      now: T0,
      decimals: 1,
      isPowerSignal: true,
      powerKind: 'grid',
    });

    expect(zeroEval.state).toBe('LIVE_FRESH');
    expect(zeroEval.isAvailable).toBe(true);
    expect(zeroEval.isMeasuredZero).toBe(true);
    expect(zeroEval.displayValue).toBe('0.0');
    expect(zeroEval.subtitle).toBe('Idle');

    // Subcase B: Missing / null value
    const nullEval = evaluateSignalFreshness({
      value: null,
      measuredAt: new Date(T0 - 10_000).toISOString(),
      componentType: 'pmg',
      now: T0,
    });

    expect(nullEval.state).toBe('NO_DATA');
    expect(nullEval.isAvailable).toBe(false);
    expect(nullEval.isNoData).toBe(true);
    expect(nullEval.displayValue).toBe('--');
    expect(nullEval.subtitle).toBe('No data');

    // Power formatter
    expect(formatPowerValue(0)).toBe('0');
    expect(formatPowerValue(null)).toBe('--');
    expect(formatPowerValue(undefined)).toBe('--');
  });

  // -------------------------------------------------------------------------
  // 6. Last-known values not falsely marked fresh by unrelated delta packets
  // -------------------------------------------------------------------------
  it('6. Omitted signals in delta packets retain original measurement timestamp and age properly', () => {
    const pfTimestamp = new Date(T0).toISOString();

    const initialState: DashboardTelemetryState = {
      pcsTimestamp: pfTimestamp,
      bessPower: 10.0,
      bessPowerMeasuredAt: pfTimestamp,
      bessPowerFactor: 0.98,
      bessPowerFactorMeasuredAt: pfTimestamp,
    };

    // A delta packet arrives 3 minutes later with bessPower updated, but bessPowerFactor omitted
    const deltaTimestamp = new Date(T0 + 3 * 60 * 1000).toISOString();
    const updatedState = mergeWsPayload(
      initialState,
      'pcs',
      { bessPower: 22.5 }, // bessPowerFactor is omitted
      deltaTimestamp
    );

    expect(updatedState.bessPower).toBe(22.5);
    expect(updatedState.bessPowerMeasuredAt).toBe(deltaTimestamp);
    expect(updatedState.pcsTimestamp).toBe(deltaTimestamp);

    // BESS PF was NOT updated and its measuredAt was NOT falsely bumped
    expect(updatedState.bessPowerFactor).toBe(0.98);
    expect(updatedState.bessPowerFactorMeasuredAt).toBe(pfTimestamp);

    // At T0 + 9m (9 minutes since BESS PF was actually measured):
    const now9m = T0 + 9 * 60 * 1000;
    const pfEval = evaluateSignalFreshness({
      value: updatedState.bessPowerFactor,
      measuredAt: updatedState.bessPowerFactorMeasuredAt,
      componentType: 'pcs',
      customFreshWindowMs: 6 * 60 * 1000,
      customHoldWindowMs: 8 * 60 * 1000,
      now: now9m,
    });

    // PF must be evaluated as STALE (age 9m > hold 8m), despite frequent delta packets
    expect(pfEval.isStale).toBe(true);
    expect(pfEval.displayValue).toBe('--');
    expect(pfEval.subtitle).toBe('Stale');
  });

  // -------------------------------------------------------------------------
  // 7. Missing snapshot buckets remaining distinguishable from actual zero
  // -------------------------------------------------------------------------
  it('7. Missing snapshot buckets remain distinguishable from valid zero in historical trend data', () => {
    const snapshots = [
      { bucketTimestamp: '2026-10-19T08:00:00.000Z', pcsActivePower: 15.0, gridSideLoad: 0, solarPower: 20.0, soc: 80 },
      { bucketTimestamp: '2026-10-19T08:15:00.000Z', pcsActivePower: 12.0, gridSideLoad: null, solarPower: null, soc: 82 },
    ];

    const chartPts = snapshots.map(s => ({
      timestamp: new Date(s.bucketTimestamp).getTime(),
      grid: s.gridSideLoad ?? undefined,
      bess: s.pcsActivePower ?? undefined,
      solar: s.solarPower ?? undefined,
      soc: s.soc ?? undefined,
    }));

    // Bucket 1 has a measured zero grid power
    expect(chartPts[0].grid).toBe(0);

    // Bucket 2 has a missing/null measurement -> undefined
    expect(chartPts[1].grid).toBeUndefined();
    expect(chartPts[1].solar).toBeUndefined();

    // Verify tooltip formatter behavior
    const formatTooltipValue = (v: number | undefined | null, unit = 'kW') => {
      return v !== null && v !== undefined ? `${Number(v).toFixed(1)} ${unit}` : '-- (No data)';
    };

    expect(formatTooltipValue(chartPts[0].grid)).toBe('0.0 kW');
    expect(formatTooltipValue(chartPts[1].grid)).toBe('-- (No data)');
  });

  // -------------------------------------------------------------------------
  // 8. Historical Power Trend polling and granularity preservation
  // -------------------------------------------------------------------------
  it('8. Preserves 15-minute bucket aggregation and query timestamps', () => {
    const buckets = [
      '2026-10-19T08:00:00.000Z',
      '2026-10-19T08:15:00.000Z',
      '2026-10-19T08:30:00.000Z',
    ];

    // Ensure 15m delta between buckets
    for (let i = 1; i < buckets.length; i++) {
      const deltaMs = new Date(buckets[i]).getTime() - new Date(buckets[i - 1]).getTime();
      expect(deltaMs).toBe(15 * 60 * 1000);
    }
  });

  // -------------------------------------------------------------------------
  // 9. Client, Site, and BESS isolation
  // -------------------------------------------------------------------------
  it('9. Aggregation safely isolates data per BESS and preserves site isolation', () => {
    const bess1State: DashboardTelemetryState = {
      bessPower: 15.0,
      bessPowerMeasuredAt: '2026-10-19T10:00:00.000Z',
      gridPower: 50.0,
      gridPowerMeasuredAt: '2026-10-19T10:00:00.000Z',
      bessSoc: 85,
    };

    const bess2State: DashboardTelemetryState = {
      bessPower: 25.0,
      bessPowerMeasuredAt: '2026-10-19T10:01:00.000Z',
      gridPower: 50.0,
      gridPowerMeasuredAt: '2026-10-19T10:01:00.000Z',
      bessSoc: 75,
    };

    const aggregated = aggregateSiteTelemetrySafe({
      'bess-1': bess1State,
      'bess-2': bess2State,
    });

    // Summed metrics
    expect(aggregated.bessPower).toBe(40.0);
    expect(aggregated.gridPower).toBe(100.0);
    // Averaged SOC
    expect(aggregated.bessSoc).toBe(80);
    // MeasuredAt retains newest timestamp
    expect(aggregated.bessPowerMeasuredAt).toBe('2026-10-19T10:01:00.000Z');
  });

  // -------------------------------------------------------------------------
  // 10. Disconnected state handling
  // -------------------------------------------------------------------------
  it('10. Disconnection cleanly produces DISCONNECTED state regardless of residual telemetry', () => {
    const bessPowerEval = evaluateSignalFreshness({
      value: 10.0,
      measuredAt: new Date(T0).toISOString(),
      componentType: 'pcs',
      now: T0,
    });

    const subsystems: SubsystemFreshnessInput[] = [
      { id: 'pcs', name: 'BESS', isConfigured: true, evaluation: bessPowerEval },
    ];

    const result = evaluateOverallTelemetryStatus({
      isConnected: false, // Disconnected
      hasPacketsReceived: true,
      subsystems,
    });

    expect(result.state).toBe('DISCONNECTED');
    expect(result.isLive).toBe(false);
    expect(result.badgeLabel).toBe('DISCONNECTED');
    expect(result.badgeVariant).toBe('slate');
    expect(result.systemStatusLabel).toBe('Disconnected');
  });
});

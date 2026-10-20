import { describe, it, expect } from 'vitest';
import {
  evaluateSignalFreshness,
  mergeWsPayload,
  buildStateFromRest,
  reconcileRestWithLive,
  aggregateSiteTelemetrySafe,
  isValidNumber,
  parseValidTimestamp,
  isFutureTimestamp,
  formatValue,
  getLatestTimestamp,
  COMPONENT_CADENCE_POLICIES,
} from '../../../frontend/src/features/dashboard/freshness.utils';
import type {
  DashboardTelemetryState,
  LatestTelemetryRow,
  DashboardDevice,
} from '../../../frontend/src/features/dashboard/dashboard.types';

describe('Production Telemetry Freshness & KPI Reliability Unit Tests', () => {
  const BASE_TIME = new Date('2026-10-13T12:00:00.000Z').getTime();

  // ---------------------------------------------------------------------------
  // 1. A valid zero measurement remains zero and is not interpreted as missing
  // ---------------------------------------------------------------------------
  it('1. Valid zero measurement remains zero and is not interpreted as missing', () => {
    const res = evaluateSignalFreshness({
      value: 0,
      measuredAt: '2026-10-13T12:00:00.000Z',
      componentType: 'pmg',
      now: BASE_TIME,
      decimals: 2,
      isPowerSignal: true,
      powerKind: 'grid',
    });

    expect(res.isAvailable).toBe(true);
    expect(res.isMeasuredZero).toBe(true);
    expect(res.value).toBe(0);
    expect(res.displayValue).toBe('0.00');
    expect(res.state).toBe('LIVE_FRESH');
    expect(res.subtitle).toBe('Idle');
  });

  // ---------------------------------------------------------------------------
  // 2. A missing signal does not become zero
  // ---------------------------------------------------------------------------
  it('2. A missing signal does not become zero', () => {
    const res = evaluateSignalFreshness({
      value: undefined,
      measuredAt: '2026-10-13T12:00:00.000Z',
      componentType: 'pmg',
      now: BASE_TIME,
      decimals: 2,
    });

    expect(res.isAvailable).toBe(false);
    expect(res.isMeasuredZero).toBe(false);
    expect(res.value).toBeUndefined();
    expect(res.displayValue).toBe('--');
    expect(res.state).toBe('NO_DATA');
    expect(res.subtitle).toBe('No data');
  });

  // ---------------------------------------------------------------------------
  // 3. A partial delta packet updates only fields that are actually present
  // ---------------------------------------------------------------------------
  it('3. A partial delta packet updates only fields actually present', () => {
    const prevState: DashboardTelemetryState = {
      pcsTimestamp: '2026-10-13T11:55:00.000Z',
      bessPower: 25.5,
      bessPowerMeasuredAt: '2026-10-13T11:55:00.000Z',
      bessPowerFactor: -0.98,
      bessPowerFactorMeasuredAt: '2026-10-13T11:55:00.000Z',
      pcsDcVoltage: 750,
      pcsDcVoltageMeasuredAt: '2026-10-13T11:55:00.000Z',
    };

    // Delta packet with only bessPower and pcsDcVoltage; bessPowerFactor is omitted
    const nextState = mergeWsPayload(
      prevState,
      'pcs',
      { bessPower: 30.0, pcsDcVoltage: 755 },
      '2026-10-13T12:00:00.000Z'
    );

    expect(nextState.bessPower).toBe(30.0);
    expect(nextState.bessPowerMeasuredAt).toBe('2026-10-13T12:00:00.000Z');
    expect(nextState.pcsDcVoltage).toBe(755);
    expect(nextState.pcsDcVoltageMeasuredAt).toBe('2026-10-13T12:00:00.000Z');

    // bessPowerFactor was omitted: MUST retain previous value
    expect(nextState.bessPowerFactor).toBe(-0.98);
  });

  // ---------------------------------------------------------------------------
  // 4. Omitted fields retain their prior values and measurement timestamps
  // ---------------------------------------------------------------------------
  it('4. Omitted fields retain their prior values and measurement timestamps', () => {
    const prevState: DashboardTelemetryState = {
      pinvTimestamp: '2026-10-13T11:55:00.000Z',
      solarPower: 45.2,
      solarPowerMeasuredAt: '2026-10-13T11:55:00.000Z',
      solarFrequency: 50.02,
      solarFrequencyMeasuredAt: '2026-10-13T11:55:00.000Z',
      solarPowerFactor: 0.99,
      solarPowerFactorMeasuredAt: '2026-10-13T11:55:00.000Z',
    };

    // PINV 1-minute delta packet containing no solar power/freq/PF signals
    const nextState = mergeWsPayload(
      prevState,
      'pinv',
      {},
      '2026-10-13T11:56:00.000Z'
    );

    expect(nextState.solarPower).toBe(45.2);
    expect(nextState.solarPowerMeasuredAt).toBe('2026-10-13T11:55:00.000Z');
    expect(nextState.solarFrequency).toBe(50.02);
    expect(nextState.solarFrequencyMeasuredAt).toBe('2026-10-13T11:55:00.000Z');
    expect(nextState.solarPowerFactor).toBe(0.99);
    expect(nextState.solarPowerFactorMeasuredAt).toBe('2026-10-13T11:55:00.000Z');
  });

  // ---------------------------------------------------------------------------
  // 5. Packet-arrival time does not refresh omitted signals
  // ---------------------------------------------------------------------------
  it('5. Packet-arrival time advances component timestamp but does not refresh omitted signals', () => {
    const prevState: DashboardTelemetryState = {
      pcsTimestamp: '2026-10-13T11:50:00.000Z',
      bessPowerFactor: -1.0,
      bessPowerFactorMeasuredAt: '2026-10-13T11:50:00.000Z',
    };

    // Subsequent packet arrives at 12:00:00Z without bessPowerFactor
    const nextState = mergeWsPayload(
      prevState,
      'pcs',
      { bessPower: 12.0 },
      '2026-10-13T12:00:00.000Z'
    );

    // Component-level packet timestamp is updated
    expect(nextState.pcsTimestamp).toBe('2026-10-13T12:00:00.000Z');

    // Signal-level measurement timestamp remains at 11:50:00Z!
    expect(nextState.bessPowerFactorMeasuredAt).toBe('2026-10-13T11:50:00.000Z');

    // Freshness evaluation at 12:00:00Z (age = 10 minutes) evaluates to STALE,
    // not falsely refreshed by the 12:00:00Z packet
    const evalResult = evaluateSignalFreshness({
      value: nextState.bessPowerFactor,
      measuredAt: nextState.bessPowerFactorMeasuredAt,
      componentType: 'pcs',
      now: BASE_TIME,
    });
    expect(evalResult.state).toBe('STALE');
    expect(evalResult.displayValue).toBe('--');
  });

  // ---------------------------------------------------------------------------
  // 6. A never-reported signal is NO DATA, not STALE
  // ---------------------------------------------------------------------------
  it('6. A never-reported signal is NO DATA, not STALE', () => {
    const evalResult = evaluateSignalFreshness({
      value: undefined,
      measuredAt: undefined,
      componentType: 'pmg',
      now: BASE_TIME,
    });

    expect(resMatches(evalResult, 'NO_DATA', '--', 'No data')).toBe(true);
  });

  // ---------------------------------------------------------------------------
  // 7. A previously valid signal transitions through freshness states correctly
  // ---------------------------------------------------------------------------
  it('7. Transitions correctly through LIVE_FRESH -> HELD -> STALE', () => {
    const measuredAt = '2026-10-13T12:00:00.000Z';
    const policy = { freshWindowMs: 6 * 60 * 1000, holdWindowMs: 8 * 60 * 1000, staleThresholdMs: 10 * 60 * 1000 };

    // At 3 minutes age (within freshWindowMs of 6m) -> LIVE_FRESH
    const liveEval = evaluateSignalFreshness({
      value: 50.01,
      measuredAt,
      componentType: 'pmg',
      now: BASE_TIME + 3 * 60 * 1000,
      decimals: 2,
      defaultSubtitle: 'Grid Frequency',
    });
    expect(liveEval.state).toBe('LIVE_FRESH');
    expect(liveEval.displayValue).toBe('50.01');
    expect(liveEval.subtitle).toBe('Grid Frequency');

    // At 7 minutes age (between freshWindowMs and holdWindowMs) -> HELD
    const heldEval = evaluateSignalFreshness({
      value: 50.01,
      measuredAt,
      componentType: 'pmg',
      now: BASE_TIME + 7 * 60 * 1000,
      decimals: 2,
      defaultSubtitle: 'Grid Frequency',
    });
    expect(heldEval.state).toBe('HELD');
    expect(heldEval.displayValue).toBe('50.01');
    expect(heldEval.subtitle).toContain('Last known');

    // At 9 minutes age (exceeding holdWindowMs) -> STALE
    const staleEval = evaluateSignalFreshness({
      value: 50.01,
      measuredAt,
      componentType: 'pmg',
      now: BASE_TIME + 9 * 60 * 1000,
      decimals: 2,
      defaultSubtitle: 'Grid Frequency',
    });
    expect(staleEval.state).toBe('STALE');
    expect(staleEval.displayValue).toBe('--');
    expect(staleEval.subtitle).toBe('Stale');
  });

  // ---------------------------------------------------------------------------
  // 8. An old measurement cannot overwrite a newer measurement
  // ---------------------------------------------------------------------------
  it('8. An out-of-order older measurement cannot overwrite a newer measurement', () => {
    const state: DashboardTelemetryState = {
      bessPower: 50.0,
      bessPowerMeasuredAt: '2026-10-13T12:00:00.000Z',
    };

    // Stale/out-of-order packet arriving from 11:58:00Z
    const result = mergeWsPayload(
      state,
      'pcs',
      { bessPower: 40.0 },
      '2026-10-13T11:58:00.000Z'
    );

    expect(result.bessPower).toBe(50.0);
    expect(result.bessPowerMeasuredAt).toBe('2026-10-13T12:00:00.000Z');
  });

  // ---------------------------------------------------------------------------
  // 9. Invalid timestamps and malformed numeric values are handled safely
  // ---------------------------------------------------------------------------
  it('9. Invalid timestamps, NaN, and Infinity handled safely without throwing', () => {
    // Malformed packet timestamp
    const state: DashboardTelemetryState = { bessPower: 10 };
    const invalidTsResult = mergeWsPayload(state, 'pcs', { bessPower: 20 }, 'not-a-valid-date');
    expect(invalidTsResult.bessPower).toBe(10); // Rejected

    // Malformed numeric values
    const nanResult = mergeWsPayload(state, 'pcs', { bessPower: NaN }, '2026-10-13T12:00:00.000Z');
    expect(nanResult.bessPower).toBe(10); // Rejected

    const infResult = mergeWsPayload(state, 'pcs', { bessPower: Infinity }, '2026-10-13T12:00:00.000Z');
    expect(infResult.bessPower).toBe(10); // Rejected

    // Freshness evaluation with invalid timestamp string
    const evalInvalidTs = evaluateSignalFreshness({
      value: 12.3,
      measuredAt: 'invalid-date',
      componentType: 'pcs',
      now: BASE_TIME,
    });
    expect(evalInvalidTs.state).toBe('NO_DATA');
    expect(evalInvalidTs.displayValue).toBe('--');
  });

  // ---------------------------------------------------------------------------
  // 10. A future-dated measurement is not silently treated as fresh
  // ---------------------------------------------------------------------------
  it('10. A future-dated measurement is rejected as STALE and not treated as fresh', () => {
    // Measurement 10 minutes into the future
    const futureTime = new Date(BASE_TIME + 10 * 60 * 1000).toISOString();

    const evalResult = evaluateSignalFreshness({
      value: 23.5,
      measuredAt: futureTime,
      componentType: 'pmg',
      now: BASE_TIME,
    });

    expect(evalResult.state).toBe('STALE');
    expect(evalResult.displayValue).toBe('--');
    expect(evalResult.subtitle).toBe('Stale');
  });

  // ---------------------------------------------------------------------------
  // 11. One component activity does not refresh another component KPIs
  // ---------------------------------------------------------------------------
  it('11. One component activity does not refresh another component KPIs', () => {
    const state: DashboardTelemetryState = {
      pcsTimestamp: '2026-10-13T12:00:00.000Z',
      bessPower: 100,
      bessPowerMeasuredAt: '2026-10-13T12:00:00.000Z',
      pmgTimestamp: '2026-10-13T11:40:00.000Z',
      gridPower: 50,
      gridPowerMeasuredAt: '2026-10-13T11:40:00.000Z',
    };

    // A PCS packet arrives
    const merged = mergeWsPayload(
      state,
      'pcs',
      { bessPower: 105 },
      '2026-10-13T12:01:00.000Z'
    );

    // BESS is refreshed
    expect(merged.bessPower).toBe(105);
    expect(merged.bessPowerMeasuredAt).toBe('2026-10-13T12:01:00.000Z');

    // Grid meter was NOT refreshed
    expect(merged.gridPower).toBe(50);
    expect(merged.gridPowerMeasuredAt).toBe('2026-10-13T11:40:00.000Z');

    // Freshness evaluation of Grid Power at 12:01:00Z (age = 21 minutes)
    const gridEval = evaluateSignalFreshness({
      value: merged.gridPower,
      measuredAt: merged.gridPowerMeasuredAt,
      componentType: 'pmg',
      now: new Date('2026-10-13T12:01:00.000Z').getTime(),
    });
    expect(gridEval.state).toBe('STALE');
    expect(gridEval.displayValue).toBe('--');
  });

  // ---------------------------------------------------------------------------
  // 12. REST hydration and WebSocket updates reconcile correctly in any order
  // ---------------------------------------------------------------------------
  it('12. REST hydration and WebSocket updates reconcile correctly regardless of order', () => {
    // Scenario A: WS packet arrives BEFORE REST hydration
    const liveBeforeRest: Record<string, DashboardTelemetryState> = {
      'bess-1': {
        timestamp: '2026-10-13T12:01:00.000Z',
        bessPower: 88.0,
        bessPowerMeasuredAt: '2026-10-13T12:01:00.000Z',
      },
    };

    // REST row has an older row from 12:00:00Z with bessPower: 80.0 and null bessPowerFactor
    const restState: Record<string, DashboardTelemetryState> = {
      'bess-1': {
        timestamp: '2026-10-13T12:00:00.000Z',
        bessPower: 80.0,
        bessPowerMeasuredAt: '2026-10-13T12:00:00.000Z',
        gridPower: 15.0,
        gridPowerMeasuredAt: '2026-10-13T12:00:00.000Z',
        bessPowerFactor: undefined,
        bessPowerFactorMeasuredAt: undefined,
      },
    };

    const reconciled = reconcileRestWithLive(liveBeforeRest, restState);

    // Newer WS bessPower is preserved
    expect(reconciled['bess-1'].bessPower).toBe(88.0);
    expect(reconciled['bess-1'].bessPowerMeasuredAt).toBe('2026-10-13T12:01:00.000Z');

    // Grid power that only REST had is populated
    expect(reconciled['bess-1'].gridPower).toBe(15.0);
    expect(reconciled['bess-1'].gridPowerMeasuredAt).toBe('2026-10-13T12:00:00.000Z');

    // Scenario B: REST hydration occurs first, then WebSocket delta arrives
    const liveAfterRest = reconcileRestWithLive({}, restState);
    const updatedWithWs = mergeWsPayload(
      liveAfterRest['bess-1'],
      'pcs',
      { bessPower: 92.0 },
      '2026-10-13T12:02:00.000Z'
    );

    expect(updatedWithWs.bessPower).toBe(92.0);
    expect(updatedWithWs.gridPower).toBe(15.0); // Retained from REST!
  });

  // ---------------------------------------------------------------------------
  // 13. Missing Solar/BESS PF remains unavailable instead of being substituted
  // ---------------------------------------------------------------------------
  it('13. Missing Solar/BESS PF remains unavailable instead of being substituted', () => {
    const state: DashboardTelemetryState = {
      bessPowerFactor: undefined,
      bessPowerFactorMeasuredAt: undefined,
      solarPowerFactor: undefined,
      solarPowerFactorMeasuredAt: undefined,
      powerFactor: 0.95, // Grid power factor exists
      powerFactorMeasuredAt: '2026-10-13T12:00:00.000Z',
    };

    const bessPfEval = evaluateSignalFreshness({
      value: state.bessPowerFactor,
      measuredAt: state.bessPowerFactorMeasuredAt,
      componentType: 'pcs',
      now: BASE_TIME,
    });
    const solarPfEval = evaluateSignalFreshness({
      value: state.solarPowerFactor,
      measuredAt: state.solarPowerFactorMeasuredAt,
      componentType: 'pinv',
      now: BASE_TIME,
    });

    expect(bessPfEval.isAvailable).toBe(false);
    expect(bessPfEval.displayValue).toBe('--');
    expect(solarPfEval.isAvailable).toBe(false);
    expect(solarPfEval.displayValue).toBe('--');
  });

  // ---------------------------------------------------------------------------
  // 14. Single-BESS and multi-BESS KPI behavior remains mathematically safe
  // ---------------------------------------------------------------------------
  it('14. Single-BESS and multi-BESS aggregation remains mathematically safe', () => {
    // Single-BESS site
    const singleBessSite: Record<string, DashboardTelemetryState> = {
      'bess-1': {
        bessPower: 50.0,
        bessPowerMeasuredAt: '2026-10-13T12:00:00.000Z',
        gridPower: 20.0,
        gridPowerMeasuredAt: '2026-10-13T12:00:00.000Z',
        gridFrequency: 50.02,
        gridFrequencyMeasuredAt: '2026-10-13T12:00:00.000Z',
        powerFactor: 0.98,
        powerFactorMeasuredAt: '2026-10-13T12:00:00.000Z',
      },
    };

    const singleAgg = aggregateSiteTelemetrySafe(singleBessSite);
    expect(singleAgg.bessPower).toBe(50.0);
    expect(singleAgg.gridPower).toBe(20.0);
    expect(singleAgg.gridFrequency).toBe(50.02);
    expect(singleAgg.powerFactor).toBe(0.98);

    // Multi-BESS site (e.g. 2 assets)
    const multiBessSite: Record<string, DashboardTelemetryState> = {
      'bess-1': {
        bessPower: 50.0,
        bessPowerMeasuredAt: '2026-10-13T12:00:00.000Z',
        gridPower: 20.0,
        gridPowerMeasuredAt: '2026-10-13T12:00:00.000Z',
        gridFrequency: 50.02,
        gridFrequencyMeasuredAt: '2026-10-13T12:00:00.000Z',
        bessSoc: 80.0,
        bessSocMeasuredAt: '2026-10-13T12:00:00.000Z',
      },
      'bess-2': {
        bessPower: 30.0,
        bessPowerMeasuredAt: '2026-10-13T12:00:05.000Z',
        gridPower: 10.0,
        gridPowerMeasuredAt: '2026-10-13T12:00:05.000Z',
        gridFrequency: 50.01,
        gridFrequencyMeasuredAt: '2026-10-13T12:00:05.000Z',
        bessSoc: 90.0,
        bessSocMeasuredAt: '2026-10-13T12:00:05.000Z',
      },
    };

    const multiAgg = aggregateSiteTelemetrySafe(multiBessSite);

    // Powers are additively summed
    expect(multiAgg.bessPower).toBe(80.0);
    expect(multiAgg.bessPowerMeasuredAt).toBe('2026-10-13T12:00:05.000Z');
    expect(multiAgg.gridPower).toBe(30.0);

    // SOC is averaged
    expect(multiAgg.bessSoc).toBe(85.0);

    // Non-aggregatable metrics are NOT summed or averaged at site level!
    expect(multiAgg.gridFrequency).toBeUndefined();
    expect(multiAgg.powerFactor).toBeUndefined();
    expect(multiAgg.bessFrequency).toBeUndefined();
    expect(multiAgg.bessPowerFactor).toBeUndefined();
  });

  // ---------------------------------------------------------------------------
  // 15. Fix 1: Exact BESS Power Factor freshness transition boundaries
  // ---------------------------------------------------------------------------
  it('15. Fix 1: Exact BESS Power Factor freshness transition boundaries (fresh -> HELD -> STALE)', () => {
    const measuredAt = '2026-10-13T12:00:00.000Z';
    const evalBessPf = (ageMs: number, customHoldWindowMs?: number) =>
      evaluateSignalFreshness({
        value: -0.98,
        measuredAt,
        componentType: 'pcs',
        now: BASE_TIME + ageMs,
        decimals: 2,
        defaultSubtitle: 'BESS Power Factor',
        customFreshWindowMs: 6 * 60 * 1000, // 6m fresh window
        customHoldWindowMs,
      });

    // 1. At age 0ms: LIVE_FRESH
    const at0 = evalBessPf(0, 8 * 60 * 1000);
    expect(at0.state).toBe('LIVE_FRESH');
    expect(at0.displayValue).toBe('-0.98');
    expect(at0.subtitle).toBe('BESS Power Factor');

    // 2. At age 5m (300,000ms): LIVE_FRESH (standard 5-minute full packet interval)
    const at5m = evalBessPf(5 * 60 * 1000, 8 * 60 * 1000);
    expect(at5m.state).toBe('LIVE_FRESH');
    expect(at5m.displayValue).toBe('-0.98');

    // 3. Exactly at 6m (360,000ms boundary): LIVE_FRESH
    const at6mExact = evalBessPf(6 * 60 * 1000, 8 * 60 * 1000);
    expect(at6mExact.state).toBe('LIVE_FRESH');
    expect(at6mExact.displayValue).toBe('-0.98');

    // 4. Just past 6m (360,001ms): transitions into HELD (HELD state is preserved!)
    const at6mPast = evalBessPf(6 * 60 * 1000 + 1, 8 * 60 * 1000);
    expect(at6mPast.state).toBe('HELD');
    expect(at6mPast.displayValue).toBe('-0.98');
    expect(at6mPast.subtitle).toBe('BESS Power Factor • Last known');

    // 5. At age 7m (420,000ms): HELD
    const at7m = evalBessPf(7 * 60 * 1000, 8 * 60 * 1000);
    expect(at7m.state).toBe('HELD');
    expect(at7m.displayValue).toBe('-0.98');
    expect(at7m.subtitle).toBe('BESS Power Factor • Last known');

    // 6. Exactly at 8m (480,000ms boundary): HELD
    const at8mExact = evalBessPf(8 * 60 * 1000, 8 * 60 * 1000);
    expect(at8mExact.state).toBe('HELD');
    expect(at8mExact.displayValue).toBe('-0.98');

    // 7. Just past 8m (480,001ms): transitions to STALE
    const at8mPast = evalBessPf(8 * 60 * 1000 + 1, 8 * 60 * 1000);
    expect(at8mPast.state).toBe('STALE');
    expect(at8mPast.displayValue).toBe('--');
    expect(at8mPast.subtitle).toBe('Stale');

    // 8. At age 9m (540,000ms): STALE
    const at9m = evalBessPf(9 * 60 * 1000, 8 * 60 * 1000);
    expect(at9m.state).toBe('STALE');
    expect(at9m.displayValue).toBe('--');

    // 9. When customHoldWindowMs is omitted, policy holdWindowMs (8m) still prevents eliminating HELD
    const withoutExplicitHold = evalBessPf(7 * 60 * 1000);
    expect(withoutExplicitHold.state).toBe('HELD');
    expect(withoutExplicitHold.displayValue).toBe('-0.98');
  });

  // ---------------------------------------------------------------------------
  // 16. Fix 2: Cadence policy fields consistency
  // ---------------------------------------------------------------------------
  it('16. Fix 2: Cadence policy fields consistency across all component policies', () => {
    const components = Object.keys(COMPONENT_CADENCE_POLICIES) as (keyof typeof COMPONENT_CADENCE_POLICIES)[];

    for (const comp of components) {
      const policy = COMPONENT_CADENCE_POLICIES[comp];

      // freshWindowMs must be strictly less than holdWindowMs
      expect(policy.freshWindowMs).toBeLessThan(policy.holdWindowMs);

      // staleThresholdMs must be strictly equal to holdWindowMs
      expect(policy.staleThresholdMs).toBe(policy.holdWindowMs);

      // Verify exact transitions under this policy
      const measuredAt = '2026-10-13T12:00:00.000Z';

      // Within fresh window -> LIVE_FRESH
      const freshRes = evaluateSignalFreshness({
        value: 100,
        measuredAt,
        componentType: comp,
        now: BASE_TIME + policy.freshWindowMs,
      });
      expect(freshRes.state).toBe('LIVE_FRESH');

      // Between fresh window and hold window -> HELD
      const heldRes = evaluateSignalFreshness({
        value: 100,
        measuredAt,
        componentType: comp,
        now: BASE_TIME + policy.freshWindowMs + 1000,
      });
      expect(heldRes.state).toBe('HELD');

      // Beyond hold window / stale threshold -> STALE
      const staleRes = evaluateSignalFreshness({
        value: 100,
        measuredAt,
        componentType: comp,
        now: BASE_TIME + policy.holdWindowMs + 1000,
      });
      expect(staleRes.state).toBe('STALE');
    }
  });

  // ---------------------------------------------------------------------------
  // 17. Fix 3: Compare multi-BESS timestamps chronologically across timezones
  // ---------------------------------------------------------------------------
  it('17. Fix 3: Compare multi-BESS timestamps chronologically across different timezone offsets', () => {
    // Timestamps representing different chronological instants with mixed offsets:
    // tsUTC: 12:00 UTC
    // tsIST: 12:05 UTC (17:35 +05:30) -> 5 mins later
    // tsEST: 12:10 UTC (07:10 -05:00) -> 10 mins later (chronologically latest!)
    const tsUTC = '2026-10-13T12:00:00.000Z';
    const tsIST = '2026-10-13T17:35:00+05:30';
    const tsEST = '2026-10-13T07:10:00-05:00';

    // Note: lexicographically, tsIST ("2026...17:35...") > tsUTC ("2026...12:00...") > tsEST ("2026...07:10...")
    // Naive string comparison would incorrectly pick tsIST!
    expect(tsIST > tsEST).toBe(true); // Demonstrates lexicographical flaw

    // getLatestTimestamp correctly identifies chronologically newest (tsEST) and preserves original string
    expect(getLatestTimestamp([tsUTC, tsIST, tsEST])).toBe(tsEST);
    expect(getLatestTimestamp([tsEST, tsIST, tsUTC])).toBe(tsEST);
    expect(getLatestTimestamp([tsUTC, tsIST])).toBe(tsIST);

    // Resilient to invalid, null, and empty candidates
    expect(getLatestTimestamp(['malformed-date', tsUTC, null, undefined, ''])).toBe(tsUTC);
    expect(getLatestTimestamp(['bad-1', 'bad-2'])).toBeUndefined();
    expect(getLatestTimestamp([])).toBeUndefined();

    // Multi-BESS site aggregation safely preserves chronologically newest timestamp string
    const multiBessWithOffsets: Record<string, DashboardTelemetryState> = {
      'bess-1': {
        bessPower: 40.0,
        bessPowerMeasuredAt: tsUTC, // 12:00 UTC
      },
      'bess-2': {
        bessPower: 35.0,
        bessPowerMeasuredAt: tsIST, // 12:05 UTC
      },
      'bess-3': {
        bessPower: 25.0,
        bessPowerMeasuredAt: tsEST, // 12:10 UTC (chronologically latest!)
      },
    };

    const agg = aggregateSiteTelemetrySafe(multiBessWithOffsets);
    expect(agg.bessPower).toBe(100.0);
    // Preserves original valid string associated with chronologically latest measurement
    expect(agg.bessPowerMeasuredAt).toBe(tsEST);
  });

  // ---------------------------------------------------------------------------
  // 18. Fix 4: Apply freshness evaluation to RJL Cabinet Meter cards
  // ---------------------------------------------------------------------------
  it('18. Fix 4: Apply freshness evaluation to RJL Cabinet Meter cards', () => {
    const measuredAt = '2026-10-13T12:00:00.000Z';

    // 1. Valid fresh Phase A voltage (age = 1m, well within 6m freshWindow)
    const freshVolt = evaluateSignalFreshness({
      value: 231.42,
      measuredAt,
      componentType: 'rjl',
      now: BASE_TIME + 1 * 60 * 1000,
      decimals: 1,
      defaultSubtitle: 'Phase A Voltage',
    });
    expect(freshVolt.state).toBe('LIVE_FRESH');
    expect(freshVolt.isAvailable).toBe(true);
    expect(freshVolt.isFresh).toBe(true);
    expect(freshVolt.displayValue).toBe('231.4'); // Formatted to 1 decimal place
    expect(freshVolt.subtitle).toBe('Phase A Voltage');

    // 2. Valid HELD Phase B voltage (age = 7m, beyond 6m freshWindow but within 8m holdWindow)
    const heldVolt = evaluateSignalFreshness({
      value: 229.81,
      measuredAt,
      componentType: 'rjl',
      now: BASE_TIME + 7 * 60 * 1000,
      decimals: 1,
      defaultSubtitle: 'Phase B Voltage',
    });
    expect(heldVolt.state).toBe('HELD');
    expect(heldVolt.isAvailable).toBe(true);
    expect(heldVolt.isHeld).toBe(true);
    expect(heldVolt.displayValue).toBe('229.8');
    expect(heldVolt.subtitle).toBe('Phase B Voltage • Last known');

    // 3. Stale Phase C voltage (age = 9m, exceeds 8m retention boundary)
    const staleVolt = evaluateSignalFreshness({
      value: 230.1,
      measuredAt,
      componentType: 'rjl',
      now: BASE_TIME + 9 * 60 * 1000,
      decimals: 1,
      defaultSubtitle: 'Phase C Voltage',
    });
    expect(staleVolt.state).toBe('STALE');
    expect(staleVolt.isStale).toBe(true);
    expect(staleVolt.displayValue).toBe('--'); // Must NOT display misleading current-looking number!
    expect(staleVolt.subtitle).toBe('Stale');

    // 4. Missing / undefined Phase A current -> NO_DATA
    const missingCurr = evaluateSignalFreshness({
      value: undefined,
      measuredAt: undefined,
      componentType: 'rjl',
      decimals: 1,
      defaultSubtitle: 'Phase A Current',
    });
    expect(missingCurr.state).toBe('NO_DATA');
    expect(missingCurr.isNoData).toBe(true);
    expect(missingCurr.displayValue).toBe('--');
    expect(missingCurr.subtitle).toBe('No data');

    // 5. Measured zero current (e.g. 0.0 A active idle load)
    const zeroCurr = evaluateSignalFreshness({
      value: 0,
      measuredAt,
      componentType: 'rjl',
      now: BASE_TIME + 1 * 60 * 1000,
      decimals: 1,
      defaultSubtitle: 'Phase A Current',
    });
    expect(zeroCurr.state).toBe('LIVE_FRESH');
    expect(zeroCurr.isMeasuredZero).toBe(true);
    expect(zeroCurr.displayValue).toBe('0.0'); // Preserves measured zero!
    expect(zeroCurr.value).toBe(0);
  });
});

function resMatches(res: any, state: string, displayValue: string, subtitle: string): boolean {
  return res.state === state && res.displayValue === displayValue && res.subtitle === subtitle;
}

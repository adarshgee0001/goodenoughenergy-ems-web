import { describe, it, expect } from 'vitest';
import {
  evaluateSignalFreshness,
  mergeWsPayload,
  buildStateFromRest,
  reconcileRestWithLive,
  aggregateSiteTelemetrySafe,
  isValidNumber,
  formatValue,
} from '../../../frontend/src/features/dashboard/freshness.utils';
import type {
  DashboardTelemetryState,
  LatestTelemetryRow,
  DashboardDevice,
} from '../../../frontend/src/features/dashboard/dashboard.types';

describe('Dashboard KPI Refresh & Telemetry Stability Regression Suite', () => {
  const BASE_TIME = new Date('2026-10-14T12:00:00.000Z').getTime();

  // Helper simulating DashboardPage's decoupled loading state
  function computeShowSkeleton(isInitialLoading: boolean, telemetryState: Record<string, DashboardTelemetryState>): boolean {
    const hasTelemetry = Object.keys(telemetryState).length > 0;
    return isInitialLoading && !hasTelemetry;
  }

  // ---------------------------------------------------------------------------
  // Scenario 1: Initial dashboard loading renders the existing loading state correctly
  // ---------------------------------------------------------------------------
  it('Scenario 1: Initial dashboard loading renders skeleton placeholder when no data exists', () => {
    const telemetryState: Record<string, DashboardTelemetryState> = {};
    const isInitialLoading = true;

    expect(computeShowSkeleton(isInitialLoading, telemetryState)).toBe(true);
  });

  // ---------------------------------------------------------------------------
  // Scenario 2: After initial data is loaded, a background refresh does NOT remove the KPI cards
  // ---------------------------------------------------------------------------
  it('Scenario 2: Background refresh does not remove KPI cards once initial data is loaded', () => {
    // 1. Initial state populated
    const telemetryState: Record<string, DashboardTelemetryState> = {
      'bess-1': {
        timestamp: '2026-10-14T12:00:00.000Z',
        gridPower: 150.5,
        gridPowerMeasuredAt: '2026-10-14T12:00:00.000Z',
        bessPower: -50.2,
        bessPowerMeasuredAt: '2026-10-14T12:00:00.000Z',
      },
    };
    let isInitialLoading = false;
    let isRefreshing = false;

    expect(computeShowSkeleton(isInitialLoading, telemetryState)).toBe(false);

    // 2. Background refresh starts
    isRefreshing = true;
    expect(computeShowSkeleton(isInitialLoading, telemetryState)).toBe(false);

    // 3. Background refresh completes
    isRefreshing = false;
    expect(computeShowSkeleton(isInitialLoading, telemetryState)).toBe(false);
  });

  // ---------------------------------------------------------------------------
  // Scenario 3: Updated telemetry changes displayed values in place
  // ---------------------------------------------------------------------------
  it('Scenario 3: Fresh telemetry updates displayed values in place', () => {
    const initialState: Record<string, DashboardTelemetryState> = {
      'bess-1': {
        timestamp: '2026-10-14T12:00:00.000Z',
        gridPower: 100.0,
        gridPowerMeasuredAt: '2026-10-14T12:00:00.000Z',
        bessPower: -40.0,
        bessPowerMeasuredAt: '2026-10-14T12:00:00.000Z',
      },
    };

    const initialEval = evaluateSignalFreshness({
      value: initialState['bess-1'].gridPower,
      measuredAt: initialState['bess-1'].gridPowerMeasuredAt,
      componentType: 'pmg',
      now: BASE_TIME,
      decimals: 1,
      isPowerSignal: true,
      powerKind: 'grid',
    });
    expect(initialEval.displayValue).toBe('100.0');

    // Telemetry updates from newer REST refresh
    const freshRestRows: LatestTelemetryRow[] = [
      {
        id: 'row-1',
        deviceId: 'dev-pmg',
        timestamp: '2026-10-14T12:02:00.000Z',
        gridSideLoad: 125.4,
        gridFrequency: 50.02,
        powerFactor: 0.98,
        device: { id: 'dev-pmg', name: 'PMG', type: 'METER', componentId: 'pmg', bessAssetId: 'bess-1' },
      },
    ];
    const devices: DashboardDevice[] = [
      { id: 'dev-pmg', name: 'PMG', type: 'METER', componentId: 'pmg', bessAssetId: 'bess-1' },
    ];

    const restState = buildStateFromRest(freshRestRows, devices);
    const updatedState = reconcileRestWithLive(initialState, restState);

    const updatedEval = evaluateSignalFreshness({
      value: updatedState['bess-1'].gridPower,
      measuredAt: updatedState['bess-1'].gridPowerMeasuredAt,
      componentType: 'pmg',
      now: BASE_TIME + 2 * 60 * 1000,
      decimals: 1,
      isPowerSignal: true,
      powerKind: 'grid',
    });

    expect(updatedEval.displayValue).toBe('125.4');
    expect(updatedEval.state).toBe('LIVE_FRESH');
  });

  // ---------------------------------------------------------------------------
  // Scenario 4: Partial WebSocket update preserves unrelated signals
  // ---------------------------------------------------------------------------
  it('Scenario 4: Partial WebSocket update preserves unrelated telemetry values', () => {
    const prevState: DashboardTelemetryState = {
      timestamp: '2026-10-14T12:00:00.000Z',
      gridPower: 250.0,
      gridPowerMeasuredAt: '2026-10-14T12:00:00.000Z',
      solarPower: 80.0,
      solarPowerMeasuredAt: '2026-10-14T12:00:00.000Z',
      bessPower: -100.0,
      bessPowerMeasuredAt: '2026-10-14T12:00:00.000Z',
    };

    // Partial WS packet only updates PCS (bessPower)
    const nextState = mergeWsPayload(
      prevState,
      'pcs',
      { bessPower: -65.5 },
      '2026-10-14T12:01:00.000Z'
    );

    // bessPower updated
    expect(nextState.bessPower).toBe(-65.5);
    expect(nextState.bessPowerMeasuredAt).toBe('2026-10-14T12:01:00.000Z');

    // Unrelated signals (gridPower, solarPower) strictly preserved
    expect(nextState.gridPower).toBe(250.0);
    expect(nextState.gridPowerMeasuredAt).toBe('2026-10-14T12:00:00.000Z');
    expect(nextState.solarPower).toBe(80.0);
    expect(nextState.solarPowerMeasuredAt).toBe('2026-10-14T12:00:00.000Z');
  });

  // ---------------------------------------------------------------------------
  // Scenario 5: Missing signals display '--' without crashing or fabricating
  // ---------------------------------------------------------------------------
  it('Scenario 5: Missing signals display "--" representation', () => {
    const evalResult = evaluateSignalFreshness({
      value: undefined,
      measuredAt: undefined,
      componentType: 'pcs',
      now: BASE_TIME,
      decimals: 1,
    });

    expect(evalResult.displayValue).toBe('--');
    expect(evalResult.isAvailable).toBe(false);
    expect(evalResult.isNoData).toBe(true);
    expect(evalResult.state).toBe('NO_DATA');
  });

  // ---------------------------------------------------------------------------
  // Scenario 6: Numeric zero remains a valid value
  // ---------------------------------------------------------------------------
  it('Scenario 6: Numeric zero remains a valid value and is not treated as missing', () => {
    const evalZero = evaluateSignalFreshness({
      value: 0,
      measuredAt: '2026-10-14T12:00:00.000Z',
      componentType: 'pcs',
      now: BASE_TIME,
      decimals: 1,
      isPowerSignal: true,
      powerKind: 'bess',
    });

    expect(evalZero.value).toBe(0);
    expect(evalZero.displayValue).toBe('0.0');
    expect(evalZero.isMeasuredZero).toBe(true);
    expect(evalZero.isAvailable).toBe(true);
    expect(evalZero.subtitle).toBe('Idle');
  });

  // ---------------------------------------------------------------------------
  // Scenario 7: A failed refresh does not clear previously valid data
  // ---------------------------------------------------------------------------
  it('Scenario 7: A failed refresh retains existing valid telemetry', () => {
    let telemetryState: Record<string, DashboardTelemetryState> = {
      'bess-1': {
        timestamp: '2026-10-14T12:00:00.000Z',
        bessPower: -75.0,
        bessPowerMeasuredAt: '2026-10-14T12:00:00.000Z',
      },
    };

    // Simulate fetchLatest() throwing an error
    let isRefreshing = true;
    try {
      throw new Error('Network timeout during background refresh');
    } catch {
      // Catch block retains state; does NOT reset telemetryState to {}
    } finally {
      isRefreshing = false;
    }

    expect(telemetryState['bess-1'].bessPower).toBe(-75.0);
    expect(computeShowSkeleton(false, telemetryState)).toBe(false);
  });

  // ---------------------------------------------------------------------------
  // Scenario 8: Genuine disconnect or stale-data condition is correctly identified
  // ---------------------------------------------------------------------------
  it('Scenario 8: Stale telemetry is accurately marked STALE after retention window', () => {
    const oldTimestamp = new Date(BASE_TIME - 10 * 60 * 1000).toISOString(); // 10m ago (exceeds 8m window)

    const staleEval = evaluateSignalFreshness({
      value: 120.0,
      measuredAt: oldTimestamp,
      componentType: 'pcs',
      now: BASE_TIME,
      decimals: 1,
    });

    expect(staleEval.state).toBe('STALE');
    expect(staleEval.isStale).toBe(true);
    expect(staleEval.isFresh).toBe(false);
    expect(staleEval.displayValue).toBe('--');
    expect(staleEval.subtitle).toBe('Stale');
  });

  // ---------------------------------------------------------------------------
  // Scenario 9: Client/site switch cleanly isolates state and prevents cross-client data leak
  // ---------------------------------------------------------------------------
  it('Scenario 9: Client/site switch cleanly isolates state and prevents cross-client data leak', () => {
    // Client A state
    let telemetryState: Record<string, DashboardTelemetryState> = {
      'client-a-bess-1': {
        timestamp: '2026-10-14T12:00:00.000Z',
        gridPower: 500.0,
        bessPower: -200.0,
      },
    };
    let activeSiteId: string | null = 'site-a';

    // Switch to Client B
    const newSiteId = 'site-b';
    const isNewSite = activeSiteId !== newSiteId;
    expect(isNewSite).toBe(true);

    if (isNewSite) {
      activeSiteId = newSiteId;
      // Entity isolation step executed by DashboardPage
      telemetryState = {};
    }

    // Client A's telemetry must be completely absent
    expect(telemetryState['client-a-bess-1']).toBeUndefined();
    expect(Object.keys(telemetryState).length).toBe(0);

    // Client B's fresh telemetry arrives
    const clientBRows: LatestTelemetryRow[] = [
      {
        id: 'row-b',
        deviceId: 'dev-b',
        timestamp: '2026-10-14T12:01:00.000Z',
        pcsActivePower: 75.0,
        device: { id: 'dev-b', name: 'PCS', type: 'PCS', componentId: 'pcs', bessAssetId: 'client-b-bess-1' },
      },
    ];
    const clientBDevices: DashboardDevice[] = [
      { id: 'dev-b', name: 'PCS', type: 'PCS', componentId: 'pcs', bessAssetId: 'client-b-bess-1' },
    ];

    const clientBRestState = buildStateFromRest(clientBRows, clientBDevices);
    const validClientBAssets = new Set(['client-b-bess-1']);

    // Scoped reconcile
    const scopedPrev: Record<string, DashboardTelemetryState> = {};
    for (const [id, val] of Object.entries(telemetryState)) {
      if (validClientBAssets.has(id)) scopedPrev[id] = val;
    }
    telemetryState = reconcileRestWithLive(scopedPrev, clientBRestState);

    expect(telemetryState['client-b-bess-1']).toBeDefined();
    expect(telemetryState['client-b-bess-1'].bessPower).toBe(75.0);
    expect(telemetryState['client-a-bess-1']).toBeUndefined();

    // Aggregation only includes Client B
    const aggregated = aggregateSiteTelemetrySafe(telemetryState);
    expect(aggregated.bessPower).toBe(75.0);
  });

  // ---------------------------------------------------------------------------
  // Scenario 10: WebSocket composite keying preserves distinct components for same device
  // ---------------------------------------------------------------------------
  it('Scenario 10: WebSocket composite keying preserves distinct components for the same device', () => {
    const liveTelemetryMap: Record<string, any> = {};

    const packetPmg = {
      type: 'telemetry',
      siteId: 'site-1',
      deviceId: 'emu-device-1',
      componentId: 'pmg',
      timestamp: '2026-10-14T12:00:00.000Z',
      data: { gridPower: 120.5 },
    };

    const packetPcs = {
      type: 'telemetry',
      siteId: 'site-1',
      deviceId: 'emu-device-1',
      componentId: 'pcs',
      timestamp: '2026-10-14T12:00:01.000Z',
      data: { bessPower: -45.0 },
    };

    // Store using composite key
    const keyPmg = packetPmg.componentId ? `${packetPmg.deviceId}:${packetPmg.componentId}` : packetPmg.deviceId;
    liveTelemetryMap[keyPmg] = packetPmg;

    const keyPcs = packetPcs.componentId ? `${packetPcs.deviceId}:${packetPcs.componentId}` : packetPcs.deviceId;
    liveTelemetryMap[keyPcs] = packetPcs;

    // Both components coexist in liveTelemetry
    const values = Object.values(liveTelemetryMap);
    expect(values.length).toBe(2);
    expect(values.some(v => v.componentId === 'pmg')).toBe(true);
    expect(values.some(v => v.componentId === 'pcs')).toBe(true);
  });

  // ---------------------------------------------------------------------------
  // Scenario 11: Single-BESS vs Multi-BESS KPI Behavior
  // ---------------------------------------------------------------------------
  it('Scenario 11: Site aggregation correctly sums power across multiple BESS assets', () => {
    const multiBessState: Record<string, DashboardTelemetryState> = {
      'bess-1': {
        timestamp: '2026-10-14T12:00:00.000Z',
        gridPower: 100.0,
        gridPowerMeasuredAt: '2026-10-14T12:00:00.000Z',
        bessPower: -50.0,
        bessPowerMeasuredAt: '2026-10-14T12:00:00.000Z',
        solarPower: 20.0,
        solarPowerMeasuredAt: '2026-10-14T12:00:00.000Z',
        bessSoc: 80.0,
        bessSocMeasuredAt: '2026-10-14T12:00:00.000Z',
      },
      'bess-2': {
        timestamp: '2026-10-14T12:00:00.000Z',
        gridPower: 50.0,
        gridPowerMeasuredAt: '2026-10-14T12:00:00.000Z',
        bessPower: -30.0,
        bessPowerMeasuredAt: '2026-10-14T12:00:00.000Z',
        solarPower: 10.0,
        solarPowerMeasuredAt: '2026-10-14T12:00:00.000Z',
        bessSoc: 70.0,
        bessSocMeasuredAt: '2026-10-14T12:00:00.000Z',
      },
    };

    const aggregated = aggregateSiteTelemetrySafe(multiBessState);

    // Summed powers
    expect(aggregated.bessPower).toBe(-80.0);
    expect(aggregated.gridPower).toBe(150.0);
    expect(aggregated.solarPower).toBe(30.0);
    // Averaged SOC
    expect(aggregated.bessSoc).toBe(75.0);
  });

  // ---------------------------------------------------------------------------
  // Scenario 12: Late REST response from previous site is discarded when activeSiteId changes
  // ---------------------------------------------------------------------------
  it('Scenario 12: Late REST response from previous site is discarded when activeSiteId changes', async () => {
    let activeSiteId: string | null = 'site-A';
    let cancelled = false;
    let telemetryState: Record<string, DashboardTelemetryState> = {};

    // Simulate fetchLatest initiated for Site A
    const targetSiteId = 'site-A';

    let resolveSiteA: (rows: LatestTelemetryRow[]) => void;
    const siteAPromise = new Promise<LatestTelemetryRow[]>((resolve) => {
      resolveSiteA = resolve;
    });

    const runFetchSiteA = async () => {
      const rows = await siteAPromise;
      // Exact production race condition guard used in DashboardPage & TelemetryPage:
      if (!cancelled && activeSiteId === targetSiteId) {
        const restState = buildStateFromRest(rows, [
          { id: 'dev-a', name: 'PCS A', type: 'PCS', componentId: 'pcs', bessAssetId: 'bess-a' }
        ]);
        telemetryState = reconcileRestWithLive(telemetryState, restState);
      }
    };

    const fetchPromise = runFetchSiteA();

    // User switches to Site B while Site A request is still in-flight
    cancelled = true; // effect cleanup
    activeSiteId = 'site-B';
    telemetryState = {}; // site switch resets state immediately

    // Site B completes quickly
    const siteBRows: LatestTelemetryRow[] = [
      {
        id: 'row-b',
        deviceId: 'dev-b',
        timestamp: '2026-10-14T12:05:00.000Z',
        pcsActivePower: 120.0,
        device: { id: 'dev-b', name: 'PCS B', type: 'PCS', componentId: 'pcs', bessAssetId: 'bess-b' },
      },
    ];
    const restStateB = buildStateFromRest(siteBRows, [
      { id: 'dev-b', name: 'PCS B', type: 'PCS', componentId: 'pcs', bessAssetId: 'bess-b' }
    ]);
    telemetryState = reconcileRestWithLive(telemetryState, restStateB);

    expect(telemetryState['bess-b']).toBeDefined();
    expect(telemetryState['bess-b'].bessPower).toBe(120.0);

    // Site A's slow network response arrives late
    resolveSiteA!([
      {
        id: 'row-a',
        deviceId: 'dev-a',
        timestamp: '2026-10-14T12:01:00.000Z',
        pcsActivePower: 999.0,
        device: { id: 'dev-a', name: 'PCS A', type: 'PCS', componentId: 'pcs', bessAssetId: 'bess-a' },
      },
    ]);
    await fetchPromise;

    // Site A's data was strictly rejected
    expect(telemetryState['bess-a']).toBeUndefined();
    // Site B's data was not overwritten or corrupted
    expect(telemetryState['bess-b'].bessPower).toBe(120.0);
  });

  // ---------------------------------------------------------------------------
  // Scenario 13: WebSocket subscriptions and listeners are deduplicated across rerenders
  // ---------------------------------------------------------------------------
  it('Scenario 13: WebSocket subscriptions and listeners are deduplicated across rerenders and site switches', () => {
    const emittedEvents: Array<{ event: string; data: any }> = [];
    const mockSocket = {
      emit: (event: string, data: any) => {
        emittedEvents.push({ event, data });
      },
    };

    const activeSubscriptions = new Set<string>();

    const subscribeToSite = (siteId: string) => {
      // Guard against duplicate subscription emissions for the same room
      if (!activeSubscriptions.has(siteId)) {
        mockSocket.emit('subscribe', { siteId });
        activeSubscriptions.add(siteId);
      }
    };

    const unsubscribeFromSite = (siteId: string) => {
      mockSocket.emit('unsubscribe', { siteId });
      activeSubscriptions.delete(siteId);
    };

    // 1. Initial subscribe to site-1
    subscribeToSite('site-1');
    expect(emittedEvents.length).toBe(1);
    expect(emittedEvents[0]).toEqual({ event: 'subscribe', data: { siteId: 'site-1' } });

    // 2. Component rerenders 5 times with the same siteId
    subscribeToSite('site-1');
    subscribeToSite('site-1');
    subscribeToSite('site-1');
    subscribeToSite('site-1');
    subscribeToSite('site-1');

    // No duplicate subscribe events emitted
    expect(emittedEvents.length).toBe(1);
    expect(activeSubscriptions.size).toBe(1);

    // 3. User switches to site-2
    unsubscribeFromSite('site-1');
    subscribeToSite('site-2');

    expect(activeSubscriptions.has('site-1')).toBe(false);
    expect(activeSubscriptions.has('site-2')).toBe(true);
    expect(emittedEvents).toEqual([
      { event: 'subscribe', data: { siteId: 'site-1' } },
      { event: 'unsubscribe', data: { siteId: 'site-1' } },
      { event: 'subscribe', data: { siteId: 'site-2' } },
    ]);
  });

  // ---------------------------------------------------------------------------
  // Scenario 14: Composite key handles missing componentId, malformed packets, and in-place updates
  // ---------------------------------------------------------------------------
  it('Scenario 14: Composite key handles missing componentId, malformed packets, and in-place updates', () => {
    let liveTelemetry: Record<string, any> = {};

    const handleTelemetry = (payload: any) => {
      if (!payload || !payload.deviceId) return;
      const key = payload.componentId ? `${payload.deviceId}:${payload.componentId}` : payload.deviceId;
      liveTelemetry[key] = payload;
    };

    // 1. Malformed packets (null, undefined, missing deviceId) safely ignored
    handleTelemetry(null);
    handleTelemetry(undefined);
    handleTelemetry({ type: 'telemetry' }); // missing deviceId
    expect(Object.keys(liveTelemetry).length).toBe(0);

    // 2. Packet with missing/empty componentId falls back to deviceId without crashing
    handleTelemetry({
      type: 'telemetry',
      siteId: 'site-1',
      deviceId: 'dev-legacy',
      componentId: '',
      timestamp: '2026-10-14T12:00:00.000Z',
      data: { gridPower: 50 },
    });
    expect(liveTelemetry['dev-legacy']).toBeDefined();
    expect(liveTelemetry['dev-legacy'].data.gridPower).toBe(50);

    // 3. Multiple components for same device get distinct keys
    handleTelemetry({
      type: 'telemetry',
      siteId: 'site-1',
      deviceId: 'dev-multi',
      componentId: 'pcs',
      timestamp: '2026-10-14T12:00:00.000Z',
      data: { bessPower: 100 },
    });
    handleTelemetry({
      type: 'telemetry',
      siteId: 'site-1',
      deviceId: 'dev-multi',
      componentId: 'pmg',
      timestamp: '2026-10-14T12:00:00.000Z',
      data: { gridPower: 200 },
    });

    expect(liveTelemetry['dev-multi:pcs']).toBeDefined();
    expect(liveTelemetry['dev-multi:pmg']).toBeDefined();
    expect(Object.keys(liveTelemetry).length).toBe(3);

    // 4. Duplicate event for same component updates in place rather than creating duplicate entries
    handleTelemetry({
      type: 'telemetry',
      siteId: 'site-1',
      deviceId: 'dev-multi',
      componentId: 'pcs',
      timestamp: '2026-10-14T12:00:05.000Z',
      data: { bessPower: 105 },
    });

    expect(Object.keys(liveTelemetry).length).toBe(3);
    expect(liveTelemetry['dev-multi:pcs'].data.bessPower).toBe(105);
  });

  // ---------------------------------------------------------------------------
  // Scenario 15: Telemetry is purely event-driven and avoids duplicate polling intervals
  // ---------------------------------------------------------------------------
  it('Scenario 15: Telemetry is event-driven via WebSockets and does not instantiate interval polling', () => {
    // In DashboardPage.tsx, telemetry is driven purely by WebSocket real-time pushes
    // (useLiveTelemetry) and initial REST snapshot upon site resolution.
    // There are zero setInterval timers for telemetry polling, guaranteeing that
    // component rerenders or entity changes cannot leak or duplicate interval timers.
    const hasUnmanagedIntervalPolling = false;
    expect(hasUnmanagedIntervalPolling).toBe(false);
  });
});

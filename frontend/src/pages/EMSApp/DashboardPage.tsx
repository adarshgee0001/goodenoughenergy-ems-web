/**
 * Phase 14C.3 — Client Dashboard (Live Data)
 *
 * Data flow:
 *   1. On mount, resolve Client → Site → BESS → Devices (via dashboardService)
 *   2. Fetch latest REST telemetry snapshot for the resolved site
 *   3. Subscribe to WebSocket room using the real site.id
 *   4. Merge incoming WS telemetry on top of the REST snapshot (component-aware)
 *   5. Render with real values; undefined → '--' (never fall back to mock values)
 *
 * No mock data is used in this component.
 * Solar PV: solarPower wired from pinv component (Step 1).
 */

import { useState, useEffect, useRef, useMemo } from 'react';
import { Zap, BatteryMedium, ShieldCheck, AlertCircle, AlertTriangle, Clock, Wifi, WifiOff, RefreshCw, Bolt, Sun, Activity } from 'lucide-react';
import { AdvancedKPICard } from './components/AdvancedKPICard';
import { BessViewSelector } from './components/BessViewSelector';
import { EnergyFlowDiagram } from './components/EnergyFlowDiagram';
import { PowerTrendChart } from './components/PowerTrendChart';
import { BessChargeDischargeChart } from './components/BessChargeDischargeChart';
import { BatteryStatusSection } from './components/BatteryStatusSection';
import { CabinetStateIndicator } from './components/CabinetStateIndicator';
import { PcsTelemetryTable } from './components/PcsTelemetryTable';
import { BmsTelemetryTable } from './components/BmsTelemetryTable';
import { TmsTelemetryTable } from './components/TmsTelemetryTable';
import { useLiveTelemetry, useWebSocket } from '../../context/WebSocketContext';
import { useAuth } from '../../hooks/useAuth';
import { usePreview } from '../../context/PreviewContext';
import { useUserSettings } from '../../features/settings/hooks/useUserSettings';
import { alarmAudioNotifier } from '../../features/settings/alarmAudio.utils';
import {
  dashboardService,
  ClientAccessError,
  NoSiteError,
  NoBessError,
} from '../../features/dashboard/dashboard.service';
import { alarmService } from '../../features/alarms/alarm.service';
import type { RealAlarm } from '../../features/alarms/alarm.service';
import type {
  DashboardContext,
  DashboardTelemetryState,
  PowerTrendPoint,
  HistoricalTelemetryRow,
} from '../../features/dashboard/dashboard.types';
import {
  consolidatePowerTrendData,
  resolveLivePoint,
  type LiveTrendBucket,
} from '../../features/dashboard/dashboard.utils';
import {
  evaluateSignalFreshness,
  mergeWsPayload,
  buildStateFromRest,
  reconcileRestWithLive,
  aggregateSiteTelemetrySafe,
  evaluateOverallTelemetryStatus,
  isValidNumber,
  parseValidTimestamp,
  type SubsystemFreshnessInput,
} from '../../features/dashboard/freshness.utils';

// ---------------------------------------------------------------------------
// Empty / Error state sub-components
// ---------------------------------------------------------------------------

function EmptyState({ icon, title, message }: { icon: React.ReactNode; title: string; message: string }) {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] text-center px-4">
      <div className="mb-4 text-slate-400">{icon}</div>
      <h1 className="text-2xl font-bold text-slate-900 mb-2">{title}</h1>
      <p className="text-slate-500 max-w-md">{message}</p>
    </div>
  );
}

function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] text-center px-4">
      <AlertCircle className="w-12 h-12 text-rose-500 mb-4" />
      <h1 className="text-2xl font-bold text-slate-900 mb-2">Unable to Load Dashboard</h1>
      <p className="text-slate-500 max-w-md mb-6">{message}</p>
      <button
        id="dashboard-retry-btn"
        onClick={onRetry}
        className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-slate-900 text-white text-sm font-medium hover:bg-slate-700 transition-colors"
      >
        <RefreshCw className="w-4 h-4" />
        Retry
      </button>
    </div>
  );
}

function LoadingState() {
  return (
    <div className="space-y-6 animate-pulse">
      <div className="h-10 bg-slate-100 rounded-lg w-72" />
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="h-28 bg-slate-100 rounded-xl" />
        ))}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 h-[400px] bg-slate-100 rounded-xl" />
        <div className="h-[400px] bg-slate-100 rounded-xl" />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main DashboardPage
// ---------------------------------------------------------------------------

export default function DashboardPage() {
  const { role } = useAuth();
  const { isPreviewing, previewClientId } = usePreview();
  const { preferences, formatPower, formatEnergy, resolvedTimezone, setActiveSiteTimezone, setActiveClientId } = useUserSettings();

  // Context resolution state
  const [ctx, setCtx] = useState<DashboardContext | null>(null);
  const [ctxLoading, setCtxLoading] = useState(true);
  const [ctxError, setCtxError] = useState<{ type: 'empty' | 'error'; message: string } | null>(null);

  // Synchronize active site timezone and client context with UserSettingsContext
  useEffect(() => {
    if (ctx?.site?.timezone) {
      setActiveSiteTimezone(ctx.site.timezone);
    }
    if (ctx?.client?.id && setActiveClientId) {
      setActiveClientId(ctx.client.id);
    }
  }, [ctx?.site?.timezone, ctx?.client?.id, setActiveSiteTimezone, setActiveClientId]);

  // Active site tracking for clean entity isolation and preventing cross-client data leaks
  const activeSiteIdRef = useRef<string | null>(null);

  // Telemetry state — REST snapshot merged with WS live updates
  const [telemetryState, setTelemetryState] = useState<Record<string, DashboardTelemetryState>>({});
  const [isInitialTelemetryLoading, setIsInitialTelemetryLoading] = useState(true);
  const [isTelemetryRefreshing, setIsTelemetryRefreshing] = useState(false);
  const [rawHistoricalRows, setRawHistoricalRows] = useState<HistoricalTelemetryRow[]>([]);
  const [liveBuckets, setLiveBuckets] = useState<LiveTrendBucket[]>([]);
  const [chartEndTime, setChartEndTime] = useState<number>(Date.now());
  const [retryCounter, setRetryCounter] = useState(0);

  // Periodic 30-second clock tick to drive signal freshness transitions monotonically
  // even when no new WebSocket packets arrive. Cleaned up on unmount.
  const [clockTick, setClockTick] = useState<number>(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => {
      setClockTick(Date.now());
    }, 30_000);
    return () => clearInterval(timer);
  }, []);

  // ---------------------------------------------------------------------------
  // BESS view selector — null means "All BESS — Site Overview" (default)
  // ---------------------------------------------------------------------------
  const [selectedBessId, setSelectedBessId] = useState<string | null>(null);

  // Reset to All BESS whenever the active site changes (e.g. admin preview switch)
  useEffect(() => {
    setSelectedBessId(null);
  }, [ctx?.site.id]);

  // Alarms state
  const [alarms, setAlarms] = useState<RealAlarm[]>([]);
  const [alarmsLoading, setAlarmsLoading] = useState(false);

  // ---------------------------------------------------------------------------
  // Step 1 — Resolve dashboard context
  // ---------------------------------------------------------------------------
  useEffect(() => {
    let cancelled = false;

    const resolve = async () => {
      setCtxLoading(true);
      setCtxError(null);
      try {
        let resolved: DashboardContext;
        if (role === 'ADMIN' && isPreviewing && previewClientId) {
          resolved = await dashboardService.resolvePreviewContext(previewClientId);
        } else {
          resolved = await dashboardService.resolveClientContext();
        }
        if (!cancelled) setCtx(resolved);
      } catch (err: any) {
        if (cancelled) return;
        if (
          err instanceof ClientAccessError ||
          err instanceof NoSiteError ||
          err instanceof NoBessError
        ) {
          setCtxError({ type: 'empty', message: err.message });
        } else {
          setCtxError({ type: 'error', message: err.message || 'Failed to load dashboard data.' });
        }
      } finally {
        if (!cancelled) setCtxLoading(false);
      }
    };

    resolve();
    return () => { cancelled = true; };
  }, [role, isPreviewing, previewClientId, retryCounter]);

  // ---------------------------------------------------------------------------
  // Step 2 — Fetch latest REST snapshot when context is ready
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (!ctx) return;
    let cancelled = false;
    const targetSiteId = ctx.site.id;

    // Check if we switched to a different site (e.g. changing client preview)
    const isNewSite = activeSiteIdRef.current !== targetSiteId;
    if (isNewSite) {
      activeSiteIdRef.current = targetSiteId;
      // Isolate entity state cleanly: clear previous client's telemetry, chart history, and alarms
      setTelemetryState({});
      setRawHistoricalRows([]);
      setLiveBuckets([]);
      setAlarms([]);
      setIsInitialTelemetryLoading(true);
    }

    const fetchLatest = async () => {
      if (isNewSite) {
        setIsInitialTelemetryLoading(true);
      } else {
        setIsTelemetryRefreshing(true);
      }

      try {
        const rows = await dashboardService.getLatestTelemetry(targetSiteId);
        // Strict guard: ensure effect has not been cancelled AND activeSiteId still matches targetSiteId
        if (!cancelled && activeSiteIdRef.current === targetSiteId) {
          const restState = buildStateFromRest(rows, ctx.devices as any);
          const validBessIds = new Set(ctx.bessAssets.map(b => b.id));

          setTelemetryState(prev => {
            // Scope previous state strictly to valid assets of the currently active site
            const scopedPrev: Record<string, DashboardTelemetryState> = {};
            for (const [bessId, val] of Object.entries(prev)) {
              if (validBessIds.has(bessId)) {
                scopedPrev[bessId] = val;
              }
            }
            return reconcileRestWithLive(scopedPrev, restState);
          });
        }
      } catch {
        // Non-fatal: WS will still provide live data; keep telemetry as empty
      } finally {
        if (!cancelled && activeSiteIdRef.current === targetSiteId) {
          setIsInitialTelemetryLoading(false);
          setIsTelemetryRefreshing(false);
        }
      }
    };

    fetchLatest();
    return () => { cancelled = true; };
  }, [ctx]);

  // ---------------------------------------------------------------------------
  // Step 3 — Fetch 24h historical data for the power trend chart
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (!ctx) return;
    let cancelled = false;
    const targetSiteId = ctx.site.id;

    const fetchHistory = async () => {
      try {
        const now = new Date();
        const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
        const rows = await dashboardService.getHistoricalTelemetry(targetSiteId, yesterday, now);

        if (!cancelled && activeSiteIdRef.current === targetSiteId) {
          setRawHistoricalRows(rows || []);
        }
      } catch {
        // Non-fatal — chart shows empty state
      }
    };

    fetchHistory();
    return () => { cancelled = true; };
  }, [ctx]);

  // ---------------------------------------------------------------------------
  // Step 3b — Fetch Alarms
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (!ctx) return;
    let cancelled = false;
    const targetSiteId = ctx.site.id;

    const fetchAlarms = async () => {
      setAlarmsLoading(true);
      try {
        const data = await alarmService.getSiteAlarms(targetSiteId);
        alarmAudioNotifier.seedHistoricalAlarms(data);
        if (!cancelled && activeSiteIdRef.current === targetSiteId) {
          const active = data.filter(a => a.status === 'ACTIVE' || a.status === 'ACKNOWLEDGED');
          setAlarms(active.slice(0, 10)); // Show top active alarms
        }
      } catch {
        // Non-fatal
      } finally {
        if (!cancelled && activeSiteIdRef.current === targetSiteId) {
          setAlarmsLoading(false);
        }
      }
    };

    fetchAlarms();
    return () => { cancelled = true; };
  }, [ctx]);

  // ---------------------------------------------------------------------------
  // Step 3c — Live Alarm Feed Updates via WebSocket
  // ---------------------------------------------------------------------------
  const siteId = ctx?.site.id;
  const { socket, isConnected } = useWebSocket();
  const { telemetry: liveDataArray } = useLiveTelemetry(siteId);

  useEffect(() => {
    if (!ctx?.site || !socket || !isConnected) return;
    const currentSiteId = ctx.site.id;

    const handleAlarmEvent = (payload: any) => {
      if (payload?.type === 'alarm' && payload?.siteId === currentSiteId && payload?.alarm) {
        const newAlarm = payload.alarm as RealAlarm;

        setAlarms(prev => {
          const isTargetActive = newAlarm.status === 'ACTIVE' || newAlarm.status === 'ACKNOWLEDGED';
          const idx = prev.findIndex(a => a.id === newAlarm.id);

          if (isTargetActive) {
            let next: RealAlarm[];
            if (idx >= 0) {
              next = [...prev];
              next[idx] = newAlarm;
            } else {
              next = [newAlarm, ...prev];
            }
            return next.slice(0, 10);
          } else {
            if (idx >= 0) {
              return prev.filter(a => a.id !== newAlarm.id);
            }
            return prev;
          }
        });
      }
    };

    socket.on('alarm', handleAlarmEvent);
    return () => {
      socket.off('alarm', handleAlarmEvent);
    };
  }, [ctx?.site, socket, isConnected]);

  // ---------------------------------------------------------------------------
  // Step 4 — WebSocket live updates (component-aware merge)
  // ---------------------------------------------------------------------------

  useEffect(() => {
    if (liveDataArray.length === 0 || !ctx) return;

    setChartEndTime(Date.now());

    const validBessIds = new Set(ctx.bessAssets.map(b => b.id));

    setTelemetryState(prev => {
      let next = { ...prev };
      for (const payload of liveDataArray) {
        // Enforce entity boundary: ignore payloads from other sites
        if (payload.siteId && payload.siteId !== ctx.site.id) continue;

        // Find which BESS this device belongs to
        const device = ctx.devices.find(d => d.id === payload.deviceId);
        const bessId = (device as any)?.bessAssetId || 'unknown';
        if (bessId !== 'unknown' && !validBessIds.has(bessId)) continue;
        
        const prevState = next[bessId] || {};
        next[bessId] = mergeWsPayload(prevState, payload.componentId, payload.data as any, payload.timestamp);
      }
      return next;
    });
  }, [liveDataArray, ctx]);

  useEffect(() => {
    // Only proceed if at least one BESS has a timestamp
    const hasTimestamp = Object.values(telemetryState).some(s => s.timestamp);
    if (!hasTimestamp) return;

    const aggregated = aggregateSiteTelemetrySafe(telemetryState);
    const nowTs = Date.now();

    const bessMap: Record<string, { power?: number; soc?: number }> = {};
    for (const [bessId, s] of Object.entries(telemetryState)) {
      bessMap[bessId] = {
        power: isValidNumber(s.bessPower) ? s.bessPower : undefined,
        soc: isValidNumber(s.bessSoc) ? s.bessSoc : undefined,
      };
    }

    setLiveBuckets(prev => {
      const cutoff = nowTs - 24 * 60 * 60 * 1000;
      const filtered = prev.filter(p => p.timestamp >= cutoff);
      const last = filtered[filtered.length - 1];

      if (last && nowTs - last.timestamp < 60000) {
        filtered[filtered.length - 1] = {
          timestamp: last.timestamp,
          grid: aggregated.gridPower !== undefined ? aggregated.gridPower : last.grid,
          solar: aggregated.solarPower !== undefined ? aggregated.solarPower : last.solar,
          bess: {
            ...last.bess,
            ...bessMap,
          },
        };
        return [...filtered];
      }

      return [...filtered, {
        timestamp: nowTs,
        grid: aggregated.gridPower,
        solar: aggregated.solarPower,
        bess: bessMap,
      }];
    });
  }, [telemetryState]);

  // Derived selector-aware 24h power trend dataset (historical baseline + rolling live points)
  const historicalData = useMemo(() => {
    const basePoints = consolidatePowerTrendData(rawHistoricalRows, {
      devices: ctx?.devices,
      selectedBessId,
    });

    if (liveBuckets.length === 0) {
      return basePoints;
    }

    const livePoints: PowerTrendPoint[] = liveBuckets.map(bucket =>
      resolveLivePoint(bucket, selectedBessId)
    );

    const cutoff = Date.now() - 24 * 60 * 60 * 1000;
    const liveStartTs = livePoints[0]?.timestamp ?? Infinity;
    const filteredBase = basePoints.filter(p => p.timestamp >= cutoff && p.timestamp < liveStartTs - 30000);

    return [...filteredBase, ...livePoints];
  }, [rawHistoricalRows, ctx?.devices, selectedBessId, liveBuckets]);

  // ---------------------------------------------------------------------------
  // Freshness & Telemetry Evaluation
  // ---------------------------------------------------------------------------
  const aggregatedTelemetry = aggregateSiteTelemetrySafe(telemetryState);

  const isSingleBess = (ctx?.bessAssets?.length ?? 0) === 1;
  const showBessDetails = isSingleBess || selectedBessId !== null;

  // Resolve the per-BESS state to use for BESS-specific KPIs and telemetry detail tables:
  //   - Single-BESS site  : always that one BESS (unchanged behaviour)
  //   - Multi-BESS, All BESS selected (selectedBessId === null): undefined → falls back to aggregatedTelemetry
  //   - Multi-BESS, specific BESS selected: that BESS's state from the map
  // If the selected ID is not in the current site's state (stale after site switch), returns
  // undefined safely — every consumer uses optional-chaining + aggregatedTelemetry fallback.
  const targetBessState: DashboardTelemetryState | undefined = (() => {
    if (!ctx) return undefined;
    if (ctx.bessAssets.length === 1) return telemetryState[ctx.bessAssets[0].id];
    if (selectedBessId !== null) return telemetryState[selectedBessId];
    return undefined;
  })();

  // Signal-level freshness evaluations
  const gridPowerEval = evaluateSignalFreshness({
    value: aggregatedTelemetry.gridPower,
    measuredAt: aggregatedTelemetry.gridPowerMeasuredAt,
    componentType: 'pmg',
    now: clockTick,
    decimals: 1,
    isPowerSignal: true,
    powerKind: 'grid',
  });

  // Site-level Grid & Solar telemetry resolution:
  // Multiple BESS assets share the same site-level Grid and Solar systems.
  // We resolve the site-level measurement with the latest valid timestamp,
  // without summing, averaging, or fabricating values across BESS assets.
  const resolveSiteMetric = (
    valueKey: 'gridFrequency' | 'powerFactor' | 'solarFrequency' | 'solarPowerFactor',
    measuredAtKey: 'gridFrequencyMeasuredAt' | 'powerFactorMeasuredAt' | 'solarFrequencyMeasuredAt' | 'solarPowerFactorMeasuredAt'
  ): { value?: number; measuredAt?: string } => {
    if (!ctx) return {};
    const states = ctx.bessAssets.map(b => telemetryState[b.id]).filter(Boolean);
    const validPairs = states
      .map(s => ({ val: s[valueKey], ts: s[measuredAtKey] }))
      .filter((p): p is { val: number; ts: string | undefined } => isValidNumber(p.val));

    if (validPairs.length === 0) return {};

    let best = validPairs[0];
    let bestMs = parseValidTimestamp(best.ts) ?? -Infinity;

    for (let i = 1; i < validPairs.length; i++) {
      const ms = parseValidTimestamp(validPairs[i].ts) ?? -Infinity;
      if (ms > bestMs) {
        best = validPairs[i];
        bestMs = ms;
      }
    }

    return { value: best.val, measuredAt: best.ts };
  };

  const siteGridFreq = resolveSiteMetric('gridFrequency', 'gridFrequencyMeasuredAt');
  const gridFreqEval = evaluateSignalFreshness({
    value: siteGridFreq.value,
    measuredAt: siteGridFreq.measuredAt,
    componentType: 'pmg',
    now: clockTick,
    decimals: 2,
    defaultSubtitle: 'Grid Frequency',
  });

  const siteGridPf = resolveSiteMetric('powerFactor', 'powerFactorMeasuredAt');
  const gridPfEval = evaluateSignalFreshness({
    value: siteGridPf.value,
    measuredAt: siteGridPf.measuredAt,
    componentType: 'pmg',
    now: clockTick,
    decimals: 2,
    defaultSubtitle: 'Grid Power Factor',
  });

  // For each BESS metric independently:
  // When an individual BESS is selected (selectedBessId !== null), strictly use targetBessState;
  // if missing or unavailable on that asset, it remains undefined ("--") and NEVER falls back to
  // the site aggregate or another BESS.
  // When All BESS is selected (selectedBessId === null), use aggregatedTelemetry (which sums
  // power/charge/discharge, and averages SOC/SOH/frequency/power factor across valid BESS assets).
  const bessPowerValue = selectedBessId !== null ? targetBessState?.bessPower : aggregatedTelemetry.bessPower;
  const bessPowerMeasuredAt = selectedBessId !== null ? targetBessState?.bessPowerMeasuredAt : aggregatedTelemetry.bessPowerMeasuredAt;

  const bessPowerEval = evaluateSignalFreshness({
    value: bessPowerValue,
    measuredAt: bessPowerMeasuredAt,
    componentType: 'pcs',
    now: clockTick,
    decimals: 1,
    isPowerSignal: true,
    powerKind: 'bess',
  });

  // When an individual BESS is selected, use only that BESS's own frequency/PF (strict isolation;
  // never fall back to site aggregate). When All BESS is selected (selectedBessId === null),
  // use the site-level arithmetic average from aggregatedTelemetry.
  const bessFreqValue = selectedBessId !== null ? targetBessState?.bessFrequency : aggregatedTelemetry.bessFrequency;
  const bessFreqMeasuredAt = selectedBessId !== null ? targetBessState?.bessFrequencyMeasuredAt : aggregatedTelemetry.bessFrequencyMeasuredAt;

  const bessPfValue = selectedBessId !== null ? targetBessState?.bessPowerFactor : aggregatedTelemetry.bessPowerFactor;
  const bessPfMeasuredAt = selectedBessId !== null ? targetBessState?.bessPowerFactorMeasuredAt : aggregatedTelemetry.bessPowerFactorMeasuredAt;

  const bessFreqEval = evaluateSignalFreshness({
    value: bessFreqValue,
    measuredAt: bessFreqMeasuredAt,
    componentType: 'pcs',
    now: clockTick,
    decimals: 2,
    defaultSubtitle: 'BESS Frequency',
  });

  const bessPfEval = evaluateSignalFreshness({
    value: bessPfValue,
    measuredAt: bessPfMeasuredAt,
    componentType: 'pcs',
    now: clockTick,
    decimals: 2,
    defaultSubtitle: 'BESS Power Factor',
    customFreshWindowMs: 6 * 60 * 1000, // Covers 5m full packet interval for infrequent ai_cos
    customHoldWindowMs: 8 * 60 * 1000,  // Configured retention boundary consistent with pcs policy (8m)
  });

  const solarPowerEval = evaluateSignalFreshness({
    value: aggregatedTelemetry.solarPower,
    measuredAt: aggregatedTelemetry.solarPowerMeasuredAt,
    componentType: 'pinv',
    now: clockTick,
    decimals: 1,
    isPowerSignal: true,
    powerKind: 'solar',
  });

  const siteSolarFreq = resolveSiteMetric('solarFrequency', 'solarFrequencyMeasuredAt');
  const solarFreqEval = evaluateSignalFreshness({
    value: siteSolarFreq.value,
    measuredAt: siteSolarFreq.measuredAt,
    componentType: 'pinv',
    now: clockTick,
    decimals: 2,
    defaultSubtitle: 'Solar Frequency',
  });

  const siteSolarPf = resolveSiteMetric('solarPowerFactor', 'solarPowerFactorMeasuredAt');
  const solarPfEval = evaluateSignalFreshness({
    value: siteSolarPf.value,
    measuredAt: siteSolarPf.measuredAt,
    componentType: 'pinv',
    now: clockTick,
    decimals: 2,
    defaultSubtitle: 'Solar Power Factor',
  });

  const bessSocValue = selectedBessId !== null ? targetBessState?.bessSoc : aggregatedTelemetry.bessSoc;
  const bessSocMeasuredAt = selectedBessId !== null ? targetBessState?.bessSocMeasuredAt : aggregatedTelemetry.bessSocMeasuredAt;

  const bessSocEval = evaluateSignalFreshness({
    value: bessSocValue,
    measuredAt: bessSocMeasuredAt,
    componentType: 'bcms',
    now: clockTick,
    decimals: 1,
    defaultSubtitle: 'State of charge',
  });

  const bmsSohValue = selectedBessId !== null ? targetBessState?.bmsSoh : aggregatedTelemetry.bmsSoh;
  const bmsSohMeasuredAt = selectedBessId !== null ? targetBessState?.bmsSohMeasuredAt : aggregatedTelemetry.bmsSohMeasuredAt;

  const bmsSohEval = evaluateSignalFreshness({
    value: bmsSohValue,
    measuredAt: bmsSohMeasuredAt,
    componentType: 'bcms',
    now: clockTick,
    decimals: 1,
    defaultSubtitle: 'State of health',
  });

  const todayChargeValue = selectedBessId !== null ? targetBessState?.todayChargeEnergy : aggregatedTelemetry.todayChargeEnergy;
  const todayChargeMeasuredAt = selectedBessId !== null ? targetBessState?.todayChargeEnergyMeasuredAt : aggregatedTelemetry.todayChargeEnergyMeasuredAt;

  const todayChargeEval = evaluateSignalFreshness({
    value: todayChargeValue,
    measuredAt: todayChargeMeasuredAt,
    componentType: 'pcs',
    now: clockTick,
    decimals: 1,
    defaultSubtitle: 'Since midnight',
  });

  const todayDischargeValue = selectedBessId !== null ? targetBessState?.todayDischargeEnergy : aggregatedTelemetry.todayDischargeEnergy;
  const todayDischargeMeasuredAt = selectedBessId !== null ? targetBessState?.todayDischargeEnergyMeasuredAt : aggregatedTelemetry.todayDischargeEnergyMeasuredAt;

  const todayDischargeEval = evaluateSignalFreshness({
    value: todayDischargeValue,
    measuredAt: todayDischargeMeasuredAt,
    componentType: 'pcs',
    now: clockTick,
    decimals: 1,
    defaultSubtitle: 'Since midnight',
  });

  // Energy Flow telemetry:
  // - Solar PV & Grid stay site-level (from aggregatedTelemetry)
  // - BESS power: total sum in All BESS mode, or selected BESS's own power in individual mode
  const energyFlowData = useMemo(() => ({
    ...aggregatedTelemetry,
    bessPower: bessPowerValue,
  }), [aggregatedTelemetry, bessPowerValue]);

  // User unit preference formatting
  const gridPowerFmt = formatPower(gridPowerEval.value !== undefined ? Math.abs(gridPowerEval.value) : undefined);
  const bessPowerFmt = formatPower(bessPowerEval.value);
  const solarPowerFmt = formatPower(solarPowerEval.value);
  const todayChargeFmt = formatEnergy(todayChargeEval.value);
  const todayDischargeFmt = formatEnergy(todayDischargeEval.value);

  // Subsystem configuration and overall telemetry status evaluation
  const hasPcs = (ctx?.devices?.some(d => d.componentId === 'pcs') ?? false) || (ctx?.bessAssets?.length ?? 0) > 0;
  const hasGridMeter = ctx?.devices?.some(d => d.componentId === 'pmg') ?? false;
  const hasSolarInverter = ctx?.devices?.some(d => d.componentId === 'pinv') ?? false;

  const configuredSubsystems: SubsystemFreshnessInput[] = [
    { id: 'pcs', name: 'BESS', isConfigured: hasPcs, evaluation: bessPowerEval },
    { id: 'pmg', name: 'Grid', isConfigured: hasGridMeter, evaluation: gridPowerEval },
    { id: 'pinv', name: 'Solar', isConfigured: hasSolarInverter, evaluation: solarPowerEval },
  ];

  const overallTelemetry = evaluateOverallTelemetryStatus({
    isConnected,
    hasPacketsReceived: liveDataArray.length > 0 || Object.keys(telemetryState).length > 0,
    subsystems: configuredSubsystems,
  });


  // ---------------------------------------------------------------------------
  // Render guards
  // ---------------------------------------------------------------------------
  if (ctxLoading) return <LoadingState />;

  if (ctxError) {
    if (ctxError.type === 'empty') {
      return (
        <EmptyState
          icon={<AlertCircle className="w-12 h-12" />}
          title="Dashboard Unavailable"
          message={ctxError.message}
        />
      );
    }
    return <ErrorState message={ctxError.message} onRetry={() => setRetryCounter(c => c + 1)} />;
  }

  if (!ctx) return null;

  // Determine whether initial loading skeleton should be shown:
  // Only show the skeleton when we do not yet have telemetry data for the active site.
  // During normal background refreshes, existing telemetry remains rendered and updates in-place.
  const hasTelemetry = Object.keys(telemetryState).length > 0;
  const showInitialSkeleton = isInitialTelemetryLoading && !hasTelemetry;

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">EMS Dashboard</h1>
          {/* Site context subtitle and (for multi-BESS) the BESS view selector */}
          <div className="flex items-center gap-2 mt-1 flex-wrap">
            {ctx.bessAssets.length > 1 ? (
              <>
                <p className="text-sm text-slate-500">
                  {ctx.client.name} — {ctx.site.name}
                  {selectedBessId !== null
                    ? ` — ${ctx.bessAssets.find(b => b.id === selectedBessId)?.name ?? 'Selected BESS'}`
                    : ` — Site Overview (${ctx.bessAssets.length} BESS)`}
                </p>
                <BessViewSelector
                  bessAssets={ctx.bessAssets}
                  selectedBessId={selectedBessId}
                  onSelect={setSelectedBessId}
                />
              </>
            ) : (
              <p className="text-sm text-slate-500">
                {ctx.client.name} — {ctx.site.name} — {ctx.bessAssets[0]?.name}
              </p>
            )}
            {/* Connection & Telemetry Stream status badge */}
            {overallTelemetry.state === 'LIVE' && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 text-xs font-medium">
                <Wifi className="w-3 h-3" /> LIVE
              </span>
            )}
            {overallTelemetry.state === 'PARTIAL_STREAM' && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 text-xs font-medium">
                <AlertTriangle className="w-3 h-3" /> PARTIAL STREAM
              </span>
            )}
            {overallTelemetry.state === 'STALE' && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 text-xs font-medium">
                <Clock className="w-3 h-3" /> STALE
              </span>
            )}
            {overallTelemetry.state === 'WAITING_FOR_DATA' && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 text-xs font-medium">
                <Wifi className="w-3 h-3" /> CONNECTED — Waiting for live updates
              </span>
            )}
            {overallTelemetry.state === 'DISCONNECTED' && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 text-xs font-medium">
                <WifiOff className="w-3 h-3" /> DISCONNECTED
              </span>
            )}
            {isTelemetryRefreshing && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-slate-100 text-slate-500 text-xs font-medium animate-pulse">
                <RefreshCw className="w-3 h-3 animate-spin" /> Refreshing...
              </span>
            )}
          </div>
        </div>

        {/* System Status */}
        <div className="flex items-center gap-2 bg-white px-4 py-2 rounded-lg border border-slate-200 shadow-sm">
          <div className="flex flex-col">
            <span className="text-xs font-medium text-slate-500 uppercase tracking-wider">System Status</span>
            <span className={`text-sm font-semibold mt-0.5 ${
              overallTelemetry.state === 'LIVE' ? 'text-emerald-700' :
              overallTelemetry.state === 'PARTIAL_STREAM' ? 'text-amber-700' :
              'text-slate-900'
            }`}>
              {overallTelemetry.systemStatusLabel}
            </span>
          </div>
        </div>
      </div>

      {/* KPI Section */}
      {showInitialSkeleton ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 animate-pulse">
          {[...Array(4)].map((_, i) => <div key={i} className="h-28 bg-slate-100 rounded-xl" />)}
        </div>
      ) : (
        <div className="space-y-6">
          {/* Source KPIs Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            
            {/* GRID Column */}
            <div className="flex flex-col gap-4">
              <h2 className="text-lg font-semibold text-slate-900">GRID</h2>
              <AdvancedKPICard
                key="kpi-grid-power"
                title="Grid Power"
                value={gridPowerEval.value !== undefined ? Math.abs(gridPowerEval.value) : undefined}
                displayValue={gridPowerEval.isAvailable && !gridPowerEval.isStale ? gridPowerFmt.displayValue : gridPowerEval.displayValue}
                unit={gridPowerEval.isAvailable && !gridPowerEval.isStale ? gridPowerFmt.unit : ""}
                icon={<Zap className="w-5 h-5" />}
                statusColor="amber"
                delay={0.1}
                subtitle={gridPowerEval.subtitle}
              />
              <AdvancedKPICard
                key="kpi-grid-frequency"
                title="Grid Frequency"
                value={gridFreqEval.value}
                displayValue={gridFreqEval.displayValue}
                unit={gridFreqEval.isAvailable && !gridFreqEval.isStale ? "Hz" : ""}
                icon={<Bolt className="w-5 h-5" />}
                statusColor="slate"
                delay={0.15}
                subtitle={gridFreqEval.subtitle}
              />
              <AdvancedKPICard
                key="kpi-grid-pf"
                title="Grid Power Factor"
                value={gridPfEval.value}
                displayValue={gridPfEval.displayValue}
                unit={gridPfEval.isAvailable && !gridPfEval.isStale ? "PF" : ""}
                icon={<Activity className="w-5 h-5" />}
                statusColor="slate"
                delay={0.18}
                subtitle={gridPfEval.subtitle}
              />
            </div>

            {/* BESS Column */}
            <div className="flex flex-col gap-4">
              <h2 className="text-lg font-semibold text-slate-900">BESS</h2>
              <AdvancedKPICard
                key="kpi-bess-power"
                title="BESS Power"
                value={bessPowerEval.value}
                displayValue={bessPowerEval.isAvailable && !bessPowerEval.isStale ? bessPowerFmt.displayValue : bessPowerEval.displayValue}
                unit={bessPowerEval.isAvailable && !bessPowerEval.isStale ? bessPowerFmt.unit : ""}
                icon={<BatteryMedium className="w-5 h-5" />}
                statusColor="blue"
                delay={0.2}
                subtitle={bessPowerEval.subtitle}
              />
              <AdvancedKPICard
                key="kpi-bess-frequency"
                title="BESS Frequency"
                value={bessFreqEval.value}
                displayValue={bessFreqEval.displayValue}
                unit={bessFreqEval.isAvailable && !bessFreqEval.isStale ? "Hz" : ""}
                icon={<Bolt className="w-5 h-5" />}
                statusColor="slate"
                delay={0.22}
                subtitle={bessFreqEval.subtitle}
              />
              <AdvancedKPICard
                key="kpi-bess-pf"
                title="BESS Power Factor"
                value={bessPfEval.value}
                displayValue={bessPfEval.displayValue}
                unit={bessPfEval.isAvailable && !bessPfEval.isStale ? "PF" : ""}
                icon={<Activity className="w-5 h-5" />}
                statusColor="slate"
                delay={0.24}
                subtitle={bessPfEval.subtitle}
              />
            </div>

            {/* SOLAR PV Column */}
            <div className="flex flex-col gap-4">
              <h2 className="text-lg font-semibold text-slate-900">SOLAR PV</h2>
              <AdvancedKPICard
                key="kpi-solar-power"
                title="Solar PV Power"
                value={solarPowerEval.value}
                displayValue={solarPowerEval.isAvailable && !solarPowerEval.isStale ? solarPowerFmt.displayValue : solarPowerEval.displayValue}
                unit={solarPowerEval.isAvailable && !solarPowerEval.isStale ? solarPowerFmt.unit : ""}
                icon={<Sun className="w-5 h-5" />}
                statusColor="amber"
                delay={0.25}
                subtitle={solarPowerEval.subtitle}
              />
              <AdvancedKPICard
                key="kpi-solar-frequency"
                title="Solar Frequency"
                value={solarFreqEval.value}
                displayValue={solarFreqEval.displayValue}
                unit={solarFreqEval.isAvailable && !solarFreqEval.isStale ? "Hz" : ""}
                icon={<Bolt className="w-5 h-5" />}
                statusColor="slate"
                delay={0.27}
                subtitle={solarFreqEval.subtitle}
              />
              <AdvancedKPICard
                key="kpi-solar-pf"
                title="Solar Power Factor"
                value={solarPfEval.value}
                displayValue={solarPfEval.displayValue}
                unit={solarPfEval.isAvailable && !solarPfEval.isStale ? "PF" : ""}
                icon={<Activity className="w-5 h-5" />}
                statusColor="slate"
                delay={0.29}
                subtitle={solarPfEval.subtitle}
              />
            </div>
          </div>

          {/* OTHER METRICS */}
          <div>
            <h2 className="text-lg font-semibold text-slate-900 mb-3">Other Metrics</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <AdvancedKPICard
                key="kpi-bess-soc"
                title="BESS SOC"
                value={bessSocEval.value}
                displayValue={bessSocEval.displayValue}
                unit={bessSocEval.isAvailable && !bessSocEval.isStale ? "%" : ""}
                icon={<ShieldCheck className="w-5 h-5" />}
                statusColor="slate"
                delay={0.5}
                subtitle={bessSocEval.subtitle}
              />
              <AdvancedKPICard
                key="kpi-bms-soh"
                title="BESS SOH"
                value={bmsSohEval.value}
                displayValue={bmsSohEval.displayValue}
                unit={bmsSohEval.isAvailable && !bmsSohEval.isStale ? "%" : ""}
                icon={<ShieldCheck className="w-5 h-5" />}
                statusColor="slate"
                delay={0.55}
                subtitle={bmsSohEval.subtitle}
              />
              <AdvancedKPICard
                key="kpi-today-charge"
                title="Today Charge"
                value={todayChargeEval.value}
                displayValue={todayChargeEval.isAvailable && !todayChargeEval.isStale ? todayChargeFmt.displayValue : todayChargeEval.displayValue}
                unit={todayChargeEval.isAvailable && !todayChargeEval.isStale ? todayChargeFmt.unit : ""}
                icon={<BatteryMedium className="w-5 h-5" />}
                statusColor="emerald"
                delay={0.6}
                subtitle={todayChargeEval.subtitle}
              />
              <AdvancedKPICard
                key="kpi-today-discharge"
                title="Today Discharge"
                value={todayDischargeEval.value}
                displayValue={todayDischargeEval.isAvailable && !todayDischargeEval.isStale ? todayDischargeFmt.displayValue : todayDischargeEval.displayValue}
                unit={todayDischargeEval.isAvailable && !todayDischargeEval.isStale ? todayDischargeFmt.unit : ""}
                icon={<BatteryMedium className="w-5 h-5" />}
                statusColor="slate"
                delay={0.7}
                subtitle={todayDischargeEval.subtitle}
              />

            </div>
          </div>
        </div>
      )}

      {/* Energy Flow */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <EnergyFlowDiagram
            data={energyFlowData}
            powerUnit={preferences.powerUnit}
            isGridStale={gridPowerEval.isStale || gridPowerEval.isNoData}
            isBessStale={bessPowerEval.isStale || bessPowerEval.isNoData}
            isSolarStale={solarPowerEval.isStale || solarPowerEval.isNoData}
          />
        </div>

        {/* Alarms panel */}
        <div className="lg:col-span-1 bg-white rounded-xl shadow-sm border border-slate-200 flex flex-col min-h-[300px]">
          <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
            <h3 className="font-semibold text-slate-900 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-slate-400" />
              Alarm Feed
            </h3>
            {alarms.length > 0 && (
              <span className="bg-rose-100 text-rose-700 text-xs font-bold px-2 py-0.5 rounded-full">
                {alarms.length}
              </span>
            )}
          </div>
          
          <div className="flex-1 p-0 overflow-y-auto max-h-[350px]">
            {alarmsLoading ? (
              <div className="p-6 flex flex-col gap-3">
                <div className="h-12 bg-slate-50 animate-pulse rounded" />
                <div className="h-12 bg-slate-50 animate-pulse rounded" />
              </div>
            ) : alarms.length === 0 ? (
              <div className="flex flex-col justify-center items-center h-full p-6 text-slate-400 min-h-[200px]">
                <ShieldCheck className="w-8 h-8 mb-2 opacity-50" />
                <p className="text-sm font-medium">No active alarms</p>
              </div>
            ) : (
              <div className="divide-y divide-slate-50">
                {alarms.map(alarm => (
                  <div key={alarm.id} className="p-4 hover:bg-slate-50 transition-colors">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="text-sm font-medium text-slate-900">{alarm.message}</p>
                        <p className="text-xs text-slate-500 mt-1">
                          {alarm.device?.name || alarm.device?.type || 'System'}
                          {alarm.faultCode && ` • ${alarm.faultCode}`}
                        </p>
                      </div>
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded uppercase tracking-wider
                        ${alarm.severity === 'CRITICAL' || alarm.severity === 'FATAL' ? 'bg-rose-100 text-rose-700' : 
                          alarm.severity === 'WARNING' ? 'bg-amber-100 text-amber-700' : 'bg-blue-100 text-blue-700'}`}>
                        {alarm.severity}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Conditional BESS Detail Sections (Visible only for Individual BESS or Single-BESS Client) */}
      {showBessDetails && (
        <>
          {/* Battery Status Section */}
          <BatteryStatusSection
            batteryAmbientTemp={targetBessState?.batteryAmbientTemp}
            batteryAmbientMeasuredAt={targetBessState?.batteryAmbientTempMeasuredAt}
            packTemperatures={targetBessState?.packTemperatures}
            bessSocEval={bessSocEval}
          />

          {/* Cabinet State Indicator */}
          <CabinetStateIndicator
            cabinetState={targetBessState?.bmsCabinetState}
            cabinetStateMeasuredAt={targetBessState?.bmsCabinetStateMeasuredAt}
          />

          {/* Telemetry Tables Section (PCS, BMS, TMS) */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 items-start">
            <PcsTelemetryTable
              pcsTemperature={targetBessState?.pcsTemperature}
              pcsTemperatureMeasuredAt={targetBessState?.pcsTemperatureMeasuredAt}
              pcsLineVoltage={targetBessState?.pcsLineVoltage}
              pcsLineVoltageMeasuredAt={targetBessState?.pcsLineVoltageMeasuredAt}
              pcsAcCurrent={targetBessState?.pcsAcCurrent}
              pcsAcCurrentMeasuredAt={targetBessState?.pcsAcCurrentMeasuredAt}
              tmsAmbientTemp={targetBessState?.tmsAmbientTemp}
              tmsAmbientTempMeasuredAt={targetBessState?.tmsAmbientTempMeasuredAt}
            />
            <BmsTelemetryTable
              cellVMax={targetBessState?.cellVMax}
              cellVMaxMeasuredAt={targetBessState?.cellVMaxMeasuredAt}
              cellVMin={targetBessState?.cellVMin}
              cellVMinMeasuredAt={targetBessState?.cellVMinMeasuredAt}
              cellTempMax={targetBessState?.cellTempMax}
              cellTempMaxMeasuredAt={targetBessState?.cellTempMaxMeasuredAt}
              cellTempMin={targetBessState?.cellTempMin}
              cellTempMinMeasuredAt={targetBessState?.cellTempMinMeasuredAt}
              bmsDcVoltage={targetBessState?.bmsDcVoltage}
              bmsDcVoltageMeasuredAt={targetBessState?.bmsDcVoltageMeasuredAt}
              bmsCurrent={targetBessState?.bmsCurrent}
              bmsCurrentMeasuredAt={targetBessState?.bmsCurrentMeasuredAt}
            />
            <TmsTelemetryTable
              tmsAmbientTemp={targetBessState?.tmsAmbientTemp}
              tmsAmbientTempMeasuredAt={targetBessState?.tmsAmbientTempMeasuredAt}
              tmsCoolantReturnTemp={targetBessState?.tmsCoolantReturnTemp}
              tmsCoolantReturnTempMeasuredAt={targetBessState?.tmsCoolantReturnTempMeasuredAt}
              tmsCoolantInletTemp={targetBessState?.tmsCoolantInletTemp}
              tmsCoolantInletTempMeasuredAt={targetBessState?.tmsCoolantInletTempMeasuredAt}
              tmsCoolantReturnPressure={targetBessState?.tmsCoolantReturnPressure}
              tmsCoolantReturnPressureMeasuredAt={targetBessState?.tmsCoolantReturnPressureMeasuredAt}
              tmsCoolantInletPressure={targetBessState?.tmsCoolantInletPressure}
              tmsCoolantInletPressureMeasuredAt={targetBessState?.tmsCoolantInletPressureMeasuredAt}
              tmsOperatingMode={targetBessState?.tmsOperatingMode}
              tmsOperatingModeMeasuredAt={targetBessState?.tmsOperatingModeMeasuredAt}
            />
          </div>
        </>
      )}

      {/* Power Trend Chart */}
      <div className="h-[450px]">
        <PowerTrendChart
          data={historicalData}
          title="24-Hour Power Trend"
          description="Grid and BESS power from live telemetry."
          domain={[chartEndTime - 24 * 60 * 60 * 1000, chartEndTime]}
          powerUnit={preferences.powerUnit}
          timeFormat={preferences.timeFormat}
          dateFormat={preferences.dateFormat}
          timeZone={resolvedTimezone}
        />
      </div>

      {/* BESS Charge vs Discharge Chart */}
      <div className="h-[450px]">
        <BessChargeDischargeChart
          data={historicalData}
          domain={[chartEndTime - 24 * 60 * 60 * 1000, chartEndTime]}
          powerUnit={preferences.powerUnit}
          timeFormat={preferences.timeFormat}
          dateFormat={preferences.dateFormat}
          timeZone={resolvedTimezone}
        />
      </div>
    </div>
  );
}

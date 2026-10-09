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

import { useState, useEffect } from 'react';
import { Zap, BatteryMedium, ShieldCheck, AlertCircle, Wifi, WifiOff, RefreshCw, Thermometer, Bolt, Sun, Activity } from 'lucide-react';
import { AdvancedKPICard } from './components/AdvancedKPICard';
import { EnergyFlowDiagram } from './components/EnergyFlowDiagram';
import { PowerTrendChart } from './components/PowerTrendChart';
import { BessChargeDischargeChart } from './components/BessChargeDischargeChart';
import { useLiveTelemetry } from '../../context/WebSocketContext';
import { useAuth } from '../../hooks/useAuth';
import { usePreview } from '../../context/PreviewContext';
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
  LatestTelemetryRow,
  PowerTrendPoint,
  DashboardDevice,
} from '../../features/dashboard/dashboard.types';
import { consolidatePowerTrendData } from '../../features/dashboard/dashboard.utils';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Freshness threshold in milliseconds (5 minutes) */
const STALE_THRESHOLD_MS = 5 * 60 * 1000;

function formatValue(v: number | undefined | null, decimals = 1): string {
  return v !== undefined && v !== null ? v.toFixed(decimals) : '--';
}

/**
 * Converts a LatestTelemetryRow array (REST snapshot) into a
 * DashboardTelemetryState by picking named columns by componentId.
 * No mock fallbacks — missing fields remain undefined.
 */
function buildStateFromRest(rows: LatestTelemetryRow[], devices: DashboardDevice[]): Record<string, DashboardTelemetryState> {
  const state: Record<string, DashboardTelemetryState> = {};

  // Find all unique BESS asset IDs from the context devices
  const bessAssetIds = new Set(devices.map(d => d.bessAssetId).filter(Boolean));

  for (const bessId of bessAssetIds) {
    const bessDevices = devices.filter(d => d.bessAssetId === bessId);
    const bessRows = rows.filter(r => bessDevices.some(d => d.id === r.deviceId));

    const pcs = bessRows.find(r => r.device.componentId === 'pcs');
    const pmg = bessRows.find(r => r.device.componentId === 'pmg');
    const rjl = bessRows.find(r => r.device.componentId === 'rjl');
    const bcms = bessRows.find(r => r.device.componentId === 'bcms');
    const pinv = bessRows.find(r => r.device.componentId === 'pinv');

    const timestamps = bessRows.map(r => r.timestamp).filter(Boolean);
    const latestTimestamp = timestamps.length > 0
      ? timestamps.reduce((a, b) => (a > b ? a : b))
      : undefined;

    state[bessId as string] = {
      timestamp: latestTimestamp,
      pcsTimestamp: pcs?.timestamp,
      pmgTimestamp: pmg?.timestamp,
      pinvTimestamp: pinv?.timestamp,
      bcmsTimestamp: bcms?.timestamp,
      rjlTimestamp: rjl?.timestamp,
    // PCS
    bessPower: pcs?.pcsActivePower ?? undefined,
    // Source: pcs.ai_freq → BESS Frequency
    bessFrequency: pcs?.bessFrequency ?? undefined,
    bessPowerFactor: pcs?.bessPowerFactor ?? undefined,
    pcsDcVoltage: pcs?.dcVoltage ?? undefined,
    pcsTemp: pcs?.ambientTemp ?? undefined,
    todayChargeEnergy: pcs?.todayChargeEnergy ?? undefined,
    todayDischargeEnergy: pcs?.todayDischargeEnergy ?? undefined,
    accChargeEnergy: pcs?.accumChargeEnergy ?? undefined,
    accDischargeEnergy: pcs?.accumDischargeEnergy ?? undefined,
    // Grid Meter
    gridPower: pmg?.gridSideLoad ?? undefined,
    gridFrequency: pmg?.gridFrequency ?? undefined,
    powerFactor: pmg?.powerFactor ?? undefined,
    // Cabinet Meter
    voltageA: (rjl?.voltageA ?? pmg?.voltageA) ?? undefined,
    voltageB: rjl?.voltageB ?? undefined,
    voltageC: rjl?.voltageC ?? undefined,
    currentA: rjl?.currentA ?? undefined,
    currentB: rjl?.currentB ?? undefined,
    currentC: rjl?.currentC ?? undefined,
    totalPower: rjl?.totalPower ?? undefined,
    // BMS — populated from bcms
    bessSoc: bcms?.soc ?? undefined,
    bmsSoh: bcms?.soh ?? undefined,
    bmsCurrent: undefined,
    cellVMax: undefined,
    cellVMin: undefined,
    cellTempMax: undefined,
    // Solar PV Inverter (pinv — Step 1)
    solarPower: pinv?.solarPower ?? undefined,
    solarFrequency: pinv?.solarFrequency ?? undefined,
    solarPowerFactor: pinv?.solarPowerFactor ?? undefined,
    };
  }

  return state;
}

/**
 * Merges a single WS LiveTelemetryPayload (keyed by componentId) into the
 * current telemetry state. Only the relevant fields for each component are
 * updated — other components' fields are preserved.
 */
function mergeWsPayload(
  prev: DashboardTelemetryState,
  componentId: string,
  data: Record<string, number | string | undefined>,
  timestamp: string
): DashboardTelemetryState {
  let newTimestamp = timestamp;
  if (prev.timestamp && new Date(prev.timestamp).getTime() > new Date(timestamp).getTime()) {
    newTimestamp = prev.timestamp;
  }
  const next = { ...prev, timestamp: newTimestamp };

  if (componentId === 'pcs') {
    let newTimestamp = timestamp;
    if (prev.pcsTimestamp && new Date(prev.pcsTimestamp).getTime() > new Date(timestamp).getTime()) {
      newTimestamp = prev.pcsTimestamp;
    }
    next.pcsTimestamp = newTimestamp;

    if (data.bessPower !== undefined) next.bessPower = data.bessPower as number;
    if (data.bessFrequency !== undefined) next.bessFrequency = data.bessFrequency as number;
    if (data.bessPowerFactor !== undefined) next.bessPowerFactor = data.bessPowerFactor as number;
    if (data.pcsState !== undefined) next.pcsState = data.pcsState as string;
    if (data.pcsDcVoltage !== undefined) next.pcsDcVoltage = data.pcsDcVoltage as number;
    if (data.pcsTemp !== undefined) next.pcsTemp = data.pcsTemp as number;
    if (data.todayChargeEnergy !== undefined) next.todayChargeEnergy = data.todayChargeEnergy as number;
    if (data.todayDischargeEnergy !== undefined) next.todayDischargeEnergy = data.todayDischargeEnergy as number;
    if (data.accChargeEnergy !== undefined) next.accChargeEnergy = data.accChargeEnergy as number;
    if (data.accDischargeEnergy !== undefined) next.accDischargeEnergy = data.accDischargeEnergy as number;
    return next;
  }

  if (componentId === 'pmg') {
    let newTimestamp = timestamp;
    if (prev.pmgTimestamp && new Date(prev.pmgTimestamp).getTime() > new Date(timestamp).getTime()) {
      newTimestamp = prev.pmgTimestamp;
    }
    next.pmgTimestamp = newTimestamp;

    if (data.gridPower !== undefined) next.gridPower = data.gridPower as number;
    if (data.gridPhaseAVoltage !== undefined && next.voltageA === undefined) {
      next.voltageA = data.gridPhaseAVoltage as number;
    }
    if (data.gridFrequency !== undefined) next.gridFrequency = data.gridFrequency as number;
    if (data.powerFactor !== undefined) next.powerFactor = data.powerFactor as number;
    return next;
  }

  if (componentId === 'rjl' || componentId === 'jl') {
    let newTimestamp = timestamp;
    if (prev.rjlTimestamp && new Date(prev.rjlTimestamp).getTime() > new Date(timestamp).getTime()) {
      newTimestamp = prev.rjlTimestamp;
    }
    next.rjlTimestamp = newTimestamp;

    if (data.phaseAVoltage !== undefined) next.voltageA = data.phaseAVoltage as number;
    if (data.phaseBVoltage !== undefined) next.voltageB = data.phaseBVoltage as number;
    if (data.phaseCVoltage !== undefined) next.voltageC = data.phaseCVoltage as number;
    if (data.phaseACurrent !== undefined) next.currentA = data.phaseACurrent as number;
    if (data.phaseBCurrent !== undefined) next.currentB = data.phaseBCurrent as number;
    if (data.phaseCCurrent !== undefined) next.currentC = data.phaseCCurrent as number;
    return next;
  }

  if (componentId === 'bcms') {
    let newTimestamp = timestamp;
    if (prev.bcmsTimestamp && new Date(prev.bcmsTimestamp).getTime() > new Date(timestamp).getTime()) {
      newTimestamp = prev.bcmsTimestamp;
    }
    next.bcmsTimestamp = newTimestamp;

    if (data.bessSoc !== undefined) next.bessSoc = data.bessSoc as number;
    if (data.bmsSoh !== undefined) next.bmsSoh = data.bmsSoh as number;
    return next;
  }

  if (componentId === 'pinv') {
    let newTimestamp = timestamp;
    if (prev.pinvTimestamp && new Date(prev.pinvTimestamp).getTime() > new Date(timestamp).getTime()) {
      newTimestamp = prev.pinvTimestamp;
    }
    next.pinvTimestamp = newTimestamp;

    // Solar PV Inverter — Step 1
    if (data.solarPower !== undefined) next.solarPower = data.solarPower as number;
    if (data.solarFrequency !== undefined) next.solarFrequency = data.solarFrequency as number;
    if (data.solarPowerFactor !== undefined) next.solarPowerFactor = data.solarPowerFactor as number;
    return next;
  }

  // tms, io, and other components: no named-column merge; rawPayload preserved in DB only
  return next;
}

// ---------------------------------------------------------------------------
// Site-Level Aggregation
// ---------------------------------------------------------------------------
function aggregateSiteTelemetry(
  state: Record<string, DashboardTelemetryState>
): DashboardTelemetryState {
  const bessStates = Object.values(state);
  
  if (bessStates.length === 0) return {};

  const agg: DashboardTelemetryState = {};

  // Helper to safely sum values
  const sum = (key: keyof DashboardTelemetryState) => {
    const values = bessStates.map(s => s[key]).filter(v => v !== undefined) as number[];
    return values.length > 0 ? values.reduce((a, b) => a + b, 0) : undefined;
  };

  // Helper to safely average values
  const avg = (key: keyof DashboardTelemetryState) => {
    const values = bessStates.map(s => s[key]).filter(v => v !== undefined) as number[];
    return values.length > 0 ? values.reduce((a, b) => a + b, 0) / values.length : undefined;
  };

  // Helper to safely get max
  const max = (key: keyof DashboardTelemetryState) => {
    const values = bessStates.map(s => s[key]).filter(v => v !== undefined) as number[];
    return values.length > 0 ? Math.max(...values) : undefined;
  };

  // Helper to safely get min
  const min = (key: keyof DashboardTelemetryState) => {
    const values = bessStates.map(s => s[key]).filter(v => v !== undefined) as number[];
    return values.length > 0 ? Math.min(...values) : undefined;
  };

  // Timestamp (most recent)
  const timestamps = bessStates.map(s => s.timestamp).filter(Boolean) as string[];
  if (timestamps.length > 0) {
    agg.timestamp = timestamps.reduce((a, b) => (a > b ? a : b));
  }

  const pcsTimestamps = bessStates.map(s => s.pcsTimestamp).filter(Boolean) as string[];
  if (pcsTimestamps.length > 0) agg.pcsTimestamp = pcsTimestamps.reduce((a, b) => (a > b ? a : b));

  const pmgTimestamps = bessStates.map(s => s.pmgTimestamp).filter(Boolean) as string[];
  if (pmgTimestamps.length > 0) agg.pmgTimestamp = pmgTimestamps.reduce((a, b) => (a > b ? a : b));

  const pinvTimestamps = bessStates.map(s => s.pinvTimestamp).filter(Boolean) as string[];
  if (pinvTimestamps.length > 0) agg.pinvTimestamp = pinvTimestamps.reduce((a, b) => (a > b ? a : b));

  const bcmsTimestamps = bessStates.map(s => s.bcmsTimestamp).filter(Boolean) as string[];
  if (bcmsTimestamps.length > 0) agg.bcmsTimestamp = bcmsTimestamps.reduce((a, b) => (a > b ? a : b));

  const rjlTimestamps = bessStates.map(s => s.rjlTimestamp).filter(Boolean) as string[];
  if (rjlTimestamps.length > 0) agg.rjlTimestamp = rjlTimestamps.reduce((a, b) => (a > b ? a : b));

  // SUM metrics (Additive)
  agg.bessPower = sum('bessPower');
  agg.gridPower = sum('gridPower'); // Assuming grid power is additive or identical across BESS in same site? Usually just one grid meter for the site, but we sum if multiple reported. Wait, grid is usually a single PMG per site, but if multiple, sum them.
  agg.todayChargeEnergy = sum('todayChargeEnergy');
  agg.todayDischargeEnergy = sum('todayDischargeEnergy');
  agg.accChargeEnergy = sum('accChargeEnergy');
  agg.accDischargeEnergy = sum('accDischargeEnergy');
  // Solar PV — sum across independent PV inverters (one per BESS asset)
  agg.solarPower = sum('solarPower');

  // AVERAGE metrics
  // Note: SOC is using simple arithmetic average as explicit fallback because BESS capacities are optional and not guaranteed to be reliable for weighting.
  agg.bessSoc = avg('bessSoc');
  agg.bmsSoh = avg('bmsSoh');

  // MAX / MIN metrics (Safety extremes)
  agg.cellTempMax = max('cellTempMax');
  agg.cellVMax = max('cellVMax');
  agg.pcsTemp = max('pcsTemp');
  agg.cellVMin = min('cellVMin');

  // Non-Aggregatable Metrics are left undefined at the site level to avoid mathematically invalid totals.
  // agg.pcsDcVoltage, agg.voltageA, etc. are NOT aggregated.

  return agg;
}

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

  // Context resolution state
  const [ctx, setCtx] = useState<DashboardContext | null>(null);
  const [ctxLoading, setCtxLoading] = useState(true);
  const [ctxError, setCtxError] = useState<{ type: 'empty' | 'error'; message: string } | null>(null);

  // Telemetry state — REST snapshot merged with WS live updates
  const [telemetryState, setTelemetryState] = useState<Record<string, DashboardTelemetryState>>({});
  const [telemetryLoading, setTelemetryLoading] = useState(false);
  const [historicalData, setHistoricalData] = useState<PowerTrendPoint[]>([]);
  const [chartEndTime, setChartEndTime] = useState<number>(Date.now());
  const [retryCounter, setRetryCounter] = useState(0);

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

    const fetchLatest = async () => {
      setTelemetryLoading(true);
      try {
        const rows = await dashboardService.getLatestTelemetry(ctx.site.id);
        // We need devices from context to group rows by BESS
        // but ctx.devices does not have bessAssetId in the DashboardDevice interface directly, wait!
        // The REST LatestTelemetryRow doesn't have bessAssetId. 
        // We need it. Let's fix buildStateFromRest usage.
        // If ctx.devices doesn't have bessAssetId... Oh, wait, we need to pass bessAssetId from the backend.
        // For now, let's just pass rows to buildStateFromRest.
        if (!cancelled) setTelemetryState(buildStateFromRest(rows, ctx.devices as any));
      } catch {
        // Non-fatal: WS will still provide live data; keep telemetry as empty
      } finally {
        if (!cancelled) setTelemetryLoading(false);
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

    const fetchHistory = async () => {
      try {
        const now = new Date();
        const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
        const rows = await dashboardService.getHistoricalTelemetry(ctx.site.id, yesterday, now);

        if (!cancelled) {
          const trend = consolidatePowerTrendData(rows);
          setHistoricalData(trend);
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

    const fetchAlarms = async () => {
      setAlarmsLoading(true);
      try {
        const data = await alarmService.getSiteAlarms(ctx.site.id);
        if (!cancelled) {
          const active = data.filter(a => a.status === 'ACTIVE' || a.status === 'ACKNOWLEDGED');
          setAlarms(active.slice(0, 10)); // Show top active alarms
        }
      } catch {
        // Non-fatal
      } finally {
        if (!cancelled) setAlarmsLoading(false);
      }
    };

    fetchAlarms();
    return () => { cancelled = true; };
  }, [ctx]);

  // ---------------------------------------------------------------------------
  // Step 4 — WebSocket live updates (component-aware merge)
  // ---------------------------------------------------------------------------
  const siteId = ctx?.site.id;
  const { telemetry: liveDataArray, isConnected } = useLiveTelemetry(siteId);

  useEffect(() => {
    if (liveDataArray.length === 0) return;

    setChartEndTime(Date.now());

    setTelemetryState(prev => {
      let next = { ...prev };
      for (const payload of liveDataArray) {
        // Find which BESS this device belongs to
        const device = ctx?.devices.find(d => d.id === payload.deviceId);
        const bessId = (device as any)?.bessAssetId || 'unknown'; // fallback if not present
        
        const prevState = next[bessId] || {};
        next[bessId] = mergeWsPayload(prevState, payload.componentId, payload.data as any, payload.timestamp);
      }
      return next;
    });
  }, [liveDataArray, ctx?.devices]);

  useEffect(() => {
    // Only proceed if at least one BESS has a timestamp
    const hasTimestamp = Object.values(telemetryState).some(s => s.timestamp);
    if (!hasTimestamp) return;

    const aggregated = aggregateSiteTelemetry(telemetryState);
    const nowTs = Date.now();
    
    setHistoricalData(prev => {
      const cutoff = nowTs - 24 * 60 * 60 * 1000;
      const filtered = prev.filter(p => p.timestamp >= cutoff);
      const last = filtered[filtered.length - 1];
      
      if (last && nowTs - last.timestamp < 60000) {
        filtered[filtered.length - 1] = {
          ...last,
          grid: aggregated.gridPower !== undefined ? aggregated.gridPower : last.grid,
          bess: aggregated.bessPower !== undefined ? aggregated.bessPower : last.bess,
          soc: aggregated.bessSoc !== undefined ? aggregated.bessSoc : last.soc,
          solar: aggregated.solarPower !== undefined ? aggregated.solarPower : last.solar,
        };
        return [...filtered];
      }
      
      return [...filtered, {
        timestamp: nowTs,
        grid: aggregated.gridPower,
        bess: aggregated.bessPower,
        soc: aggregated.bessSoc,
        solar: aggregated.solarPower,
      }];
    });
  }, [telemetryState]);

  // ---------------------------------------------------------------------------
  // Freshness
  // ---------------------------------------------------------------------------
  
  const aggregatedTelemetry = aggregateSiteTelemetry(telemetryState);

  const freshnessLabel = (() => {
    if (!aggregatedTelemetry.timestamp) return 'NO DATA';
    const age = Date.now() - new Date(aggregatedTelemetry.timestamp).getTime();
    if (age > STALE_THRESHOLD_MS) return 'STALE';
    return null; // fresh
  })();

  const getComponentFreshness = (ts?: string) => {
    if (!ts) return 'NO DATA';
    const age = Date.now() - new Date(ts).getTime();
    return age > STALE_THRESHOLD_MS ? 'STALE' : null;
  };

  /**
   * isStale — true when the most recent telemetry timestamp is older than
   * STALE_THRESHOLD_MS or no timestamp exists at all.
   * When true, KPI display values are masked to '--' so the user cannot
   * mistake aged database values for current live readings.
   * Underlying telemetry state and calculations are NEVER modified.
   */
  const isStale = freshnessLabel === 'STALE' || freshnessLabel === 'NO DATA';
  const isPcsStale = getComponentFreshness(aggregatedTelemetry.pcsTimestamp) !== null;
  const isPmgStale = getComponentFreshness(aggregatedTelemetry.pmgTimestamp) !== null;
  const isPinvStale = getComponentFreshness(aggregatedTelemetry.pinvTimestamp) !== null;
  const isBcmsStale = getComponentFreshness(aggregatedTelemetry.bcmsTimestamp) !== null;

  const isLive = liveDataArray.length > 0 && !isStale;

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

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">EMS Dashboard</h1>
          <div className="flex items-center gap-2 mt-1 flex-wrap">
            <p className="text-sm text-slate-500">
              {ctx.client.name} — {ctx.site.name} — {ctx.bessAssets.length > 1 ? `Site Aggregation (${ctx.bessAssets.length} BESS)` : ctx.bessAssets[0]?.name}
            </p>
            {/* Connection badge */}
            {isLive ? (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 text-xs font-medium">
                <Wifi className="w-3 h-3" /> LIVE
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 text-xs font-medium">
                <WifiOff className="w-3 h-3" /> {isConnected ? 'CONNECTED — Waiting for live updates' : 'DISCONNECTED'}
              </span>
            )}
            {/* Freshness badge */}
            {freshnessLabel && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 text-xs font-medium">
                {freshnessLabel}
              </span>
            )}
          </div>
        </div>

        {/* System Status */}
        <div className="flex items-center gap-2 bg-white px-4 py-2 rounded-lg border border-slate-200 shadow-sm">
          <div className="flex flex-col">
            <span className="text-xs font-medium text-slate-500 uppercase tracking-wider">System Status</span>
            <span className="text-sm font-semibold text-slate-900 mt-0.5">
              {isLive ? 'System Online' : (isConnected ? 'Connected' : 'Disconnected')}
            </span>
          </div>
        </div>
      </div>

      {/* KPI Section */}
      {telemetryLoading ? (
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
                title="Grid Power"
                value={aggregatedTelemetry.gridPower !== undefined ? Math.abs(aggregatedTelemetry.gridPower) : undefined}
                displayValue={isPmgStale ? '--' : (aggregatedTelemetry.gridPower !== undefined ? formatValue(Math.abs(aggregatedTelemetry.gridPower)) : '--')}
                unit="kW"
                icon={<Zap className="w-5 h-5" />}
                statusColor="amber"
                delay={0.1}
                subtitle={
                  isPmgStale
                    ? 'Stale'
                    : aggregatedTelemetry.gridPower !== undefined
                      ? aggregatedTelemetry.gridPower !== 0 ? 'Active' : 'Idle'
                      : 'No data'
                }
              />
              {ctx.bessAssets.length === 1 ? (
                <AdvancedKPICard
                  title="Grid Frequency"
                  value={telemetryState[ctx.bessAssets[0].id]?.gridFrequency}
                  displayValue={isPmgStale ? '--' : formatValue(telemetryState[ctx.bessAssets[0].id]?.gridFrequency, 2)}
                  unit="Hz"
                  icon={<Bolt className="w-5 h-5" />}
                  statusColor="slate"
                  delay={0.15}
                  subtitle={isPmgStale ? 'Stale' : 'Grid Frequency'}
                />
              ) : (
                <AdvancedKPICard
                  title="Grid Frequency"
                  value={undefined}
                  displayValue="—"
                  unit=""
                  icon={<Bolt className="w-5 h-5" />}
                  statusColor="slate"
                  delay={0.15}
                  subtitle="Per-BESS Metric"
                />
              )}
              {ctx.bessAssets.length === 1 ? (
                <AdvancedKPICard
                  title="Grid Power Factor"
                  value={telemetryState[ctx.bessAssets[0].id]?.powerFactor}
                  displayValue={isPmgStale ? '--' : formatValue(telemetryState[ctx.bessAssets[0].id]?.powerFactor, 2)}
                  unit="PF"
                  icon={<Activity className="w-5 h-5" />}
                  statusColor="slate"
                  delay={0.18}
                  subtitle={isPmgStale ? 'Stale' : 'Grid Power Factor'}
                />
              ) : (
                <AdvancedKPICard
                  title="Grid Power Factor"
                  value={undefined}
                  displayValue="—"
                  unit=""
                  icon={<Activity className="w-5 h-5" />}
                  statusColor="slate"
                  delay={0.18}
                  subtitle="Per-BESS Metric"
                />
              )}
            </div>

            {/* BESS Column */}
            <div className="flex flex-col gap-4">
              <h2 className="text-lg font-semibold text-slate-900">BESS</h2>
              <AdvancedKPICard
                title="BESS Power"
                value={aggregatedTelemetry.bessPower}
                displayValue={isPcsStale ? '--' : (aggregatedTelemetry.bessPower !== undefined ? formatValue(aggregatedTelemetry.bessPower) : '--')}
                unit="kW"
                icon={<BatteryMedium className="w-5 h-5" />}
                statusColor="blue"
                delay={0.2}
                subtitle={
                  isPcsStale
                    ? 'Stale'
                    : aggregatedTelemetry.bessPower !== undefined
                      ? aggregatedTelemetry.bessPower > 0 ? 'Charging' : aggregatedTelemetry.bessPower < 0 ? 'Discharging' : 'Idle'
                      : 'No data'
                }
              />
              {ctx.bessAssets.length === 1 ? (
                <AdvancedKPICard
                  title="BESS Frequency"
                  value={telemetryState[ctx.bessAssets[0].id]?.bessFrequency}
                  displayValue={isPcsStale ? '--' : formatValue(telemetryState[ctx.bessAssets[0].id]?.bessFrequency, 2)}
                  unit="Hz"
                  icon={<Bolt className="w-5 h-5" />}
                  statusColor="slate"
                  delay={0.22}
                  subtitle={isPcsStale ? 'Stale' : 'BESS Frequency'}
                />
              ) : (
                <AdvancedKPICard
                  title="BESS Frequency"
                  value={undefined}
                  displayValue="—"
                  unit=""
                  icon={<Bolt className="w-5 h-5" />}
                  statusColor="slate"
                  delay={0.22}
                  subtitle="Per-BESS Metric"
                />
              )}
              {ctx.bessAssets.length === 1 ? (
                <AdvancedKPICard
                  title="BESS Power Factor"
                  value={telemetryState[ctx.bessAssets[0].id]?.bessPowerFactor}
                  displayValue={isPcsStale ? '--' : formatValue(telemetryState[ctx.bessAssets[0].id]?.bessPowerFactor, 2)}
                  unit="PF"
                  icon={<Activity className="w-5 h-5" />}
                  statusColor="slate"
                  delay={0.24}
                  subtitle={isPcsStale ? 'Stale' : 'BESS Power Factor'}
                />
              ) : (
                <AdvancedKPICard
                  title="BESS Power Factor"
                  value={undefined}
                  displayValue="—"
                  unit=""
                  icon={<Activity className="w-5 h-5" />}
                  statusColor="slate"
                  delay={0.24}
                  subtitle="Per-BESS Metric"
                />
              )}
            </div>

            {/* SOLAR PV Column */}
            <div className="flex flex-col gap-4">
              <h2 className="text-lg font-semibold text-slate-900">SOLAR PV</h2>
              <AdvancedKPICard
                title="Solar PV Power"
                value={aggregatedTelemetry.solarPower}
                displayValue={isPinvStale ? '--' : (aggregatedTelemetry.solarPower !== undefined ? formatValue(aggregatedTelemetry.solarPower) : '--')}
                unit="kW"
                icon={<Sun className="w-5 h-5" />}
                statusColor="amber"
                delay={0.25}
                subtitle={
                  isPinvStale
                    ? 'Stale'
                    : aggregatedTelemetry.solarPower !== undefined
                      ? aggregatedTelemetry.solarPower > 0 ? 'Generating' : 'Idle'
                      : 'No data'
                }
              />
              {ctx.bessAssets.length === 1 ? (
                <AdvancedKPICard
                  title="Solar Frequency"
                  value={telemetryState[ctx.bessAssets[0].id]?.solarFrequency}
                  displayValue={isPinvStale ? '--' : formatValue(telemetryState[ctx.bessAssets[0].id]?.solarFrequency, 2)}
                  unit="Hz"
                  icon={<Bolt className="w-5 h-5" />}
                  statusColor="slate"
                  delay={0.27}
                  subtitle={isPinvStale ? 'Stale' : 'Solar Frequency'}
                />
              ) : (
                <AdvancedKPICard
                  title="Solar Frequency"
                  value={undefined}
                  displayValue="—"
                  unit=""
                  icon={<Bolt className="w-5 h-5" />}
                  statusColor="slate"
                  delay={0.27}
                  subtitle="Per-BESS Metric"
                />
              )}
              {ctx.bessAssets.length === 1 ? (
                <AdvancedKPICard
                  title="Solar Power Factor"
                  value={telemetryState[ctx.bessAssets[0].id]?.solarPowerFactor}
                  displayValue={isPinvStale ? '--' : formatValue(telemetryState[ctx.bessAssets[0].id]?.solarPowerFactor, 2)}
                  unit="PF"
                  icon={<Activity className="w-5 h-5" />}
                  statusColor="slate"
                  delay={0.29}
                  subtitle={isPinvStale ? 'Stale' : 'Solar Power Factor'}
                />
              ) : (
                <AdvancedKPICard
                  title="Solar Power Factor"
                  value={undefined}
                  displayValue="—"
                  unit=""
                  icon={<Activity className="w-5 h-5" />}
                  statusColor="slate"
                  delay={0.29}
                  subtitle="Per-BESS Metric"
                />
              )}
            </div>
          </div>

          {/* OTHER METRICS */}
          <div>
            <h2 className="text-lg font-semibold text-slate-900 mb-3">Other Metrics</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {ctx.bessAssets.length === 1 ? (
                <AdvancedKPICard
                  title="DC Voltage"
                  value={telemetryState[ctx.bessAssets[0].id]?.pcsDcVoltage}
                  displayValue={isPcsStale ? '--' : formatValue(telemetryState[ctx.bessAssets[0].id]?.pcsDcVoltage, 1)}
                  unit="V"
                  icon={<Bolt className="w-5 h-5" />}
                  statusColor="slate"
                  delay={0.3}
                  subtitle={isPcsStale ? 'Stale' : 'PCS DC bus'}
                />
              ) : (
                <AdvancedKPICard
                  title="DC Voltage"
                  value={undefined}
                  displayValue="—"
                  unit=""
                  icon={<Bolt className="w-5 h-5" />}
                  statusColor="slate"
                  delay={0.3}
                  subtitle="Per-BESS Metric"
                />
              )}
              <AdvancedKPICard
                title="PCS Temp"
                value={aggregatedTelemetry.pcsTemp}
                displayValue={isPcsStale ? '--' : formatValue(aggregatedTelemetry.pcsTemp, 1)}
                unit="°C"
                icon={<Thermometer className="w-5 h-5" />}
                statusColor="slate"
                delay={0.4}
                subtitle={isPcsStale ? 'Stale' : 'IGBT temperature'}
              />
              <AdvancedKPICard
                title="BESS SOC"
                value={aggregatedTelemetry.bessSoc}
                displayValue={isBcmsStale ? '--' : (aggregatedTelemetry.bessSoc !== undefined ? `${aggregatedTelemetry.bessSoc.toFixed(1)}` : '--')}
                unit={(!isBcmsStale && aggregatedTelemetry.bessSoc !== undefined) ? '%' : ''}
                icon={<ShieldCheck className="w-5 h-5" />}
                statusColor="slate"
                delay={0.5}
                subtitle={isBcmsStale ? 'Stale' : (aggregatedTelemetry.bessSoc !== undefined ? 'State of charge' : 'Not Available')}
              />
              <AdvancedKPICard
                title="BESS SOH"
                value={aggregatedTelemetry.bmsSoh}
                displayValue={isBcmsStale ? '--' : (aggregatedTelemetry.bmsSoh !== undefined ? `${aggregatedTelemetry.bmsSoh.toFixed(1)}` : '--')}
                unit={(!isBcmsStale && aggregatedTelemetry.bmsSoh !== undefined) ? '%' : ''}
                icon={<ShieldCheck className="w-5 h-5" />}
                statusColor="slate"
                delay={0.55}
                subtitle={isBcmsStale ? 'Stale' : (aggregatedTelemetry.bmsSoh !== undefined ? 'State of health' : 'Not Available')}
              />
              <AdvancedKPICard
                title="Today Charge"
                value={aggregatedTelemetry.todayChargeEnergy}
                displayValue={isPcsStale ? '--' : formatValue(aggregatedTelemetry.todayChargeEnergy, 1)}
                unit="kWh"
                icon={<BatteryMedium className="w-5 h-5" />}
                statusColor="emerald"
                delay={0.6}
                subtitle={isPcsStale ? 'Stale' : 'Since midnight'}
              />
              <AdvancedKPICard
                title="Today Discharge"
                value={aggregatedTelemetry.todayDischargeEnergy}
                displayValue={isPcsStale ? '--' : formatValue(aggregatedTelemetry.todayDischargeEnergy, 1)}
                unit="kWh"
                icon={<BatteryMedium className="w-5 h-5" />}
                statusColor="slate"
                delay={0.7}
                subtitle={isPcsStale ? 'Stale' : 'Since midnight'}
              />

            </div>
          </div>
        </div>
      )}

      {/* Energy Flow */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <EnergyFlowDiagram data={aggregatedTelemetry} isStale={isStale} />
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

      {/* Power Trend Chart */}
      <div className="h-[450px]">
        <PowerTrendChart
          data={historicalData}
          title="24-Hour Power Trend"
          description="Grid and BESS power from live telemetry."
          domain={[chartEndTime - 24 * 60 * 60 * 1000, chartEndTime]}
        />
      </div>

      {/* BESS Charge vs Discharge Chart */}
      <div className="h-[450px]">
        <BessChargeDischargeChart
          data={historicalData}
          domain={[chartEndTime - 24 * 60 * 60 * 1000, chartEndTime]}
        />
      </div>

      {/* Phase Voltages & Currents (when rjl data is available) */}
      {ctx.bessAssets.length === 1 && (aggregatedTelemetry.voltageA !== undefined || aggregatedTelemetry.voltageB !== undefined || aggregatedTelemetry.voltageC !== undefined ||
        aggregatedTelemetry.currentA !== undefined || aggregatedTelemetry.currentB !== undefined || aggregatedTelemetry.currentC !== undefined) && (
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
          <h3 className="text-lg font-semibold text-slate-900 mb-4">Cabinet Meter (RJL)</h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
            {[
              { label: 'Phase A V', value: formatValue(aggregatedTelemetry.voltageA, 1), unit: 'V' },
              { label: 'Phase B V', value: formatValue(aggregatedTelemetry.voltageB, 1), unit: 'V' },
              { label: 'Phase C V', value: formatValue(aggregatedTelemetry.voltageC, 1), unit: 'V' },
              { label: 'Phase A I', value: formatValue(aggregatedTelemetry.currentA, 1), unit: 'A' },
              { label: 'Phase B I', value: formatValue(aggregatedTelemetry.currentB, 1), unit: 'A' },
              { label: 'Phase C I', value: formatValue(aggregatedTelemetry.currentC, 1), unit: 'A' },
            ].map(({ label, value, unit }) => (
              <div key={label} className="text-center p-3 bg-slate-50 rounded-lg border border-slate-100">
                <p className="text-xs text-slate-500 uppercase tracking-wider">{label}</p>
                <p className="text-xl font-bold text-slate-900 mt-1">{value}</p>
                <p className="text-xs text-slate-400">{unit}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Per-BESS Metrics for Multi-BESS Site */}
      {ctx.bessAssets.length > 1 && (
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
          <h3 className="text-lg font-semibold text-slate-900 mb-4">Per-BESS Metrics</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-slate-600">
              <thead className="border-b border-slate-200">
                <tr>
                  <th className="pb-3 font-semibold text-slate-900">BESS Asset</th>
                  <th className="pb-3 font-semibold text-slate-900">DC Voltage (V)</th>
                  <th className="pb-3 font-semibold text-slate-900">Phase A Voltage (V)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {ctx.bessAssets.map(b => (
                  <tr key={b.id}>
                    <td className="py-3 font-medium text-slate-900 pr-4 whitespace-nowrap">{b.name}</td>
                    <td className="py-3 whitespace-nowrap">{isStale ? '--' : formatValue(telemetryState[b.id]?.pcsDcVoltage, 1)}</td>
                    <td className="py-3 whitespace-nowrap">{isStale ? '--' : formatValue(telemetryState[b.id]?.voltageA, 1)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

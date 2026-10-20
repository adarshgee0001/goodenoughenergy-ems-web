import { useState, useEffect, useRef } from 'react';
import { Zap, Wifi, WifiOff, AlertCircle, RefreshCw, BatteryMedium, ArrowRight, Clock } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import { usePreview } from '../../context/PreviewContext';
import { useLiveTelemetry } from '../../context/WebSocketContext';
import { useUserSettings } from '../../features/settings/hooks/useUserSettings';
import {
  reconcileRestWithLive,
  isValidNumber,
  parseValidTimestamp,
  evaluateSignalFreshness,
} from '../../features/dashboard/freshness.utils';
import {
  dashboardService,
  ClientAccessError,
  NoSiteError,
  NoBessError,
} from '../../features/dashboard/dashboard.service';
import type {
  DashboardContext,
  DashboardTelemetryState,
  LatestTelemetryRow,
  DashboardDevice,
} from '../../features/dashboard/dashboard.types';
import { BessViewSelector } from './components/BessViewSelector';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatValue(v: number | undefined | null, decimals = 1): string {
  return isValidNumber(v) ? v.toFixed(decimals) : '--';
}

function formatTimestamp(isoString: string | undefined): string {
  if (!isoString) return '--';
  try {
    const d = new Date(isoString);
    if (isNaN(d.getTime())) return '--';
    return d.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: true,
    });
  } catch {
    return '--';
  }
}

/**
 * Resolves shared site-level metrics (e.g. Grid Power, Grid Frequency, Grid Power Factor)
 * across reporting BESS assets by picking the measurement with the latest valid timestamp.
 * Avoids multiplying or summing the same physical grid measurement across multiple BESS assets.
 */
function resolveSiteMetric(
  states: DashboardTelemetryState[],
  valueKey: keyof DashboardTelemetryState,
  measuredAtKey?: keyof DashboardTelemetryState
): { value: number | undefined; measuredAt: string | undefined } {
  const validPairs = states
    .map(s => ({
      val: s[valueKey] as number | undefined,
      ts: (measuredAtKey ? (s[measuredAtKey] as string | undefined) : undefined) || s.timestamp,
    }))
    .filter((p): p is { val: number; ts: string | undefined } => isValidNumber(p.val));

  if (validPairs.length === 0) return { value: undefined, measuredAt: undefined };

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
}

function buildStateFromRest(rows: LatestTelemetryRow[], devices: DashboardDevice[]): Record<string, DashboardTelemetryState> {
  const state: Record<string, DashboardTelemetryState> = {};

  const bessAssetIds = new Set(devices.map(d => d.bessAssetId).filter(Boolean));

  for (const bessId of bessAssetIds) {
    const bessDevices = devices.filter(d => d.bessAssetId === bessId);
    const bessRows = rows.filter(r => bessDevices.some(d => d.id === r.deviceId));

    const pcs = bessRows.find(r => r.device.componentId === 'pcs');
    const pmg = bessRows.find(r => r.device.componentId === 'pmg');
    const rjl = bessRows.find(r => r.device.componentId === 'rjl' || r.device.componentId === 'jl');

    const timestamps = bessRows.map(r => r.timestamp).filter(Boolean);
    const latestTimestamp = timestamps.length > 0
      ? timestamps.reduce((a, b) => (a > b ? a : b))
      : undefined;

    state[bessId as string] = {
      timestamp: latestTimestamp,
      gridPowerMeasuredAt: pmg?.timestamp,
      gridFrequencyMeasuredAt: pmg?.timestamp,
      powerFactorMeasuredAt: pmg?.timestamp,
      bessPowerMeasuredAt: pcs?.timestamp,
      bessFrequencyMeasuredAt: pcs?.timestamp,
      bessPowerFactorMeasuredAt: pcs?.timestamp,
      bessPower: pcs?.pcsActivePower ?? undefined,
      // Source: pcs.ai_freq → BESS Frequency
      bessFrequency: pcs?.bessFrequency ?? undefined,
      gridFrequency: pmg?.gridFrequency ?? undefined,
      powerFactor: pmg?.powerFactor ?? undefined,
      bessPowerFactor: pcs?.bessPowerFactor ?? undefined,
      gridPower: pmg?.gridSideLoad ?? undefined,
      totalPower: rjl?.totalPower ?? undefined,
      voltageA: rjl?.voltageA ?? undefined,
      voltageB: rjl?.voltageB ?? undefined,
      voltageC: rjl?.voltageC ?? undefined,
      currentA: rjl?.currentA ?? undefined,
      currentB: rjl?.currentB ?? undefined,
      currentC: rjl?.currentC ?? undefined,
    };
  }

  return state;
}

function mergeWsPayload(
  prev: DashboardTelemetryState,
  componentId: string,
  data: Record<string, number | string | undefined>,
  timestamp: string
): DashboardTelemetryState {
  const next = { ...prev, timestamp };

  if (componentId === 'pcs') {
    if (data.bessPower !== undefined) {
      next.bessPower = data.bessPower as number;
      next.bessPowerMeasuredAt = timestamp;
    }
    // Source: pcs.ai_freq → BESS Frequency
    if (data.bessFrequency !== undefined) {
      next.bessFrequency = data.bessFrequency as number;
      next.bessFrequencyMeasuredAt = timestamp;
    }
    if (data.bessPowerFactor !== undefined) {
      next.bessPowerFactor = data.bessPowerFactor as number;
      next.bessPowerFactorMeasuredAt = timestamp;
    }
    return next;
  }

  if (componentId === 'pmg') {
    if (data.gridPower !== undefined) {
      next.gridPower = data.gridPower as number;
      next.gridPowerMeasuredAt = timestamp;
    }
    if (data.gridFrequency !== undefined) {
      next.gridFrequency = data.gridFrequency as number;
      next.gridFrequencyMeasuredAt = timestamp;
    }
    if (data.powerFactor !== undefined) {
      next.powerFactor = data.powerFactor as number;
      next.powerFactorMeasuredAt = timestamp;
    }
    return next;
  }

  if (componentId === 'rjl' || componentId === 'jl') {
    // some fields might arrive in payload depending on WS contract, map them if present
    if (data.totalPower !== undefined) next.totalPower = data.totalPower as number;
    if (data.phaseAVoltage !== undefined) next.voltageA = data.phaseAVoltage as number;
    if (data.phaseBVoltage !== undefined) next.voltageB = data.phaseBVoltage as number;
    if (data.phaseCVoltage !== undefined) next.voltageC = data.phaseCVoltage as number;
    if (data.phaseACurrent !== undefined) next.currentA = data.phaseACurrent as number;
    if (data.phaseBCurrent !== undefined) next.currentB = data.phaseBCurrent as number;
    if (data.phaseCCurrent !== undefined) next.currentC = data.phaseCCurrent as number;
    return next;
  }

  return next;
}

// ---------------------------------------------------------------------------
// State Components
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
      <h1 className="text-2xl font-bold text-slate-900 mb-2">Unable to Load Telemetry</h1>
      <p className="text-slate-500 max-w-md mb-6">{message}</p>
      <button
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
    <div className="space-y-6 animate-pulse p-4">
      <div className="h-10 bg-slate-100 rounded-lg w-72" />
      <div className="h-[400px] bg-slate-100 rounded-xl" />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export default function TelemetryPage() {
  const { role } = useAuth();
  const { isPreviewing, previewClientId } = usePreview();
  const { formatPower, setActiveSiteTimezone } = useUserSettings();

  const [ctx, setCtx] = useState<DashboardContext | null>(null);
  const [ctxLoading, setCtxLoading] = useState(true);
  const [ctxError, setCtxError] = useState<{ type: 'empty' | 'error'; message: string } | null>(null);

  // Local selector state for multi-BESS clients (null = All BESS — Site Overview)
  const [selectedBessId, setSelectedBessId] = useState<string | null>(null);

  // Reset the selection to All BESS whenever site/client context changes
  useEffect(() => {
    setSelectedBessId(null);
  }, [ctx?.site.id]);

  // Synchronize active site timezone with UserSettingsContext
  useEffect(() => {
    if (ctx?.site?.timezone) {
      setActiveSiteTimezone(ctx.site.timezone);
    }
  }, [ctx?.site?.timezone, setActiveSiteTimezone]);

  const activeSiteIdRef = useRef<string | null>(null);

  const [telemetry, setTelemetry] = useState<Record<string, DashboardTelemetryState>>({});
  const [isInitialTelemetryLoading, setIsInitialTelemetryLoading] = useState(true);
  const [isTelemetryRefreshing, setIsTelemetryRefreshing] = useState(false);
  const [retryCounter, setRetryCounter] = useState(0);

  // 1. Resolve context
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
          setCtxError({ type: 'error', message: err.message || 'Failed to load telemetry context.' });
        }
      } finally {
        if (!cancelled) setCtxLoading(false);
      }
    };

    resolve();
    return () => { cancelled = true; };
  }, [role, isPreviewing, previewClientId, retryCounter]);

  // 2. Initial REST snapshot
  useEffect(() => {
    if (!ctx) return;
    let cancelled = false;
    const targetSiteId = ctx.site.id;

    const isNewSite = activeSiteIdRef.current !== targetSiteId;
    if (isNewSite) {
      activeSiteIdRef.current = targetSiteId;
      setTelemetry({});
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
        if (!cancelled && activeSiteIdRef.current === targetSiteId) {
          const restState = buildStateFromRest(rows, ctx.devices as any);
          const validBessIds = new Set(ctx.bessAssets.map(b => b.id));

          setTelemetry(prev => {
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
        // Non-fatal, fallback handled by WS
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

  // 3. WebSocket sync
  const siteId = ctx?.site.id;
  const { telemetry: liveDataArray, isConnected } = useLiveTelemetry(siteId);

  useEffect(() => {
    if (liveDataArray.length === 0 || !ctx) return;

    const validBessIds = new Set(ctx.bessAssets.map(b => b.id));

    setTelemetry(prev => {
      let next = { ...prev };
      for (const payload of liveDataArray) {
        if (payload.siteId && payload.siteId !== ctx.site.id) continue;
        const device = ctx.devices.find(d => d.id === payload.deviceId);
        const bessId = (device as any)?.bessAssetId || 'unknown';
        if (bessId !== 'unknown' && !validBessIds.has(bessId)) continue;

        const prevState = next[bessId] || {};
        next[bessId] = mergeWsPayload(prevState, payload.componentId, payload.data as any, payload.timestamp);
      }
      return next;
    });
  }, [liveDataArray, ctx]);

  const isLive = liveDataArray.length > 0;

  if (ctxLoading) return <LoadingState />;

  if (ctxError) {
    if (ctxError.type === 'empty') {
      return <EmptyState icon={<AlertCircle className="w-12 h-12" />} title="Telemetry Unavailable" message={ctxError.message} />;
    }
    return <ErrorState message={ctxError.message} onRetry={() => setRetryCounter(c => c + 1)} />;
  }

  if (!ctx) return null;

  const hasTelemetry = Object.keys(telemetry).length > 0;
  const showInitialSkeleton = isInitialTelemetryLoading && !hasTelemetry;

  // Validate that selected ID belongs to the currently resolved site before using it
  const isMultiBess = ctx.bessAssets.length > 1;
  const activeBessId =
    isMultiBess && selectedBessId && ctx.bessAssets.some(b => b.id === selectedBessId)
      ? selectedBessId
      : null;

  // Collect all states for site-level calculations
  const allStates = ctx.bessAssets.map(b => telemetry[b.id]).filter(Boolean);

  // Authoritative site-level Grid metrics (latest valid measurement across reporting meters)
  const siteGridPower = resolveSiteMetric(allStates, 'gridPower', 'gridPowerMeasuredAt');
  const siteGridFreq = resolveSiteMetric(allStates, 'gridFrequency', 'gridFrequencyMeasuredAt');
  const siteGridPf = resolveSiteMetric(allStates, 'powerFactor', 'powerFactorMeasuredAt');

  // Consolidated BESS metrics (for All BESS mode)
  const validBessPowers = allStates
    .map(s => s.bessPower)
    .filter((v): v is number => isValidNumber(v));
  const totalBessPower = validBessPowers.length > 0
    ? validBessPowers.reduce((sum, p) => sum + p, 0)
    : undefined;

  const validBessFreqs = allStates
    .map(s => s.bessFrequency)
    .filter((v): v is number => isValidNumber(v));
  const fleetBessFrequency = validBessFreqs.length > 0
    ? validBessFreqs.reduce((sum, f) => sum + f, 0) / validBessFreqs.length
    : undefined;

  const validBessPfs = allStates
    .map(s => s.bessPowerFactor)
    .filter((v): v is number => isValidNumber(v));
  const fleetBessPowerFactor = validBessPfs.length > 0
    ? validBessPfs.reduce((sum, pf) => sum + pf, 0) / validBessPfs.length
    : undefined;

  return (
    <div className="space-y-6">
      {/* Page Header with Status & BESS Selector */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-slate-900">Telemetry & Metering</h1>
            {isLive ? (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 text-xs font-medium">
                <Wifi className="w-3 h-3" /> LIVE
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 text-xs font-medium">
                <WifiOff className="w-3 h-3" /> {isConnected ? 'CONNECTED' : 'DISCONNECTED'}
              </span>
            )}
            {isTelemetryRefreshing && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-slate-100 text-slate-500 text-xs font-medium animate-pulse">
                <RefreshCw className="w-3 h-3 animate-spin" /> Refreshing...
              </span>
            )}
          </div>
          <p className="text-sm text-slate-500 mt-1">
            {ctx.client.name} — {ctx.site.name}
            {isMultiBess
              ? activeBessId !== null
                ? ` — ${ctx.bessAssets.find(b => b.id === activeBessId)?.name ?? 'Selected BESS'}`
                : ` — Site Overview (${ctx.bessAssets.length} BESS)`
              : ` — ${ctx.bessAssets[0]?.name}`}
          </p>
        </div>

        {/* Show selector only when ctx.bessAssets.length > 1 */}
        {isMultiBess && (
          <BessViewSelector
            bessAssets={ctx.bessAssets}
            selectedBessId={activeBessId}
            onSelect={setSelectedBessId}
          />
        )}
      </div>

      {showInitialSkeleton ? (
        <div className="h-[300px] bg-slate-100 rounded-xl animate-pulse" />
      ) : isMultiBess && activeBessId === null ? (
        /* ===================================================================
           SCENARIO A: Multi-BESS Client — All BESS Selected (Site Overview)
           1. One consolidated site-level Grid/BESS summary panel.
           2. One compact asset breakdown table beneath the summary.
           =================================================================== */
        <div className="space-y-8">
          {/* Consolidated Summary Panel */}
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden flex flex-col">
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
              <div className="flex items-center gap-3">
                <h3 className="text-lg font-semibold text-slate-900">
                  Site Overview - Grid / BESS Summary Panel
                </h3>
                <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">
                  Consolidated ({ctx.bessAssets.length} BESS)
                </span>
              </div>
              <Zap className="w-5 h-5 text-slate-400" />
            </div>
            <div className="p-6">
              <div className="space-y-6">
                {/* Shared Grid Section */}
                <div>
                  <div className="flex items-center justify-between mb-4">
                    <h4 className="text-sm font-bold text-slate-400 uppercase tracking-wider">
                      SHARED GRID METRICS
                    </h4>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div className="bg-slate-50 p-4 rounded-xl border border-slate-100 flex items-center justify-between">
                      <span className="text-sm font-medium text-slate-500 uppercase tracking-wider">Grid Power</span>
                      {(() => {
                        const gridDisplay = formatPower(siteGridPower.value);
                        return (
                          <span className="text-2xl font-bold text-slate-900">
                            {gridDisplay.displayValue} <span className="text-sm text-slate-500">{gridDisplay.unit}</span>
                          </span>
                        );
                      })()}
                    </div>
                    <div className="bg-slate-50 p-4 rounded-xl border border-slate-100 flex items-center justify-between">
                      <span className="text-sm font-medium text-slate-500 uppercase tracking-wider flex items-center gap-2">Grid Frequency</span>
                      <span className="text-2xl font-bold text-slate-900">
                        {formatValue(siteGridFreq.value, 2)} <span className="text-sm text-slate-500">Hz</span>
                      </span>
                    </div>
                    <div className="bg-slate-50 p-4 rounded-xl border border-slate-100 flex items-center justify-between">
                      <span className="text-sm font-medium text-slate-500 uppercase tracking-wider flex items-center gap-2">Grid Power Factor</span>
                      <span className="text-2xl font-bold text-slate-900">
                        {formatValue(siteGridPf.value, 2)}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Consolidated BESS Section */}
                <div>
                  <div className="flex items-center justify-between mb-4">
                    <h4 className="text-sm font-bold text-slate-400 uppercase tracking-wider">
                      CONSOLIDATED BESS FLEET
                    </h4>
                    <span className="text-xs text-slate-500">
                      Reporting: {validBessPowers.length} of {ctx.bessAssets.length} BESS
                    </span>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div className="bg-slate-50 p-4 rounded-xl border border-slate-100 flex items-center justify-between">
                      <span className="text-sm font-medium text-slate-500 uppercase tracking-wider flex items-center gap-2">
                        <BatteryMedium className="w-4 h-4" /> Total BESS Power
                      </span>
                      {(() => {
                        const bessDisplay = formatPower(totalBessPower);
                        return (
                          <span className="text-2xl font-bold text-slate-900">
                            {bessDisplay.displayValue} <span className="text-sm text-slate-500">{bessDisplay.unit}</span>
                          </span>
                        );
                      })()}
                    </div>
                    <div className="bg-slate-50 p-4 rounded-xl border border-slate-100 flex items-center justify-between">
                      <span className="text-sm font-medium text-slate-500 uppercase tracking-wider flex items-center gap-2">Fleet BESS Frequency</span>
                      <span className="text-2xl font-bold text-slate-900">
                        {formatValue(fleetBessFrequency, 2)} <span className="text-sm text-slate-500">Hz</span>
                      </span>
                    </div>
                    <div className="bg-slate-50 p-4 rounded-xl border border-slate-100 flex items-center justify-between">
                      <span className="text-sm font-medium text-slate-500 uppercase tracking-wider flex items-center gap-2">Fleet BESS Power Factor</span>
                      <span className="text-2xl font-bold text-slate-900">
                        {formatValue(fleetBessPowerFactor, 2)}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Compact Asset Breakdown Table */}
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden flex flex-col">
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
              <div>
                <h3 className="text-lg font-semibold text-slate-900">BESS Fleet Breakdown</h3>
                <p className="text-xs text-slate-500 mt-0.5">Individual asset telemetry contributions across the fleet</p>
              </div>
              <span className="text-xs font-medium text-slate-500 bg-white px-2.5 py-1 rounded-md border border-slate-200">
                {ctx.bessAssets.length} Assets
              </span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm text-slate-600">
                <thead className="border-b border-slate-200 bg-slate-50/75">
                  <tr>
                    <th className="px-6 py-3 font-semibold text-slate-700 text-xs uppercase tracking-wider">BESS Name</th>
                    <th className="px-6 py-3 font-semibold text-slate-700 text-xs uppercase tracking-wider">Status</th>
                    <th className="px-6 py-3 font-semibold text-slate-700 text-xs uppercase tracking-wider text-right">PCS Active Power</th>
                    <th className="px-6 py-3 font-semibold text-slate-700 text-xs uppercase tracking-wider text-right">PCS Frequency</th>
                    <th className="px-6 py-3 font-semibold text-slate-700 text-xs uppercase tracking-wider text-right">PCS Power Factor</th>
                    <th className="px-6 py-3 font-semibold text-slate-700 text-xs uppercase tracking-wider">Last Reported</th>
                    <th className="px-6 py-3 font-semibold text-slate-700 text-xs uppercase tracking-wider text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {ctx.bessAssets.map(bess => {
                    const bessTelemetry = telemetry[bess.id] || {};
                    const bessPowerDisplay = formatPower(bessTelemetry.bessPower);
                    const freshness = evaluateSignalFreshness({
                      value: bessTelemetry.bessPower,
                      measuredAt: bessTelemetry.bessPowerMeasuredAt || bessTelemetry.timestamp,
                      componentType: 'pcs',
                    });

                    return (
                      <tr key={bess.id} className="hover:bg-slate-50/60 transition-colors">
                        <td className="px-6 py-3.5 font-medium text-slate-900 flex items-center gap-2">
                          <BatteryMedium className="w-4 h-4 text-slate-400" />
                          <span>{bess.name}</span>
                        </td>
                        <td className="px-6 py-3.5">
                          {freshness.isFresh ? (
                            <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span> Online
                            </span>
                          ) : freshness.isHeld ? (
                            <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium bg-amber-50 text-amber-700 border border-amber-200">
                              <span className="w-1.5 h-1.5 rounded-full bg-amber-500"></span> Retained
                            </span>
                          ) : freshness.isStale ? (
                            <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium bg-amber-50 text-amber-700 border border-amber-200">
                              <span className="w-1.5 h-1.5 rounded-full bg-amber-500"></span> Stale
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-600 border border-slate-200">
                              <span className="w-1.5 h-1.5 rounded-full bg-slate-400"></span> Unavailable
                            </span>
                          )}
                        </td>
                        <td className="px-6 py-3.5 text-right tabular-nums text-slate-900 font-medium">
                          {bessPowerDisplay.displayValue} <span className="text-xs text-slate-500 font-normal">{bessPowerDisplay.unit}</span>
                        </td>
                        <td className="px-6 py-3.5 text-right tabular-nums text-slate-800">
                          {formatValue(bessTelemetry.bessFrequency, 2)} {isValidNumber(bessTelemetry.bessFrequency) && <span className="text-xs text-slate-500">Hz</span>}
                        </td>
                        <td className="px-6 py-3.5 text-right tabular-nums text-slate-800">
                          {formatValue(bessTelemetry.bessPowerFactor, 2)}
                        </td>
                        <td className="px-6 py-3.5 text-slate-500 text-xs">
                          {formatTimestamp(bessTelemetry.timestamp)}
                        </td>
                        <td className="px-6 py-3.5 text-right">
                          <button
                            type="button"
                            onClick={() => setSelectedBessId(bess.id)}
                            className="inline-flex items-center gap-1 text-xs font-medium text-primary-600 hover:text-primary-800 hover:underline cursor-pointer"
                          >
                            View BESS
                            <ArrowRight className="w-3 h-3" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      ) : isMultiBess && activeBessId !== null ? (
        /* ===================================================================
           SCENARIO B: Multi-BESS Client — Individual BESS Selected
           1. Display only ONE telemetry panel for the selected BESS.
           2. Show shared Grid metrics using site-level metric resolution.
           3. Show BESS metrics exclusively from selected asset's telemetry.
           =================================================================== */
        (() => {
          const selectedBess = ctx.bessAssets.find(b => b.id === activeBessId)!;
          const bessTelemetry = telemetry[activeBessId] || {};
          const bessPowerDisplay = formatPower(bessTelemetry.bessPower);
          const gridPowerDisplay = formatPower(siteGridPower.value);

          return (
            <div className="space-y-6">
              <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden flex flex-col">
                <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
                  <div className="flex items-center gap-3">
                    <h3 className="text-lg font-semibold text-slate-900">
                      {selectedBess.name} - Grid / Meter Panel
                    </h3>
                    <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-primary-50 text-primary-700 border border-primary-200">
                      Asset Telemetry
                    </span>
                  </div>
                  <Zap className="w-5 h-5 text-slate-400" />
                </div>
                <div className="p-6">
                  <div className="space-y-6">
                    {/* GRID Section (Shared Site-Level Metrics) */}
                    <div>
                      <div className="flex items-center justify-between mb-4">
                        <h4 className="text-sm font-bold text-slate-400 uppercase tracking-wider">
                          GRID (Shared Site Metrics)
                        </h4>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        <div className="bg-slate-50 p-4 rounded-xl border border-slate-100 flex items-center justify-between">
                          <span className="text-sm font-medium text-slate-500 uppercase tracking-wider">Grid Power</span>
                          <span className="text-2xl font-bold text-slate-900">
                            {gridPowerDisplay.displayValue} <span className="text-sm text-slate-500">{gridPowerDisplay.unit}</span>
                          </span>
                        </div>
                        <div className="bg-slate-50 p-4 rounded-xl border border-slate-100 flex items-center justify-between">
                          <span className="text-sm font-medium text-slate-500 uppercase tracking-wider flex items-center gap-2">Grid Frequency</span>
                          <span className="text-2xl font-bold text-slate-900">
                            {formatValue(siteGridFreq.value, 2)} <span className="text-sm text-slate-500">Hz</span>
                          </span>
                        </div>
                        <div className="bg-slate-50 p-4 rounded-xl border border-slate-100 flex items-center justify-between">
                          <span className="text-sm font-medium text-slate-500 uppercase tracking-wider flex items-center gap-2">Grid Power Factor</span>
                          <span className="text-2xl font-bold text-slate-900">
                            {formatValue(siteGridPf.value, 2)}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* BESS Section (Selected Asset Only) */}
                    <div>
                      <div className="flex items-center justify-between mb-4">
                        <h4 className="text-sm font-bold text-slate-400 uppercase tracking-wider">
                          {selectedBess.name} Telemetry
                        </h4>
                        {bessTelemetry.timestamp && (
                          <span className="text-xs text-slate-500 flex items-center gap-1">
                            <Clock className="w-3.5 h-3.5" />
                            Last reported: {formatTimestamp(bessTelemetry.timestamp)}
                          </span>
                        )}
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        <div className="bg-slate-50 p-4 rounded-xl border border-slate-100 flex items-center justify-between">
                          <span className="text-sm font-medium text-slate-500 uppercase tracking-wider flex items-center gap-2">
                            <BatteryMedium className="w-4 h-4" /> BESS Power
                          </span>
                          <span className="text-2xl font-bold text-slate-900">
                            {bessPowerDisplay.displayValue} <span className="text-sm text-slate-500">{bessPowerDisplay.unit}</span>
                          </span>
                        </div>
                        <div className="bg-slate-50 p-4 rounded-xl border border-slate-100 flex items-center justify-between">
                          <span className="text-sm font-medium text-slate-500 uppercase tracking-wider flex items-center gap-2">BESS Frequency</span>
                          <span className="text-2xl font-bold text-slate-900">
                            {formatValue(bessTelemetry.bessFrequency, 2)} <span className="text-sm text-slate-500">Hz</span>
                          </span>
                        </div>
                        <div className="bg-slate-50 p-4 rounded-xl border border-slate-100 flex items-center justify-between">
                          <span className="text-sm font-medium text-slate-500 uppercase tracking-wider flex items-center gap-2">BESS Power Factor</span>
                          <span className="text-2xl font-bold text-slate-900">
                            {formatValue(bessTelemetry.bessPowerFactor, 2)}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          );
        })()
      ) : (
        /* ===================================================================
           SCENARIO C: Single-BESS Client
           Preserve existing single-BESS experience and presentation.
           =================================================================== */
        (() => {
          const singleBess = ctx.bessAssets[0];
          const bessTelemetry = (singleBess ? telemetry[singleBess.id] : undefined) || {};
          const gridPowerDisplay = formatPower(bessTelemetry.gridPower);
          const bessPowerDisplay = formatPower(bessTelemetry.bessPower);

          return (
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden flex flex-col">
              <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
                <h3 className="text-lg font-semibold text-slate-900">Grid / Meter Panel</h3>
                <Zap className="w-5 h-5 text-slate-400" />
              </div>
              <div className="p-6">
                <div className="space-y-6">
                  {/* GRID Section */}
                  <div>
                    <h4 className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-4">GRID</h4>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                      <div className="bg-slate-50 p-4 rounded-xl border border-slate-100 flex items-center justify-between">
                        <span className="text-sm font-medium text-slate-500 uppercase tracking-wider">Grid Power</span>
                        <span className="text-2xl font-bold text-slate-900">
                          {gridPowerDisplay.displayValue} <span className="text-sm text-slate-500">{gridPowerDisplay.unit}</span>
                        </span>
                      </div>
                      <div className="bg-slate-50 p-4 rounded-xl border border-slate-100 flex items-center justify-between">
                        <span className="text-sm font-medium text-slate-500 uppercase tracking-wider flex items-center gap-2">Grid Frequency</span>
                        <span className="text-2xl font-bold text-slate-900">
                          {formatValue(bessTelemetry.gridFrequency, 2)} <span className="text-sm text-slate-500">Hz</span>
                        </span>
                      </div>
                      <div className="bg-slate-50 p-4 rounded-xl border border-slate-100 flex items-center justify-between">
                        <span className="text-sm font-medium text-slate-500 uppercase tracking-wider flex items-center gap-2">Grid Power Factor</span>
                        <span className="text-2xl font-bold text-slate-900">
                          {formatValue(bessTelemetry.powerFactor, 2)}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* BESS Section */}
                  <div>
                    <h4 className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-4">BESS</h4>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                      <div className="bg-slate-50 p-4 rounded-xl border border-slate-100 flex items-center justify-between">
                        <span className="text-sm font-medium text-slate-500 uppercase tracking-wider flex items-center gap-2">
                          <BatteryMedium className="w-4 h-4" /> BESS Power
                        </span>
                        <span className="text-2xl font-bold text-slate-900">
                          {bessPowerDisplay.displayValue} <span className="text-sm text-slate-500">{bessPowerDisplay.unit}</span>
                        </span>
                      </div>
                      <div className="bg-slate-50 p-4 rounded-xl border border-slate-100 flex items-center justify-between">
                        <span className="text-sm font-medium text-slate-500 uppercase tracking-wider flex items-center gap-2">BESS Frequency</span>
                        <span className="text-2xl font-bold text-slate-900">
                          {formatValue(bessTelemetry.bessFrequency, 2)} <span className="text-sm text-slate-500">Hz</span>
                        </span>
                      </div>
                      <div className="bg-slate-50 p-4 rounded-xl border border-slate-100 flex items-center justify-between">
                        <span className="text-sm font-medium text-slate-500 uppercase tracking-wider flex items-center gap-2">BESS Power Factor</span>
                        <span className="text-2xl font-bold text-slate-900">
                          {formatValue(bessTelemetry.bessPowerFactor, 2)}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          );
        })()
      )}
    </div>
  );
}



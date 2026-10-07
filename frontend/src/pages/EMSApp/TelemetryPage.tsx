import { useState, useEffect } from 'react';
import { Zap, Wifi, WifiOff, AlertCircle, RefreshCw, BatteryMedium } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import { usePreview } from '../../context/PreviewContext';
import { useLiveTelemetry } from '../../context/WebSocketContext';
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

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatValue(v: number | undefined | null, decimals = 1): string {
  return v !== undefined && v !== null ? v.toFixed(decimals) : '--';
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
    if (data.bessPower !== undefined) next.bessPower = data.bessPower as number;
    // Source: pcs.ai_freq → BESS Frequency
    if (data.bessFrequency !== undefined) next.bessFrequency = data.bessFrequency as number;
    if (data.bessPowerFactor !== undefined) next.bessPowerFactor = data.bessPowerFactor as number;
    return next;
  }

  if (componentId === 'pmg') {
    if (data.gridPower !== undefined) next.gridPower = data.gridPower as number;
    if (data.gridFrequency !== undefined) next.gridFrequency = data.gridFrequency as number;
    if (data.powerFactor !== undefined) next.powerFactor = data.powerFactor as number;
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

  const [ctx, setCtx] = useState<DashboardContext | null>(null);
  const [ctxLoading, setCtxLoading] = useState(true);
  const [ctxError, setCtxError] = useState<{ type: 'empty' | 'error'; message: string } | null>(null);

  const [telemetry, setTelemetry] = useState<Record<string, DashboardTelemetryState>>({});
  const [telemetryLoading, setTelemetryLoading] = useState(false);
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

    const fetchLatest = async () => {
      setTelemetryLoading(true);
      try {
        const rows = await dashboardService.getLatestTelemetry(ctx.site.id);
        if (!cancelled) setTelemetry(buildStateFromRest(rows, ctx.devices as any));
      } catch {
        // Non-fatal, fallback handled by WS
      } finally {
        if (!cancelled) setTelemetryLoading(false);
      }
    };

    fetchLatest();
    return () => { cancelled = true; };
  }, [ctx]);

  // 3. WebSocket sync
  const siteId = ctx?.site.id;
  const { telemetry: liveDataArray, isConnected } = useLiveTelemetry(siteId);

  useEffect(() => {
    if (liveDataArray.length === 0) return;

    setTelemetry(prev => {
      let next = { ...prev };
      for (const payload of liveDataArray) {
        const device = ctx?.devices.find(d => d.id === payload.deviceId);
        const bessId = (device as any)?.bessAssetId || 'unknown';
        const prevState = next[bessId] || {};
        next[bessId] = mergeWsPayload(prevState, payload.componentId, payload.data as any, payload.timestamp);
      }
      return next;
    });
  }, [liveDataArray]);

  const isLive = liveDataArray.length > 0;

  if (ctxLoading) return <LoadingState />;

  if (ctxError) {
    if (ctxError.type === 'empty') {
      return <EmptyState icon={<AlertCircle className="w-12 h-12" />} title="Telemetry Unavailable" message={ctxError.message} />;
    }
    return <ErrorState message={ctxError.message} onRetry={() => setRetryCounter(c => c + 1)} />;
  }

  if (!ctx) return null;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
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
        </div>
      </div>

      {telemetryLoading ? (
        <div className="h-[300px] bg-slate-100 rounded-xl animate-pulse" />
      ) : (
        <div className="space-y-8">
          {ctx.bessAssets.map(bess => {
            const bessTelemetry = telemetry[bess.id] || {};
            return (
              <div key={bess.id} className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden flex flex-col">
                <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
                  <h3 className="text-lg font-semibold text-slate-900">
                    {ctx.bessAssets.length > 1 ? `${bess.name} - ` : ''}Grid / Meter Panel
                  </h3>
                  <Zap className="w-5 h-5 text-slate-400" />
                </div>
                <div className="p-6">
                  {/* Main Power Metrics */}
                  <div className="space-y-6 mb-8">
                    {/* GRID Section */}
                    <div>
                      <h4 className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-4">GRID</h4>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        <div className="bg-slate-50 p-4 rounded-xl border border-slate-100 flex items-center justify-between">
                          <span className="text-sm font-medium text-slate-500 uppercase tracking-wider">Grid Power</span>
                          <span className="text-2xl font-bold text-slate-900">{formatValue(bessTelemetry.gridPower)} <span className="text-sm text-slate-500">kW</span></span>
                        </div>
                        <div className="bg-slate-50 p-4 rounded-xl border border-slate-100 flex items-center justify-between">
                          <span className="text-sm font-medium text-slate-500 uppercase tracking-wider flex items-center gap-2">Grid Frequency</span>
                          <span className="text-2xl font-bold text-slate-900">{formatValue(bessTelemetry.gridFrequency, 2)} <span className="text-sm text-slate-500">Hz</span></span>
                        </div>
                        <div className="bg-slate-50 p-4 rounded-xl border border-slate-100 flex items-center justify-between">
                          <span className="text-sm font-medium text-slate-500 uppercase tracking-wider flex items-center gap-2">Grid Power Factor</span>
                          <span className="text-2xl font-bold text-slate-900">{formatValue(bessTelemetry.powerFactor, 2)}</span>
                        </div>
                      </div>
                    </div>

                    {/* BESS Section */}
                    <div>
                      <h4 className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-4">BESS</h4>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        <div className="bg-slate-50 p-4 rounded-xl border border-slate-100 flex items-center justify-between">
                          <span className="text-sm font-medium text-slate-500 uppercase tracking-wider flex items-center gap-2"><BatteryMedium className="w-4 h-4"/> BESS Power</span>
                          <span className="text-2xl font-bold text-slate-900">{formatValue(bessTelemetry.bessPower)} <span className="text-sm text-slate-500">kW</span></span>
                        </div>
                        <div className="bg-slate-50 p-4 rounded-xl border border-slate-100 flex items-center justify-between">
                          <span className="text-sm font-medium text-slate-500 uppercase tracking-wider flex items-center gap-2">BESS Frequency</span>
                          <span className="text-2xl font-bold text-slate-900">{formatValue(bessTelemetry.bessFrequency, 2)} <span className="text-sm text-slate-500">Hz</span></span>
                        </div>
                        <div className="bg-slate-50 p-4 rounded-xl border border-slate-100 flex items-center justify-between">
                          <span className="text-sm font-medium text-slate-500 uppercase tracking-wider flex items-center gap-2">BESS Power Factor</span>
                          <span className="text-2xl font-bold text-slate-900">{formatValue(bessTelemetry.bessPowerFactor, 2)}</span>
                        </div>
                      </div>
                    </div>

                    {/* CABINET METER Section */}
                    <div>
                      <h4 className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-4">CABINET METER</h4>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        <div className="bg-slate-50 p-4 rounded-xl border border-slate-100 flex items-center justify-between">
                          <span className="text-sm font-medium text-slate-500 uppercase tracking-wider flex items-center gap-2">Cabinet Meter Power</span>
                          <span className="text-2xl font-bold text-slate-900">{formatValue(bessTelemetry.totalPower)} <span className="text-sm text-slate-500">kW</span></span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Phase Telemetry */}
                  <h4 className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-4">Cabinet Meter Phase Telemetry</h4>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    {/* Phase A */}
                    <div className="border border-slate-200 rounded-lg overflow-hidden">
                      <div className="bg-slate-50 px-4 py-2 border-b border-slate-200 font-semibold text-slate-700">Phase A</div>
                      <div className="p-4 grid grid-cols-2 gap-4">
                        <div>
                          <p className="text-xs font-medium text-slate-500">Voltage</p>
                          <p className="text-lg font-bold text-slate-900">{formatValue(bessTelemetry.voltageA)} V</p>
                        </div>
                        <div>
                          <p className="text-xs font-medium text-slate-500">Current</p>
                          <p className="text-lg font-bold text-slate-900">{formatValue(bessTelemetry.currentA)} A</p>
                        </div>
                      </div>
                    </div>
                    {/* Phase B */}
                    <div className="border border-slate-200 rounded-lg overflow-hidden">
                      <div className="bg-slate-50 px-4 py-2 border-b border-slate-200 font-semibold text-slate-700">Phase B</div>
                      <div className="p-4 grid grid-cols-2 gap-4">
                        <div>
                          <p className="text-xs font-medium text-slate-500">Voltage</p>
                          <p className="text-lg font-bold text-slate-900">{formatValue(bessTelemetry.voltageB)} V</p>
                        </div>
                        <div>
                          <p className="text-xs font-medium text-slate-500">Current</p>
                          <p className="text-lg font-bold text-slate-900">{formatValue(bessTelemetry.currentB)} A</p>
                        </div>
                      </div>
                    </div>
                    {/* Phase C */}
                    <div className="border border-slate-200 rounded-lg overflow-hidden">
                      <div className="bg-slate-50 px-4 py-2 border-b border-slate-200 font-semibold text-slate-700">Phase C</div>
                      <div className="p-4 grid grid-cols-2 gap-4">
                        <div>
                          <p className="text-xs font-medium text-slate-500">Voltage</p>
                          <p className="text-lg font-bold text-slate-900">{formatValue(bessTelemetry.voltageC)} V</p>
                        </div>
                        <div>
                          <p className="text-xs font-medium text-slate-500">Current</p>
                          <p className="text-lg font-bold text-slate-900">{formatValue(bessTelemetry.currentC)} A</p>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}


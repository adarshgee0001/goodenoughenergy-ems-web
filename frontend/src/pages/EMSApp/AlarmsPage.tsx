import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { Bell, AlertCircle, XCircle, AlertTriangle, Info, CheckCircle2, Calendar, Download } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import { usePreview } from '../../context/PreviewContext';
import { dashboardService, ClientAccessError, NoSiteError, NoBessError } from '../../features/dashboard/dashboard.service';
import type { DashboardContext } from '../../features/dashboard/dashboard.types';
import { alarmService, type RealAlarm, type AlarmQueryParams } from '../../features/alarms/alarm.service';
import { useWebSocket } from '../../context/WebSocketContext';
import { useUserSettings } from '../../features/settings/hooks/useUserSettings';
import { alarmAudioNotifier } from '../../features/settings/alarmAudio.utils';
import { BessViewSelector } from './components/BessViewSelector';

export type HistoryDatePreset = 'All' | 'Today' | 'Yesterday' | 'Last 30 Days' | 'Custom Range';

function formatDateISO(date: Date): string {
  return date.toISOString().split('T')[0];
}

function getNextDay(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const nextDate = new Date(Date.UTC(y, m - 1, d + 1));
  return nextDate.toISOString().split('T')[0];
}

function buildBoundaryDates(dateStr: string, isEnd: boolean, tz?: string | null): Date {
  const timeStr = isEnd ? '23:59:59.999' : '00:00:00.000';
  if (!tz) return new Date(`${dateStr}T${timeStr}Z`);

  try {
    const [y, m, d] = dateStr.split('-');
    const localTarget = new Date(Date.UTC(Number(y), Number(m) - 1, Number(d), isEnd ? 23 : 0, isEnd ? 59 : 0, isEnd ? 59 : 0, isEnd ? 999 : 0));

    const tzStr = localTarget.toLocaleString('en-US', { timeZone: tz });
    const utcStr = localTarget.toLocaleString('en-US', { timeZone: 'UTC' });
    const offsetMs = new Date(tzStr).getTime() - new Date(utcStr).getTime();

    return new Date(localTarget.getTime() - offsetMs);
  } catch {
    return new Date(`${dateStr}T${timeStr}Z`);
  }
}

/**
 * Returns timezone-correct half-open boundaries [from, to) for inclusive calendar dates.
 * 'from' is start of startDate at 00:00:00.000 local site time.
 * 'to' is start of day after endDate at 00:00:00.000 local site time (capturing all of endDate).
 */
export function buildHalfOpenInterval(startDateStr: string, endDateStr: string, tz?: string | null): { from: Date; to: Date } {
  const from = buildBoundaryDates(startDateStr, false, tz);
  const nextDay = getNextDay(endDateStr);
  const to = buildBoundaryDates(nextDay, false, tz);
  return { from, to };
}

export function calculateHistoryPresetDates(preset: HistoryDatePreset, anchorDate: Date = new Date()): { startDate: string; endDate: string } {
  const today = new Date(anchorDate);
  if (preset === 'Today') {
    return { startDate: formatDateISO(today), endDate: formatDateISO(today) };
  } else if (preset === 'Yesterday') {
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    return { startDate: formatDateISO(yesterday), endDate: formatDateISO(yesterday) };
  } else if (preset === 'Last 30 Days') {
    const lastMonth = new Date(today);
    lastMonth.setDate(lastMonth.getDate() - 29);
    return { startDate: formatDateISO(lastMonth), endDate: formatDateISO(today) };
  } else if (preset === 'All') {
    return { startDate: '', endDate: '' };
  }
  return { startDate: formatDateISO(today), endDate: formatDateISO(today) };
}

export default function AlarmsPage() {
  const { role } = useAuth();
  const { isPreviewing, previewClientId } = usePreview();
  const { formatDateTime, setActiveSiteTimezone } = useUserSettings();

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

  // Validate that selected ID belongs to the currently resolved site before using it
  const isMultiBess = (ctx?.bessAssets?.length ?? 0) > 1;
  const activeBessId =
    isMultiBess && selectedBessId && ctx?.bessAssets?.some(b => b.id === selectedBessId)
      ? selectedBessId
      : null;
  const selectedBess = activeBessId ? ctx?.bessAssets.find(b => b.id === activeBessId) : null;

  const [activeTab, setActiveTab] = useState<'active' | 'history'>('active');

  // Active faults state (unresolved faults, unconstrained by history date presets)
  const [activeAlarms, setActiveAlarms] = useState<RealAlarm[]>([]);
  const [activeLoading, setActiveLoading] = useState(false);
  const [activeError, setActiveError] = useState<string | null>(null);

  // Alarm history state (filtered by date preset / custom range)
  const [historyAlarms, setHistoryAlarms] = useState<RealAlarm[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);

  // Date filters for Alarm History
  const [datePreset, setDatePreset] = useState<HistoryDatePreset>('All');
  const initialDates = useMemo(() => calculateHistoryPresetDates('Today'), []);
  const [startDate, setStartDate] = useState(initialDates.startDate);
  const [endDate, setEndDate] = useState(initialDates.endDate);
  const [appliedStartDate, setAppliedStartDate] = useState(initialDates.startDate);
  const [appliedEndDate, setAppliedEndDate] = useState(initialDates.endDate);

  // CSV export state
  const [isExporting, setIsExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  // Request ID to prevent race conditions and stale responses
  const historyRequestIdRef = useRef(0);

  const { socket, isConnected } = useWebSocket();

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
        if (err instanceof ClientAccessError || err instanceof NoSiteError || err instanceof NoBessError) {
          setCtxError({ type: 'empty', message: err.message });
        } else {
          setCtxError({ type: 'error', message: err.message || 'Failed to load context.' });
        }
      } finally {
        if (!cancelled) setCtxLoading(false);
      }
    };

    resolve();
    return () => { cancelled = true; };
  }, [role, isPreviewing, previewClientId]);

  // 2. Fetch Active Faults (unresolved faults only, scoped to active BESS if selected)
  const loadActiveAlarms = useCallback(async () => {
    if (!ctx?.site) return;
    try {
      setActiveLoading(true);
      setActiveError(null);
      const params: AlarmQueryParams = { status: 'ACTIVE' };
      if (activeBessId) {
        params.bessId = activeBessId;
      }
      const data = await alarmService.getSiteAlarms(ctx.site.id, params);
      alarmAudioNotifier.seedHistoricalAlarms(data);
      setActiveAlarms(data);
    } catch (err: any) {
      setActiveError(err.message || 'Failed to load active faults.');
    } finally {
      setActiveLoading(false);
    }
  }, [ctx?.site, activeBessId]);

  useEffect(() => {
    loadActiveAlarms();
  }, [loadActiveAlarms]);

  // 3. Fetch Alarm History (filtered by timezone-aware half-open interval, scoped to active BESS if selected)
  const loadHistoryAlarms = useCallback(async (startStr?: string, endStr?: string) => {
    if (!ctx?.site) return;
    const reqId = ++historyRequestIdRef.current;
    setHistoryLoading(true);
    setHistoryError(null);
    try {
      const params: AlarmQueryParams = {
        status: 'HISTORY'
      };
      if (activeBessId) {
        params.bessId = activeBessId;
      }
      if (startStr && endStr) {
        const { from, to } = buildHalfOpenInterval(startStr, endStr, ctx.site.timezone);
        params.from = from.toISOString();
        params.to = to.toISOString();
      }
      const data = await alarmService.getSiteAlarms(ctx.site.id, params);
      if (reqId !== historyRequestIdRef.current) return;
      setHistoryAlarms(data);
    } catch (err: any) {
      if (reqId !== historyRequestIdRef.current) return;
      setHistoryError(err.message || 'Failed to load alarm history.');
      setHistoryAlarms([]);
    } finally {
      if (reqId === historyRequestIdRef.current) {
        setHistoryLoading(false);
      }
    }
  }, [ctx?.site, activeBessId]);

  // Synchronize history alarms when preset, dates, or active BESS selection changes
  useEffect(() => {
    if (datePreset === 'All') {
      if (ctx?.site) {
        loadHistoryAlarms();
      }
    } else if (datePreset !== 'Custom Range') {
      const { startDate: s, endDate: e } = calculateHistoryPresetDates(datePreset);
      setStartDate(s);
      setEndDate(e);
      setAppliedStartDate(s);
      setAppliedEndDate(e);
      if (ctx?.site) {
        loadHistoryAlarms(s, e);
      }
    } else if (ctx?.site && appliedStartDate && appliedEndDate) {
      loadHistoryAlarms(appliedStartDate, appliedEndDate);
    }
  }, [datePreset, ctx?.site, activeBessId, loadHistoryAlarms]);

  // 4. WebSocket Subscription
  useEffect(() => {
    if (!ctx?.site || !socket || !isConnected) return;
    const siteId = ctx.site.id;

    socket.emit('subscribe', { siteId });

    const handleAlarmEvent = (payload: any) => {
      if (payload.type === 'alarm' && payload.siteId === siteId && payload.alarm) {
        const newAlarm = payload.alarm as RealAlarm;

        // Verify site ownership
        if (newAlarm.device?.bessAsset?.siteId && newAlarm.device.bessAsset.siteId !== siteId) {
          return;
        }

        // Update active faults
        setActiveAlarms((prev) => {
          const idx = prev.findIndex(a => a.id === newAlarm.id);
          if (newAlarm.status === 'ACTIVE') {
            if (idx >= 0) {
              const next = [...prev];
              next[idx] = newAlarm;
              return next;
            } else {
              return [newAlarm, ...prev];
            }
          } else {
            // Unresolved fault resolved/acknowledged/cleared -> remove from active faults
            if (idx >= 0) {
              return prev.filter(a => a.id !== newAlarm.id);
            }
            return prev;
          }
        });

        // Update history if cleared or acknowledged
        if (newAlarm.status !== 'ACTIVE') {
          setHistoryAlarms((prev) => {
            const idx = prev.findIndex(a => a.id === newAlarm.id);
            if (idx >= 0) {
              const next = [...prev];
              next[idx] = newAlarm;
              return next;
            } else {
              return [newAlarm, ...prev];
            }
          });
        }
      }
    };

    socket.on('alarm', handleAlarmEvent);

    return () => {
      socket.off('alarm', handleAlarmEvent);
      socket.emit('unsubscribe', { siteId });
    };
  }, [ctx?.site, socket, isConnected]);

  const handleAcknowledge = async (alarmId: string) => {
    try {
      const updated = await alarmService.acknowledgeAlarm(alarmId);
      // Remove from active faults
      setActiveAlarms((prev) => prev.filter(a => a.id !== updated.id));
      // Prepend to history alarms if loaded
      setHistoryAlarms((prev) => {
        const idx = prev.findIndex(a => a.id === updated.id);
        if (idx >= 0) {
          const next = [...prev];
          next[idx] = updated;
          return next;
        }
        return [updated, ...prev];
      });
    } catch (err) {
      console.error('Failed to acknowledge alarm:', err);
    }
  };

  const handleApplyCustomRange = () => {
    if (startDate > endDate) {
      return;
    }
    setAppliedStartDate(startDate);
    setAppliedEndDate(endDate);
    loadHistoryAlarms(startDate, endDate);
  };

  const handleExportCsv = async () => {
    if (!ctx?.site || isExporting) return;
    setIsExporting(true);
    setExportError(null);
    try {
      let from: Date | undefined;
      let to: Date | undefined;
      let startStr: string | undefined;
      let endStr: string | undefined;

      if (datePreset !== 'All') {
        const interval = buildHalfOpenInterval(appliedStartDate, appliedEndDate, ctx.site.timezone);
        from = interval.from;
        to = interval.to;
        startStr = appliedStartDate;
        endStr = appliedEndDate;
      }

      const { blob, filename } = await alarmService.exportAlarmsCsv(
        ctx.site.id,
        from,
        to,
        startStr,
        endStr,
        activeBessId ?? undefined
      );
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    } catch (err: any) {
      console.error('Failed to export alarms CSV:', err);
      setExportError(err.message || 'Failed to export CSV.');
    } finally {
      setIsExporting(false);
    }
  };

  // Defensive client-side scope filter and deterministic sort
  const displayedAlarms = useMemo(() => {
    const list = activeTab === 'active' ? activeAlarms : historyAlarms;
    const scopedList = activeBessId
      ? list.filter(a => a.device?.bessAsset?.id === activeBessId)
      : list;
    return [...scopedList].sort((a, b) => {
      const timeDiff = new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      if (timeDiff !== 0) return timeDiff;
      return (b.id || '').localeCompare(a.id || '');
    });
  }, [activeTab, activeAlarms, historyAlarms, activeBessId]);

  const isLoading = activeTab === 'active' ? activeLoading : historyLoading;
  const currentError = activeTab === 'active' ? activeError : historyError;

  if (ctxLoading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600 mb-4"></div>
        <p className="text-slate-500">Loading context...</p>
      </div>
    );
  }

  if (ctxError) {
    return <ErrorState message={ctxError.message} onRetry={() => window.location.reload()} />;
  }

  if (!ctx) return null;

  return (
    <div className="space-y-6 pb-6">
      {/* Page Header with Client/Site Context & BESS View Selector */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-2">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-3">
            <Bell className="w-6 h-6 text-primary-600" /> Alarms & Events
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            {ctx.client.name} — {ctx.site.name}
            {isMultiBess
              ? activeBessId !== null
                ? ` — ${selectedBess?.name ?? 'Selected BESS'}`
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

      <div className="flex border-b border-slate-200">
        <button
          className={`px-4 py-2 font-medium text-sm border-b-2 transition-colors ${
            activeTab === 'active' ? 'border-primary-600 text-primary-600' : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
          }`}
          onClick={() => setActiveTab('active')}
        >
          Active Faults
        </button>
        <button
          className={`px-4 py-2 font-medium text-sm border-b-2 transition-colors ${
            activeTab === 'history' ? 'border-primary-600 text-primary-600' : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
          }`}
          onClick={() => setActiveTab('history')}
        >
          Alarm History
        </button>
      </div>

      {/* Date Filters and CSV Export Toolbar for Alarm History */}
      {activeTab === 'history' && (
        <div className="flex flex-wrap items-center justify-between gap-3 bg-white p-3 rounded-xl border border-slate-200 shadow-sm">
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2 bg-slate-50 px-3 py-2 rounded-lg border border-slate-200">
              <Calendar className="w-4 h-4 text-slate-400" />
              <select
                className="bg-transparent border-none text-sm font-medium text-slate-700 focus:ring-0 cursor-pointer outline-none"
                value={datePreset}
                onChange={(e) => setDatePreset(e.target.value as HistoryDatePreset)}
              >
                <option value="All">All History</option>
                <option value="Today">Today</option>
                <option value="Yesterday">Yesterday</option>
                <option value="Last 30 Days">Last 30 Days</option>
                <option value="Custom Range">Custom Range</option>
              </select>
            </div>

            {datePreset === 'Custom Range' && (
              <>
                <div className="flex items-center gap-2 bg-slate-50 px-3 py-2 rounded-lg border border-slate-200">
                  <span className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">Start Date</span>
                  <input
                    type="date"
                    className="bg-transparent border-none text-sm font-medium text-slate-700 focus:ring-0 outline-none p-0 cursor-pointer"
                    value={startDate}
                    max={endDate || undefined}
                    onChange={(e) => setStartDate(e.target.value)}
                  />
                </div>
                <div className="flex items-center gap-2 bg-slate-50 px-3 py-2 rounded-lg border border-slate-200">
                  <span className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">End Date</span>
                  <input
                    type="date"
                    className="bg-transparent border-none text-sm font-medium text-slate-700 focus:ring-0 outline-none p-0 cursor-pointer"
                    value={endDate}
                    min={startDate || undefined}
                    onChange={(e) => setEndDate(e.target.value)}
                  />
                </div>
                <button
                  onClick={handleApplyCustomRange}
                  disabled={startDate > endDate || historyLoading}
                  className="flex items-center gap-2 bg-slate-900 hover:bg-slate-800 disabled:opacity-50 text-white px-4 py-2 rounded-lg font-medium text-sm transition-colors shadow-sm"
                >
                  Apply
                </button>
                {startDate > endDate && (
                  <span className="text-xs text-rose-500 font-medium">Start date cannot be after end date</span>
                )}
              </>
            )}
          </div>

          <div className="flex items-center gap-2">
            {exportError && (
              <span className="text-xs text-rose-500 font-medium">{exportError}</span>
            )}
            <button
              onClick={handleExportCsv}
              disabled={isExporting || historyLoading}
              className="flex items-center gap-2 bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 px-4 py-2 rounded-lg font-medium text-sm transition-colors shadow-sm disabled:opacity-50"
            >
              {isExporting ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-slate-700" />
                  <span>Exporting...</span>
                </>
              ) : (
                <>
                  <Download className="w-4 h-4 text-slate-500" />
                  <span>Export CSV</span>
                </>
              )}
            </button>
          </div>
        </div>
      )}

      {isLoading ? (
        <div className="flex flex-col items-center justify-center min-h-[40vh]">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600 mb-4"></div>
          <p className="text-slate-500">{activeTab === 'active' ? 'Loading active faults...' : 'Loading alarm history...'}</p>
        </div>
      ) : currentError ? (
        <ErrorState
          message={currentError}
          onRetry={
            activeTab === 'active'
              ? loadActiveAlarms
              : () => (datePreset === 'All' ? loadHistoryAlarms() : loadHistoryAlarms(appliedStartDate, appliedEndDate))
          }
        />
      ) : displayedAlarms.length === 0 ? (
        <EmptyState
          icon={<CheckCircle2 className="w-12 h-12" />}
          title={activeTab === 'active' ? 'All Clear' : 'No Alarms Found'}
          message={
            activeTab === 'active'
              ? activeBessId && selectedBess
                ? `No active faults for ${selectedBess.name}.`
                : 'No active faults to display in this view.'
              : datePreset === 'All'
              ? activeBessId && selectedBess
                ? `No historical alarms found for ${selectedBess.name}.`
                : 'No historical alarms found.'
              : activeBessId && selectedBess
              ? `No historical alarms found for ${selectedBess.name} in this date range.`
              : 'No historical alarms found for the selected date range.'
          }
        />
      ) : (
        <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-xs uppercase tracking-wider text-slate-500">
                <th className="px-4 py-3 font-medium">Time</th>
                <th className="px-4 py-3 font-medium">Severity</th>
                <th className="px-4 py-3 font-medium">Event</th>
                <th className="px-4 py-3 font-medium">EMU ID</th>
                <th className="px-4 py-3 font-medium">Device</th>
                <th className="px-4 py-3 font-medium">Status</th>
                {activeTab === 'active' && <th className="px-4 py-3 font-medium">Action</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {displayedAlarms.map(alarm => (
                <tr key={alarm.id} className="hover:bg-slate-50 transition-colors">
                  <td className="px-4 py-3 text-sm text-slate-600 whitespace-nowrap">
                    {formatDateTime(alarm.createdAt)}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <SeverityBadge severity={alarm.severity} />
                  </td>
                  <td className="px-4 py-3">
                    <p className="text-sm font-semibold text-slate-900">{alarm.message}</p>
                    {alarm.faultCode && <p className="text-xs text-slate-500 font-mono">{alarm.faultCode}</p>}
                  </td>
                  <td className="px-4 py-3 text-sm font-mono text-slate-600 whitespace-nowrap">
                    {alarm.device?.bessAsset?.emuId || 'N/A'}
                  </td>
                  <td className="px-4 py-3 text-sm text-slate-600 whitespace-nowrap">
                    {alarm.device ? `${alarm.device.bessAsset?.name || 'BESS'} / ${alarm.device.type}` : '-'}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <StatusBadge status={alarm.status} />
                  </td>
                  {activeTab === 'active' && (
                    <td className="px-4 py-3 whitespace-nowrap">
                      {alarm.status === 'ACTIVE' && (
                        <button
                          onClick={() => handleAcknowledge(alarm.id)}
                          className="text-xs font-medium bg-slate-900 text-white px-3 py-1.5 rounded hover:bg-slate-700 transition-colors cursor-pointer"
                        >
                          Acknowledge
                        </button>
                      )}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function SeverityBadge({ severity }: { severity: string }) {
  switch (severity) {
    case 'CRITICAL':
    case 'FATAL':
      return <div className="flex items-center gap-1.5 text-rose-600 font-medium text-sm"><XCircle className="w-4 h-4" /> {severity}</div>;
    case 'WARNING':
      return <div className="flex items-center gap-1.5 text-amber-600 font-medium text-sm"><AlertTriangle className="w-4 h-4" /> {severity}</div>;
    default:
      return <div className="flex items-center gap-1.5 text-blue-600 font-medium text-sm"><Info className="w-4 h-4" /> {severity}</div>;
  }
}

function StatusBadge({ status }: { status: string }) {
  switch (status) {
    case 'ACTIVE':
      return <span className="px-2 py-0.5 rounded text-[10px] uppercase font-bold tracking-wider bg-rose-100 text-rose-700">Active</span>;
    case 'ACKNOWLEDGED':
      return <span className="px-2 py-0.5 rounded text-[10px] uppercase font-bold tracking-wider bg-amber-100 text-amber-700">Ack'd</span>;
    case 'CLEARED':
      return <span className="px-2 py-0.5 rounded text-[10px] uppercase font-bold tracking-wider bg-emerald-100 text-emerald-700">Cleared</span>;
    default:
      return <span className="px-2 py-0.5 rounded text-[10px] uppercase font-bold tracking-wider bg-slate-100 text-slate-700">{status}</span>;
  }
}

function EmptyState({ icon, title, message }: { icon: React.ReactNode; title: string; message: string }) {
  return (
    <div className="flex flex-col items-center justify-center min-h-[40vh] text-center px-4">
      <div className="mb-4 text-slate-400">{icon}</div>
      <h1 className="text-xl font-bold text-slate-900 mb-2">{title}</h1>
      <p className="text-slate-500 max-w-md text-sm">{message}</p>
    </div>
  );
}

function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] text-center px-4">
      <AlertCircle className="w-12 h-12 text-rose-500 mb-4" />
      <h1 className="text-2xl font-bold text-slate-900 mb-2">Unable to Load</h1>
      <p className="text-slate-500 max-w-md mb-6">{message}</p>
      <button
        onClick={onRetry}
        className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-slate-900 text-white text-sm font-medium hover:bg-slate-700 transition-colors"
      >
        Retry Connection
      </button>
    </div>
  );
}


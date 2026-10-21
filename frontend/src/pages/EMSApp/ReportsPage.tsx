import { useState, useEffect, useMemo, useCallback, useRef, useLayoutEffect } from 'react';
import { Download, FileText, Calendar, AlertCircle, RefreshCw } from 'lucide-react';
import { PowerTrendChart } from './components/PowerTrendChart';
import { BessViewSelector } from './components/BessViewSelector';
import type { TelemetrySnapshotRow, DashboardContext } from '../../features/dashboard/dashboard.types';
import { dashboardService, ClientAccessError, NoSiteError, NoBessError } from '../../features/dashboard/dashboard.service';
import { useAuth } from '../../hooks/useAuth';
import { usePreview } from '../../context/PreviewContext';
import { useUserSettings } from '../../features/settings/hooks/useUserSettings';

export type ReportsUnitOptions = {
  powerUnit?: 'kW' | 'MW';
  energyUnit?: 'kWh' | 'MWh';
};

export function getAuthoritativeReportsHeaders(options?: ReportsUnitOptions): string[] {
  const pUnit = options?.powerUnit === 'MW' ? 'MW' : 'kW';
  const eUnit = options?.energyUnit === 'MWh' ? 'MWh' : 'kWh';
  return [
    'Timestamp',
    'BESS Name',
    'EMU Serial No.',
    `Grid Side Load (${pUnit})`,
    'Grid Frequency (Hz)',
    'Grid Power Factor',
    'BESS Frequency (Hz)',
    'BESS Power Factor',
    `PCS Active Power (${pUnit})`,
    'PCS Temperature (°C)',
    'Line Voltage (V)',
    'AC Current (A)',
    'Operating Mode',
    'Ambient Temperature (°C)',
    'Battery Coolant Return Temperature (°C)',
    'Battery Coolant Inlet Temperature (°C)',
    'Coolant Return Pressure (bar)',
    'Coolant Inlet Pressure (bar)',
    'SOC (%)',
    'SOH (%)',
    'BMS Current (A)',
    'BMS DC Voltage (V)',
    'Cabinet State',
    'Cell V Max (V)',
    'Cell V Min (V)',
    'Cell Temp Max (°C)',
    'Cell Temp Min (°C)',
    'Battery Ambient Temperature (°C)',
    'Pack 01 Average Temperature (°C)',
    'Pack 01 Maximum Temperature (°C)',
    'Pack 02 Average Temperature (°C)',
    'Pack 02 Maximum Temperature (°C)',
    'Pack 03 Average Temperature (°C)',
    'Pack 03 Maximum Temperature (°C)',
    'Pack 04 Average Temperature (°C)',
    'Pack 04 Maximum Temperature (°C)',
    'Pack 05 Average Temperature (°C)',
    'Pack 05 Maximum Temperature (°C)',
    `Today Charge Energy (${eUnit})`,
    `Today Discharge Energy (${eUnit})`,
    `Accum Charge Energy (${eUnit})`,
    `Accum Discharge Energy (${eUnit})`,
    `Solar Power (${pUnit})`
  ];
}

export const AUTHORITATIVE_REPORTS_HEADERS = [
  'Timestamp',
  'BESS Name',
  'EMU Serial No.',
  'Grid Side Load (kW)',
  'Grid Frequency (Hz)',
  'Grid Power Factor',
  'BESS Frequency (Hz)',
  'BESS Power Factor',
  'PCS Active Power (kW)',
  'PCS Temperature (°C)',
  'Line Voltage (V)',
  'AC Current (A)',
  'Operating Mode',
  'Ambient Temperature (°C)',
  'Battery Coolant Return Temperature (°C)',
  'Battery Coolant Inlet Temperature (°C)',
  'Coolant Return Pressure (bar)',
  'Coolant Inlet Pressure (bar)',
  'SOC (%)',
  'SOH (%)',
  'BMS Current (A)',
  'BMS DC Voltage (V)',
  'Cabinet State',
  'Cell V Max (V)',
  'Cell V Min (V)',
  'Cell Temp Max (°C)',
  'Cell Temp Min (°C)',
  'Battery Ambient Temperature (°C)',
  'Pack 01 Average Temperature (°C)',
  'Pack 01 Maximum Temperature (°C)',
  'Pack 02 Average Temperature (°C)',
  'Pack 02 Maximum Temperature (°C)',
  'Pack 03 Average Temperature (°C)',
  'Pack 03 Maximum Temperature (°C)',
  'Pack 04 Average Temperature (°C)',
  'Pack 04 Maximum Temperature (°C)',
  'Pack 05 Average Temperature (°C)',
  'Pack 05 Maximum Temperature (°C)',
  'Today Charge Energy (kWh)',
  'Today Discharge Energy (kWh)',
  'Accum Charge Energy (kWh)',
  'Accum Discharge Energy (kWh)',
  'Solar Power (kW)'
] as const;

export const SINGLE_BESS_REPORTS_HEADERS = AUTHORITATIVE_REPORTS_HEADERS;

export function getSingleBessReportsHeaders(options?: ReportsUnitOptions): string[] {
  return getAuthoritativeReportsHeaders(options);
}

export function formatPowerValue(
  v: number | undefined | null,
  powerUnit: 'kW' | 'MW' = 'kW',
  decimals = 2
): string {
  if (v === undefined || v === null || typeof v !== 'number' || isNaN(v)) return '--';
  const val = powerUnit === 'MW' ? v / 1000 : v;
  const rounded = Object.is(val, -0) ? 0 : val;
  return rounded.toFixed(decimals);
}

export function formatEnergyValue(
  v: number | undefined | null,
  energyUnit: 'kWh' | 'MWh' = 'kWh',
  decimals = 2
): string {
  if (v === undefined || v === null || typeof v !== 'number' || isNaN(v)) return '--';
  const val = energyUnit === 'MWh' ? v / 1000 : v;
  const rounded = Object.is(val, -0) ? 0 : val;
  return rounded.toFixed(decimals);
}

export function formatValue(v: number | undefined | null, decimals = 1): string {
  return v !== undefined && v !== null ? v.toFixed(decimals) : '--';
}

export function formatCabinetState(state: number | string | undefined | null): string {
  if (state === 0 || state === '0') return 'STANDBY';
  if (state === 1 || state === '1') return 'DISCHARGING';
  if (state === 2 || state === '2') return 'CHARGING';
  if (typeof state === 'string' && (state === 'STANDBY' || state === 'DISCHARGING' || state === 'CHARGING')) {
    return state;
  }
  return '';
}

export const TMS_MODE_LABELS: Record<number, string> = {
  0: 'STOP',
  1: 'SELF-CIRCULATION',
  2: 'UNKNOWN',
  3: 'HEATING',
  4: 'FAULT',
};

export function formatTmsMode(state: number | string | undefined | null): string {
  if (state === null || state === undefined) return '';
  const num = Number(state);
  if (num in TMS_MODE_LABELS) {
    return TMS_MODE_LABELS[num];
  }
  if (typeof state === 'string' && Object.values(TMS_MODE_LABELS).includes(state)) {
    return state;
  }
  return '';
}

function formatDateISO(date: Date) {
  return date.toISOString().split('T')[0];
}

function formatTimestamp(isoString: string, timeZone?: string | null) {
  if (!isoString) return '--';
  try {
    const d = new Date(isoString);
    if (isNaN(d.getTime())) return '--';
    const tz = timeZone || 'Asia/Kolkata';
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: true
    });
    return formatter.format(d);
  } catch {
    const d = new Date(isoString);
    const day = d.getDate();
    const month = d.toLocaleString('en-US', { month: 'long' });
    const year = d.getFullYear();
    let hours = d.getHours();
    const minutes = d.getMinutes().toString().padStart(2, '0');
    const seconds = d.getSeconds().toString().padStart(2, '0');
    const ampm = hours >= 12 ? 'PM' : 'AM';
    hours = hours % 12;
    hours = hours ? hours : 12;
    const strTime = hours.toString().padStart(2, '0') + ':' + minutes + ':' + seconds + ' ' + ampm;
    return `${day} ${month} ${year}, ${strTime}`;
  }
}

function buildBoundaryDates(dateStr: string, isEnd: boolean, tz?: string | null) {
  const timeStr = isEnd ? '23:59:59.999' : '00:00:00.000';
  if (!tz) return new Date(`${dateStr}T${timeStr}Z`);
  
  try {
    const [y, m, d] = dateStr.split('-');
    const localTarget = new Date(Date.UTC(Number(y), Number(m)-1, Number(d), isEnd ? 23 : 0, isEnd ? 59 : 0, isEnd ? 59 : 0, isEnd ? 999 : 0));
    
    const tzStr = localTarget.toLocaleString('en-US', { timeZone: tz });
    const utcStr = localTarget.toLocaleString('en-US', { timeZone: 'UTC' });
    const offsetMs = new Date(tzStr).getTime() - new Date(utcStr).getTime();
    
    return new Date(localTarget.getTime() - offsetMs);
  } catch {
    return new Date(`${dateStr}T${timeStr}Z`);
  }
}

export default function ReportsPage() {
  const { role } = useAuth();
  const { isPreviewing, previewClientId } = usePreview();

  const [ctx, setCtx] = useState<DashboardContext | null>(null);
  const [ctxLoading, setCtxLoading] = useState(true);
  const [ctxError, setCtxError] = useState<{ type: 'empty' | 'error'; message: string } | null>(null);
  const [retryCounter, setRetryCounter] = useState(0);

  const { preferences, formatEnergy, resolvedTimezone, setActiveSiteTimezone, setActiveClientId } = useUserSettings();

  // Local selector state for multi-BESS clients (null = All BESS — Site Overview)
  const [selectedBessId, setSelectedBessId] = useState<string | null>(null);

  // Reset the selection to All BESS whenever site/client context changes
  useEffect(() => {
    setSelectedBessId(null);
  }, [ctx?.site.id]);

  // Synchronize active site timezone and client context with UserSettingsContext
  useEffect(() => {
    if (ctx?.site?.timezone) {
      setActiveSiteTimezone(ctx.site.timezone);
    }
    if (ctx?.client?.id && setActiveClientId) {
      setActiveClientId(ctx.client.id);
    }
  }, [ctx?.site?.timezone, ctx?.client?.id, setActiveSiteTimezone, setActiveClientId]);

  // Validate that selected ID belongs to the currently resolved site before using it
  const isMultiBess = (ctx?.bessAssets?.length ?? 0) > 1;
  const activeBessId =
    isMultiBess && selectedBessId && ctx?.bessAssets?.some(b => b.id === selectedBessId)
      ? selectedBessId
      : null;
  const selectedBess = activeBessId ? ctx?.bessAssets.find(b => b.id === activeBessId) : null;

  const [dateRange, setDateRange] = useState<string>(preferences.defaultReportRange || 'Today');
  const [startDate, setStartDate] = useState(formatDateISO(new Date()));
  const [endDate, setEndDate] = useState(formatDateISO(new Date()));
  const [reportInterval, setReportInterval] = useState<number | null>(null);
  const authoritativeInterval = activeBessId
    ? (selectedBess?.reportIntervalMinutes ?? 15)
    : (reportInterval ?? ctx?.bessAssets?.[0]?.reportIntervalMinutes ?? 15);
  const configuredInterval = authoritativeInterval;

  const [chartSnapshots, setChartSnapshots] = useState<TelemetrySnapshotRow[]>([]);
  const [tableSnapshots, setTableSnapshots] = useState<TelemetrySnapshotRow[]>([]);
  const [tableTotal, setTableTotal] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 10;
  
  const [snapshotsLoading, setSnapshotsLoading] = useState(false);
  const [snapshotsError, setSnapshotsError] = useState<string | null>(null);
  const [summary, setSummary] = useState<{ chargeDifference: number | null; dischargeDifference: number | null } | null>(null);

  const [isExporting, setIsExporting] = useState(false);
  const tableContainerRef = useRef<HTMLDivElement>(null);
  const previousTableTop = useRef<number | null>(null);
  const tableRequestIdRef = useRef(0);

  const authoritativeHeaders = useMemo(
    () => getAuthoritativeReportsHeaders({ powerUnit: preferences.powerUnit, energyUnit: preferences.energyUnit }),
    [preferences.powerUnit, preferences.energyUnit]
  );

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
        if (!cancelled) {
          setCtx(resolved);
          if (resolved.bessAssets?.[0]?.reportIntervalMinutes) {
            setReportInterval(resolved.bessAssets[0].reportIntervalMinutes);
          }
        }
      } catch (err: any) {
        if (cancelled) return;
        if (err instanceof ClientAccessError || err instanceof NoSiteError || err instanceof NoBessError) {
          setCtxError({ type: 'empty', message: err.message });
        } else {
          setCtxError({ type: 'error', message: err.message || 'Failed to load report context.' });
        }
      } finally {
        if (!cancelled) setCtxLoading(false);
      }
    };

    resolve();
    return () => { cancelled = true; };
  }, [role, isPreviewing, previewClientId, retryCounter]);

  // Sync preset dates
  useEffect(() => {
    const today = new Date();
    if (dateRange === 'Today') {
      setStartDate(formatDateISO(today));
      setEndDate(formatDateISO(today));
    } else if (dateRange === 'Yesterday') {
      const yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1);
      setStartDate(formatDateISO(yesterday));
      setEndDate(formatDateISO(yesterday));
    } else if (dateRange === 'Last 7 Days') {
      const lastWeek = new Date(today);
      lastWeek.setDate(lastWeek.getDate() - 6);
      setStartDate(formatDateISO(lastWeek));
      setEndDate(formatDateISO(today));
    } else if (dateRange === 'Last 30 Days') {
      const lastMonth = new Date(today);
      lastMonth.setDate(lastMonth.getDate() - 29);
      setStartDate(formatDateISO(lastMonth));
      setEndDate(formatDateISO(today));
    }
    // Note: Do not reset currentPage here, rely on apply/fetch logic.
  }, [dateRange]);

  const fetchChartData = useCallback(async (start: Date, end: Date) => {
    if (!ctx) return;
    try {
      const snapData = await dashboardService.getTelemetrySnapshots(ctx.site.id, start, end, activeBessId ?? undefined, 5000, 0);
      setChartSnapshots(snapData.snapshots);
      setSummary(snapData.summary || null);
    } catch (err) {
      console.error('Failed to fetch chart telemetry', err);
      setChartSnapshots([]);
      setSummary(null);
    }
  }, [ctx, activeBessId]);

  const fetchTableData = useCallback(async (start: Date, end: Date, page: number) => {
    if (!ctx) return;
    const reqId = ++tableRequestIdRef.current;
    setSnapshotsLoading(true);
    setSnapshotsError(null);
    try {
      const offset = (page - 1) * pageSize;
      const snapData = await dashboardService.getDynamicReport(ctx.site.id, start, end, configuredInterval, activeBessId ?? undefined, pageSize, offset);
      if (reqId !== tableRequestIdRef.current) return;
      if (!activeBessId && snapData.intervalMinutes && snapData.intervalMinutes !== reportInterval) {
        setReportInterval(snapData.intervalMinutes);
      }
      setTableSnapshots(snapData.snapshots);
      setTableTotal(snapData.total);
      if (snapData.summary) {
        setSummary(snapData.summary);
      }
    } catch (err: any) {
      if (reqId !== tableRequestIdRef.current) return;
      setSnapshotsError(err.message || 'Failed to fetch table data.');
      setTableSnapshots([]);
      setTableTotal(0);
    } finally {
      if (reqId === tableRequestIdRef.current) {
        setSnapshotsLoading(false);
      }
    }
  }, [ctx, configuredInterval, reportInterval, activeBessId]);

  const handleApply = useCallback(() => {
    const start = buildBoundaryDates(startDate, false, ctx?.site?.timezone);
    const end = buildBoundaryDates(endDate, true, ctx?.site?.timezone);
    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      setSnapshotsError('Invalid date range');
      return;
    }
    setCurrentPage(1);
    fetchChartData(start, end);
    fetchTableData(start, end, 1);
  }, [startDate, endDate, fetchChartData, fetchTableData, ctx?.site?.timezone]);

  const handlePageChange = (newPage: number) => {
    if (tableContainerRef.current) {
      previousTableTop.current = tableContainerRef.current.getBoundingClientRect().top;
    }
    setCurrentPage(newPage);
    const start = buildBoundaryDates(startDate, false, ctx?.site?.timezone);
    const end = buildBoundaryDates(endDate, true, ctx?.site?.timezone);
    fetchTableData(start, end, newPage);
  };

  useLayoutEffect(() => {
    if (previousTableTop.current !== null && tableContainerRef.current) {
      const afterTop = tableContainerRef.current.getBoundingClientRect().top;
      const diff = afterTop - previousTableTop.current;
      if (diff !== 0) {
        window.scrollBy({ top: diff, behavior: 'auto' });
      }
      previousTableTop.current = null;
    }
  }, [tableSnapshots]);

  // Auto-fetch when context is ready and dates are valid (only for presets)
  // Also poll periodically if the selected end date includes today
  useEffect(() => {
    if (ctx && dateRange !== 'Custom Range') {
      handleApply();
    }

    // Determine if we need to poll (i.e. if endDate is today or in the future)
    const todayString = new Date().toISOString().split('T')[0];
    let intervalId: ReturnType<typeof setInterval> | null = null;
    
    if (ctx && endDate >= todayString) {
      intervalId = setInterval(() => {
        handleApply();
      }, 60000); // 1 minute interval for snapshots
    }

    return () => {
      if (intervalId) clearInterval(intervalId);
    };
  }, [ctx, dateRange, startDate, endDate, handleApply]); // dependencies cover all variables

  // Refresh immediately when active BESS selection changes (across all date range modes)
  const prevActiveBessIdRef = useRef<string | null>(selectedBessId);
  useEffect(() => {
    if (prevActiveBessIdRef.current !== selectedBessId) {
      prevActiveBessIdRef.current = selectedBessId;
      handleApply();
    }
  }, [selectedBessId, handleApply]);

  // Chart data (defensive aggregation by bucketTimestamp to guarantee 1 point per bucket and algebraic power / mean SOC)
  const chartData = useMemo(() => {
    if (!chartSnapshots || chartSnapshots.length === 0) return [];

    const map = new Map<number, {
      timestamp: number;
      gridValues: number[];
      bessValues: number[];
      socValues: number[];
      solarValues: number[];
    }>();

    for (const s of chartSnapshots) {
      const ts = new Date(s.bucketTimestamp).getTime();
      if (isNaN(ts)) continue;

      let entry = map.get(ts);
      if (!entry) {
        entry = {
          timestamp: ts,
          gridValues: [],
          bessValues: [],
          socValues: [],
          solarValues: []
        };
        map.set(ts, entry);
      }

      if (typeof s.gridSideLoad === 'number' && !isNaN(s.gridSideLoad)) {
        entry.gridValues.push(s.gridSideLoad);
      }
      if (typeof s.pcsActivePower === 'number' && !isNaN(s.pcsActivePower)) {
        entry.bessValues.push(s.pcsActivePower);
      }
      if (typeof s.soc === 'number' && !isNaN(s.soc)) {
        entry.socValues.push(s.soc);
      }
      if (typeof s.solarPower === 'number' && !isNaN(s.solarPower)) {
        entry.solarValues.push(s.solarPower);
      }
    }

    const sortedTimestamps = Array.from(map.keys()).sort((a, b) => a - b);

    const pts = sortedTimestamps.map(ts => {
      const entry = map.get(ts)!;
      return {
        timestamp: ts,
        // Grid: site-level value (authoritative value, never summed or averaged across assets)
        grid: entry.gridValues.length > 0 ? entry.gridValues[0] : undefined,
        // BESS active power: algebraic sum across valid reporting assets
        bess: entry.bessValues.length > 0 ? entry.bessValues.reduce((a, b) => a + b, 0) : undefined,
        // SOC: arithmetic mean across valid reporting assets
        soc: entry.socValues.length > 0 ? entry.socValues.reduce((a, b) => a + b, 0) / entry.socValues.length : undefined,
        // Solar power: site-level value (authoritative value, never summed or averaged across assets)
        solar: entry.solarValues.length > 0 ? entry.solarValues[0] : undefined,
      };
    });

    if (pts.length > 1000) {
      const step = Math.ceil(pts.length / 1000);
      return pts.filter((_, i) => i % step === 0);
    }
    return pts;
  }, [chartSnapshots]);

  const handleExport = async () => {
    if (!ctx) return;
    
    const start = buildBoundaryDates(startDate, false, ctx?.site?.timezone);
    const end = buildBoundaryDates(endDate, true, ctx?.site?.timezone);
    if (isNaN(start.getTime()) || isNaN(end.getTime())) return;

    try {
      setIsExporting(true);
      
      const { blob, filename, isXlsx } = await dashboardService.exportDynamicReport(
        ctx.site.id,
        start,
        end,
        configuredInterval,
        activeBessId ?? undefined,
        { powerUnit: preferences.powerUnit, energyUnit: preferences.energyUnit }
      );

      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      
      const rangeSuffix = `${startDate}_to_${endDate}`;
      const defaultFilename = activeBessId && selectedBess
        ? `EMS_Report_${selectedBess.name.toLowerCase().replace(/[^a-z0-9_-]+/g, '-')}_${rangeSuffix}.csv`
        : `EMS_Report_${rangeSuffix}.${isXlsx ? 'xlsx' : 'csv'}`;
      link.setAttribute("download", filename || defaultFilename);
      
      document.body.appendChild(link);
      link.click();
      
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch (error: any) {
      console.error('Export failed:', error);
      alert(error.message || 'Failed to export report. Please try again.');
    } finally {
      setIsExporting(false);
    }
  };

  // UI States
  if (ctxLoading) {
    return (
      <div className="space-y-6 pb-6 animate-pulse p-4">
        <div className="h-10 bg-slate-100 rounded-lg w-72" />
        <div className="h-[400px] bg-slate-100 rounded-xl" />
      </div>
    );
  }

  if (ctxError) {
    if (ctxError.type === 'empty') {
      return (
        <div className="flex flex-col items-center justify-center min-h-[60vh] text-center px-4">
          <AlertCircle className="w-12 h-12 text-slate-400 mb-4" />
          <h1 className="text-2xl font-bold text-slate-900 mb-2">Reports Unavailable</h1>
          <p className="text-slate-500 max-w-md">{ctxError.message}</p>
        </div>
      );
    }
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center px-4">
        <AlertCircle className="w-12 h-12 text-rose-500 mb-4" />
        <h1 className="text-2xl font-bold text-slate-900 mb-2">Unable to Load Reports Context</h1>
        <p className="text-slate-500 max-w-md mb-6">{ctxError.message}</p>
        <button onClick={() => setRetryCounter(c => c + 1)} className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-slate-900 text-white text-sm font-medium hover:bg-slate-700 transition-colors">
          <RefreshCw className="w-4 h-4" /> Retry
        </button>
      </div>
    );
  }

  if (!ctx) {
    return null;
  }

  const isExcelExport = isMultiBess && activeBessId === null;

  return (
    <div className="space-y-6 pb-6">
      {/* Top Header Row with Title, Context-Aware Subtitle, and BESS View Selector */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-3">
            <FileText className="w-6 h-6 text-primary-600" /> Historical Reports
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

        {isMultiBess && (
          <BessViewSelector
            bessAssets={ctx.bessAssets}
            selectedBessId={activeBessId}
            onSelect={(bessId) => {
              setSelectedBessId(bessId);
              setCurrentPage(1);
            }}
          />
        )}
      </div>

      {/* Filter and Export Toolbar */}
      <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2 bg-white px-3 py-2 rounded-lg border border-slate-200 shadow-sm">
            <Calendar className="w-4 h-4 text-slate-400" />
            <select 
              className="bg-transparent border-none text-sm font-medium text-slate-700 focus:ring-0 cursor-pointer outline-none"
              value={dateRange}
              onChange={(e) => setDateRange(e.target.value)}
            >
              <option value="Today">Today</option>
              <option value="Yesterday">Yesterday</option>
              <option value="Last 7 Days">Last 7 Days</option>
              <option value="Last 30 Days">Last 30 Days</option>
              <option value="Custom Range">Custom Range</option>
            </select>
          </div>
          
          {dateRange === 'Custom Range' && (
            <>
              <div className="flex items-center gap-2 bg-white px-3 py-2 rounded-lg border border-slate-200 shadow-sm">
                <span className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">Start Date</span>
                <input 
                  type="date" 
                  className="bg-transparent border-none text-sm font-medium text-slate-700 focus:ring-0 outline-none p-0 cursor-pointer"
                  value={startDate}
                  max={endDate || undefined}
                  onChange={(e) => setStartDate(e.target.value)}
                />
              </div>
              <div className="flex items-center gap-2 bg-white px-3 py-2 rounded-lg border border-slate-200 shadow-sm">
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
                onClick={handleApply}
                className="flex items-center gap-2 bg-slate-900 hover:bg-slate-800 text-white px-4 py-2 rounded-lg font-medium text-sm transition-colors shadow-sm"
              >
                Apply
              </button>
            </>
          )}

          <div className="flex items-center gap-2 bg-white px-3 py-2 rounded-lg border border-slate-200 shadow-sm" title="Reporting interval configured by Administrator">
            <span className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">Interval</span>
            <span className="text-sm font-semibold text-slate-700 bg-slate-100 px-2 py-0.5 rounded text-xs">
              {authoritativeInterval !== null ? `${authoritativeInterval} min` : '...'}
            </span>
          </div>

          <button 
            onClick={handleExport}
            disabled={tableTotal === 0 || isExporting}
            className="flex items-center gap-2 bg-primary-600 hover:bg-primary-700 text-white px-4 py-2 rounded-lg font-medium text-sm transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isExporting ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
            {isExporting ? 'Exporting...' : (isExcelExport ? 'Export Excel' : 'Export CSV')}
          </button>
        </div>

        {summary && (() => {
          const chargeDiffFmt = formatEnergy(summary.chargeDifference);
          const dischargeDiffFmt = formatEnergy(summary.dischargeDifference);
          return (
            <div className="flex items-center gap-6 bg-slate-50 border border-slate-200 rounded-lg px-4 py-3 shadow-sm">
              <div className="flex flex-col">
                <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Total Charge Difference</span>
                <span className="text-sm font-medium text-slate-900">{chargeDiffFmt.displayValue} {chargeDiffFmt.unit}</span>
              </div>
              <div className="w-px h-8 bg-slate-200"></div>
              <div className="flex flex-col">
                <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Total Discharge Difference</span>
                <span className="text-sm font-medium text-slate-900">{dischargeDiffFmt.displayValue} {dischargeDiffFmt.unit}</span>
              </div>
            </div>
          );
        })()}
      </div>

      {snapshotsLoading ? (
        <div className="h-[450px] bg-slate-100 rounded-xl animate-pulse" />
      ) : snapshotsError ? (
        <div className="bg-rose-50 border border-rose-200 rounded-xl p-6 text-center h-[450px] flex flex-col justify-center items-center">
          <AlertCircle className="w-8 h-8 text-rose-500 mb-2" />
          <h3 className="text-rose-900 font-semibold mb-1">Error Loading Data</h3>
          <p className="text-sm text-rose-700">{snapshotsError}</p>
        </div>
      ) : (
        <>
          <div className="h-[450px]">
            <PowerTrendChart 
              data={chartData} 
              title="Historical Power Trend"
              description="15-minute aggregated power flow across the selected date range."
              domain={[
                buildBoundaryDates(startDate, false, ctx?.site?.timezone).getTime(),
                buildBoundaryDates(endDate, true, ctx?.site?.timezone).getTime()
              ]}
              powerUnit={preferences.powerUnit}
              timeFormat={preferences.timeFormat}
              dateFormat={preferences.dateFormat}
              timeZone={resolvedTimezone}
            />
          </div>

          <div ref={tableContainerRef} className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden mt-6">
            <div className="px-6 py-4 border-b border-slate-200 bg-slate-50 flex justify-between items-center">
              <h3 className="text-lg font-semibold text-slate-900">Telemetry Data Table</h3>
              <span className="text-xs font-medium text-slate-500">{tableTotal} records</span>
            </div>
            
            {snapshotsLoading && tableSnapshots.length === 0 ? (
              <div className="p-12 text-center">
                 <div className="inline-block animate-spin w-6 h-6 border-2 border-primary-600 border-t-transparent rounded-full mb-2"></div>
                 <p className="text-slate-500">Loading snapshots...</p>
              </div>
            ) : tableSnapshots.length === 0 ? (
              <div className="p-12 text-center text-slate-500">
                No telemetry data available
              </div>
            ) : (
              <div className="relative">
                {snapshotsLoading && (
                  <div className="absolute inset-0 bg-white/50 backdrop-blur-[1px] z-20 flex items-center justify-center">
                    <div className="inline-block animate-spin w-8 h-8 border-4 border-primary-600 border-t-transparent rounded-full"></div>
                  </div>
                )}
                <div className="overflow-x-auto max-h-[500px]">
                  <table className="w-full text-left border-collapse">
                    <thead className="sticky top-0 bg-white shadow-sm z-10">
                      <tr className="bg-slate-50 border-b border-slate-200 text-xs uppercase tracking-wider text-slate-500 whitespace-nowrap">
                        {authoritativeHeaders.map((header) => (
                          <th key={header} className="px-6 py-3 font-medium min-w-[140px]">
                            {header}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {tableSnapshots.map((pt, rowIdx) => (
                        <tr key={pt.id || `${pt.bessAssetId}-${pt.bucketTimestamp}-${rowIdx}`} className="hover:bg-slate-50 transition-colors whitespace-nowrap">
                          {/* 1. Timestamp */}
                          <td className="px-6 py-3 text-sm font-medium text-slate-900">
                            {formatTimestamp(pt.bucketTimestamp, ctx?.site?.timezone)}
                          </td>
                          {/* 2. BESS Name */}
                          <td className="px-6 py-3 text-sm text-slate-900">
                            {ctx?.bessAssets.find(b => b.id === pt.bessAssetId)?.name || pt.bessName || 'Unknown BESS'}
                          </td>
                          {/* 3. EMU Serial No. */}
                          <td className="px-6 py-3 text-sm text-slate-600">{pt.emuId || '--'}</td>
                          {/* 4. Grid Side Load (kW/MW) */}
                          <td className="px-6 py-3 text-sm text-slate-600">{formatPowerValue(pt.gridSideLoad, preferences.powerUnit)}</td>
                          {/* 5. Grid Frequency (Hz) */}
                          <td className="px-6 py-3 text-sm text-slate-600">{formatValue(pt.gridFrequency, 2)}</td>
                          {/* 6. Grid Power Factor */}
                          <td className="px-6 py-3 text-sm text-slate-600">{formatValue(pt.powerFactor, 2)}</td>
                          {/* 7. BESS Frequency (Hz) */}
                          <td className="px-6 py-3 text-sm text-slate-600">{formatValue(pt.bessFrequency, 2)}</td>
                          {/* 8. BESS Power Factor */}
                          <td className="px-6 py-3 text-sm text-slate-600">{formatValue(pt.bessPowerFactor, 2)}</td>
                          {/* 9. PCS Active Power (kW/MW) */}
                          <td className="px-6 py-3 text-sm text-slate-600">{formatPowerValue(pt.pcsActivePower, preferences.powerUnit)}</td>
                          {/* 10. PCS Temperature (°C) */}
                          <td className="px-6 py-3 text-sm text-slate-600">{formatValue(pt.pcsTemperature, 1)}</td>
                          {/* 11. Line Voltage (V) */}
                          <td className="px-6 py-3 text-sm text-slate-600">{formatValue(pt.pcsLineVoltage, 1)}</td>
                          {/* 12. AC Current (A) */}
                          <td className="px-6 py-3 text-sm text-slate-600">{formatValue(pt.pcsAcCurrent, 1)}</td>
                          {/* 13. Operating Mode */}
                          <td className="px-6 py-3 text-sm text-slate-600">{formatTmsMode(pt.tmsOperatingMode) || '--'}</td>
                          {/* 14. Ambient Temperature (°C) */}
                          <td className="px-6 py-3 text-sm text-slate-600">{formatValue(pt.tmsAmbientTemp, 1)}</td>
                          {/* 15. Battery Coolant Return Temperature (°C) */}
                          <td className="px-6 py-3 text-sm text-slate-600">{formatValue(pt.tmsCoolantReturnTemp, 1)}</td>
                          {/* 16. Battery Coolant Inlet Temperature (°C) */}
                          <td className="px-6 py-3 text-sm text-slate-600">{formatValue(pt.tmsCoolantInletTemp, 1)}</td>
                          {/* 17. Coolant Return Pressure (bar) */}
                          <td className="px-6 py-3 text-sm text-slate-600">{formatValue(pt.tmsCoolantReturnPressure, 2)}</td>
                          {/* 18. Coolant Inlet Pressure (bar) */}
                          <td className="px-6 py-3 text-sm text-slate-600">{formatValue(pt.tmsCoolantInletPressure, 2)}</td>
                          {/* 19. SOC (%) */}
                          <td className="px-6 py-3 text-sm text-slate-600">{formatValue(pt.soc, 1)}</td>
                          {/* 20. SOH (%) */}
                          <td className="px-6 py-3 text-sm text-slate-600">{formatValue(pt.soh, 1)}</td>
                          {/* 21. BMS Current (A) */}
                          <td className="px-6 py-3 text-sm text-slate-600">{formatValue(pt.bmsCurrent, 1)}</td>
                          {/* 22. BMS DC Voltage (V) */}
                          <td className="px-6 py-3 text-sm text-slate-600">{formatValue(pt.bmsDcVoltage, 1)}</td>
                          {/* 23. Cabinet State */}
                          <td className="px-6 py-3 text-sm text-slate-600">{formatCabinetState(pt.bmsCabinetState) || '--'}</td>
                          {/* 24. Cell V Max (V) */}
                          <td className="px-6 py-3 text-sm text-slate-600">{formatValue(pt.cellVMax, 3)}</td>
                          {/* 25. Cell V Min (V) */}
                          <td className="px-6 py-3 text-sm text-slate-600">{formatValue(pt.cellVMin, 3)}</td>
                          {/* 26. Cell Temp Max (°C) */}
                          <td className="px-6 py-3 text-sm text-slate-600">{formatValue(pt.cellTempMax, 1)}</td>
                          {/* 27. Cell Temp Min (°C) */}
                          <td className="px-6 py-3 text-sm text-slate-600">{formatValue(pt.cellTempMin, 1)}</td>
                          {/* 28. Battery Ambient Temperature (°C) */}
                          <td className="px-6 py-3 text-sm text-slate-600">{formatValue(pt.batteryAmbientTemp, 1)}</td>
                          {/* 29. Pack 01 Average Temperature (°C) */}
                          <td className="px-6 py-3 text-sm text-slate-600">{formatValue(pt.pack01AvgTemp, 1)}</td>
                          {/* 30. Pack 01 Maximum Temperature (°C) */}
                          <td className="px-6 py-3 text-sm text-slate-600">{formatValue(pt.pack01MaxTemp, 1)}</td>
                          {/* 31. Pack 02 Average Temperature (°C) */}
                          <td className="px-6 py-3 text-sm text-slate-600">{formatValue(pt.pack02AvgTemp, 1)}</td>
                          {/* 32. Pack 02 Maximum Temperature (°C) */}
                          <td className="px-6 py-3 text-sm text-slate-600">{formatValue(pt.pack02MaxTemp, 1)}</td>
                          {/* 33. Pack 03 Average Temperature (°C) */}
                          <td className="px-6 py-3 text-sm text-slate-600">{formatValue(pt.pack03AvgTemp, 1)}</td>
                          {/* 34. Pack 03 Maximum Temperature (°C) */}
                          <td className="px-6 py-3 text-sm text-slate-600">{formatValue(pt.pack03MaxTemp, 1)}</td>
                          {/* 35. Pack 04 Average Temperature (°C) */}
                          <td className="px-6 py-3 text-sm text-slate-600">{formatValue(pt.pack04AvgTemp, 1)}</td>
                          {/* 36. Pack 04 Maximum Temperature (°C) */}
                          <td className="px-6 py-3 text-sm text-slate-600">{formatValue(pt.pack04MaxTemp, 1)}</td>
                          {/* 37. Pack 05 Average Temperature (°C) */}
                          <td className="px-6 py-3 text-sm text-slate-600">{formatValue(pt.pack05AvgTemp, 1)}</td>
                          {/* 38. Pack 05 Maximum Temperature (°C) */}
                          <td className="px-6 py-3 text-sm text-slate-600">{formatValue(pt.pack05MaxTemp, 1)}</td>
                          {/* 39. Today Charge Energy (kWh/MWh) */}
                          <td className="px-6 py-3 text-sm text-slate-600">{formatEnergyValue(pt.todayChargeEnergy, preferences.energyUnit)}</td>
                          {/* 40. Today Discharge Energy (kWh/MWh) */}
                          <td className="px-6 py-3 text-sm text-slate-600">{formatEnergyValue(pt.todayDischargeEnergy, preferences.energyUnit)}</td>
                          {/* 41. Accum Charge Energy (kWh/MWh) */}
                          <td className="px-6 py-3 text-sm text-slate-600">{formatEnergyValue(pt.accumChargeEnergy, preferences.energyUnit)}</td>
                          {/* 42. Accum Discharge Energy (kWh/MWh) */}
                          <td className="px-6 py-3 text-sm text-slate-600">{formatEnergyValue(pt.accumDischargeEnergy, preferences.energyUnit)}</td>
                          {/* 43. Solar Power (kW/MW) */}
                          <td className="px-6 py-3 text-sm text-slate-600">{formatPowerValue(pt.solarPower, preferences.powerUnit)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
             </div>
            )}

            {tableTotal > 0 && (
              <div className={`px-6 py-4 border-t border-slate-200 bg-slate-50 flex flex-wrap items-center justify-between gap-4 transition-opacity ${snapshotsLoading ? 'opacity-50 pointer-events-none' : ''}`}>
                <span className="text-sm text-slate-500">
                  Showing {((currentPage - 1) * pageSize) + 1} to {Math.min(currentPage * pageSize, tableTotal)} of {tableTotal} records
                </span>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    disabled={currentPage === 1}
                    onClick={() => handlePageChange(currentPage - 1)}
                    className="px-3 py-1.5 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Previous
                  </button>
                  
                  {(() => {
                    const totalPages = Math.ceil(tableTotal / pageSize);
                    const buttons = [];
                    const maxButtons = 5;
                    
                    let startPage = Math.max(1, currentPage - 2);
                    let endPage = Math.min(totalPages, startPage + maxButtons - 1);
                    
                    if (endPage - startPage + 1 < maxButtons) {
                      startPage = Math.max(1, endPage - maxButtons + 1);
                    }

                    for (let i = startPage; i <= endPage; i++) {
                      buttons.push(
                        <button
                          key={i}
                          type="button"
                          onClick={() => handlePageChange(i)}
                          className={`min-w-[32px] px-2 py-1.5 text-sm font-medium rounded-lg border ${
                            currentPage === i
                              ? 'bg-slate-900 text-white border-slate-900'
                              : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
                          }`}
                        >
                          {i}
                        </button>
                      );
                    }
                    
                    return (
                      <>
                        {startPage > 1 && (
                          <>
                            <button type="button" onClick={() => handlePageChange(1)} className="min-w-[32px] px-2 py-1.5 text-sm font-medium bg-white text-slate-700 border border-slate-300 rounded-lg hover:bg-slate-50">1</button>
                            {startPage > 2 && <span className="px-1 text-slate-400">...</span>}
                          </>
                        )}
                        {buttons}
                        {endPage < totalPages && (
                          <>
                            {endPage < totalPages - 1 && <span className="px-1 text-slate-400">...</span>}
                            <button type="button" onClick={() => handlePageChange(totalPages)} className="min-w-[32px] px-2 py-1.5 text-sm font-medium bg-white text-slate-700 border border-slate-300 rounded-lg hover:bg-slate-50">{totalPages}</button>
                          </>
                        )}
                      </>
                    );
                  })()}

                  <button
                    type="button"
                    disabled={currentPage >= Math.ceil(tableTotal / pageSize)}
                    onClick={() => handlePageChange(currentPage + 1)}
                    className="px-3 py-1.5 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

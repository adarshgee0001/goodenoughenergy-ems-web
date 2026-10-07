import { useState, useEffect, useMemo, useCallback, useRef, useLayoutEffect } from 'react';
import { Download, FileText, Calendar, AlertCircle, RefreshCw } from 'lucide-react';
import { PowerTrendChart } from './components/PowerTrendChart';
import type { TelemetrySnapshotRow, DashboardContext } from '../../features/dashboard/dashboard.types';
import { dashboardService, ClientAccessError, NoSiteError, NoBessError } from '../../features/dashboard/dashboard.service';
import { useAuth } from '../../hooks/useAuth';
import { usePreview } from '../../context/PreviewContext';

function formatValue(v: number | undefined | null, decimals = 1): string {
  return v !== undefined && v !== null ? v.toFixed(decimals) : '--';
}

function formatDateISO(date: Date) {
  return date.toISOString().split('T')[0];
}

function formatTimestamp(isoString: string) {
  const d = new Date(isoString);
  const day = d.getDate();
  const month = d.toLocaleString('en-US', { month: 'long' });
  const year = d.getFullYear();
  let hours = d.getHours();
  const minutes = d.getMinutes().toString().padStart(2, '0');
  const seconds = d.getSeconds().toString().padStart(2, '0');
  const ampm = hours >= 12 ? 'PM' : 'AM';
  hours = hours % 12;
  hours = hours ? hours : 12; // the hour '0' should be '12'
  const strTime = hours.toString().padStart(2, '0') + ':' + minutes + ':' + seconds + ' ' + ampm;
  return `${day} ${month} ${year}, ${strTime}`;
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
  } catch(e) {
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

  const [dateRange, setDateRange] = useState('Today');
  const [startDate, setStartDate] = useState(formatDateISO(new Date()));
  const [endDate, setEndDate] = useState(formatDateISO(new Date()));
  const [intervalMinutes, setIntervalMinutes] = useState<number>(15);

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
    }
    // Note: Do not reset currentPage here, rely on apply/fetch logic.
  }, [dateRange]);

  const fetchChartData = useCallback(async (start: Date, end: Date) => {
    if (!ctx) return;
    try {
      const snapData = await dashboardService.getTelemetrySnapshots(ctx.site.id, start, end, undefined, 1000, 0);
      setChartSnapshots(snapData.snapshots);
      setSummary(snapData.summary || null);
    } catch (err) {
      console.error('Failed to fetch chart telemetry', err);
      setChartSnapshots([]);
      setSummary(null);
    }
  }, [ctx]);

  const fetchTableData = useCallback(async (start: Date, end: Date, page: number) => {
    if (!ctx) return;
    setSnapshotsLoading(true);
    setSnapshotsError(null);
    try {
      const offset = (page - 1) * pageSize;
      const snapData = await dashboardService.getDynamicReport(ctx.site.id, start, end, intervalMinutes, undefined, pageSize, offset);
      setTableSnapshots(snapData.snapshots);
      setTableTotal(snapData.total);
    } catch (err: any) {
      setSnapshotsError(err.message || 'Failed to fetch table data.');
      setTableSnapshots([]);
      setTableTotal(0);
    } finally {
      setSnapshotsLoading(false);
    }
  }, [ctx, intervalMinutes]);

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

  // Chart data (downsampled if > 1000 points)
  const chartData = useMemo(() => {
    const pts = chartSnapshots.map(s => ({
      timestamp: new Date(s.bucketTimestamp).getTime(),
      grid: s.gridSideLoad ?? undefined,
      bess: s.pcsActivePower ?? undefined,
      soc: s.soc ?? undefined,
      solar: s.solarPower ?? undefined,
    }));
    if (pts.length > 1000) {
      const step = Math.ceil(pts.length / 1000);
      return pts.filter((_, i) => i % step === 0);
    }
    return pts;
  }, [chartSnapshots]);

  const handleExportExcel = async () => {
    if (!ctx) return;
    
    const start = new Date(`${startDate}T00:00:00.000Z`);
    const end = new Date(`${endDate}T23:59:59.999Z`);
    if (isNaN(start.getTime()) || isNaN(end.getTime())) return;

    try {
      setIsExporting(true);
      
      const blob = await dashboardService.exportDynamicReport(
        ctx.site.id,
        start,
        end,
        intervalMinutes
      );

      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      
      const rangeSuffix = `${startDate}_to_${endDate}`;
      link.setAttribute("download", `EMS_Report_${rangeSuffix}.xlsx`);
      
      document.body.appendChild(link);
      link.click();
      
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch (error: any) {
      console.error('Excel Export failed:', error);
      alert(error.message || 'Failed to export Excel. Please try again.');
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

  return (
    <div className="space-y-6 pb-6">
      <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-3">
            <FileText className="w-6 h-6 text-primary-600" /> Historical Reports
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Analyze historical telemetry and generate exports
          </p>
        </div>
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-3 justify-end">
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

            <div className="flex items-center gap-2 bg-white px-3 py-2 rounded-lg border border-slate-200 shadow-sm">
              <span className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">Interval</span>
              <select
                className="bg-transparent border-none text-sm font-medium text-slate-700 focus:ring-0 cursor-pointer outline-none p-0"
                value={intervalMinutes}
                onChange={(e) => {
                  const newInterval = Number(e.target.value);
                  setIntervalMinutes(newInterval);
                  const start = new Date(`${startDate}T00:00:00.000Z`);
                  const end = new Date(`${endDate}T23:59:59.999Z`);
                  if (!isNaN(start.getTime()) && !isNaN(end.getTime())) {
                    setCurrentPage(1);
                    // We must bypass fetchTableData's old closure or just rely on the next render.
                    // Actually, setting state and fetching here might use old state if fetchTableData
                    // reads intervalMinutes from state. Let's just pass the interval to fetchTableData.
                  }
                }}
              >
                {[...Array(20)].map((_, i) => (
                  <option key={i + 1} value={i + 1}>{i + 1} min</option>
                ))}
              </select>
            </div>

            <button 
              onClick={handleExportExcel}
              disabled={tableTotal === 0 || isExporting}
              className="flex items-center gap-2 bg-primary-600 hover:bg-primary-700 text-white px-4 py-2 rounded-lg font-medium text-sm transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isExporting ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
              {isExporting ? 'Exporting...' : 'Export Excel'}
            </button>
          </div>
          {summary && (
            <div className="flex items-center gap-6 bg-slate-50 border border-slate-200 rounded-lg px-4 py-3 self-end shadow-sm">
              <div className="flex flex-col">
                <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Total Charge Difference</span>
                <span className="text-sm font-medium text-slate-900">{formatValue(summary.chargeDifference)} kWh</span>
              </div>
              <div className="w-px h-8 bg-slate-200"></div>
              <div className="flex flex-col">
                <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Total Discharge Difference</span>
                <span className="text-sm font-medium text-slate-900">{formatValue(summary.dischargeDifference)} kWh</span>
              </div>
            </div>
          )}
        </div>
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
              description="Analyzed telemetry based on the selected date range."
              domain={[
                new Date(`${startDate}T00:00:00.000Z`).getTime(),
                new Date(`${endDate}T23:59:59.999Z`).getTime()
              ]}
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
                    <tr className="bg-slate-50 border-b border-slate-200 text-xs uppercase tracking-wider text-slate-500">
                      <th className="px-6 py-3 font-medium min-w-[150px]">Time</th>
                      <th className="px-6 py-3 font-medium min-w-[150px]">BESS Asset</th>
                      <th className="px-6 py-3 font-medium min-w-[150px]">EMU Serial No.</th>
                      <th className="px-6 py-3 font-medium min-w-[170px]">Grid Side Load (kW)</th>
                      <th className="px-6 py-3 font-medium min-w-[170px]">Grid Frequency (Hz)</th>
                      <th className="px-6 py-3 font-medium min-w-[150px]">Grid Power Factor</th>
                      <th className="px-6 py-3 font-medium min-w-[150px]">Cabinet Meter Power (kW)</th>
                      <th className="px-6 py-3 font-medium min-w-[130px]">Cabinet Voltage A (V)</th>
                      <th className="px-6 py-3 font-medium min-w-[130px]">Cabinet Voltage B (V)</th>
                      <th className="px-6 py-3 font-medium min-w-[130px]">Cabinet Voltage C (V)</th>
                      <th className="px-6 py-3 font-medium min-w-[130px]">Cabinet Current A (A)</th>
                      <th className="px-6 py-3 font-medium min-w-[130px]">Cabinet Current B (A)</th>
                      <th className="px-6 py-3 font-medium min-w-[130px]">Cabinet Current C (A)</th>
                      <th className="px-6 py-3 font-medium min-w-[170px]">BESS Frequency (Hz)</th>
                      <th className="px-6 py-3 font-medium min-w-[150px]">BESS Power Factor</th>
                      <th className="px-6 py-3 font-medium min-w-[170px]">PCS Active Power (kW)</th>
                      <th className="px-6 py-3 font-medium min-w-[130px]">DC Voltage (V)</th>
                      <th className="px-6 py-3 font-medium min-w-[150px]">PCS Temperature (°C)</th>
                      <th className="px-6 py-3 font-medium min-w-[100px]">SOC (%)</th>
                      <th className="px-6 py-3 font-medium min-w-[100px]">SOH (%)</th>
                      <th className="px-6 py-3 font-medium min-w-[150px]">BMS Current (A)</th>
                      <th className="px-6 py-3 font-medium min-w-[130px]">Cell V Max (V)</th>
                      <th className="px-6 py-3 font-medium min-w-[130px]">Cell V Min (V)</th>
                      <th className="px-6 py-3 font-medium min-w-[160px]">Cell Temp Max (°C)</th>
                      <th className="px-6 py-3 font-medium min-w-[200px]">Today Charge Energy (kWh)</th>
                      <th className="px-6 py-3 font-medium min-w-[200px]">Today Discharge Energy (kWh)</th>
                      <th className="px-6 py-3 font-medium min-w-[200px]">Accum Charge Energy (kWh)</th>
                      <th className="px-6 py-3 font-medium min-w-[200px]">Accum Discharge Energy (kWh)</th>
                      <th className="px-6 py-3 font-medium min-w-[120px]">Solar Power (kW)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {tableSnapshots.map((pt) => (
                      <tr key={pt.id} className="hover:bg-slate-50 transition-colors">
                        <td className="px-6 py-3 text-sm font-medium text-slate-900 whitespace-nowrap">
                          {formatTimestamp(pt.bucketTimestamp)}
                        </td>
                        <td className="px-6 py-3 text-sm text-slate-900 whitespace-nowrap">
                          {ctx?.bessAssets.find(b => b.id === pt.bessAssetId)?.name || 'Unknown BESS'}
                        </td>
                        <td className="px-6 py-3 text-sm text-slate-600">{pt.emuId || '--'}</td>
                        <td className="px-6 py-3 text-sm text-slate-600">{formatValue(pt.gridSideLoad)}</td>
                        <td className="px-6 py-3 text-sm text-slate-600">{formatValue(pt.gridFrequency, 2)}</td>
                        <td className="px-6 py-3 text-sm text-slate-600">{formatValue(pt.powerFactor, 2)}</td>
                        <td className="px-6 py-3 text-sm text-slate-600">{formatValue(pt.totalPower)}</td>
                        <td className="px-6 py-3 text-sm text-slate-600">{formatValue(pt.voltageA)}</td>
                        <td className="px-6 py-3 text-sm text-slate-600">{formatValue(pt.voltageB)}</td>
                        <td className="px-6 py-3 text-sm text-slate-600">{formatValue(pt.voltageC)}</td>
                        <td className="px-6 py-3 text-sm text-slate-600">{formatValue(pt.currentA)}</td>
                        <td className="px-6 py-3 text-sm text-slate-600">{formatValue(pt.currentB)}</td>
                        <td className="px-6 py-3 text-sm text-slate-600">{formatValue(pt.currentC)}</td>
                        <td className="px-6 py-3 text-sm text-slate-600">{formatValue(pt.bessFrequency, 2)}</td>
                        <td className="px-6 py-3 text-sm text-slate-600">{formatValue(pt.bessPowerFactor, 2)}</td>
                        <td className="px-6 py-3 text-sm text-slate-600">{formatValue(pt.pcsActivePower)}</td>
                        <td className="px-6 py-3 text-sm text-slate-600">{formatValue(pt.dcVoltage)}</td>
                        <td className="px-6 py-3 text-sm text-slate-600">{formatValue(pt.ambientTemp)}</td>
                        <td className="px-6 py-3 text-sm text-slate-600">{formatValue(pt.soc)}</td>
                        <td className="px-6 py-3 text-sm text-slate-600">{formatValue(pt.soh)}</td>
                        <td className="px-6 py-3 text-sm text-slate-600">{formatValue(pt.bmsCurrent)}</td>
                        <td className="px-6 py-3 text-sm text-slate-600">{formatValue(pt.cellVMax)}</td>
                        <td className="px-6 py-3 text-sm text-slate-600">{formatValue(pt.cellVMin)}</td>
                        <td className="px-6 py-3 text-sm text-slate-600">{formatValue(pt.cellTempMax)}</td>
                        <td className="px-6 py-3 text-sm text-slate-600">{formatValue(pt.todayChargeEnergy)}</td>
                        <td className="px-6 py-3 text-sm text-slate-600">{formatValue(pt.todayDischargeEnergy)}</td>
                        <td className="px-6 py-3 text-sm text-slate-600">{formatValue(pt.accumChargeEnergy)}</td>
                        <td className="px-6 py-3 text-sm text-slate-600">{formatValue(pt.accumDischargeEnergy)}</td>
                        <td className="px-6 py-3 text-sm text-slate-600">{formatValue(pt.solarPower)}</td>
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

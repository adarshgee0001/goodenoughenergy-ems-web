import { API_BASE } from '../../../utils/apiClient';
import React, { useState, useEffect } from 'react';
import { dashboardService } from '../../../features/dashboard/dashboard.service';
import type { GridStateTrendPoint } from '../../../features/dashboard/dashboard.types';
import { ResponsiveContainer, LineChart, CartesianGrid, XAxis, YAxis, Tooltip, Line, Legend, ReferenceArea } from 'recharts';
import { Loader2, Download } from 'lucide-react';
import { useParams } from 'react-router-dom';
import { useLiveTelemetry } from '../../../context/WebSocketContext';
import { useUserSettings } from '../../../features/settings/hooks/useUserSettings';
import { formatDateTimeCustom, formatTimeCustom } from '../../../features/settings/settings.utils';
import type { TimeFormat, DateFormat } from '../../../features/settings/settings.types';

export interface GridStateTrendSectionProps {
  assetId: string;
  timeFormat?: TimeFormat;
  dateFormat?: DateFormat;
  timeZone?: string;
}

export function formatGridStateTrendTick(
  timestamp: string | number | Date | null | undefined,
  timeFormat: TimeFormat = '12h',
  timeZone?: string
): string {
  if (!timestamp) return '';
  return formatTimeCustom(timestamp, timeFormat, false, timeZone);
}

export function formatGridStateTrendTooltipTimestamp(
  timestamp: string | number | Date | null | undefined,
  dateFormat: DateFormat = 'DD MMM YYYY',
  timeFormat: TimeFormat = '12h',
  timeZone?: string
): string {
  return formatDateTimeCustom(timestamp, dateFormat, timeFormat, false, timeZone);
}

export type GridOperatingState = 'GRID' | 'BESS' | null;

export interface ProcessedGridTrendPoint {
  index: number;
  timestamp: string;
  grid: number | null; // 1 when Grid is active, 0 when Grid is inactive, null when unconfirmed
  bess: number | null; // 1 when BESS is active, 0 when BESS is inactive, null when unconfirmed
  operatingState: GridOperatingState;
  rawGridOnState: number | null;
  rawGridOffState: number | null;
  isDuplicateTime?: boolean;
}

export function interpretGridState(
  gridOnState: number | null | undefined,
  gridOffState: number | null | undefined
): { grid: number | null; bess: number | null; operatingState: GridOperatingState } {
  // Authoritative verified semantics from PCS digital inputs:
  // Grid active: gridOnState === 1 && gridOffState !== 1 -> Grid = 1, BESS = 0
  // BESS active: gridOnState === 0 && gridOffState === 1 -> Grid = 0, BESS = 1
  // If explicitly reported 0 and 0 (transit/open): Grid = 0, BESS = 0
  // Incomplete, missing, or contradictory (1, 1): unconfirmed (null, null)
  if (gridOnState === 1 && gridOffState === 0) {
    return { grid: 1, bess: 0, operatingState: 'GRID' };
  }
  if (gridOnState === 0 && gridOffState === 1) {
    return { grid: 0, bess: 1, operatingState: 'BESS' };
  }
  if (gridOnState === 0 && gridOffState === 0) {
    return { grid: 0, bess: 0, operatingState: null };
  }
  return { grid: null, bess: null, operatingState: null };
}

export function processGridTrendData(rawData: GridStateTrendPoint[]): ProcessedGridTrendPoint[] {
  if (!rawData || rawData.length === 0) return [];

  const processed: ProcessedGridTrendPoint[] = [];
  let dataIndex = 0;

  for (let i = 0; i < rawData.length; i++) {
    const row = rawData[i];
    const { grid, bess, operatingState } = interpretGridState(row.gridOnState, row.gridOffState);

    const isDuplicateTime =
      (i > 0 && rawData[i].timestamp === rawData[i - 1].timestamp) ||
      (i < rawData.length - 1 && rawData[i].timestamp === rawData[i + 1].timestamp);

    processed.push({
      index: dataIndex++,
      timestamp: row.timestamp,
      grid,
      bess,
      operatingState,
      rawGridOnState: row.gridOnState ?? null,
      rawGridOffState: row.gridOffState ?? null,
      isDuplicateTime,
    });
  }

  return processed;
}

interface CustomGridTooltipProps {
  active?: boolean;
  payload?: any[];
  timeFormat?: TimeFormat;
  dateFormat?: DateFormat;
  timeZone?: string;
}

const CustomGridTooltip = ({
  active,
  payload,
  timeFormat = '12h',
  dateFormat = 'DD MMM YYYY',
  timeZone,
}: CustomGridTooltipProps) => {
  if (active && payload && payload.length) {
    const point: ProcessedGridTrendPoint = payload[0].payload;
    if (!point) return null;

    const isGrid = point.operatingState === 'GRID';
    const isBess = point.operatingState === 'BESS';
    const formattedTimestamp = formatGridStateTrendTooltipTimestamp(
      point.timestamp,
      dateFormat,
      timeFormat,
      timeZone
    );

    return (
      <div className="bg-white p-3.5 border border-slate-200 shadow-lg rounded-lg text-xs min-w-[240px]">
        <p className="text-slate-500 font-medium mb-1.5">
          Recorded Time: <span className="text-slate-800 font-semibold">{formattedTimestamp}</span>
        </p>

        {isGrid && (
          <div className="mb-2.5 pb-2 border-b border-slate-100 flex items-center justify-between">
            <span className="text-slate-500 font-medium">Operating State:</span>
            <span className="px-2 py-0.5 rounded border text-xs font-semibold bg-emerald-50 text-emerald-800 border-emerald-300">
              ON GRID
            </span>
          </div>
        )}

        {isBess && (
          <div className="mb-2.5 pb-2 border-b border-slate-100 flex items-center justify-between">
            <span className="text-slate-500 font-medium">Operating State:</span>
            <span className="px-2 py-0.5 rounded border text-xs font-semibold bg-rose-50 text-rose-800 border-rose-300">
              OFF GRID
            </span>
          </div>
        )}

        {!isGrid && !isBess && (
          <div className="mb-2.5 pb-2 border-b border-slate-100">
            <span className="text-slate-500 italic">
              {point.grid === 0 && point.bess === 0
                ? 'Transit / Open Circuit (Neither Active)'
                : 'No confirmed state at this recorded sample'}
            </span>
          </div>
        )}

        <div className="space-y-1.5 text-slate-600 mb-2.5">
          <div className="flex justify-between items-center">
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-sm bg-emerald-500 inline-block"></span>
              <span>ON GRID State:</span>
            </span>
            <span className="font-mono font-semibold text-slate-800">
              {point.grid !== null ? (point.grid === 1 ? '1 (Active)' : '0 (Inactive)') : 'unconfirmed'}
            </span>
          </div>
          <div className="flex justify-between items-center">
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-sm bg-rose-500 inline-block"></span>
              <span>OFF GRID State:</span>
            </span>
            <span className="font-mono font-semibold text-slate-800">
              {point.bess !== null ? (point.bess === 1 ? '1 (Active)' : '0 (Inactive)') : 'unconfirmed'}
            </span>
          </div>
        </div>

        <div className="space-y-1 text-slate-500 text-[11px] pt-2 border-t border-slate-100">
          <div className="flex justify-between">
            <span>Raw pcs.di_ongrid_state:</span>
            <span className="font-mono font-semibold text-slate-700">
              {point.rawGridOnState !== null ? point.rawGridOnState : 'null'}
            </span>
          </div>
          <div className="flex justify-between">
            <span>Raw pcs.di_offgrid_state:</span>
            <span className="font-mono font-semibold text-slate-700">
              {point.rawGridOffState !== null ? point.rawGridOffState : 'null'}
            </span>
          </div>
        </div>
      </div>
    );
  }
  return null;
};

const CustomActiveDot = (props: any) => {
  const { cx, cy, stroke, value } = props;
  if (!cx || !cy || value === null || value === undefined) {
    return null;
  }
  return (
    <circle
      cx={cx}
      cy={cy}
      r={4.5}
      fill={stroke || '#0284c7'}
      stroke="#ffffff"
      strokeWidth={2}
      className="drop-shadow-sm"
    />
  );
};

export function GridStateTrendSection({
  assetId,
  timeFormat: propTimeFormat,
  dateFormat: propDateFormat,
  timeZone: propTimeZone,
}: GridStateTrendSectionProps) {
  const { preferences, resolvedTimezone } = useUserSettings();

  const effectiveTimeFormat = propTimeFormat ?? preferences.timeFormat;
  const effectiveDateFormat = propDateFormat ?? preferences.dateFormat;
  const effectiveTimeZone = propTimeZone ?? resolvedTimezone;

  const [showGraph, setShowGraph] = useState(false);
  const [selectedDate, setSelectedDate] = useState<string>(new Date().toLocaleDateString('en-CA'));
  const [data, setData] = useState<ProcessedGridTrendPoint[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { siteId } = useParams<{ siteId: string }>();
  const { telemetry, isConnected } = useLiveTelemetry(siteId);
  const loadTrendRef = React.useRef<(isPolling?: boolean) => Promise<void>>(undefined);
  const fetchTimeoutRef = React.useRef<number | null>(null);

  useEffect(() => {
    if (!showGraph) return;
    
    async function loadTrend(isPolling = false) {
      try {
        if (!isPolling) setIsLoading(true);
        setError(null);
        
        // Parse date for start and end boundaries in local time
        const [year, month, day] = selectedDate.split('-').map(Number);
        const start = new Date(year, month - 1, day, 0, 0, 0, 0);
        const end = new Date(year, month - 1, day + 1, 0, 0, 0, 0);

        const result = await dashboardService.getBessGridStateTrend(assetId, start, end);
        const processed = processGridTrendData(result);
        setData(processed);
      } catch (err: any) {
        setError(err.message || 'Failed to load grid state trend');
      } finally {
        if (!isPolling) setIsLoading(false);
      }
    }
    
    loadTrendRef.current = loadTrend;
    loadTrend();

    // Only poll when viewing today's local/site date
    const todayLocal = new Date().toLocaleDateString('en-CA');
    if (selectedDate !== todayLocal) {
      return;
    }

    const intervalId = window.setInterval(() => {
      loadTrend(true);
    }, 5 * 60 * 1000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [assetId, showGraph, selectedDate]);

  useEffect(() => {
    if (!showGraph || !isConnected || telemetry.length === 0) return;
    
    const todayLocal = new Date().toLocaleDateString('en-CA');
    if (selectedDate !== todayLocal) return;

    if (fetchTimeoutRef.current) return; // already queued

    fetchTimeoutRef.current = window.setTimeout(() => {
      fetchTimeoutRef.current = null;
      if (loadTrendRef.current) {
        loadTrendRef.current(true);
      }
    }, 3000); // 3-second coalescing window
  }, [telemetry, showGraph, selectedDate, isConnected]);

  useEffect(() => {
    return () => {
      if (fetchTimeoutRef.current) {
        window.clearTimeout(fetchTimeoutRef.current);
        fetchTimeoutRef.current = null;
      }
    };
  }, []);

  const handleExport = () => {
    const [year, month, day] = selectedDate.split('-').map(Number);
    const start = new Date(year, month - 1, day, 0, 0, 0, 0);
    const end = new Date(year, month - 1, day + 1, 0, 0, 0, 0);

    const url = new URL(`${API_BASE}/api/bess/${assetId}/grid-state-trend/export`);
    url.searchParams.set('from', start.toISOString());
    url.searchParams.set('to', end.toISOString());
    
    fetch(url.toString(), {
      credentials: 'include'
    }).then(response => {
       if (response.ok) {
           response.blob().then(blob => {
             const a = document.createElement('a');
             const urlBlob = window.URL.createObjectURL(blob);
             a.href = urlBlob;
             const safeDate = start.toISOString().split('T')[0];
             a.download = `Grid_State_Trend_${assetId}_${safeDate}.csv`;
             document.body.appendChild(a);
             a.click();
             window.URL.revokeObjectURL(urlBlob);
             document.body.removeChild(a);
           });
       } else {
         console.error('Export failed');
       }
    }).catch(console.error);
  };

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden mt-6">
      <div className="px-6 py-4 border-b border-slate-200 flex flex-wrap items-center justify-between gap-4 bg-slate-50">
        <h3 className="text-lg font-semibold text-slate-900 flex items-center gap-4">
          Grid ON/OFF State Trend
          <label className="flex items-center gap-2 text-sm font-normal cursor-pointer">
            <input 
              type="checkbox" 
              className="rounded border-slate-300 text-primary-600 focus:ring-primary-500"
              checked={showGraph}
              onChange={(e) => setShowGraph(e.target.checked)}
            />
            Show Grid State Trend
          </label>
        </h3>
        
        {showGraph && (
          <div className="flex items-center gap-4">
            <input 
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="border border-slate-300 rounded-md px-3 py-1.5 text-sm"
            />
            <button
              onClick={handleExport}
              className="inline-flex items-center px-3 py-1.5 border border-slate-300 shadow-sm text-sm font-medium rounded-md text-slate-700 bg-white hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500"
            >
              <Download className="w-4 h-4 mr-2" />
              Export CSV
            </button>
          </div>
        )}
      </div>

      {showGraph && (
        <div className="p-6">
          <p className="text-xs text-slate-500 mb-3">
            Digital timing diagram showing Grid and BESS operating states over recorded time
          </p>

          {isLoading ? (
            <div className="flex flex-col items-center justify-center h-[220px]">
              <Loader2 className="w-8 h-8 text-primary-600 animate-spin mb-4" />
              <p className="text-slate-500 text-sm">Loading trend data...</p>
            </div>
          ) : error ? (
            <div className="flex flex-col items-center justify-center h-[220px] text-rose-500 text-sm">
              <p>{error}</p>
            </div>
          ) : data.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-[220px] text-slate-500 text-sm">
              <p>No grid state data found for this date.</p>
            </div>
          ) : (
            <div className="h-[220px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={data} margin={{ top: 12, right: 30, left: 10, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.3} />

                  {/* Subtle contextual state bands */}
                  <ReferenceArea y1={0.5} y2={1.3} fill="#10b981" fillOpacity={0.03} />
                  <ReferenceArea y1={-0.3} y2={0.5} fill="#f43f5e" fillOpacity={0.03} />

                  <XAxis 
                    dataKey="index"
                    padding={{ left: 20, right: 20 }}
                    tickFormatter={(val) => {
                      if (!data[val] || !data[val].timestamp) return '';
                      return formatGridStateTrendTick(data[val].timestamp, effectiveTimeFormat, effectiveTimeZone);
                    }}
                    tick={{ fontSize: 11, fill: '#64748b' }}
                  />
                  <YAxis 
                    domain={[-0.3, 1.3]}
                    ticks={[0, 1]}
                    tickFormatter={(val) => String(val)}
                    tick={{ fontSize: 12, fill: '#334155', fontWeight: 600 }}
                    width={40}
                  />
                  <Tooltip
                    content={
                      <CustomGridTooltip
                        timeFormat={effectiveTimeFormat}
                        dateFormat={effectiveDateFormat}
                        timeZone={effectiveTimeZone}
                      />
                    }
                  />
                  <Legend
                    verticalAlign="bottom"
                    height={32}
                    iconType="rect"
                    wrapperStyle={{ paddingTop: '8px' }}
                  />
                  <Line
                    connectNulls={false}
                    type="stepAfter"
                    dataKey="grid"
                    name="ON GRID"
                    stroke="#16a34a"
                    strokeWidth={2.5}
                    dot={false}
                    activeDot={<CustomActiveDot />}
                    isAnimationActive={false}
                  />
                  <Line
                    connectNulls={false}
                    type="stepAfter"
                    dataKey="bess"
                    name="OFF GRID"
                    stroke="#dc2626"
                    strokeWidth={2.5}
                    dot={false}
                    activeDot={<CustomActiveDot />}
                    isAnimationActive={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

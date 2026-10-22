import { API_BASE, authenticatedFetch } from '../../../utils/apiClient';
import React, { useState, useEffect } from 'react';
import { dashboardService } from '../../../features/dashboard/dashboard.service';
import type { VoltageTrendPoint } from '../../../features/dashboard/dashboard.types';
import { ResponsiveContainer, LineChart, CartesianGrid, XAxis, YAxis, Tooltip, Legend, Line } from 'recharts';
import { Loader2, Download } from 'lucide-react';
import { useParams } from 'react-router-dom';
import { useLiveTelemetry } from '../../../context/WebSocketContext';
import { useUserSettings } from '../../../features/settings/hooks/useUserSettings';
import { formatDateTimeCustom, formatTimeCustom } from '../../../features/settings/settings.utils';
import type { TimeFormat, DateFormat } from '../../../features/settings/settings.types';

export interface VoltageTrendSectionProps {
  assetId: string;
  timeFormat?: TimeFormat;
  dateFormat?: DateFormat;
  timeZone?: string;
}

export function formatVoltageTrendTick(
  timestamp: string | number | Date | null | undefined,
  timeFormat: TimeFormat = '12h',
  timeZone?: string
): string {
  if (!timestamp) return '';
  return formatTimeCustom(timestamp, timeFormat, false, timeZone);
}

export function formatVoltageTrendTooltipTimestamp(
  timestamp: string | number | Date | null | undefined,
  dateFormat: DateFormat = 'DD MMM YYYY',
  timeFormat: TimeFormat = '12h',
  timeZone?: string
): string {
  return formatDateTimeCustom(timestamp, dateFormat, timeFormat, false, timeZone);
}

interface CustomTooltipProps {
  active?: boolean;
  payload?: any[];
  timeFormat?: TimeFormat;
  dateFormat?: DateFormat;
  timeZone?: string;
}

const CustomTooltip = ({
  active,
  payload,
  timeFormat = '12h',
  dateFormat = 'DD MMM YYYY',
  timeZone,
}: CustomTooltipProps) => {
  if (active && payload && payload.length) {
    const dataPoint = payload[0].payload;
    if (dataPoint.isBreakPoint) return null;
    const isUnknown = dataPoint.activeSource === 'UNKNOWN';
    const formattedTimestamp = formatVoltageTrendTooltipTimestamp(
      dataPoint.timestamp,
      dateFormat,
      timeFormat,
      timeZone
    );
    return (
      <div className="bg-white p-3 border border-slate-200 shadow-md rounded text-sm">
        <p className="font-semibold mb-2 text-slate-800">{formattedTimestamp}</p>
        <p className={`font-bold mb-2 ${isUnknown ? 'text-amber-600' : 'text-slate-700'}`}>
          Source: {dataPoint.activeSource || 'UNKNOWN'}
          {isUnknown && ' (Unconfirmed)'}
        </p>
        {payload.map((entry: any, index: number) => {
          return (
            <div key={index} className="mb-1">
              <p style={{ color: entry.color }}>
                {entry.name}: {entry.value !== null ? `${entry.value} V` : 'N/A'}
              </p>
            </div>
          );
        })}
      </div>
    );
  }
  return null;
};

const CustomDot = (props: any) => {
  const { cx, cy, payload, stroke } = props;
  if (!cx || !cy || payload.isBreakPoint) return null;

  if (payload.isDuplicateTime) {
    return (
      <circle cx={cx} cy={cy} r={3} stroke={stroke} strokeWidth={2} fill="#fff" />
    );
  }
  return null;
};

export function VoltageTrendSection({
  assetId,
  timeFormat: propTimeFormat,
  dateFormat: propDateFormat,
  timeZone: propTimeZone,
}: VoltageTrendSectionProps) {
  const { preferences, resolvedTimezone } = useUserSettings();

  const effectiveTimeFormat = propTimeFormat ?? preferences.timeFormat;
  const effectiveDateFormat = propDateFormat ?? preferences.dateFormat;
  const effectiveTimeZone = propTimeZone ?? resolvedTimezone;

  const [showGraph, setShowGraph] = useState(false);
  const [selectedDate, setSelectedDate] = useState<string>(new Date().toLocaleDateString('en-CA'));
  const [data, setData] = useState<VoltageTrendPoint[]>([]);
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

        const result = await dashboardService.getBessVoltageTrend(assetId, start, end);

        const filteredResult = result.filter((r: any) => r.activeSource !== 'UNKNOWN');

        const processed: any[] = [];
        let dataIndex = 0;
        const FRESHNESS_MS = 6 * 60 * 1000;

        for (let i = 0; i < filteredResult.length; i++) {
          const currentTs = new Date(filteredResult[i].timestamp).getTime();

          if (i > 0) {
            const prevTs = new Date(filteredResult[i - 1].timestamp).getTime();

            // Check for gap due to missing data or filtered UNKNOWNs
            if (currentTs - prevTs > FRESHNESS_MS) {
              processed.push({
                index: dataIndex++,
                timestamp: filteredResult[i].timestamp,
                isBreakPoint: true,
                gridVoltageUab: null,
                gridVoltageUbc: null,
                gridVoltageUca: null,
                bessVoltageUa: null,
                bessVoltageUb: null,
                bessVoltageUc: null,
              });
            }

            // Check for duplicate time with different source (transition)
            if (currentTs === prevTs && filteredResult[i].activeSource !== filteredResult[i - 1].activeSource) {
              processed.push({
                index: dataIndex++,
                timestamp: filteredResult[i].timestamp,
                isBreakPoint: true,
                gridVoltageUab: null,
                gridVoltageUbc: null,
                gridVoltageUca: null,
                bessVoltageUa: null,
                bessVoltageUb: null,
                bessVoltageUc: null,
              });
            }
          }

          const isDuplicateTime =
            (i > 0 && filteredResult[i].timestamp === filteredResult[i - 1].timestamp) ||
            (i < filteredResult.length - 1 && filteredResult[i].timestamp === filteredResult[i + 1].timestamp);

          processed.push({ ...filteredResult[i], isDuplicateTime, index: dataIndex++ });
        }

        console.log('API Result:', result);
        console.log('Processed for Recharts:', processed);
        setData(processed as VoltageTrendPoint[]);
      } catch (err: any) {
        setError(err.message || 'Failed to load voltage trend');
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

    // Throttle: If a fetch is already queued, do not cancel and reschedule.
    // This guarantees a fetch happens 3 seconds after the first event in a burst.
    if (fetchTimeoutRef.current) return;

    fetchTimeoutRef.current = window.setTimeout(() => {
      fetchTimeoutRef.current = null;
      if (loadTrendRef.current) {
        loadTrendRef.current(true);
      }
    }, 3000); // 3-second coalescing window

    // No return cleanup here for the timeout itself because we want the throttle to persist across renders
    // caused by rapid telemetry updates. The unmount cleanup is handled separately below.
  }, [telemetry, showGraph, selectedDate, isConnected]);

  // Cleanup timeout on unmount
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

    const url = new URL(`${API_BASE}/api/bess/${assetId}/voltage-trend/export`);
    url.searchParams.set('from', start.toISOString());
    url.searchParams.set('to', end.toISOString());
    
    authenticatedFetch(url.toString()).then(response => {
       if (response.ok) {
           response.blob().then(blob => {
             const a = document.createElement('a');
             const urlBlob = window.URL.createObjectURL(blob);
             a.href = urlBlob;
             const safeDate = start.toISOString().split('T')[0];
             a.download = `Voltage_Trend_${assetId}_${safeDate}.csv`;
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
          Voltage Trend
          <label className="flex items-center gap-2 text-sm font-normal cursor-pointer">
            <input 
              type="checkbox" 
              className="rounded border-slate-300 text-primary-600 focus:ring-primary-500"
              checked={showGraph}
              onChange={(e) => setShowGraph(e.target.checked)}
            />
            Show Voltage Trend
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
          {isLoading ? (
            <div className="flex flex-col items-center justify-center h-[400px]">
              <Loader2 className="w-8 h-8 text-primary-600 animate-spin mb-4" />
              <p className="text-slate-500">Loading trend data...</p>
            </div>
          ) : error ? (
            <div className="flex flex-col items-center justify-center h-[400px] text-rose-500">
              <p>{error}</p>
            </div>
          ) : data.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-[400px] text-slate-500">
              <p>No voltage data found for this date.</p>
            </div>
          ) : (
            <div className="h-[400px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={data} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                  <XAxis
                    dataKey="index"
                    padding={{ left: 30, right: 30 }}
                    tickFormatter={(val) => {
                      if (!data[val] || !data[val].timestamp) return '';
                      return formatVoltageTrendTick(data[val].timestamp, effectiveTimeFormat, effectiveTimeZone);
                    }}
                  />
                  <YAxis
                    label={{ value: 'Voltage (V)', angle: -90, position: 'insideLeft', offset: -10 }} 
                  />
                  <Tooltip
                    content={
                      <CustomTooltip
                        timeFormat={effectiveTimeFormat}
                        dateFormat={effectiveDateFormat}
                        timeZone={effectiveTimeZone}
                      />
                    }
                  />
                  <Legend />
                  <Line connectNulls={false} type="monotone" dataKey="gridVoltageUab" name="Grid Uab" stroke="#2563eb" dot={<CustomDot />} strokeWidth={2} />
                  <Line connectNulls={false} type="monotone" dataKey="gridVoltageUbc" name="Grid Ubc" stroke="#3b82f6" dot={<CustomDot />} strokeWidth={2} />
                  <Line connectNulls={false} type="monotone" dataKey="gridVoltageUca" name="Grid Uca" stroke="#60a5fa" dot={<CustomDot />} strokeWidth={2} />
                  
                  <Line connectNulls={false} type="monotone" dataKey="bessVoltageUa" name="BESS Uab" stroke="#16a34a" dot={<CustomDot />} strokeWidth={2} />
                  <Line connectNulls={false} type="monotone" dataKey="bessVoltageUb" name="BESS Ubc" stroke="#22c55e" dot={<CustomDot />} strokeWidth={2} />
                  <Line connectNulls={false} type="monotone" dataKey="bessVoltageUc" name="BESS Uca" stroke="#4ade80" dot={<CustomDot />} strokeWidth={2} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

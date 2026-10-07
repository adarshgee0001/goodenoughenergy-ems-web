import { API_BASE } from '../../../utils/apiClient';
import React, { useState, useEffect } from 'react';
import { dashboardService } from '../../../features/dashboard/dashboard.service';
import type { GridStateTrendPoint } from '../../../features/dashboard/dashboard.types';
import { ResponsiveContainer, LineChart, CartesianGrid, XAxis, YAxis, Tooltip, Legend, Line } from 'recharts';
import { Loader2, Download } from 'lucide-react';
import { useParams } from 'react-router-dom';
import { useLiveTelemetry } from '../../../context/WebSocketContext';

interface GridStateTrendSectionProps {
  assetId: string;
}

export function GridStateTrendSection({ assetId }: GridStateTrendSectionProps) {
  const [showGraph, setShowGraph] = useState(false);
  const [selectedDate, setSelectedDate] = useState<string>(new Date().toLocaleDateString('en-CA'));
  const [data, setData] = useState<GridStateTrendPoint[]>([]);
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
        
        // Parse date for start and end boundaries
        const start = new Date(selectedDate);
        start.setHours(0, 0, 0, 0);
        
        const end = new Date(start);
        end.setDate(end.getDate() + 1);

        const result = await dashboardService.getBessGridStateTrend(assetId, start, end);
        setData(result);
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

    return () => {
      // We only clear on unmount or deps change that would invalidate the need to fetch
      if (fetchTimeoutRef.current) {
        window.clearTimeout(fetchTimeoutRef.current);
        fetchTimeoutRef.current = null;
      }
    };
  }, [telemetry, showGraph, selectedDate, isConnected]);

  const handleExport = () => {
    const start = new Date(selectedDate);
    start.setHours(0, 0, 0, 0);
    
    const end = new Date(start);
    end.setDate(end.getDate() + 1);

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
             a.download = `Grid_State_Trend_${assetId}_${safeDate}.xlsx`;
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
              Export Excel
            </button>
          </div>
        )}
      </div>

      {showGraph && (
        <div className="p-6">
          <p className="text-sm text-slate-500 mb-4">PCS grid state over time</p>
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
              <p>No grid state data found for this date.</p>
            </div>
          ) : (
            <div className="h-[400px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={data} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                  <XAxis 
                    dataKey="timestamp" 
                    tickFormatter={(val) => {
                      const d = new Date(val);
                      return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                    }}
                  />
                  <YAxis 
                    domain={[0, 1]}
                    ticks={[0, 1]}
                    tickFormatter={(val) => val === 1 ? '1 (Active)' : '0 (Inactive)'}
                    label={{ value: 'State', angle: -90, position: 'insideLeft', offset: -10 }} 
                  />
                  <Tooltip 
                    labelFormatter={(val) => new Date(String(val)).toLocaleString()}
                    formatter={(value, name) => [value === 1 ? '1 (Active)' : '0 (Inactive)', name]}
                  />
                  <Legend />
                  <Line connectNulls={false} type="stepAfter" dataKey="gridOnState" name="Grid ON State" stroke="#22c55e" dot={false} strokeWidth={2} />
                  <Line connectNulls={false} type="stepAfter" dataKey="gridOffState" name="Grid OFF State" stroke="#ef4444" dot={false} strokeWidth={2} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

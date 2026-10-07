import { useState, useEffect, useMemo, useCallback } from 'react';
import { Bell, AlertCircle, XCircle, AlertTriangle, Info, CheckCircle2 } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import { usePreview } from '../../context/PreviewContext';
import { dashboardService, ClientAccessError, NoSiteError, NoBessError } from '../../features/dashboard/dashboard.service';
import type { DashboardContext } from '../../features/dashboard/dashboard.types';
import { alarmService, type RealAlarm } from '../../features/alarms/alarm.service';
import { useWebSocket } from '../../context/WebSocketContext';
import { formatAlarmTime } from '../../utils/formatTime';

export default function AlarmsPage() {
  const { role } = useAuth();
  const { isPreviewing, previewClientId } = usePreview();

  const [ctx, setCtx] = useState<DashboardContext | null>(null);
  const [ctxLoading, setCtxLoading] = useState(true);
  const [ctxError, setCtxError] = useState<{ type: 'empty' | 'error'; message: string } | null>(null);

  const [alarms, setAlarms] = useState<RealAlarm[]>([]);
  const [alarmsLoading, setAlarmsLoading] = useState(false);
  const [alarmsError, setAlarmsError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'active' | 'history'>('active');

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

  // 2. Fetch Alarms
  const loadAlarms = useCallback(async () => {
    if (!ctx?.site) return;
    try {
      setAlarmsLoading(true);
      setAlarmsError(null);
      const data = await alarmService.getSiteAlarms(ctx.site.id);
      setAlarms(data);
    } catch (err: any) {
      setAlarmsError(err.message || 'Failed to load alarms.');
    } finally {
      setAlarmsLoading(false);
    }
  }, [ctx?.site]);

  useEffect(() => {
    loadAlarms();
  }, [loadAlarms]);

  // 3. WebSocket Subscription
  useEffect(() => {
    if (!ctx?.site || !socket || !isConnected) return;
    const siteId = ctx.site.id;

    // Use the existing rooms from WebSocketContext if possible, but it subscribes automatically 
    // via useLiveTelemetry. Here we can manually subscribe if we need to, but useLiveTelemetry
    // typically manages it. Let's just emit subscribe to be safe.
    socket.emit('subscribe', { siteId });

    const handleAlarmEvent = (payload: any) => {
      if (payload.type === 'alarm' && payload.siteId === siteId && payload.alarm) {
        setAlarms((prev) => {
          const newAlarm = payload.alarm as RealAlarm;
          const idx = prev.findIndex(a => a.id === newAlarm.id);
          if (idx >= 0) {
            const next = [...prev];
            next[idx] = newAlarm;
            return next;
          } else {
            return [newAlarm, ...prev]; // Prepend new alarm
          }
        });
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
      setAlarms((prev) => prev.map(a => a.id === updated.id ? updated : a));
    } catch (err) {
      console.error('Failed to acknowledge alarm:', err);
    }
  };

  const filteredAlarms = useMemo(() => {
    return alarms.filter((alarm) => {
      if (activeTab === 'active' && alarm.status !== 'ACTIVE') return false;
      if (activeTab === 'history' && alarm.status === 'ACTIVE') return false;
      return true;
    }).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [alarms, activeTab]);

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
      <div className="flex items-center justify-between mb-2">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-3">
            <Bell className="w-6 h-6 text-primary-600" /> Alarms & Events
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Real-time monitoring of system faults and events.
          </p>
        </div>
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

      {alarmsLoading ? (
        <div className="flex flex-col items-center justify-center min-h-[40vh]">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600 mb-4"></div>
          <p className="text-slate-500">Loading alarms...</p>
        </div>
      ) : alarmsError ? (
        <ErrorState message={alarmsError} onRetry={loadAlarms} />
      ) : filteredAlarms.length === 0 ? (
        <EmptyState icon={<CheckCircle2 className="w-12 h-12" />} title="All Clear" message="No alarms to display in this view." />
      ) : (
        <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-xs uppercase tracking-wider text-slate-500">
                <th className="px-4 py-3 font-medium">Time</th>
                <th className="px-4 py-3 font-medium">Severity</th>
                <th className="px-4 py-3 font-medium">Event</th>
                <th className="px-4 py-3 font-medium">Device</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredAlarms.map(alarm => (
                <tr key={alarm.id} className="hover:bg-slate-50 transition-colors">
                  <td className="px-4 py-3 text-sm text-slate-600 whitespace-nowrap">
                    {formatAlarmTime(alarm.createdAt)}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <SeverityBadge severity={alarm.severity} />
                  </td>
                  <td className="px-4 py-3">
                    <p className="text-sm font-semibold text-slate-900">{alarm.message}</p>
                    {alarm.faultCode && <p className="text-xs text-slate-500 font-mono">{alarm.faultCode}</p>}
                  </td>
                  <td className="px-4 py-3 text-sm text-slate-600 whitespace-nowrap">
                    {alarm.device ? `${alarm.device.bessAsset?.name || 'BESS'} / ${alarm.device.type}` : '-'}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <StatusBadge status={alarm.status} />
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    {alarm.status === 'ACTIVE' && (
                      <button 
                        onClick={() => handleAcknowledge(alarm.id)}
                        className="text-xs font-medium bg-slate-900 text-white px-3 py-1.5 rounded hover:bg-slate-700 transition-colors"
                      >
                        Acknowledge
                      </button>
                    )}
                  </td>
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

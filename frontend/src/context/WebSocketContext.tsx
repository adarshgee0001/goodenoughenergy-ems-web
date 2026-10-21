import { API_BASE } from '../utils/apiClient';
import React, { createContext, useContext, useEffect, useState, type ReactNode, useRef, useMemo, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';
import { useAuth } from '../hooks/useAuth';
import { useUserSettings } from '../features/settings/hooks/useUserSettings';
import { alarmAudioNotifier } from '../features/settings/alarmAudio.utils';

// Live Telemetry Contract — mirrors backend's LiveTelemetryPayload
// solarPower intentionally absent: pcs.ai_p is BESS power, NOT solar.
// No confirmed solar inverter component in the live payload.
// loadPower intentionally absent: no confirmed load measurement signal source.
export interface LiveTelemetryData {
  gridPower?: number;
  bessPower?: number;
  bessSoc?: number;
  energyToday?: number;
  pcsState?: string;
  bmsSoh?: number;
  bmsCurrent?: number;
  cellVMax?: number;
  cellVMin?: number;
  cellTempMax?: number;
  pcsDcVoltage?: number;
  pcsTemp?: number;
  todayChargeEnergy?: number;
  todayDischargeEnergy?: number;
  accChargeEnergy?: number;
  accDischargeEnergy?: number;
  phaseAVoltage?: number;
  phaseBVoltage?: number;
  phaseCVoltage?: number;
  phaseACurrent?: number;
  phaseBCurrent?: number;
  phaseCCurrent?: number;
}

export interface LiveTelemetryPayload {
  type: 'telemetry';
  siteId: string;
  deviceId: string;
  emuId: string;
  componentId: string;
  timestamp: string;
  data: LiveTelemetryData;
}

interface WebSocketContextProps {
  socket: Socket | null;
  isConnected: boolean;
  subscribeToSite: (siteId: string) => void;
  unsubscribeFromSite: (siteId: string) => void;
  liveTelemetry: Record<string, LiveTelemetryPayload>; // Keyed by componentId or deviceId
}

const WebSocketContext = createContext<WebSocketContextProps | undefined>(undefined);

export const WebSocketProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const { isAuthenticated } = useAuth();
  const { preferences } = useUserSettings();
  const alarmSoundEnabledRef = useRef(preferences.alarmSoundEnabled);
  const alarmSoundProfileRef = useRef(preferences.alarmSoundProfile);
  const warningProfileRef = useRef(preferences.warningAlarmSoundProfile);
  const criticalProfileRef = useRef(preferences.criticalAlarmSoundProfile);

  useEffect(() => {
    alarmSoundEnabledRef.current = preferences.alarmSoundEnabled;
    if (!preferences.alarmSoundEnabled) {
      alarmAudioNotifier.stopPlayback('master-mute');
    }
  }, [preferences.alarmSoundEnabled]);

  useEffect(() => {
    alarmSoundProfileRef.current = preferences.alarmSoundProfile;
  }, [preferences.alarmSoundProfile]);

  useEffect(() => {
    warningProfileRef.current = preferences.warningAlarmSoundProfile;
  }, [preferences.warningAlarmSoundProfile]);

  useEffect(() => {
    criticalProfileRef.current = preferences.criticalAlarmSoundProfile;
  }, [preferences.criticalAlarmSoundProfile]);

  const [socket, setSocket] = useState<Socket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [liveTelemetry, setLiveTelemetry] = useState<Record<string, LiveTelemetryPayload>>({});
  const activeSubscriptions = useRef<Map<string, number>>(new Map());

  useEffect(() => {
    if (!isAuthenticated) return;

    // Fallback URL if env is missing; backend is expected at /api or similar port
    const socketUrl = API_BASE;

    const newSocket = io(socketUrl, {
      withCredentials: true,
      autoConnect: true,
      reconnection: true,
      reconnectionDelay: 2000,
      reconnectionAttempts: 10,
    });

    newSocket.on('connect', () => {
      console.log('[WebSocket] Connected');
      setIsConnected(true);
      
      // Resubscribe to active rooms upon reconnect
      activeSubscriptions.current.forEach((count, siteId) => {
        if (count > 0) {
          newSocket.emit('subscribe', { siteId });
        }
      });
    });

    newSocket.on('disconnect', (reason) => {
      console.log('[WebSocket] Disconnected:', reason);
      setIsConnected(false);
    });

    newSocket.on('telemetry', (payload: LiveTelemetryPayload) => {
      if (!payload || !payload.deviceId) return;
      const key = payload.componentId ? `${payload.deviceId}:${payload.componentId}` : payload.deviceId;
      setLiveTelemetry(prev => ({
        ...prev,
        [key]: payload
      }));
    });

    newSocket.on('alarm', (payload: any) => {
      if (payload && payload.alarm) {
        alarmAudioNotifier.handleIncomingAlarm(
          payload.alarm,
          alarmSoundEnabledRef.current,
          {
            warning: warningProfileRef.current,
            critical: criticalProfileRef.current ?? alarmSoundProfileRef.current,
          }
        );
      }
    });

    newSocket.on('error', (err: any) => {
      console.error('[WebSocket] Server Error:', err);
      if (err?.message === 'Session expired') {
        window.dispatchEvent(new Event('auth:expired'));
      }
    });

    newSocket.on('connect_error', (err) => {
      console.error('[WebSocket] Connect Error:', err.message);
      if (err.message === 'AUTH_REQUIRED') {
        window.dispatchEvent(new Event('auth:expired'));
      }
    });

    setSocket(newSocket);

    return () => {
      newSocket.close();
      setSocket(null);
      setIsConnected(false);
    };
  }, [isAuthenticated]);

  const subscribeToSite = useCallback((siteId: string) => {
    if (!siteId) return;
    const currentCount = activeSubscriptions.current.get(siteId) || 0;
    activeSubscriptions.current.set(siteId, currentCount + 1);

    if (currentCount === 0 && socket && isConnected) {
      socket.emit('subscribe', { siteId });
    }
  }, [socket, isConnected]);

  const unsubscribeFromSite = useCallback((siteId: string) => {
    if (!siteId) return;
    const currentCount = activeSubscriptions.current.get(siteId) || 0;
    if (currentCount <= 1) {
      activeSubscriptions.current.delete(siteId);
      if (socket && isConnected) {
        socket.emit('unsubscribe', { siteId });
      }
      // Cleanly purge live telemetry entries belonging to the unsubscribed site
      setLiveTelemetry(prev => {
        let changed = false;
        const remaining: Record<string, LiveTelemetryPayload> = {};
        for (const [k, v] of Object.entries(prev)) {
          if (v.siteId === siteId) {
            changed = true;
          } else {
            remaining[k] = v;
          }
        }
        return changed ? remaining : prev;
      });
    } else {
      activeSubscriptions.current.set(siteId, currentCount - 1);
    }
  }, [socket, isConnected]);

  const providerValue = useMemo(() => ({
    socket,
    isConnected,
    subscribeToSite,
    unsubscribeFromSite,
    liveTelemetry,
  }), [socket, isConnected, subscribeToSite, unsubscribeFromSite, liveTelemetry]);

  return (
    <WebSocketContext.Provider value={providerValue}>
      {children}
    </WebSocketContext.Provider>
  );
};

export const useWebSocket = () => {
  const context = useContext(WebSocketContext);
  if (context === undefined) {
    throw new Error('useWebSocket must be used within a WebSocketProvider');
  }
  return context;
};

// Hook strictly for live telemetry consumption
export const useLiveTelemetry = (siteId?: string) => {
  const { isConnected, liveTelemetry, subscribeToSite, unsubscribeFromSite } = useWebSocket();

  useEffect(() => {
    if (siteId && isConnected) {
      subscribeToSite(siteId);
      return () => {
        unsubscribeFromSite(siteId);
      };
    }
  }, [siteId, isConnected, subscribeToSite, unsubscribeFromSite]);

  // If siteId is provided, optionally filter telemetry to only that site
  // Memoize to prevent infinite update loops in consumers
  const filteredTelemetry = useMemo(() => {
    return siteId 
      ? Object.values(liveTelemetry).filter(t => t.siteId === siteId)
      : Object.values(liveTelemetry);
  }, [siteId, liveTelemetry]);

  return { isConnected, telemetry: filteredTelemetry };
};

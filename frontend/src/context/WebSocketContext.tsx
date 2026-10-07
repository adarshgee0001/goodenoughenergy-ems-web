import { API_BASE } from '../utils/apiClient';
import React, { createContext, useContext, useEffect, useState, type ReactNode, useRef, useMemo } from 'react';
import { io, Socket } from 'socket.io-client';
import { useAuth } from '../hooks/useAuth';

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
  const [socket, setSocket] = useState<Socket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [liveTelemetry, setLiveTelemetry] = useState<Record<string, LiveTelemetryPayload>>({});
  const activeSubscriptions = useRef<Set<string>>(new Set());

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
      activeSubscriptions.current.forEach(siteId => {
        newSocket.emit('subscribe', { siteId });
      });
    });

    newSocket.on('disconnect', (reason) => {
      console.log('[WebSocket] Disconnected:', reason);
      setIsConnected(false);
    });

    newSocket.on('telemetry', (payload: LiveTelemetryPayload) => {
      setLiveTelemetry(prev => ({
        ...prev,
        [payload.deviceId]: payload
      }));
    });

    newSocket.on('error', (err) => {
      console.error('[WebSocket] Server Error:', err);
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

  const subscribeToSite = (siteId: string) => {
    if (socket && isConnected) {
      socket.emit('subscribe', { siteId });
      activeSubscriptions.current.add(siteId);
    }
  };

  const unsubscribeFromSite = (siteId: string) => {
    if (socket && isConnected) {
      socket.emit('unsubscribe', { siteId });
      activeSubscriptions.current.delete(siteId);
    }
  };

  return (
    <WebSocketContext.Provider value={{ socket, isConnected, subscribeToSite, unsubscribeFromSite, liveTelemetry }}>
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
  }, [siteId, isConnected]);

  // If siteId is provided, optionally filter telemetry to only that site
  // Memoize to prevent infinite update loops in consumers
  const filteredTelemetry = useMemo(() => {
    return siteId 
      ? Object.values(liveTelemetry).filter(t => t.siteId === siteId)
      : Object.values(liveTelemetry);
  }, [siteId, liveTelemetry]);

  return { isConnected, telemetry: filteredTelemetry };
};

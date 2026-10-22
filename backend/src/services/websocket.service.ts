import { Server as SocketIOServer, Socket } from 'socket.io';
import { Server as HttpServer } from 'http';
import { authService } from './auth.service';
import { assetService } from './asset.service';
import { authorizationService } from './authorization.service';
import { telemetryService } from './telemetry.service';

// Phase 14C Live Telemetry Contract
// Solar PV: pinv.ai_op_p → solarPower (kW). Confirmed R&D signal (Step 1).
// pcs.ai_p is PCS Active Power (BESS), NOT Solar.
export interface LiveTelemetryPayload {
  type: 'telemetry';
  siteId: string;
  deviceId: string;
  emuId: string;
  componentId: string;
  timestamp: string;
  data: {
    // Grid Meter (pmg)
    gridPower?: number;           // pmg.ai_sum_p
    gridFrequency?: number;       // pmg.ai_freq
    powerFactor?: number;         // pmg.ai_sum_cos
    gridPhaseAVoltage?: number;   // pmg.ai_ua
    // PCS
    bessPower?: number;           // pcs.ai_p
    pcsState?: string;
    pcsDcVoltage?: number;
    pcsTemp?: number;
    todayChargeEnergy?: number;
    todayDischargeEnergy?: number;
    accChargeEnergy?: number;
    accDischargeEnergy?: number;
    // Cabinet Meter (rjl / jl)
    phaseAVoltage?: number;
    phaseBVoltage?: number;
    phaseCVoltage?: number;
    phaseACurrent?: number;
    phaseBCurrent?: number;
    phaseCCurrent?: number;
    // BMS (Phase 2 BMS Telemetry Table)
    bessSoc?: number;
    bmsSoh?: number;
    bmsCurrent?: number;
    cellVMax?: number;
    cellVMin?: number;
    cellTempMax?: number;
    cellTempMin?: number;        // bcms.ai_min_temp
    bmsDcVoltage?: number;       // bcms.ai_sum_u
    bmsCabinetState?: number;    // bcms.di_rcdhg_stat (0=STANDBY, 1=DISCHARGING, 2=CHARGING)
    // Solar PV Inverter (pinv component — Step 1)
    solarPower?: number;          // pinv.ai_op_p
    solarFrequency?: number;      // pinv.ai_freq
    solarPowerFactor?: number;    // pinv.ai_cos
    // Cabinet Frequency and Power Factor
    bessFrequency?: number;       // pcs.ai_freq
    bessPowerFactor?: number;     // pcs.ai_cos → BESS/PCS Power Factor
    bessPowerFactorMeasuredAt?: string;
    // Battery Status & Ambient
    batteryAmbientTemp?: number;  // th.ai_temp
    packAvgTemp?: number;         // pack_* average temperature
    packMaxTemp?: number;         // pack_* maximum temperature
    // PCS Telemetry Table (Phase 1) & TMS Ambient Temp
    pcsTemperature?: number;      // pcs.ai_igbt_temp
    pcsLineVoltage?: number;      // pcs avg(ai_out_uab, ai_out_ubc, ai_out_uca)
    pcsAcCurrent?: number;        // pcs avg(ai_ia, ai_ib, ai_ic)
    tmsAmbientTemp?: number;      // tms.ai_at
    // TMS Telemetry Table
    tmsOperatingMode?: number;         // tms.di_singco_state
    tmsCoolantReturnTemp?: number;     // tms.ai_iw_temp (°C)
    tmsCoolantInletTemp?: number;      // tms.ai_ow_temp (°C)
    tmsCoolantReturnPressure?: number; // tms.ai_iw_prs (bar)
    tmsCoolantInletPressure?: number;  // tms.ai_ow_prs (bar)
    // loadPower and energyToday reserved for future use
    loadPower?: number;
    energyToday?: number;
  };
}

export interface LiveAlarmPayload {
  type: 'alarm';
  siteId: string;
  alarm: any; // The Prisma Alarm object
}

export class WebSocketService {
  private io: SocketIOServer | null = null;

  public initialize(httpServer: HttpServer) {
    const configuredOrigins = (process.env.CORS_ORIGIN || 'http://localhost:5173,http://localhost:3000,http://localhost:80,http://storedge.goodenough.energy,http://10.10.10.245:5173,http://10.10.10.245:5000')
      .split(',')
      .map(o => o.trim())
      .filter(Boolean);

    const isAllowedOrigin = (origin: string | undefined): boolean => {
      if (!origin) return true;
      if (configuredOrigins.includes(origin)) return true;
      if (/^https?:\/\/(localhost|127\.0\.0\.1|10\.10\.10\.245)(:\d+)?$/.test(origin)) return true;
      if (/^https?:\/\/([a-z0-9-]+\.)*goodenough\.energy(:\d+)?$/.test(origin)) return true;
      return false;
    };

    this.io = new SocketIOServer(httpServer, {
      cors: {
        origin: (origin, callback) => {
          if (isAllowedOrigin(origin)) {
            callback(null, true);
          } else {
            callback(null, false);
          }
        },
        methods: ['GET', 'POST'],
        credentials: true
      }
    });

    // Authentication Middleware
    this.io.use((socket, next) => {
      let token: string | undefined;

      if (socket.handshake.auth?.token) {
        token = socket.handshake.auth.token;
      } else if (socket.handshake.headers.authorization) {
        const authHeader = socket.handshake.headers.authorization;
        token = authHeader.startsWith('Bearer ') ? authHeader.substring(7).trim() : authHeader.trim();
      } else if (socket.handshake.headers.cookie) {
        const cookieHeader = socket.handshake.headers.cookie;
        const cookies = Object.fromEntries(
          cookieHeader.split(';').map(c => {
            const [key, ...v] = c.split('=');
            return [key.trim(), decodeURIComponent(v.join('='))];
          })
        );
        token = cookies.auth_token;
      }
      
      if (!token) {
        return next(new Error('AUTH_REQUIRED'));
      }
      try {
        const decoded = authService.verifyToken(token);
        if (decoded.exp && (decoded.exp * 1000) <= Date.now()) {
          return next(new Error('AUTH_REQUIRED'));
        }
        (socket as any).user = decoded; // Store userId, email, role, exp
        next();
      } catch (err) {
        return next(new Error('AUTH_REQUIRED'));
      }
    });

    this.io.on('connection', (socket: Socket) => {
      const user = (socket as any).user;
      console.log(`[WebSocket] Client connected: ${socket.id} (User: ${user?.userId})`);

      // Server-side session expiry enforcement
      let expiryTimer: NodeJS.Timeout | null = null;
      if (user?.exp) {
        const remainingMs = (user.exp * 1000) - Date.now();
        if (remainingMs <= 0) {
          socket.emit('error', { message: 'Session expired' });
          socket.disconnect(true);
          return;
        }

        expiryTimer = setTimeout(() => {
          if (socket.connected) {
            console.log(`[WebSocket] Session expired for socket ${socket.id} (User: ${user.userId}). Disconnecting.`);
            socket.emit('error', { message: 'Session expired' });
            socket.disconnect(true);
          }
        }, remainingMs);
      }

      socket.on('subscribe', async (payload: { siteId: string }) => {
        const { siteId } = payload;
        if (!siteId) return;

        try {
          const clientId = await assetService.resolveSiteOwnership(siteId);
          if (!clientId) {
            socket.emit('error', { message: 'Site not found or unresolvable ownership' });
            return;
          }

          const isAuthorized = await authorizationService.canAccessClient(user.userId, user.role, clientId);
          if (!isAuthorized) {
            socket.emit('error', { message: 'Forbidden: Access to site denied' });
            return;
          }

          const room = `site:${siteId}`;
          socket.join(room);
          console.log(`[WebSocket] Socket ${socket.id} joined room ${room}`);
          socket.emit('subscribed', { siteId });

          // Send immediate latest telemetry
          const latestRows = await telemetryService.getSiteLatestTelemetry(siteId);
          for (const row of latestRows) {
            const payload = telemetryService.mapToLivePayload(siteId, row);
            socket.emit('telemetry', payload);
          }
        } catch (err) {
          console.error(`[WebSocket] Subscription error for ${socket.id}:`, err);
          socket.emit('error', { message: 'Internal server error during subscription' });
        }
      });

      socket.on('unsubscribe', (payload: { siteId: string }) => {
        if (payload.siteId) {
          socket.leave(`site:${payload.siteId}`);
          console.log(`[WebSocket] Socket ${socket.id} left room site:${payload.siteId}`);
        }
      });

      socket.on('disconnect', () => {
        if (expiryTimer) {
          clearTimeout(expiryTimer);
          expiryTimer = null;
        }
        console.log(`[WebSocket] Client disconnected: ${socket.id}`);
      });
    });
  }

  public broadcastTelemetry(siteId: string, payload: LiveTelemetryPayload) {
    if (!this.io) return;
    this.io.to(`site:${siteId}`).emit('telemetry', payload);
  }

  public broadcastAlarm(siteId: string, payload: LiveAlarmPayload) {
    if (!this.io) return;
    this.io.to(`site:${siteId}`).emit('alarm', payload);
  }
}

export const webSocketService = new WebSocketService();

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
    // BMS — not populated in Phase 14C (bcms absent from live payload)
    bessSoc?: number;
    bmsSoh?: number;
    bmsCurrent?: number;
    cellVMax?: number;
    cellVMin?: number;
    cellTempMax?: number;
    // Solar PV Inverter (pinv component — Step 1)
    solarPower?: number;          // pinv.ai_op_p
    solarFrequency?: number;      // pinv.ai_freq
    solarPowerFactor?: number;    // pinv.ai_cos
    // Cabinet Frequency and Power Factor
    bessFrequency?: number;       // pcs.ai_freq
    bessPowerFactor?: number;     // pcs.ai_cos → BESS/PCS Power Factor
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
    const allowedOrigins = process.env.CORS_ORIGIN 
      ? process.env.CORS_ORIGIN.split(',') 
      : ['http://localhost:5173'];

    this.io = new SocketIOServer(httpServer, {
      cors: {
        origin: allowedOrigins,
        methods: ['GET', 'POST'],
        credentials: true
      }
    });

    // Authentication Middleware
    this.io.use((socket, next) => {
      const cookieHeader = socket.handshake.headers.cookie;
      if (!cookieHeader) {
        return next(new Error('AUTH_REQUIRED'));
      }
      
      const cookies = Object.fromEntries(
        cookieHeader.split(';').map(c => {
          const [key, ...v] = c.split('=');
          return [key.trim(), decodeURIComponent(v.join('='))];
        })
      );
      const token = cookies.auth_token;
      
      if (!token) {
        return next(new Error('AUTH_REQUIRED'));
      }
      try {
        const decoded = authService.verifyToken(token);
        (socket as any).user = decoded; // Store userId, email, role
        next();
      } catch (err) {
        return next(new Error('AUTH_REQUIRED'));
      }
    });

    this.io.on('connection', (socket: Socket) => {
      const user = (socket as any).user;
      console.log(`[WebSocket] Client connected: ${socket.id} (User: ${user.userId})`);

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

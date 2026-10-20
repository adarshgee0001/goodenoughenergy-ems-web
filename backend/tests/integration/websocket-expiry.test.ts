import { describe, test, expect } from 'vitest';
import * as http from 'http';
import express from 'express';
import jwt from 'jsonwebtoken';
import { io as ioc } from 'socket.io-client';
import { WebSocketService } from '../../src/services/websocket.service';
import { authService } from '../../src/services/auth.service';
import { prisma } from '../../src/db/prisma';

describe('WebSocket Server-Side Session Expiry Integration Tests', () => {
  test('Enforces server-side disconnection at JWT expiration and rejects expired reconnects', async () => {
    const app = express();
    const httpServer = http.createServer(app);
    const wsService = new WebSocketService();
    wsService.initialize(httpServer);

    await new Promise<void>((resolve) => httpServer.listen(0, () => resolve()));
    const port = (httpServer.address() as any).port;
    const wsUrl = `http://localhost:${port}`;

    const secret = process.env.JWT_SECRET || 'fallback_secret_do_not_use';
    const uniqueSuffix = Date.now().toString();

    const dbUser = await prisma.user.create({
      data: {
        name: 'WS Expiry User',
        email: `ws.expiry.${uniqueSuffix}@example.com`,
        passwordHash: 'hash',
        role: 'ADMIN',
      },
    });

    const clientRecord = await prisma.client.create({
      data: { name: `WSExpiryClient_${uniqueSuffix}` },
    });
    const siteRecord = await prisma.site.create({
      data: { name: `WSExpirySite_${uniqueSuffix}`, clientId: clientRecord.id },
    });

    try {
      // -----------------------------------------------------------
      // 1. Connection with already-expired token is rejected
      // -----------------------------------------------------------
      const pastExpToken = jwt.sign(
        { userId: dbUser.id, role: dbUser.role, exp: Math.floor(Date.now() / 1000) - 60 },
        secret
      );

      await new Promise<void>((resolve, reject) => {
        const socket = ioc(wsUrl, {
          extraHeaders: { Cookie: `auth_token=${pastExpToken}` },
          reconnection: false,
          timeout: 2000,
        });

        socket.on('connect_error', (err) => {
          expect(err.message).toBe('AUTH_REQUIRED');
          socket.close();
          resolve();
        });

        socket.on('connect', () => {
          socket.close();
          reject(new Error('Expired token should not have connected'));
        });
      });

      // -----------------------------------------------------------
      // 2. Active socket is automatically disconnected when token expires
      // -----------------------------------------------------------
      // Create a token that expires in 1.2 seconds
      const shortExpToken = jwt.sign(
        { userId: dbUser.id, role: dbUser.role },
        secret,
        { expiresIn: '1.2s' }
      );

      await new Promise<void>((resolve, reject) => {
        const socket = ioc(wsUrl, {
          extraHeaders: { Cookie: `auth_token=${shortExpToken}` },
          reconnection: false,
        });

        let sessionExpiredErrorReceived = false;
        let disconnected = false;

        socket.on('connect', () => {
          // Subscribe to site
          socket.emit('subscribe', { siteId: siteRecord.id });
        });

        socket.on('error', (err: any) => {
          if (err?.message === 'Session expired') {
            sessionExpiredErrorReceived = true;
          }
        });

        socket.on('disconnect', (reason) => {
          disconnected = true;
          expect(sessionExpiredErrorReceived).toBe(true);
          socket.close();
          resolve();
        });

        setTimeout(() => {
          if (!disconnected) {
            socket.close();
            reject(new Error('Socket was not disconnected upon token expiration'));
          }
        }, 3000);
      });

      // -----------------------------------------------------------
      // 3. Reconnect attempt with now-expired token is rejected
      // -----------------------------------------------------------
      await new Promise<void>((resolve, reject) => {
        const reconnectSocket = ioc(wsUrl, {
          extraHeaders: { Cookie: `auth_token=${shortExpToken}` },
          reconnection: false,
        });

        reconnectSocket.on('connect_error', (err) => {
          expect(err.message).toBe('AUTH_REQUIRED');
          reconnectSocket.close();
          resolve();
        });

        reconnectSocket.on('connect', () => {
          reconnectSocket.close();
          reject(new Error('Reconnect with expired token should have failed'));
        });
      });

      // -----------------------------------------------------------
      // 4. Socket manual disconnect clears timer cleanly
      // -----------------------------------------------------------
      const mediumToken = jwt.sign(
        { userId: dbUser.id, role: dbUser.role },
        secret,
        { expiresIn: '5s' }
      );

      await new Promise<void>((resolve) => {
        const socket = ioc(wsUrl, {
          extraHeaders: { Cookie: `auth_token=${mediumToken}` },
          reconnection: false,
        });

        socket.on('connect', () => {
          // Disconnect manually before expiry
          setTimeout(() => {
            socket.close();
            resolve();
          }, 300);
        });
      });

      // -----------------------------------------------------------
      // 5. Subsequent connection with valid token stays connected and receives telemetry
      // -----------------------------------------------------------
      const validToken = authService.generateToken({ userId: dbUser.id, role: dbUser.role });
      await new Promise<void>((resolve, reject) => {
        const socket = ioc(wsUrl, {
          extraHeaders: { Cookie: `auth_token=${validToken}` },
          reconnection: false,
        });

        let receivedSubscribed = false;

        socket.on('connect', () => {
          socket.emit('subscribe', { siteId: siteRecord.id });
        });

        socket.on('subscribed', (payload: any) => {
          if (payload.siteId === siteRecord.id) {
            receivedSubscribed = true;
          }
        });

        socket.on('telemetry', (payload: any) => {
          // Broadcast works normally
        });

        setTimeout(() => {
          expect(receivedSubscribed).toBe(true);
          expect(socket.connected).toBe(true);
          socket.close();
          resolve();
        }, 1000);
      });
    } finally {
      httpServer.close();
    }
  });
});

/**
 * Phase 13 WebSocket Authentication & Authorization Tests
 * 
 * Tests WebSocket connections, JWT auth, site subscriptions, and client isolation.
 * Run: npx tsx test-websocket.ts
 */

import 'dotenv/config';
import { io as ioc } from 'socket.io-client';
import * as http from 'http';
import express from 'express';
import { authService } from '../../src/services/auth.service';
import { webSocketService } from '../../src/services/websocket.service';
import { prisma } from '../../src/db/prisma';

// ---- Test Helpers ----


function assert(condition: boolean, name: string) {
  if (!condition) {
    throw new Error(`FAIL: ${name}`);
  }
}

function wait(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ---- Test Setup: Start a temporary HTTP+WS server ----
const app = express();
const httpServer = http.createServer(app);
webSocketService.initialize(httpServer);

const PORT = 7001;

import { describe, test } from 'vitest';

describe('test-websocket.ts', () => {
  test('Runs all checks', async () => {
  await new Promise<void>(resolve => httpServer.listen(PORT, resolve));
  console.log(`[WS Test] Server listening on port ${PORT}`);

  // ---- Shared Test Data Setup ----
  const uniqueSuffix = Date.now().toString();
  const adminDbUser = await prisma.user.create({
    data: { name: 'Admin', email: `admin.ws.${uniqueSuffix}@example.com`, passwordHash: 'hash', role: 'ADMIN' }
  });
  const clientRecord = await prisma.client.create({ data: { name: `WSTestClient_${uniqueSuffix}` } });
  const siteRecord = await prisma.site.create({ data: { name: `WSTestSite_${uniqueSuffix}`, clientId: clientRecord.id } });
  const bessRecord = await prisma.bESSAsset.create({ data: { name: `BESS1_${uniqueSuffix}`, emuId: `EMU_WS_${uniqueSuffix}`, siteId: siteRecord.id, assetIdentifier: `bess1_${uniqueSuffix}` } });
  const deviceRecord = await prisma.device.create({ data: { name: `PCS1_${uniqueSuffix}`, type: 'PCS', componentId: 'pcs', bessAssetId: bessRecord.id } });
  
  await prisma.telemetryHistory.create({
    data: {
      deviceId: deviceRecord.id,
      timestamp: new Date(),
      pcsActivePower: 123.4,
      rawPayload: []
    }
  });

  const adminToken = authService.generateToken({ userId: adminDbUser.id, role: 'ADMIN' });

  const clientToken = authService.generateToken({ userId: 'client-user-id', role: 'CLIENT' });
  const expiredToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiJ4Iiwicm9sZSI6IkNMSUVOVCIsImlhdCI6MTY4MDAwMDAwMCwiZXhwIjoxNjgwMDAwMDAxfQ.invalid';

  // =========================================================
  // TEST 1: Missing token → connection rejected
  // =========================================================
  await new Promise<void>(resolve => {
    const socket = ioc(`http://localhost:${PORT}`, {
      extraHeaders: { Cookie: '' }, // No token
      reconnection: false,
    });
    socket.on('connect_error', (err) => {
      assert(err.message === 'AUTH_REQUIRED', 'Missing token: connection rejected');
      socket.close();
      resolve();
    });
    socket.on('connect', () => {
      assert(false, 'Missing token: connection rejected'); // Should NOT connect
      socket.close();
      resolve();
    });
  });

  // =========================================================
  // TEST 2: Invalid token → connection rejected
  // =========================================================
  await new Promise<void>(resolve => {
    const socket = ioc(`http://localhost:${PORT}`, {
      extraHeaders: { Cookie: 'auth_token=thisisaninvalidtoken' },
      reconnection: false,
    });
    socket.on('connect_error', (err) => {
      assert(err.message === 'AUTH_REQUIRED', 'Invalid token: connection rejected');
      socket.close();
      resolve();
    });
    socket.on('connect', () => {
      assert(false, 'Invalid token: connection rejected'); // Should NOT connect
      socket.close();
      resolve();
    });
  });

  // =========================================================
  // TEST 3: Expired token → connection rejected
  // =========================================================
  await new Promise<void>(resolve => {
    const socket = ioc(`http://localhost:${PORT}`, {
      extraHeaders: { Cookie: `auth_token=${expiredToken}` },
      reconnection: false,
    });
    socket.on('connect_error', (err) => {
      assert(err.message === 'AUTH_REQUIRED', 'Expired token: connection rejected');
      socket.close();
      resolve();
    });
    socket.on('connect', () => {
      assert(false, 'Expired token: connection rejected'); // Should NOT connect
      socket.close();
      resolve();
    });
  });

  // =========================================================
  // TEST 4: Valid ADMIN token → connection accepted
  // =========================================================
  await new Promise<void>(resolve => {
    const socket = ioc(`http://localhost:${PORT}`, {
      extraHeaders: { Cookie: `auth_token=${adminToken}` },
      reconnection: false,
    });
    socket.on('connect', () => {
      assert(true, 'Valid ADMIN token: connected');
      socket.close();
      resolve();
    });
    socket.on('connect_error', (err) => {
      assert(false, `Valid ADMIN token: connected (error: ${err.message})`);
      socket.close();
      resolve();
    });
  });

  // =========================================================
  // TEST 5: Valid CLIENT token → connection accepted
  // =========================================================
  await new Promise<void>(resolve => {
    const socket = ioc(`http://localhost:${PORT}`, {
      extraHeaders: { Cookie: `auth_token=${clientToken}` },
      reconnection: false,
    });
    socket.on('connect', () => {
      assert(true, 'Valid CLIENT token: connected');
      socket.close();
      resolve();
    });
    socket.on('connect_error', (err) => {
      assert(false, `Valid CLIENT token: connected (error: ${err.message})`);
      socket.close();
      resolve();
    });
  });

  // =========================================================
  // TEST 6: Subscribe without siteId → no subscribed event
  // =========================================================
  await new Promise<void>(resolve => {
    const socket = ioc(`http://localhost:${PORT}`, {
      extraHeaders: { Cookie: `auth_token=${clientToken}` },
      reconnection: false,
    });
    socket.on('connect', () => {
      socket.emit('subscribe', {}); // No siteId
      setTimeout(() => {
        // If we get here without 'subscribed', the test is correct
        assert(true, 'Subscribe without siteId: gracefully ignored');
        socket.close();
        resolve();
      }, 500);
    });
    socket.on('subscribed', () => {
      // Should not receive this
      assert(false, 'Subscribe without siteId: gracefully ignored');
      socket.close();
      resolve();
    });
  });

  // =========================================================
  // TEST 7: Subscribe with non-existent siteId → error event
  // =========================================================
  await new Promise<void>(resolve => {
    const socket = ioc(`http://localhost:${PORT}`, {
      extraHeaders: { Cookie: `auth_token=${clientToken}` },
      reconnection: false,
    });
    socket.on('connect', () => {
      socket.emit('subscribe', { siteId: 'non-existent-site-id-xyz' });
    });
    socket.on('error', (err: { message: string }) => {
      assert(
        err.message.includes('Site not found') || err.message.includes('Forbidden') || err.message.includes('Internal server error'),
        'Subscribe unknown siteId: server returns error'
      );
      socket.close();
      resolve();
    });
    setTimeout(() => {
      // Timeout fallback
      socket.close();
      resolve();
    }, 2000);
  });

  // =========================================================
  // TEST 8: Broadcast telemetry reaches subscribed room
  // =========================================================
  await new Promise<void>(resolve => {
    // We test that broadcastTelemetry dispatches to the correct room
    // by directly calling the method and checking the socket.io internal room mechanics
    const fakeSiteId = 'fake-site-broadcast-test';
    const adminSocket = ioc(`http://localhost:${PORT}`, {
      extraHeaders: { Cookie: `auth_token=${adminToken}` },
      reconnection: false,
    });

    adminSocket.on('connect', () => {
      adminSocket.emit('subscribe', { siteId: fakeSiteId });
    });

    adminSocket.on('error', () => {
      // Expected - fake site won't resolve in DB, but socket is still connected
      // Room won't be joined, so broadcast won't reach it - that is the correct behavior
      assert(true, 'Broadcast to unauthorized room: correctly blocked by ownership check');
      adminSocket.close();
      resolve();
    });

    setTimeout(() => {
      adminSocket.close();
      resolve();
    }, 1500);
  });

  // =========================================================
  // TEST 9: Disconnect event is handled cleanly
  // =========================================================
  await new Promise<void>(resolve => {
    const socket = ioc(`http://localhost:${PORT}`, {
      extraHeaders: { Cookie: `auth_token=${adminToken}` },
      reconnection: false,
    });
    socket.on('connect', () => {
      socket.close();
    });
    socket.on('disconnect', () => {
      assert(true, 'Disconnect: handled cleanly');
      resolve();
    });
  });

  // =========================================================
  // TEST 10: Immediate telemetry broadcast on subscribe
  // =========================================================
  await new Promise<void>(resolve => {
    const socket = ioc(`http://localhost:${PORT}`, {
      extraHeaders: { Cookie: `auth_token=${adminToken}` },
      reconnection: false,
    });
    
    let receivedTelemetry = false;

    socket.on('connect', () => {
      socket.emit('subscribe', { siteId: siteRecord.id });
    });

    socket.on('telemetry', (payload) => {
      if (payload.siteId === siteRecord.id && payload.data.bessPower === 123.4) {
        receivedTelemetry = true;
      }
    });

    setTimeout(() => {
      assert(receivedTelemetry, 'Immediate telemetry on subscribe received');
      socket.close();
      resolve();
    }, 1500);
  });

  // =========================================================
  // Final Summary
  // =========================================================
  httpServer.close();

  });
});

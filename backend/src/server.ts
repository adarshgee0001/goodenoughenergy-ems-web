import * as dotenv from 'dotenv';
import * as http from 'http';
import app from './app';
import { mqttService } from './services/mqtt.service';
import { webSocketService } from './services/websocket.service';
import { prisma } from './db/prisma';
import { telemetrySnapshotService } from './services/telemetry-snapshot.service';
import { retentionService } from './services/retention.service';

// Load environment variables
dotenv.config();

const PORT = process.env.PORT || 5000;

// Create the HTTP server explicitly so Socket.IO is attached
// to the same server instance BEFORE listen() is called.
// This eliminates any race condition where a WebSocket upgrade
// request could arrive before Socket.IO is initialized.
const server = http.createServer(app);

// Attach Socket.IO to HTTP server before listening
webSocketService.initialize(server);

// ---------------------------------------------------------------------------
// 15-minute snapshot generation job
// Reads TelemetryHistory and upserts TelemetrySnapshot15m for the last 30 min.
// Runs independently of MQTT ingestion; does not modify live telemetry flow.
// ---------------------------------------------------------------------------
let isSnapshotJobRunning = false;

async function runSnapshotJob() {
  if (isSnapshotJobRunning) {
    console.warn('[Snapshot] Previous snapshot job is still running. Skipping this interval.');
    return;
  }
  
  isSnapshotJobRunning = true;
  try {
    const now = new Date();
    // Cover a 30-minute window to ensure the current and prior bucket are updated
    const windowStart = new Date(now.getTime() - 30 * 60 * 1000);
    console.log(`[Snapshot] Job started. Processing window: ${windowStart.toISOString()} to ${now.toISOString()}`);

    const besses = await prisma.bESSAsset.findMany({ select: { id: true, name: true } });
    let totalUpserted = 0;
    
    for (const bess of besses) {
      const count = await telemetrySnapshotService.generateSnapshotsForWindow(bess.id, windowStart, now);
      if (count > 0) {
        console.log(`[Snapshot] ${bess.name}: upserted ${count} bucket(s)`);
        totalUpserted += count;
      }
    }
    
    console.log(`[Snapshot] Job completed. Total snapshots generated/updated: ${totalUpserted}`);
  } catch (err) {
    console.error('[Snapshot] Job error:', err);
  } finally {
    isSnapshotJobRunning = false;
  }
}

// Start listening
server.listen(PORT, () => {
  console.log(`[Server] Backend is running at http://localhost:${PORT}`);
  console.log(`[Server] Environment: ${process.env.NODE_ENV || 'development'}`);

  // Initialize MQTT after server is confirmed listening
  mqttService.connect();

  // Run snapshot job immediately on startup, then every 1 minute
  runSnapshotJob();
  setInterval(runSnapshotJob, 1 * 60 * 1000);

  // Run retention cleanup periodically based on config (default 24h)
  const retentionInterval = parseInt(process.env.RETENTION_CLEANUP_INTERVAL || (24 * 60 * 60 * 1000).toString(), 10);
  setInterval(() => retentionService.runRetentionCleanup(), retentionInterval);
});

let isShuttingDown = false;

async function gracefulShutdown(signal: string, exitCode: number) {
  if (isShuttingDown) return;
  isShuttingDown = true;
  console.log(`[Server] ${signal} received. Shutting down gracefully...`);

  try {
    // 1. Close HTTP server and WebSockets
    await new Promise<void>((resolve) => {
      server.close(() => {
        console.log('[Server] HTTP server closed.');
        resolve();
      });
    });

    // 2. Disconnect MQTT
    try {
      mqttService.disconnect();
    } catch (err) {
      console.error('[Server] Error disconnecting MQTT:', err);
    }

    // 3. Disconnect Prisma
    try {
      await prisma.$disconnect();
      console.log('[Server] Prisma disconnected.');
    } catch (err) {
      console.error('[Server] Error disconnecting Prisma:', err);
    }

    console.log('[Server] Process terminated.');
    process.exit(exitCode);
  } catch (error) {
    console.error('[Server] Error during graceful shutdown:', error);
    process.exit(1);
  }
}

// Graceful shutdown handling
process.on('SIGTERM', () => gracefulShutdown('SIGTERM', 0));
process.on('SIGINT', () => gracefulShutdown('SIGINT', 0));

// Fatal error handling
process.on('uncaughtException', (error) => {
  console.error('[Server] FATAL: uncaughtException:', error);
  gracefulShutdown('uncaughtException', 1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('[Server] FATAL: unhandledRejection at:', promise, 'reason:', reason);
  gracefulShutdown('unhandledRejection', 1);
});

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export class RetentionService {
  private isRunning = false;
  private readonly BATCH_SIZE = parseInt(process.env.RETENTION_BATCH_SIZE || '10000', 10);
  private readonly RETENTION_MONTHS = 6;

  /**
   * Calculates the exact rolling boundary timestamp (UTC) for 6 months ago.
   */
  private getRetentionBoundary(): Date {
    const boundary = new Date();
    boundary.setUTCMonth(boundary.getUTCMonth() - this.RETENTION_MONTHS);
    return boundary;
  }

  /**
   * The main cron job entry point.
   */
  public async runRetentionCleanup() {
    if (this.isRunning) {
      console.log(`[RETENTION] Cleanup skipped because a previous run is still active.`);
      return;
    }

    this.isRunning = true;
    const boundary = this.getRetentionBoundary();
    console.log(`[RETENTION] Cleanup started. Boundary: ${boundary.toISOString()} (older than ${this.RETENTION_MONTHS} months)`);

    try {
      // We process client by client to ensure strict isolation.
      const clients = await prisma.client.findMany({ select: { id: true, name: true } });

      for (const client of clients) {
        console.log(`[RETENTION] Processing Client: ${client.name} (${client.id})`);
        
        await this.cleanTelemetryHistory(client.id, boundary);
        await this.cleanTelemetrySnapshots(client.id, boundary);
        await this.cleanAlarms(client.id, boundary);
      }

      console.log(`[RETENTION] Cleanup completed successfully.`);
    } catch (error) {
      console.error(`[RETENTION] Error during cleanup:`, error);
    } finally {
      this.isRunning = false;
    }
  }

  private async cleanTelemetryHistory(clientId: string, boundary: Date) {
    let deletedCount = 0;
    let batchNum = 1;

    while (true) {
      // Find IDs belonging to this client AND older than boundary
      // We use 'take' for batching to keep transaction sizes small.
      const recordsToDelete = await prisma.telemetryHistory.findMany({
        where: {
          timestamp: { lt: boundary },
          device: {
            bessAsset: {
              site: {
                clientId: clientId
              }
            }
          }
        },
        select: { id: true },
        take: this.BATCH_SIZE
      });

      if (recordsToDelete.length === 0) {
        break; // No more eligible records for this client
      }

      const ids = recordsToDelete.map(r => r.id);

      // Execute delete
      const result = await prisma.telemetryHistory.deleteMany({
        where: { id: { in: ids } }
      });

      deletedCount += result.count;
      console.log(`[RETENTION] [TelemetryHistory] Client ${clientId} - Batch ${batchNum} deleted ${result.count} records.`);
      
      batchNum++;
    }

    if (deletedCount > 0) {
      console.log(`[RETENTION] [TelemetryHistory] Client ${clientId} - Total deleted: ${deletedCount}`);
    }
  }

  private async cleanTelemetrySnapshots(clientId: string, boundary: Date) {
    let deletedCount = 0;
    let batchNum = 1;

    while (true) {
      const recordsToDelete = await prisma.telemetrySnapshot15m.findMany({
        where: {
          bucketTimestamp: { lt: boundary },
          bessAsset: {
            site: {
              clientId: clientId
            }
          }
        },
        select: { id: true },
        take: this.BATCH_SIZE
      });

      if (recordsToDelete.length === 0) break;

      const ids = recordsToDelete.map(r => r.id);

      const result = await prisma.telemetrySnapshot15m.deleteMany({
        where: { id: { in: ids } }
      });

      deletedCount += result.count;
      console.log(`[RETENTION] [TelemetrySnapshot15m] Client ${clientId} - Batch ${batchNum} deleted ${result.count} records.`);
      batchNum++;
    }

    if (deletedCount > 0) {
      console.log(`[RETENTION] [TelemetrySnapshot15m] Client ${clientId} - Total deleted: ${deletedCount}`);
    }
  }

  private async cleanAlarms(clientId: string, boundary: Date) {
    let deletedCount = 0;
    let batchNum = 1;

    while (true) {
      const recordsToDelete = await prisma.alarm.findMany({
        where: {
          createdAt: { lt: boundary },
          device: {
            bessAsset: {
              site: {
                clientId: clientId
              }
            }
          }
        },
        select: { id: true },
        take: this.BATCH_SIZE
      });

      if (recordsToDelete.length === 0) break;

      const ids = recordsToDelete.map(r => r.id);

      const result = await prisma.alarm.deleteMany({
        where: { id: { in: ids } }
      });

      deletedCount += result.count;
      console.log(`[RETENTION] [Alarm] Client ${clientId} - Batch ${batchNum} deleted ${result.count} records.`);
      batchNum++;
    }

    if (deletedCount > 0) {
      console.log(`[RETENTION] [Alarm] Client ${clientId} - Total deleted: ${deletedCount}`);
    }
  }
}

export const retentionService = new RetentionService();

import { PrismaClient } from '@prisma/client';
import { describe, test, expect, beforeAll, afterAll } from 'vitest';
import { dynamicReportService } from '../../src/services/dynamic-report.service';

const prisma = new PrismaClient();

describe('dynamic-report.service.ts', () => {
  let siteId = '';
  let clientId = '';

  beforeAll(async () => {
    const clientRecord = await prisma.client.create({ data: { name: 'DynamicReportClient' } });
    clientId = clientRecord.id;

    const siteRecord = await prisma.site.create({ data: { name: 'DynamicReportSite', clientId: clientRecord.id } });
    siteId = siteRecord.id;
  });

  afterAll(async () => {
    await prisma.telemetryHistory.deleteMany({
      where: { device: { bessAsset: { siteId } } }
    });
    await prisma.device.deleteMany({
      where: { bessAsset: { siteId } }
    });
    await prisma.bESSAsset.deleteMany({
      where: { siteId }
    });
    await prisma.site.deleteMany({ where: { id: siteId } });
    await prisma.client.deleteMany({ where: { id: clientId } });
  });

  test('chargeDifference / dischargeDifference logic', async () => {
    const bess1 = await prisma.bESSAsset.create({ data: { name: 'BESS01', assetIdentifier: 'BESS01_ID', emuId: '111', siteId } });
    const bess2 = await prisma.bESSAsset.create({ data: { name: 'BESS02', assetIdentifier: 'BESS02_ID', emuId: '222', siteId } });
    
    const device1 = await prisma.device.create({
      data: { type: 'BMS', name: 'Device1', componentId: 'd1', bessAssetId: bess1.id }
    });
    const device2 = await prisma.device.create({
      data: { type: 'BMS', name: 'Device2', componentId: 'd2', bessAssetId: bess2.id }
    });

    const t1 = new Date('2026-09-01T10:00:00Z');
    const t2 = new Date('2026-09-01T10:15:00Z');
    
    // BESS 01: first charge = 10, last charge = 30
    await prisma.telemetryHistory.create({
      data: { deviceId: device1.id, timestamp: t1, accumChargeEnergy: 10, accumDischargeEnergy: 2, rawPayload: {} }
    });
    await prisma.telemetryHistory.create({
      data: { deviceId: device1.id, timestamp: t2, accumChargeEnergy: 30, accumDischargeEnergy: 5, rawPayload: {} }
    });

    // BESS 02: first charge = 20, last charge = 50
    await prisma.telemetryHistory.create({
      data: { deviceId: device2.id, timestamp: t1, accumChargeEnergy: 20, accumDischargeEnergy: 3, rawPayload: {} }
    });
    await prisma.telemetryHistory.create({
      data: { deviceId: device2.id, timestamp: t2, accumChargeEnergy: 50, accumDischargeEnergy: 8, rawPayload: {} }
    });

    const from = new Date('2026-09-01T09:00:00Z');
    const to = new Date('2026-09-01T11:00:00Z');

    const result = await dynamicReportService.getDynamicReport(siteId, 15, from, to, undefined, 100, 0);

    // Expected chargeDiff: BESS01 (30-10=20) + BESS02 (50-20=30) = 50
    expect(result.summary?.chargeDifference).toBe(50);

    // Expected dischargeDiff: BESS01 (5-2=3) + BESS02 (8-3=5) = 8
    expect(result.summary?.dischargeDifference).toBe(8);
  });
});

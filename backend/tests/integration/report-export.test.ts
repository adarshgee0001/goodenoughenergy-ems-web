import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import app from '../../src/app';
import { prisma } from '../../src/db/prisma';
import { sign } from 'jsonwebtoken';
import http from 'http';
import ExcelJS from 'exceljs';

import { authService } from '../../src/services/auth.service';

function generateToken(user: any) {
  return authService.generateToken({ userId: user.id, role: user.role });
}

describe('test-report-export.ts', () => {
  let adminToken: string;
  let clientToken: string;
  let unauthorizedClientToken: string;
  let siteId: string;
  let baseUrl: string;
  let server: http.Server;
  
  let admin: any, client: any, unauthClient: any, clientUser: any, unauthUser: any;
  let site: any, bess1: any, bess2: any, d1: any, d2: any;
  let singleSite: any, singleBess: any, singleDevice: any;

  beforeAll(async () => {
    console.log('Starting Report Export Integration Tests...');

    server = http.createServer(app);
    await new Promise<void>((resolve) => server.listen(0, () => resolve()));
    const port = (server.address() as any).port;
    baseUrl = `http://localhost:${port}/api`;

    // Clean up any left over state
    await prisma.telemetryHistory.deleteMany();
    await prisma.device.deleteMany({ where: { componentId: { in: ['pcs1', 'pcs2', 'pcs-single'] } } });
    await prisma.bESSAsset.deleteMany({ where: { name: { in: ['BESS 01', 'BESS 02', 'Single BESS'] } } });
    await prisma.site.deleteMany({ where: { name: { in: ['Export Site', 'Single Export Site'] } } });
    await prisma.user.deleteMany({ where: { email: { in: ['admin-export@example.com', 'client-export@example.com', 'unauth-export@example.com'] } } });
    await prisma.client.deleteMany({ where: { name: { in: ['Export Client', 'Unauthorized Client'] } } });

    admin = await prisma.user.create({
      data: {
        email: 'admin-export@example.com',
        name: 'Admin',
        passwordHash: 'hash',
        role: 'ADMIN'
      }
    });
    adminToken = generateToken(admin);

    client = await prisma.client.create({
      data: { name: 'Export Client' }
    });

    unauthClient = await prisma.client.create({
      data: { name: 'Unauthorized Client' }
    });

    clientUser = await prisma.user.create({
      data: {
        email: 'client-export@example.com',
        name: 'Client',
        passwordHash: 'hash',
        role: 'CLIENT',
        clientAccess: {
          create: {
            clientId: client.id,
          }
        }
      }
    });
    clientToken = generateToken(clientUser);

    unauthUser = await prisma.user.create({
      data: {
        email: 'unauth-export@example.com',
        name: 'Unauthorized',
        passwordHash: 'hash',
        role: 'CLIENT',
        clientAccess: {
          create: {
            clientId: unauthClient.id,
          }
        }
      }
    });
    unauthorizedClientToken = generateToken(unauthUser);

    site = await prisma.site.create({
      data: {
        name: 'Export Site',
        clientId: client.id,
        timezone: 'Asia/Kolkata',
      }
    });
    siteId = site.id;

    bess1 = await prisma.bESSAsset.create({ data: { name: 'BESS 01', siteId: site.id, model: 'M1', assetIdentifier: 'bess-01', emuId: 'EMU001' } });
    bess2 = await prisma.bESSAsset.create({ data: { name: 'BESS 02', siteId: site.id, model: 'M1', assetIdentifier: 'bess-02', emuId: 'EMU002' } });

    d1 = await prisma.device.create({ data: { componentId: 'pcs1', bessAssetId: bess1.id, name: 'PCS1', type: 'PCS' }});
    d2 = await prisma.device.create({ data: { componentId: 'pcs2', bessAssetId: bess2.id, name: 'PCS2', type: 'PCS' }});

    const now = new Date('2026-09-01T12:00:00.000Z');
    const earlier = new Date('2026-09-01T10:00:00.000Z');
    const middle = new Date('2026-09-01T11:00:00.000Z'); // to test chronological not min/max

    await prisma.telemetryHistory.create({
      data: {
        deviceId: d1.id,
        timestamp: earlier,
        accumChargeEnergy: 1250.50,
        accumDischargeEnergy: 800.20,
        rawPayload: {}
      }
    });
    
    // Add a middle record with a higher number to prove chronological, not MAX()
    await prisma.telemetryHistory.create({
      data: {
        deviceId: d1.id,
        timestamp: middle,
        accumChargeEnergy: 1300.00, // strictly greater than 1268.75
        accumDischargeEnergy: 850.00, // strictly greater than 812.60
        rawPayload: {}
      }
    });

    await prisma.telemetryHistory.create({
      data: {
        deviceId: d1.id,
        timestamp: now,
        pcsActivePower: 15.2,
        gridSideLoad: 100,
        solarPower: 50,
        todayChargeEnergy: 20,
        todayDischargeEnergy: 5,
        accumChargeEnergy: 1268.75,
        accumDischargeEnergy: 812.60,
        soc: 80,
        soh: 98,
        ambientTemp: 35,
        dcVoltage: 850,
        voltageA: 240,
        rawPayload: {}
      }
    });

    await prisma.telemetryHistory.create({
      data: {
        deviceId: d2.id,
        timestamp: earlier,
        accumChargeEnergy: 2000.00,
        accumDischargeEnergy: 900.00,
        rawPayload: {}
      }
    });

    await prisma.telemetryHistory.create({
      data: {
        deviceId: d2.id,
        timestamp: now,
        pcsActivePower: -10.2,
        gridSideLoad: 200,
        solarPower: 70,
        todayChargeEnergy: 30,
        todayDischargeEnergy: 8,
        accumChargeEnergy: 2021.50,
        accumDischargeEnergy: 914.75,
        soc: 90,
        soh: 96,
        ambientTemp: 40,
        dcVoltage: 860,
        voltageA: 242,
        rawPayload: {}
      }
    });

    singleSite = await prisma.site.create({
      data: {
        name: 'Single Export Site',
        clientId: client.id,
        timezone: 'Asia/Kolkata',
      }
    });
    singleBess = await prisma.bESSAsset.create({ data: { name: 'Single BESS', siteId: singleSite.id, model: 'M1', assetIdentifier: 'bess-single', emuId: 'EMU-SINGLE' } });
    singleDevice = await prisma.device.create({ data: { componentId: 'pcs-single', bessAssetId: singleBess.id, name: 'PCS-Single', type: 'PCS' }});

    await prisma.telemetryHistory.create({
      data: {
        deviceId: singleDevice.id,
        timestamp: new Date('2026-09-01T12:00:00.000Z'),
        accumChargeEnergy: 1250.50,
        accumDischargeEnergy: 800.20,
        rawPayload: {}
      }
    });

    await prisma.telemetryHistory.create({
      data: {
        deviceId: singleDevice.id,
        timestamp: new Date('2026-09-01T12:15:00.000Z'),
        accumChargeEnergy: 1268.75,
        accumDischargeEnergy: 812.60,
        rawPayload: {}
      }
    });
  });

  afterAll(async () => {
    // Delete specifically what we created to avoid race conditions with other tests
    if (d1 && d2) await prisma.telemetryHistory.deleteMany({ where: { deviceId: { in: [d1.id, d2.id] } } });
    if (d1 && d2) await prisma.device.deleteMany({ where: { id: { in: [d1.id, d2.id] } } });
    if (bess1 && bess2) await prisma.bESSAsset.deleteMany({ where: { id: { in: [bess1.id, bess2.id] } } });
    if (site) await prisma.site.deleteMany({ where: { id: site.id } });
    
    if (singleDevice) await prisma.telemetryHistory.deleteMany({ where: { deviceId: singleDevice.id } });
    if (singleDevice) await prisma.device.deleteMany({ where: { id: singleDevice.id } });
    if (singleBess) await prisma.bESSAsset.deleteMany({ where: { id: singleBess.id } });
    if (singleSite) await prisma.site.deleteMany({ where: { id: singleSite.id } });
    if (admin && clientUser && unauthUser) await prisma.user.deleteMany({ where: { id: { in: [admin.id, clientUser.id, unauthUser.id] } } });
    if (client && unauthClient) await prisma.client.deleteMany({ where: { id: { in: [client.id, unauthClient.id] } } });
    server.close();
  });

  it('Runs all checks', async () => {
    // 1. Unauthenticated
    const resUnauth = await fetch(`${baseUrl}/sites/${siteId}/telemetry/export?intervalMinutes=15`);
    expect(resUnauth.status).toBe(401);

    // 2. Unauthorized client
    const resForbidden = await fetch(`${baseUrl}/sites/${siteId}/telemetry/export?intervalMinutes=15`, {
      headers: { 'Cookie': `auth_token=${unauthorizedClientToken}` }
    });
    expect(resForbidden.status).toBe(403);

    // 3. Authorized request, valid export
    const resExport = await fetch(`${baseUrl}/sites/${siteId}/telemetry/export?intervalMinutes=15&from=2026-09-01T00:00:00.000Z&to=2026-09-02T00:00:00.000Z`, {
      headers: { 'Cookie': `auth_token=${clientToken}` }
    });
    expect(resExport.status).toBe(200);
    expect(resExport.headers.get('content-type')).toBe('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    
    const buffer = await resExport.arrayBuffer();
    
    // Parse workbook
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(Buffer.from(buffer));
    
    // Verify Multi-BESS structure
    const sheet1 = workbook.getWorksheet('Per-BESS Details');
    const sheet2 = workbook.getWorksheet('Site Summary');
    
    expect(sheet1).toBeDefined();
    expect(sheet2).toBeDefined();

    // Verify Multi-BESS summaries
    // BESS 01 summary
    expect(sheet1!.getRow(1).getCell(1).value).toBe('BESS 01');
    expect(sheet1!.getRow(2).getCell(1).value).toBe('Total Charge Difference');
    expect(sheet1!.getRow(2).getCell(2).value).toBeCloseTo(18.25); // 1268.75 - 1250.50 (ignores the 1300 middle value)
    expect(sheet1!.getRow(2).getCell(2).numFmt).toBe('0.00 "kWh"');
    expect(sheet1!.getRow(3).getCell(1).value).toBe('Total Discharge Difference');
    expect(sheet1!.getRow(3).getCell(2).value).toBeCloseTo(12.40); // 812.60 - 800.20
    expect(sheet1!.getRow(3).getCell(2).numFmt).toBe('0.00 "kWh"');

    // BESS 02 summary
    expect(sheet1!.getRow(5).getCell(1).value).toBe('BESS 02');
    expect(sheet1!.getRow(6).getCell(1).value).toBe('Total Charge Difference');
    expect(sheet1!.getRow(6).getCell(2).value).toBeCloseTo(21.50); // 2021.50 - 2000.00
    expect(sheet1!.getRow(6).getCell(2).numFmt).toBe('0.00 "kWh"');
    expect(sheet1!.getRow(7).getCell(1).value).toBe('Total Discharge Difference');
    expect(sheet1!.getRow(7).getCell(2).value).toBeCloseTo(14.75); // 914.75 - 900.00
    expect(sheet1!.getRow(7).getCell(2).numFmt).toBe('0.00 "kWh"');

    // Verify Table Header is present and intact below summaries
    const mbHeaderRow = sheet1!.getRow(9);
    expect(mbHeaderRow.getCell(1).value).toBe('Timestamp');
    expect(mbHeaderRow.getCell(2).value).toBe('BESS Name');
    expect(mbHeaderRow.getCell(3).value).toBe('EMU Serial No.');
    expect(mbHeaderRow.getCell(4).value).toBe('Grid Power (kW)');
    expect(mbHeaderRow.getCell(20).value).toBe('Accum Charge Energy (kWh)');
    expect(mbHeaderRow.getCell(26).value).toBe('Grid Frequency (Hz)');

    // Verify Data row identities for BESS 01 and 02
    const mbDataRow1 = sheet1!.getRow(10);
    expect(mbDataRow1.getCell(2).value).toBe('BESS 01');
    expect(mbDataRow1.getCell(3).value).toBe('EMU001');

    const mbDataRow2 = sheet1!.getRow(11); // BESS 02
    expect(mbDataRow2.getCell(2).value).toBe('BESS 02');
    expect(mbDataRow2.getCell(3).value).toBe('EMU002');

    // Verify Site Summary differences
    expect(sheet2!.getRow(1).getCell(1).value).toBe('Total Charge Difference');
    expect(sheet2!.getRow(1).getCell(2).value).toBeCloseTo(39.75); // 18.25 + 21.50
    expect(sheet2!.getRow(1).getCell(2).numFmt).toBe('0.00 "kWh"');
    expect(sheet2!.getRow(2).getCell(1).value).toBe('Total Discharge Difference');
    expect(sheet2!.getRow(2).getCell(2).value).toBeCloseTo(27.15); // 12.40 + 14.75
    expect(sheet2!.getRow(2).getCell(2).numFmt).toBe('0.00 "kWh"');

    // Verify Site Summary Aggregation (now shifted to row 6 because of 3 prepended rows)
    const summaryRow = sheet2!.getRow(6);
    expect(summaryRow.getCell(2).value).toBe(300); // Grid
    expect(summaryRow.getCell(3).value).toBe(5); // BESS Power (15.2 - 10.2 = 5)
    expect(summaryRow.getCell(4).value).toBe(120); // Solar Power
    expect(summaryRow.getCell(5).value).toBe(50); // Today Charge (20+30)
    expect(summaryRow.getCell(6).value).toBe(13); // Today Discharge (5+8)
    expect(summaryRow.getCell(7).value).toBe(85); // Avg SOC
    expect(summaryRow.getCell(8).value).toBe(97); // Avg SOH
    expect(summaryRow.getCell(9).value).toBe(40); // Max Temp
    
    // Check that we have exactly numbers, not strings
    expect(typeof summaryRow.getCell(3).value).toBe('number');

    // 4. Single-BESS Export
    const resSingleExport = await fetch(`${baseUrl}/sites/${singleSite.id}/telemetry/export?intervalMinutes=15&from=2026-09-01T00:00:00.000Z&to=2026-09-02T00:00:00.000Z`, {
      headers: { 'Cookie': `auth_token=${clientToken}` }
    });
    expect(resSingleExport.status).toBe(200);
    
    const bufferSingle = await resSingleExport.arrayBuffer();
    const wbSingle = new ExcelJS.Workbook();
    await wbSingle.xlsx.load(Buffer.from(bufferSingle));
    
    const singleSheet = wbSingle.getWorksheet('Telemetry Report');
    expect(singleSheet).toBeDefined();
    
    const chargeDiffRow = singleSheet!.getRow(1);
    expect(chargeDiffRow.getCell(1).value).toBe('Total Charge Difference');
    expect(chargeDiffRow.getCell(2).value).toBeCloseTo(18.25);
    expect(chargeDiffRow.getCell(2).numFmt).toBe('0.00 "kWh"');
    
    const dischargeDiffRow = singleSheet!.getRow(2);
    expect(dischargeDiffRow.getCell(1).value).toBe('Total Discharge Difference');
    expect(dischargeDiffRow.getCell(2).value).toBeCloseTo(12.40);
    expect(dischargeDiffRow.getCell(2).numFmt).toBe('0.00 "kWh"');
    
    const headerRow = singleSheet!.getRow(4);
    expect(headerRow.getCell(1).value).toBe('Timestamp');
    expect(headerRow.getCell(2).value).toBe('BESS Name');
    expect(headerRow.getCell(3).value).toBe('EMU Serial No.');
    expect(headerRow.getCell(4).value).toBe('Grid Power (kW)');
    expect(headerRow.getCell(14).value).toBe('Voltage B (V)');
    expect(headerRow.getCell(19).value).toBe('Total Power (kW)');
    expect(headerRow.getCell(20).value).toBe('Accum Charge Energy (kWh)');
    expect(headerRow.getCell(25).value).toBe('Cell Temp Max (°C)');
    expect(headerRow.getCell(26).value).toBe('Grid Frequency (Hz)');
    
    const dataRow = singleSheet!.getRow(5);
    expect(dataRow.getCell(2).value).toBe('Single BESS');
    expect(dataRow.getCell(3).value).toBe('EMU-SINGLE');
    expect(dataRow.getCell(20).value).toBe(1268.75); // the later record is on top
  });
});

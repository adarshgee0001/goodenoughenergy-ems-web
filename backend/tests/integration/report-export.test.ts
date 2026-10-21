import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import ExcelJS from 'exceljs';
import app from '../../src/app';
import { prisma } from '../../src/db/prisma';
import { sign } from 'jsonwebtoken';
import http from 'http';

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

    // 3. Authorized request, valid export for Multi-BESS site (restores Excel workbook)
    const resExport = await fetch(`${baseUrl}/sites/${siteId}/telemetry/export?intervalMinutes=15&from=2026-09-01T00:00:00.000Z&to=2026-09-02T00:00:00.000Z`, {
      headers: { 'Cookie': `auth_token=${clientToken}` }
    });
    expect(resExport.status).toBe(200);
    expect(resExport.headers.get('content-type')).toBe('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    expect(resExport.headers.get('content-disposition')).toContain('.xlsx');

    const multiExcelBuffer = await resExport.arrayBuffer();
    const wbMulti = new ExcelJS.Workbook();
    await wbMulti.xlsx.load(Buffer.from(multiExcelBuffer));

    // Verify worksheets are present: Site Summary and separate sheet for each BESS
    const sheetNames = wbMulti.worksheets.map((w) => w.name);
    expect(sheetNames).toEqual(['Site Summary', 'BESS 01', 'BESS 02']);
    expect(wbMulti.getWorksheet('Per-BESS Details')).toBeUndefined();

    const sheetSummary = wbMulti.getWorksheet('Site Summary')!;
    const sheetBess1 = wbMulti.getWorksheet('BESS 01')!;
    const sheetBess2 = wbMulti.getWorksheet('BESS 02')!;
    expect(sheetSummary).toBeDefined();
    expect(sheetBess1).toBeDefined();
    expect(sheetBess2).toBeDefined();

    // Verify Site Summary metadata & differences (canonical kW / kWh)
    expect(sheetSummary.getRow(1).getCell(1).value).toBe('EMS Site Summary');
    expect(sheetSummary.getRow(2).getCell(1).value).toBe('Client Name:');
    expect(sheetSummary.getRow(2).getCell(2).value).toBe('Export Client');
    expect(sheetSummary.getRow(3).getCell(2).value).toBe('Export Site');
    expect(sheetSummary.getRow(8).getCell(1).value).toBe('Total Charge Difference');
    expect(sheetSummary.getRow(8).getCell(2).value).toBeCloseTo(39.75);
    expect(sheetSummary.getRow(8).getCell(2).numFmt).toBe('0.00 "kWh"');
    expect(sheetSummary.getRow(9).getCell(1).value).toBe('Total Discharge Difference');
    expect(sheetSummary.getRow(9).getCell(2).value).toBeCloseTo(27.15);
    expect(sheetSummary.getRow(9).getCell(2).numFmt).toBe('0.00 "kWh"');

    // Verify Site Summary aggregated data (Row 12 immediately beneath header row 11)
    const summaryRow = sheetSummary.getRow(12);
    expect(summaryRow.getCell(2).value).toBe(300); // Grid: 100 + 200
    expect(summaryRow.getCell(3).value).toBe(5); // BESS Power: 15.2 - 10.2
    expect(summaryRow.getCell(4).value).toBe(120); // Solar: 50 + 70
    expect(summaryRow.getCell(5).value).toBe(50); // Today Charge: 20 + 30
    expect(summaryRow.getCell(6).value).toBe(13); // Today Discharge: 5 + 8
    expect(summaryRow.getCell(7).value).toBe(85); // Avg SOC: (80 + 90) / 2
    expect(summaryRow.getCell(8).value).toBe(97); // Avg SOH: (98 + 96) / 2
    // Max PCS Temp removed; cells 9, 10, 11 are Average Frequencies (null when unrecorded)
    expect(summaryRow.getCell(9).value).toBeNull();
    expect(summaryRow.getCell(10).value).toBeNull();
    expect(summaryRow.getCell(11).value).toBeNull();

    // Verify BESS 01 metadata and individual summary (Rows 1-10)
    expect(sheetBess1.getRow(1).getCell(1).value).toBe('EMS Reports Export (Multi-BESS)');
    expect(sheetBess1.getRow(2).getCell(2).value).toBe('Export Client');
    expect(sheetBess1.getRow(3).getCell(2).value).toBe('Export Site');
    expect(sheetBess1.getRow(8).getCell(1).value).toBe('BESS 01');
    expect(sheetBess1.getRow(9).getCell(1).value).toBe('Total Charge Difference');
    expect(sheetBess1.getRow(9).getCell(2).value).toBeCloseTo(18.25);
    expect(sheetBess1.getRow(9).getCell(2).numFmt).toBe('0.00 "kWh"');
    expect(sheetBess1.getRow(10).getCell(1).value).toBe('Total Discharge Difference');
    expect(sheetBess1.getRow(10).getCell(2).value).toBeCloseTo(12.40);
    expect(sheetBess1.getRow(10).getCell(2).numFmt).toBe('0.00 "kWh"');

    // BESS 01 headers (Row 12)
    const mbHeaderRow1 = sheetBess1.getRow(12);
    expect(mbHeaderRow1.getCell(1).value).toBe('Timestamp');
    expect(mbHeaderRow1.getCell(2).value).toBe('BESS Name');
    expect(mbHeaderRow1.getCell(3).value).toBe('EMU Serial No.');
    expect(mbHeaderRow1.getCell(4).value).toBe('Grid Side Load (kW)');
    expect(mbHeaderRow1.getCell(7).value).toBe('BESS Frequency (Hz)');
    expect(mbHeaderRow1.getCell(41).value).toBe('Accum Charge Energy (kWh)');

    // BESS 01 data rows (Rows 13+) - contain strictly and only BESS 01
    let bess1RowCount = 0;
    sheetBess1.eachRow((row, rowNumber) => {
      if (rowNumber > 12) {
        bess1RowCount++;
        expect(row.getCell(2).value).toBe('BESS 01');
        expect(row.getCell(3).value).toBe('EMU001');
      }
    });
    expect(bess1RowCount).toBeGreaterThan(0);

    // Verify BESS 02 metadata and individual summary (Rows 1-10)
    expect(sheetBess2.getRow(1).getCell(1).value).toBe('EMS Reports Export (Multi-BESS)');
    expect(sheetBess2.getRow(2).getCell(2).value).toBe('Export Client');
    expect(sheetBess2.getRow(3).getCell(2).value).toBe('Export Site');
    expect(sheetBess2.getRow(8).getCell(1).value).toBe('BESS 02');
    expect(sheetBess2.getRow(9).getCell(1).value).toBe('Total Charge Difference');
    expect(sheetBess2.getRow(9).getCell(2).value).toBeCloseTo(21.50);
    expect(sheetBess2.getRow(9).getCell(2).numFmt).toBe('0.00 "kWh"');
    expect(sheetBess2.getRow(10).getCell(1).value).toBe('Total Discharge Difference');
    expect(sheetBess2.getRow(10).getCell(2).value).toBeCloseTo(14.75);
    expect(sheetBess2.getRow(10).getCell(2).numFmt).toBe('0.00 "kWh"');

    // BESS 02 headers (Row 12)
    const mbHeaderRow2 = sheetBess2.getRow(12);
    expect(mbHeaderRow2.getCell(1).value).toBe('Timestamp');
    expect(mbHeaderRow2.getCell(2).value).toBe('BESS Name');
    expect(mbHeaderRow2.getCell(3).value).toBe('EMU Serial No.');

    // BESS 02 data rows (Rows 13+) - contain strictly and only BESS 02
    let bess2RowCount = 0;
    sheetBess2.eachRow((row, rowNumber) => {
      if (rowNumber > 12) {
        bess2RowCount++;
        expect(row.getCell(2).value).toBe('BESS 02');
        expect(row.getCell(3).value).toBe('EMU002');
      }
    });
    expect(bess2RowCount).toBeGreaterThan(0);

    // 4. Single-BESS Export remains CSV with authoritative 29 columns
    const resSingleExport = await fetch(`${baseUrl}/sites/${singleSite.id}/telemetry/export?intervalMinutes=15&from=2026-09-01T00:00:00.000Z&to=2026-09-02T00:00:00.000Z`, {
      headers: { 'Cookie': `auth_token=${clientToken}` }
    });
    expect(resSingleExport.status).toBe(200);
    expect(resSingleExport.headers.get('content-type')).toBe('text/csv; charset=utf-8');
    expect(resSingleExport.headers.get('content-disposition')).toContain('.csv');
    
    const singleCsvBuffer = Buffer.from(await resSingleExport.arrayBuffer());
    expect(singleCsvBuffer[0]).toBe(0xEF);
    expect(singleCsvBuffer[1]).toBe(0xBB);
    expect(singleCsvBuffer[2]).toBe(0xBF);
    const singleCsvContent = singleCsvBuffer.toString('utf8');

    expect(singleCsvContent).toContain('EMS Reports Export');
    expect(singleCsvContent).toContain('Total Charge Difference (kWh),18.25');
    expect(singleCsvContent).toContain('Total Discharge Difference (kWh),12.4');

    expect(singleCsvContent).toContain('Timestamp,BESS Name,EMU Serial No.,Grid Side Load (kW)');
    expect(singleCsvContent).not.toContain('Cabinet Meter Power (kW)');
    expect(singleCsvContent).toContain('Accum Charge Energy (kWh)');
    expect(singleCsvContent).toContain('Cell Temp Max (°C)');
    expect(singleCsvContent).toContain('Grid Frequency (Hz)');

    expect(singleCsvContent).toContain('Single BESS,EMU-SINGLE');
    expect(singleCsvContent).toContain('1268.75');

    // 5. Multi-BESS Export with Unit Preferences (MW and MWh)
    const resExportMw = await fetch(`${baseUrl}/sites/${siteId}/telemetry/export?intervalMinutes=15&from=2026-09-01T00:00:00.000Z&to=2026-09-02T00:00:00.000Z&powerUnit=MW&energyUnit=MWh`, {
      headers: { 'Cookie': `auth_token=${clientToken}` }
    });
    expect(resExportMw.status).toBe(200);
    const mwBuffer = await resExportMw.arrayBuffer();
    const wbMw = new ExcelJS.Workbook();
    await wbMw.xlsx.load(Buffer.from(mwBuffer));

    const sheetSummaryMw = wbMw.getWorksheet('Site Summary')!;
    const sheetBess1Mw = wbMw.getWorksheet('BESS 01')!;
    expect(wbMw.getWorksheet('Per-BESS Details')).toBeUndefined();

    // Differences converted to MWh (divided by 1000)
    expect(sheetSummaryMw.getRow(8).getCell(2).value).toBeCloseTo(0.04);
    expect(sheetSummaryMw.getRow(8).getCell(2).numFmt).toBe('0.00 "MWh"');
    expect(sheetSummaryMw.getRow(9).getCell(2).value).toBeCloseTo(0.03);
    expect(sheetSummaryMw.getRow(9).getCell(2).numFmt).toBe('0.00 "MWh"');

    // Headers converted to MW and MWh in Site Summary (Row 11 & 12)
    expect(sheetSummaryMw.getRow(11).getCell(2).value).toBe('Grid Power (MW)');
    expect(sheetSummaryMw.getRow(11).getCell(3).value).toBe('Total BESS Power (MW)');
    expect(sheetSummaryMw.getRow(11).getCell(4).value).toBe('Solar Power (MW)');
    expect(sheetSummaryMw.getRow(11).getCell(5).value).toBe('Total Today Charge (MWh)');
    expect(sheetSummaryMw.getRow(11).getCell(6).value).toBe('Total Today Discharge (MWh)');
    expect(sheetSummaryMw.getRow(11).getCell(9).value).toBe('Average Grid Frequency (Hz)');
    expect(sheetSummaryMw.getRow(11).getCell(10).value).toBe('Average BESS Frequency (Hz)');
    expect(sheetSummaryMw.getRow(11).getCell(11).value).toBe('Average Solar Frequency (Hz)');

    // Summary data converted in Site Summary (Row 12)
    const summaryRowMw = sheetSummaryMw.getRow(12);
    expect(summaryRowMw.getCell(2).value).toBe(0.3); // 300 kW -> 0.3 MW
    expect(summaryRowMw.getCell(3).value).toBe(0.01); // 5 kW -> 0.005 -> round2(0.01) MW
    expect(summaryRowMw.getCell(4).value).toBe(0.12); // 120 kW -> 0.12 MW
    expect(summaryRowMw.getCell(5).value).toBe(0.05); // 50 kWh -> 0.05 MWh
    expect(summaryRowMw.getCell(6).value).toBe(0.01); // 13 kWh -> 0.013 -> round2(0.01) MWh
    expect(summaryRowMw.getCell(7).value).toBe(85); // Non-power/energy unchanged: SOC 85%
    expect(summaryRowMw.getCell(8).value).toBe(97); // SOH 97%
    // Frequency averages null when no readings present
    expect(summaryRowMw.getCell(9).value).toBeNull();
    expect(summaryRowMw.getCell(10).value).toBeNull();
    expect(summaryRowMw.getCell(11).value).toBeNull();

    // BESS 01 headers converted in Row 12
    const mbHeaderMw = sheetBess1Mw.getRow(12);
    expect(mbHeaderMw.getCell(4).value).toBe('Grid Side Load (MW)');
    expect(mbHeaderMw.getCell(7).value).toBe('BESS Frequency (Hz)');
    expect(mbHeaderMw.getCell(9).value).toBe('PCS Active Power (MW)');
    expect(mbHeaderMw.getCell(39).value).toBe('Today Charge Energy (MWh)');
    expect(mbHeaderMw.getCell(41).value).toBe('Accum Charge Energy (MWh)');
    expect(mbHeaderMw.getCell(43).value).toBe('Solar Power (MW)');
    // Non-power/energy headers preserved
    expect(mbHeaderMw.getCell(5).value).toBe('Grid Frequency (Hz)');
    expect(mbHeaderMw.getCell(10).value).toBe('PCS Temperature (°C)');
    expect(mbHeaderMw.getCell(19).value).toBe('SOC (%)');

    // 6. Single-BESS Export with Unit Preferences (MW and MWh)
    const resSingleMw = await fetch(`${baseUrl}/sites/${singleSite.id}/telemetry/export?intervalMinutes=15&from=2026-09-01T00:00:00.000Z&to=2026-09-02T00:00:00.000Z&powerUnit=MW&energyUnit=MWh`, {
      headers: { 'Cookie': `auth_token=${clientToken}` }
    });
    expect(resSingleMw.status).toBe(200);
    const singleMwContent = (Buffer.from(await resSingleMw.arrayBuffer())).toString('utf8');
    expect(singleMwContent).toContain('Total Charge Difference (MWh),0.02');
    expect(singleMwContent).toContain('Total Discharge Difference (MWh),0.01');
    expect(singleMwContent).toContain('Grid Side Load (MW)');
    expect(singleMwContent).toContain('Accum Charge Energy (MWh)');
    expect(singleMwContent).toContain('Solar Power (MW)');
    // Non-power/energy headers preserved
    expect(singleMwContent).toContain('Grid Frequency (Hz)');
    expect(singleMwContent).toContain('DC Voltage (V)');
    expect(singleMwContent).toContain('Cell Temp Max (°C)');
  });
});

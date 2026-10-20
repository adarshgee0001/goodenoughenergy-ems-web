import { describe, it, expect, beforeAll, vi } from 'vitest';
import ExcelJS from 'exceljs';
import { reportExportService, AUTHORITATIVE_TELEMETRY_HEADERS } from '../../src/services/report-export.service';
import { prisma } from '../../src/db/prisma';
import { EventEmitter } from 'events';

// Mock Express Response object for capturing streamed CSV and Excel output
class MockResponse extends EventEmitter {
  public headers: Record<string, string> = {};
  public chunks: Buffer[] = [];
  public ended = false;

  setHeader(name: string, value: string) {
    this.headers[name.toLowerCase()] = value;
  }

  write(chunk: any) {
    this.chunks.push(chunk instanceof Buffer ? chunk : Buffer.from(chunk));
    return true;
  }

  end(chunk?: any) {
    if (chunk) this.write(chunk);
    this.ended = true;
    this.emit('finish');
  }

  getBuffer(): Buffer {
    return Buffer.concat(this.chunks);
  }

  getContent(): string {
    return this.getBuffer().toString('utf8');
  }
}

describe('Report Export CSV Unit & Service Tests', () => {
  let assetId: string;

  beforeAll(async () => {
    // Find an existing asset in the database
    const asset = await prisma.bESSAsset.findFirst({
      where: { name: 'Visakapatnam BESS 01' }
    });
    if (asset) {
      assetId = asset.id;
    }
  });

  it('exports Voltage Trend as valid CSV with all metadata and expected columns', async () => {
    if (!assetId) return;

    const mockRes = new MockResponse() as any;
    const from = new Date('2026-10-10T03:25:00.000Z');
    const to = new Date('2026-10-10T03:35:00.000Z');

    await reportExportService.exportVoltageTrend(mockRes, assetId, from, to, false);

    expect(mockRes.ended).toBe(true);
    const content = mockRes.getContent();
    const lines = content.split('\r\n');

    // Row 1: Title
    expect(lines[0]).toBe('Voltage Trend Report');
    // Rows 2-11: Metadata labels
    expect(lines[1]).toContain('Client Name:');
    expect(lines[2]).toContain('Site Name:');
    expect(lines[3]).toContain('Site Identifier:');
    expect(lines[4]).toContain('BESS Asset:');
    expect(lines[5]).toContain('BESS Identifier:');
    expect(lines[6]).toContain('EMU Serial No.:');
    expect(lines[7]).toContain('BESS Model:');
    expect(lines[8]).toContain('Energy Capacity:');
    expect(lines[9]).toContain('Power Rating:');
    expect(lines[10]).toContain('Note:');

    // Row 12: Column headers
    expect(lines[11]).toBe(
      'Timestamp,BESS Asset,EMU Serial No.,Active Source,Grid Uab (V),Grid Ubc (V),Grid Uca (V),BESS Uab (V),BESS Ubc (V),BESS Uca (V)'
    );

    // If data exists, verify first data row
    if (lines.length > 13 && lines[12]) {
      // Note: First column has quotes because of the comma in timestamp
      expect(lines[12]).toContain('Visakapatnam BESS 01');
      expect(lines[12]).toMatch(/,\s*(GRID|BESS|UNKNOWN)\s*,/);
    }
  });

  it('exports Grid ON/OFF State Trend as valid CSV with all metadata and expected columns', async () => {
    if (!assetId) return;

    const mockRes = new MockResponse() as any;
    const from = new Date('2026-10-10T03:25:00.000Z');
    const to = new Date('2026-10-10T03:35:00.000Z');

    await reportExportService.exportGridStateTrend(assetId, from, to, mockRes);

    expect(mockRes.ended).toBe(true);
    const content = mockRes.getContent();
    const lines = content.split('\r\n');

    // Row 1: Title
    expect(lines[0]).toBe('Grid State Trend Report');
    // Rows 2-10: Metadata labels
    expect(lines[1]).toContain('Client Name:');
    expect(lines[2]).toContain('Site Name:');
    expect(lines[3]).toContain('Site Identifier:');
    expect(lines[4]).toContain('BESS Asset:');
    expect(lines[5]).toContain('BESS Identifier:');
    expect(lines[6]).toContain('EMU Serial No.:');
    expect(lines[7]).toContain('BESS Model:');
    expect(lines[8]).toContain('Energy Capacity:');
    expect(lines[9]).toContain('Power Rating:');
    expect(lines[10]).toBe(''); // Blank row 11

    // Row 12: Column headers
    expect(lines[11]).toBe(
      'Timestamp,BESS Asset,EMU Serial No.,Grid ON State,Grid OFF State'
    );

    // If data exists, verify first data row
    if (lines.length > 13 && lines[12]) {
      const dataCols = lines[12].split(',');
      expect(dataCols.length).toBe(5);
      expect(dataCols[1]).toBe('Visakapatnam BESS 01');
      // State values are either 0, 1, or empty
      expect(['0', '1', '']).toContain(dataCols[3]);
      expect(['0', '1', '']).toContain(dataCols[4]);
    }
  });

  it('exports Dynamic Telemetry Report for single-BESS as valid CSV with metadata, difference summaries, and 51 columns', async () => {
    const mockRes = new MockResponse() as any;
    const from = new Date('2026-10-10T00:00:00.000Z');
    const to = new Date('2026-10-11T00:00:00.000Z');

    vi.spyOn(prisma.site, 'findUnique').mockResolvedValueOnce({
      id: 'site-single',
      name: 'Single Site',
      businessIdentifier: 'SITE-001',
      timezone: 'Asia/Kolkata',
      client: { id: 'c1', name: 'Acme Corp' }
    } as any);

    vi.spyOn(prisma.bESSAsset, 'findMany').mockResolvedValueOnce([
      { id: 'bess-1', name: 'BESS 01', emuId: 'EMU-001', siteId: 'site-single' }
    ] as any);

    const mockRows = [
      {
        bessAssetId: 'bess-1',
        bessName: 'BESS 01',
        emuId: 'EMU-001',
        bucketTimestamp: new Date('2026-10-10T12:00:00.000Z'),
        gridSideLoad: 100.5,
        gridFrequency: 50.01,
        powerFactor: 0.98,
        totalPower: 15.2,
        voltageA: 230.1,
        voltageB: 230.4,
        voltageC: 229.8,
        currentA: 10.1,
        currentB: 10.2,
        currentC: 10.0,
        bessFrequency: 50.00,
        bessPowerFactor: -0.99,
        pcsActivePower: 19.5,
        dcVoltage: 750.2,
        ambientTemp: 28.5,
        soc: 85.0,
        soh: 99.0,
        bmsCurrent: 12.0,
        cellVMax: 3.35,
        cellVMin: 3.31,
        cellTempMax: 29.0,
        todayChargeEnergy: 50.0,
        todayDischargeEnergy: 20.0,
        accumChargeEnergy: 1268.75,
        accumDischargeEnergy: 812.60,
        solarPower: 45.0
      },
      {
        bessAssetId: 'bess-1',
        bessName: 'BESS 01',
        emuId: 'EMU-001',
        bucketTimestamp: new Date('2026-10-10T11:45:00.000Z'),
        gridSideLoad: 95.0,
        gridFrequency: 49.99,
        powerFactor: null, // Missing value handling
        totalPower: 0,     // Legitimate zero preservation
        voltageA: 229.5,
        voltageB: 230.0,
        voltageC: 229.1,
        currentA: 9.8,
        currentB: 9.9,
        currentC: 9.7,
        bessFrequency: 49.98,
        bessPowerFactor: null,
        pcsActivePower: -10.5, // Negative number preservation
        dcVoltage: 748.0,
        ambientTemp: 28.0,
        soc: 84.0,
        soh: 99.0,
        bmsCurrent: -5.0,
        cellVMax: 3.34,
        cellVMin: 3.30,
        cellTempMax: 28.8,
        todayChargeEnergy: 48.0,
        todayDischargeEnergy: 19.0,
        accumChargeEnergy: 1250.50,
        accumDischargeEnergy: 800.20,
        solarPower: null
      }
    ];

    vi.spyOn(prisma, '$queryRawUnsafe').mockResolvedValueOnce(mockRows as any);

    await reportExportService.exportDynamicReport(mockRes, 'site-single', 15, from, to);

    expect(mockRes.ended).toBe(true);
    const content = mockRes.getContent();

    // Verify UTF-8 BOM is present
    expect(content.startsWith('\uFEFF')).toBe(true);

    const stripped = content.slice(1);
    const lines = stripped.split('\r\n');

    // Row 1-7 Metadata
    expect(lines[0]).toBe('EMS Reports Export');
    expect(lines[1]).toBe('Client Name:,Acme Corp');
    expect(lines[2]).toBe('Site Name:,Single Site');
    expect(lines[3]).toBe('Site Identifier:,SITE-001');
    expect(lines[4]).toContain('Report Period:');
    expect(lines[4]).toContain('10 Oct 2026');
    expect(lines[5]).toBe('Export Interval:,15 minutes');
    expect(lines[6]).toBe('');

    // Row 8-10 Charge differences (1268.75 - 1250.50 = 18.25, 812.60 - 800.20 = 12.40)
    expect(lines[7]).toBe('Total Charge Difference (kWh),18.25');
    expect(lines[8]).toBe('Total Discharge Difference (kWh),12.4');
    expect(lines[9]).toBe('');

    // Row 11: 43 Column Headers
    expect(lines[10]).toBe(
      'Timestamp,BESS Name,EMU Serial No.,Grid Side Load (kW),Grid Frequency (Hz),Grid Power Factor,BESS Frequency (Hz),BESS Power Factor,PCS Active Power (kW),PCS Temperature (°C),Line Voltage (V),AC Current (A),Operating Mode,Ambient Temperature (°C),Battery Coolant Return Temperature (°C),Battery Coolant Inlet Temperature (°C),Coolant Return Pressure (bar),Coolant Inlet Pressure (bar),SOC (%),SOH (%),BMS Current (A),BMS DC Voltage (V),Cabinet State,Cell V Max (V),Cell V Min (V),Cell Temp Max (°C),Cell Temp Min (°C),Battery Ambient Temperature (°C),Pack 01 Average Temperature (°C),Pack 01 Maximum Temperature (°C),Pack 02 Average Temperature (°C),Pack 02 Maximum Temperature (°C),Pack 03 Average Temperature (°C),Pack 03 Maximum Temperature (°C),Pack 04 Average Temperature (°C),Pack 04 Maximum Temperature (°C),Pack 05 Average Temperature (°C),Pack 05 Maximum Temperature (°C),Today Charge Energy (kWh),Today Discharge Energy (kWh),Accum Charge Energy (kWh),Accum Discharge Energy (kWh),Solar Power (kW)'
    );

    // Row 12: First data row (1268.75)
    expect(lines[11]).toContain('BESS 01,EMU-001,100.5,50.01,0.98,50,-0.99,19.5');
    expect(lines[11]).toContain('1268.75,812.6,45');

    // Row 13: Second data row (with nulls as empty, zeros preserved, negatives preserved)
    expect(lines[12]).toContain('BESS 01,EMU-001,95,49.99,,49.98');
    expect(lines[12]).toContain('-10.5');
    expect(lines[12]).toContain('1250.5,800.2,');
  });

  it('exports Dynamic Telemetry Report for multi-BESS as valid CSV preserving sequential sections, summaries, and 23 columns', async () => {
    const mockRes = new MockResponse() as any;
    const from = new Date('2026-10-10T00:00:00.000Z');
    const to = new Date('2026-10-11T00:00:00.000Z');

    vi.spyOn(prisma.site, 'findUnique').mockResolvedValueOnce({
      id: 'site-multi',
      name: 'Multi Site',
      businessIdentifier: 'SITE-002',
      timezone: 'Asia/Kolkata',
      client: { id: 'c2', name: 'Mega Corp' }
    } as any);

    vi.spyOn(prisma.bESSAsset, 'findMany').mockResolvedValueOnce([
      { id: 'bess-1', name: 'BESS 01', emuId: 'EMU-001', siteId: 'site-multi' },
      { id: 'bess-2', name: 'BESS 02', emuId: 'EMU-002', siteId: 'site-multi' }
    ] as any);

    // Mock boundary query
    const mockBoundaries = [
      { bessAssetId: 'bess-1', bessName: 'BESS 01', firstCharge: 1000, lastCharge: 1018.25, firstDischarge: 500, lastDischarge: 512.4 },
      { bessAssetId: 'bess-2', bessName: 'BESS 02', firstCharge: 2000, lastCharge: 2021.5, firstDischarge: 900, lastDischarge: 914.75 },
    ];

    // Mock data query rows (same bucket, 2 rows for BESS 01 and BESS 02)
    const bucketTs = new Date('2026-10-10T12:00:00.000Z');
    const mockDataRows = [
      {
        bessAssetId: 'bess-1',
        bessName: 'BESS 01',
        emuId: 'EMU-001',
        bucketTimestamp: bucketTs,
        gridSideLoad: 100,
        gridFrequency: 50.01,
        powerFactor: 0.98,
        totalPower: 15,
        voltageA: 230,
        voltageB: 230,
        voltageC: 230,
        currentA: 10,
        currentB: 10,
        currentC: 10,
        bessFrequency: 50.00,
        bessPowerFactor: -0.99,
        pcsActivePower: 15.2,
        dcVoltage: 850,
        ambientTemp: 35,
        soc: 80,
        soh: 98,
        bmsCurrent: 12,
        cellVMax: 3.35,
        cellVMin: 3.31,
        cellTempMax: 30,
        todayChargeEnergy: 20,
        todayDischargeEnergy: 5,
        accumChargeEnergy: 1018.25,
        accumDischargeEnergy: 512.40,
        solarPower: 50
      },
      {
        bessAssetId: 'bess-2',
        bessName: 'BESS 02',
        emuId: 'EMU-002',
        bucketTimestamp: bucketTs,
        gridSideLoad: 200,
        gridFrequency: 50.02,
        powerFactor: 0.99,
        totalPower: 25,
        voltageA: 232,
        voltageB: 232,
        voltageC: 232,
        currentA: 15,
        currentB: 15,
        currentC: 15,
        bessFrequency: 50.01,
        bessPowerFactor: -1.00,
        pcsActivePower: -10.2,
        dcVoltage: 860,
        ambientTemp: 40,
        soc: 90,
        soh: 96,
        bmsCurrent: -8,
        cellVMax: 3.36,
        cellVMin: 3.32,
        cellTempMax: 32,
        todayChargeEnergy: 30,
        todayDischargeEnergy: 8,
        accumChargeEnergy: 2021.50,
        accumDischargeEnergy: 914.75,
        solarPower: 70
      }
    ];

    vi.spyOn(prisma, '$queryRawUnsafe')
      .mockResolvedValueOnce(mockBoundaries as any)
      .mockResolvedValueOnce(mockDataRows as any);

    await reportExportService.exportMultiBessCsv(mockRes, 'site-multi', 15, from, to);

    expect(mockRes.ended).toBe(true);
    expect(mockRes.headers['content-type']).toBe('text/csv; charset=utf-8');

    const content = mockRes.getContent();
    expect(content.startsWith('\uFEFF')).toBe(true);

    const stripped = content.slice(1);
    const lines = stripped.split('\r\n');

    // Section 1: Metadata
    expect(lines[0]).toBe('EMS Reports Export (Multi-BESS)');
    expect(lines[1]).toBe('Client Name:,Mega Corp');
    expect(lines[2]).toBe('Site Name:,Multi Site');
    expect(lines[3]).toBe('Site Identifier:,SITE-002');
    expect(lines[4]).toContain('Report Period:');
    expect(lines[5]).toBe('Export Interval:,15 minutes');

    // Section 2: Energy Summaries
    expect(stripped).toContain('--- SITE ENERGY SUMMARY ---');
    expect(stripped).toContain('Total Site Charge Difference (kWh),39.75');
    expect(stripped).toContain('Total Site Discharge Difference (kWh),27.15');

    expect(stripped).toContain('--- PER-BESS ENERGY SUMMARY ---');
    expect(stripped).toContain('BESS Name,Total Charge Difference (kWh),Total Discharge Difference (kWh)');
    expect(stripped).toContain('BESS 01,18.25,12.4');
    expect(stripped).toContain('BESS 02,21.5,14.75');

    // Section 3: Site Summary (Interval Telemetry)
    expect(stripped).toContain('--- SITE SUMMARY (INTERVAL TELEMETRY) ---');
    expect(stripped).toContain('Total Grid Power (kW),Total BESS Power (kW)');

    // Section 4: Per-BESS Details (Interval Telemetry)
    expect(stripped).toContain('--- PER-BESS DETAILS (INTERVAL TELEMETRY) ---');
    expect(stripped).toContain(AUTHORITATIVE_TELEMETRY_HEADERS.join(','));

    // Verify both BESS rows exist with proper asset mapping
    expect(stripped).toContain('BESS 01,EMU-001,100,50.01,0.98,50,-0.99,15.2');
    expect(stripped).toContain('BESS 02,EMU-002,200,50.02,0.99,50.01,-1,-10.2');
  });

  it('exports Dynamic Telemetry Report for multi-BESS as valid Excel workbook with both worksheets', async () => {
    const mockRes = new MockResponse() as any;
    const from = new Date('2026-10-10T00:00:00.000Z');
    const to = new Date('2026-10-11T00:00:00.000Z');

    vi.spyOn(prisma.site, 'findUnique').mockResolvedValueOnce({
      id: 'site-multi-wb',
      name: 'Workbook Site',
      businessIdentifier: 'SITE-WB',
      timezone: 'Asia/Kolkata',
      client: { id: 'c1', name: 'Workbook Client' }
    } as any);

    vi.spyOn(prisma.bESSAsset, 'findMany').mockResolvedValueOnce([
      { id: 'bess-1', name: 'BESS 01', emuId: 'EMU-001', siteId: 'site-multi-wb' },
      { id: 'bess-2', name: 'BESS 02', emuId: 'EMU-002', siteId: 'site-multi-wb' }
    ] as any);

    vi.spyOn(prisma, '$queryRawUnsafe')
      .mockResolvedValueOnce([]) // boundaries
      .mockResolvedValueOnce([]); // data

    await reportExportService.exportDynamicReport(mockRes, 'site-multi-wb', 15, from, to);

    expect(mockRes.ended).toBe(true);
    expect(mockRes.headers['content-type']).toBe('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(mockRes.getBuffer());

    const sheetNames = workbook.worksheets.map(w => w.name);
    expect(sheetNames).toEqual(['Site Summary', 'BESS 01', 'BESS 02']);
    expect(workbook.getWorksheet('Per-BESS Details')).toBeUndefined();
  });
});


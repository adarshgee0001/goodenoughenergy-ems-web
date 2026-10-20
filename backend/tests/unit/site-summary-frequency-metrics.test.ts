import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EventEmitter } from 'events';
import ExcelJS from 'exceljs';
import { reportExportService } from '../../src/services/report-export.service';
import { prisma } from '../../src/db/prisma';

class MockResponse extends EventEmitter {
  public headers: Record<string, string> = {};
  public chunks: Buffer[] = [];
  public ended = false;
  public statusCode = 200;

  setHeader(key: string, val: string) {
    this.headers[key.toLowerCase()] = val;
  }

  write(chunk: any) {
    if (typeof chunk === 'string') {
      this.chunks.push(Buffer.from(chunk));
    } else {
      this.chunks.push(chunk);
    }
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
}

describe('Site Summary Metrics and Frequency Averages in Multi-BESS Excel Export', () => {
  const from = new Date('2026-10-10T00:00:00.000Z');
  const to = new Date('2026-10-10T01:00:00.000Z');

  const mockSite = {
    id: 'site-frequency-test',
    name: 'Frequency Test Site',
    businessIdentifier: 'SITE-FREQ-01',
    timezone: 'Asia/Kolkata',
    client: { id: 'client-1', name: 'Test Frequency Client' },
  };

  const mockBessAssets = [
    { id: 'bess-01', name: 'BESS 01', emuId: 'EMU-01', siteId: 'site-frequency-test', reportIntervalMinutes: 15 },
    { id: 'bess-02', name: 'BESS 02', emuId: 'EMU-02', siteId: 'site-frequency-test', reportIntervalMinutes: 15 },
  ];

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('1. Verifies Max PCS Temperature is removed, Grid Power & Solar Power have "Total" removed, and 3 Frequency metrics are present', async () => {
    const mockRes = new MockResponse() as any;

    vi.spyOn(prisma.site, 'findUnique').mockResolvedValueOnce(mockSite as any);
    vi.spyOn(prisma.bESSAsset, 'findMany').mockResolvedValueOnce(mockBessAssets as any);

    // Mock boundaries and telemetry rows
    vi.spyOn(prisma, '$queryRawUnsafe')
      .mockResolvedValueOnce([]) // boundaries
      .mockResolvedValueOnce([]); // telemetry rows

    await reportExportService.exportDynamicReport(mockRes, mockSite.id, 15, from, to);

    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(mockRes.getBuffer());

    const summarySheet = wb.getWorksheet('Site Summary')!;
    expect(summarySheet).toBeDefined();

    const row11 = summarySheet.getRow(11);
    const row12 = summarySheet.getRow(12);

    const row11Values = (row11.values as any[]).filter(Boolean);
    const row12Values = (row12.values as any[]).filter(Boolean);

    // 1. Max PCS Temperature (°C) is removed
    expect(row11Values).not.toContain('Max PCS Temperature (°C)');

    // 2. Exactly one authoritative header row at row 11
    expect(row11.getCell(1).value).toBe('Timestamp');
    expect(row11.getCell(2).value).toBe('Grid Power (kW)');
    expect(row11.getCell(3).value).toBe('Total BESS Power (kW)');
    expect(row11.getCell(4).value).toBe('Solar Power (kW)');
    expect(row11.getCell(5).value).toBe('Total Today Charge (kWh)');
    expect(row11.getCell(6).value).toBe('Total Today Discharge (kWh)');
    expect(row11.getCell(7).value).toBe('Average SOC (%)');
    expect(row11.getCell(8).value).toBe('Average SOH (%)');
    expect(row11.getCell(9).value).toBe('Average Grid Frequency (Hz)');
    expect(row11.getCell(10).value).toBe('Average BESS Frequency (Hz)');
    expect(row11.getCell(11).value).toBe('Average Solar Frequency (Hz)');
    expect(row11.getCell(12).value).toBeNull();
    expect(row11Values).toHaveLength(11);

    // 3. Row 12 does NOT contain duplicate header labels
    expect(row12Values).not.toEqual(row11Values);
    expect(row12Values).not.toContain('Grid Power (kW)');
    expect(row12Values).not.toContain('Total BESS Power (kW)');
    expect(row12Values).not.toContain('Solar Power (kW)');
    expect(row12.getCell(1).value).toBeNull();

    // 4. Per-BESS headers completely absent
    expect(row11Values).not.toContain('Grid Frequency (Hz)');
    expect(row11Values).not.toContain('BESS 01');
    expect(row11Values).not.toContain('BESS 02');
  });

  it('2. Calculates frequency averages correctly from known sample values', async () => {
    const mockRes = new MockResponse() as any;

    vi.spyOn(prisma.site, 'findUnique').mockResolvedValueOnce(mockSite as any);
    vi.spyOn(prisma.bESSAsset, 'findMany').mockResolvedValueOnce(mockBessAssets as any);

    const bucketTime = new Date('2026-10-10T00:15:00.000Z');
    const mockTelemetryRows = [
      {
        bessAssetId: 'bess-01',
        bessName: 'BESS 01',
        emuId: 'EMU-01',
        bucketTimestamp: bucketTime,
        gridSideLoad: 120,
        pcsActivePower: 50,
        solarPower: 80,
        gridFrequency: 49.90,
        bessFrequency: 50.05,
        solarFrequency: 50.00,
        todayChargeEnergy: 10,
        todayDischargeEnergy: 5,
        soc: 85,
        soh: 98,
      },
      {
        bessAssetId: 'bess-02',
        bessName: 'BESS 02',
        emuId: 'EMU-02',
        bucketTimestamp: bucketTime,
        gridSideLoad: 180,
        pcsActivePower: -30,
        solarPower: 60,
        gridFrequency: 50.10,
        bessFrequency: 49.95,
        solarFrequency: 50.20,
        todayChargeEnergy: 15,
        todayDischargeEnergy: 8,
        soc: 75,
        soh: 96,
      },
    ];

    vi.spyOn(prisma, '$queryRawUnsafe')
      .mockResolvedValueOnce([]) // boundaries
      .mockResolvedValueOnce(mockTelemetryRows); // telemetry rows

    await reportExportService.exportDynamicReport(mockRes, mockSite.id, 15, from, to);

    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(mockRes.getBuffer());

    const summarySheet = wb.getWorksheet('Site Summary')!;
    // First data row is Row 12 immediately beneath the single header row 11
    const dataRow = summarySheet.getRow(12);
    expect(dataRow.getCell(1).value).toBeInstanceOf(Date);

    // Site power totals preserved
    expect(dataRow.getCell(2).value).toBe(300); // 120 + 180
    expect(dataRow.getCell(3).value).toBe(20);  // 50 - 30
    expect(dataRow.getCell(4).value).toBe(140); // 80 + 60

    // Average Grid Frequency: (49.90 + 50.10) / 2 = 50.00 Hz
    expect(dataRow.getCell(9).value).toBe(50.00);

    // Average BESS Frequency: (50.05 + 49.95) / 2 = 50.00 Hz
    expect(dataRow.getCell(10).value).toBe(50.00);

    // Average Solar Frequency: (50.00 + 50.20) / 2 = 50.10 Hz
    expect(dataRow.getCell(11).value).toBe(50.10);

    // Per-BESS Grid Frequency columns and values are completely absent; no column 12
    expect(dataRow.getCell(12).value).toBeNull();
  });

  it('3. Excludes null/missing frequency readings from the average and does not invent zeros', async () => {
    const mockRes = new MockResponse() as any;

    vi.spyOn(prisma.site, 'findUnique').mockResolvedValueOnce(mockSite as any);
    vi.spyOn(prisma.bESSAsset, 'findMany').mockResolvedValueOnce(mockBessAssets as any);

    const bucketTime = new Date('2026-10-10T00:15:00.000Z');
    const mockTelemetryRows = [
      {
        bessAssetId: 'bess-01',
        bessName: 'BESS 01',
        emuId: 'EMU-01',
        bucketTimestamp: bucketTime,
        gridSideLoad: 100,
        pcsActivePower: 40,
        solarPower: 50,
        // BESS 01 has valid gridFrequency, but null bessFrequency and null solarFrequency
        gridFrequency: 50.12,
        bessFrequency: null,
        solarFrequency: null,
        todayChargeEnergy: 10,
        todayDischargeEnergy: 5,
        soc: 80,
        soh: 98,
      },
      {
        bessAssetId: 'bess-02',
        bessName: 'BESS 02',
        emuId: 'EMU-02',
        bucketTimestamp: bucketTime,
        gridSideLoad: 150,
        pcsActivePower: 20,
        solarPower: 30,
        // BESS 02 has null gridFrequency, but valid bessFrequency and null solarFrequency
        gridFrequency: null,
        bessFrequency: 49.88,
        solarFrequency: null,
        todayChargeEnergy: 12,
        todayDischargeEnergy: 6,
        soc: 82,
        soh: 97,
      },
    ];

    vi.spyOn(prisma, '$queryRawUnsafe')
      .mockResolvedValueOnce([]) // boundaries
      .mockResolvedValueOnce(mockTelemetryRows); // telemetry rows

    await reportExportService.exportDynamicReport(mockRes, mockSite.id, 15, from, to);

    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(mockRes.getBuffer());

    const summarySheet = wb.getWorksheet('Site Summary')!;
    const dataRow = summarySheet.getRow(12);

    // Average Grid Frequency: only BESS 01 had a reading (50.12), BESS 02 was null.
    // Must NOT divide by 2 (which would invent 25.06)
    expect(dataRow.getCell(9).value).toBe(50.12);

    // Average BESS Frequency: only BESS 02 had a reading (49.88), BESS 01 was null.
    // Must NOT divide by 2 (which would invent 24.94)
    expect(dataRow.getCell(10).value).toBe(49.88);

    // Average Solar Frequency: ALL readings were null.
    // Must produce null (empty cell), NOT an invented 0 or 0.00!
    expect(dataRow.getCell(11).value).toBeNull();
  });

  it('4. Preserves unit preference conversions (MW/MWh) for Grid Power and Solar Power without altering frequency Hz', async () => {
    const mockRes = new MockResponse() as any;

    vi.spyOn(prisma.site, 'findUnique').mockResolvedValueOnce(mockSite as any);
    vi.spyOn(prisma.bESSAsset, 'findMany').mockResolvedValueOnce(mockBessAssets as any);

    const bucketTime = new Date('2026-10-10T00:15:00.000Z');
    const mockTelemetryRows = [
      {
        bessAssetId: 'bess-01',
        bessName: 'BESS 01',
        emuId: 'EMU-01',
        bucketTimestamp: bucketTime,
        gridSideLoad: 250,
        pcsActivePower: 100,
        solarPower: 150,
        gridFrequency: 50.02,
        bessFrequency: 50.01,
        solarFrequency: 50.03,
      },
      {
        bessAssetId: 'bess-02',
        bessName: 'BESS 02',
        emuId: 'EMU-02',
        bucketTimestamp: bucketTime,
        gridSideLoad: 350,
        pcsActivePower: 200,
        solarPower: 250,
        gridFrequency: 50.04,
        bessFrequency: 50.03,
        solarFrequency: 50.05,
      },
    ];

    vi.spyOn(prisma, '$queryRawUnsafe')
      .mockResolvedValueOnce([]) // boundaries
      .mockResolvedValueOnce(mockTelemetryRows); // telemetry rows

    await reportExportService.exportDynamicReport(
      mockRes,
      mockSite.id,
      15,
      from,
      to,
      { powerUnit: 'MW', energyUnit: 'MWh' }
    );

    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(mockRes.getBuffer());

    const summarySheet = wb.getWorksheet('Site Summary')!;
    const row11 = summarySheet.getRow(11);
    const dataRow = summarySheet.getRow(12);

    // Labels scaled with MW
    expect(row11.getCell(2).value).toBe('Grid Power (MW)');
    expect(row11.getCell(3).value).toBe('Total BESS Power (MW)');
    expect(row11.getCell(4).value).toBe('Solar Power (MW)');

    // Values scaled to MW
    expect(dataRow.getCell(2).value).toBe(0.6);  // (250 + 350) / 1000 = 0.6 MW
    expect(dataRow.getCell(3).value).toBe(0.3);  // (100 + 200) / 1000 = 0.3 MW
    expect(dataRow.getCell(4).value).toBe(0.4);  // (150 + 250) / 1000 = 0.4 MW

    // Frequencies remain Hz and are not altered by power unit conversions
    expect(row11.getCell(9).value).toBe('Average Grid Frequency (Hz)');
    expect(row11.getCell(10).value).toBe('Average BESS Frequency (Hz)');
    expect(row11.getCell(11).value).toBe('Average Solar Frequency (Hz)');

    expect(dataRow.getCell(9).value).toBe(50.03);  // (50.02 + 50.04) / 2
    expect(dataRow.getCell(10).value).toBe(50.02); // (50.01 + 50.03) / 2
    expect(dataRow.getCell(11).value).toBe(50.04); // (50.03 + 50.05) / 2
  });

  it('5. Individual BESS worksheets preserve all 43 authoritative headers and data', async () => {
    const mockRes = new MockResponse() as any;

    vi.spyOn(prisma.site, 'findUnique').mockResolvedValueOnce(mockSite as any);
    vi.spyOn(prisma.bESSAsset, 'findMany').mockResolvedValueOnce(mockBessAssets as any);

    const bucketTime = new Date('2026-10-10T00:15:00.000Z');
    const mockTelemetryRows = [
      {
        bessAssetId: 'bess-01',
        bessName: 'BESS 01',
        emuId: 'EMU-01',
        bucketTimestamp: bucketTime,
        gridSideLoad: 100,
        pcsActivePower: 50,
        solarPower: 25,
        gridFrequency: 50.01,
        bessFrequency: 50.02,
        solarFrequency: 50.03,
      },
    ];

    vi.spyOn(prisma, '$queryRawUnsafe')
      .mockResolvedValueOnce([]) // boundaries
      .mockResolvedValueOnce(mockTelemetryRows); // telemetry rows

    await reportExportService.exportDynamicReport(mockRes, mockSite.id, 15, from, to);

    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(mockRes.getBuffer());

    // Both individual BESS worksheets are created
    const bess1Sheet = wb.getWorksheet('BESS 01')!;
    const bess2Sheet = wb.getWorksheet('BESS 02')!;
    expect(bess1Sheet).toBeDefined();
    expect(bess2Sheet).toBeDefined();

    // Verify 43 authoritative telemetry headers on individual sheet
    const row12 = bess1Sheet.getRow(12);
    expect(row12.getCell(1).value).toBe('Timestamp');
    expect(row12.getCell(2).value).toBe('BESS Name');
    expect(row12.getCell(3).value).toBe('EMU Serial No.');
    expect(row12.getCell(4).value).toBe('Grid Side Load (kW)');
    expect(row12.getCell(5).value).toBe('Grid Frequency (Hz)');
    expect(row12.getCell(7).value).toBe('BESS Frequency (Hz)');
    expect(row12.getCell(9).value).toBe('PCS Active Power (kW)');
    expect(row12.getCell(43).value).toBe('Solar Power (kW)');
    expect(row12.getCell(44).value).toBeNull();
  });
});

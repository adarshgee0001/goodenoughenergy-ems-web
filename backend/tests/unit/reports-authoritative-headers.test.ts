import { describe, it, expect, vi } from 'vitest';
import { EventEmitter } from 'events';
import {
  reportExportService,
  AUTHORITATIVE_TELEMETRY_HEADERS,
  SINGLE_BESS_TELEMETRY_HEADERS,
  getAuthoritativeTelemetryHeaders,
  sanitizeWorksheetName,
  generateBessWorksheetNames
} from '../../src/services/report-export.service';
import {
  getAuthoritativeReportsHeaders,
  getSingleBessReportsHeaders,
  formatPowerValue,
  formatEnergyValue
} from '../../../frontend/src/pages/EMSApp/ReportsPage';
import { prisma } from '../../src/db/prisma';
import fs from 'fs';
import path from 'path';

// Mock Response for streaming CSV tests
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

describe('Authoritative Reports Table & CSV Export Verification', () => {
  const EXPECTED_43_HEADERS = [
    'Timestamp',
    'BESS Name',
    'EMU Serial No.',
    'Grid Side Load (kW)',
    'Grid Frequency (Hz)',
    'Grid Power Factor',
    'BESS Frequency (Hz)',
    'BESS Power Factor',
    'PCS Active Power (kW)',
    'PCS Temperature (°C)',
    'Line Voltage (V)',
    'AC Current (A)',
    'Operating Mode',
    'Ambient Temperature (°C)',
    'Battery Coolant Return Temperature (°C)',
    'Battery Coolant Inlet Temperature (°C)',
    'Coolant Return Pressure (bar)',
    'Coolant Inlet Pressure (bar)',
    'SOC (%)',
    'SOH (%)',
    'BMS Current (A)',
    'BMS DC Voltage (V)',
    'Cabinet State',
    'Cell V Max (V)',
    'Cell V Min (V)',
    'Cell Temp Max (°C)',
    'Cell Temp Min (°C)',
    'Battery Ambient Temperature (°C)',
    'Pack 01 Average Temperature (°C)',
    'Pack 01 Maximum Temperature (°C)',
    'Pack 02 Average Temperature (°C)',
    'Pack 02 Maximum Temperature (°C)',
    'Pack 03 Average Temperature (°C)',
    'Pack 03 Maximum Temperature (°C)',
    'Pack 04 Average Temperature (°C)',
    'Pack 04 Maximum Temperature (°C)',
    'Pack 05 Average Temperature (°C)',
    'Pack 05 Maximum Temperature (°C)',
    'Today Charge Energy (kWh)',
    'Today Discharge Energy (kWh)',
    'Accum Charge Energy (kWh)',
    'Accum Discharge Energy (kWh)',
    'Solar Power (kW)'
  ];

  it('1. Authoritative 43-column unified per-BESS schema: matches exact headers and ordering', () => {
    expect(AUTHORITATIVE_TELEMETRY_HEADERS).toHaveLength(43);
    expect([...AUTHORITATIVE_TELEMETRY_HEADERS]).toEqual(EXPECTED_43_HEADERS);

    expect(SINGLE_BESS_TELEMETRY_HEADERS).toHaveLength(43);
    expect([...SINGLE_BESS_TELEMETRY_HEADERS]).toEqual(EXPECTED_43_HEADERS);

    expect(AUTHORITATIVE_TELEMETRY_HEADERS).not.toContain('Cabinet Meter Power (kW)');
    expect(SINGLE_BESS_TELEMETRY_HEADERS).not.toContain('Cabinet Meter Power (kW)');
    expect(AUTHORITATIVE_TELEMETRY_HEADERS).not.toContain('DC Voltage (V)');
    expect(SINGLE_BESS_TELEMETRY_HEADERS).not.toContain('DC Voltage (V)');
  });

  it('2. Reports UI table: verifies dynamic 43-column single-BESS schema, dynamic thead expressions, and cell value scaling', () => {
    // 2a. Default kW/kWh authoritative headers match exact 43 headers and ordering
    const defaultHeaders = getAuthoritativeReportsHeaders();
    expect(defaultHeaders).toHaveLength(43);
    expect(defaultHeaders).toEqual(EXPECTED_43_HEADERS);

    const singleBessHeaders = getSingleBessReportsHeaders();
    expect(singleBessHeaders).toEqual(EXPECTED_43_HEADERS);
    expect(defaultHeaders).not.toContain('Cabinet Meter Power (kW)');
    expect(defaultHeaders).not.toContain('DC Voltage (V)');

    // 2b. Dynamic MW/MWh authoritative headers replace only power and energy units
    const mwMwhHeaders = getAuthoritativeReportsHeaders({ powerUnit: 'MW', energyUnit: 'MWh' });
    expect(mwMwhHeaders).toHaveLength(43);
    expect(mwMwhHeaders).toContain('Grid Side Load (MW)');
    expect(mwMwhHeaders).not.toContain('Cabinet Meter Power (MW)');
    expect(mwMwhHeaders).toContain('PCS Active Power (MW)');
    expect(mwMwhHeaders).toContain('Solar Power (MW)');
    expect(mwMwhHeaders).toContain('Today Charge Energy (MWh)');
    expect(mwMwhHeaders).toContain('Today Discharge Energy (MWh)');
    expect(mwMwhHeaders).toContain('Accum Charge Energy (MWh)');
    expect(mwMwhHeaders).toContain('Accum Discharge Energy (MWh)');
    // Non-power/energy headers preserved exactly
    expect(mwMwhHeaders[0]).toBe('Timestamp');
    expect(mwMwhHeaders[1]).toBe('BESS Name');
    expect(mwMwhHeaders[2]).toBe('EMU Serial No.');
    expect(mwMwhHeaders[4]).toBe('Grid Frequency (Hz)');
    expect(mwMwhHeaders).not.toContain('DC Voltage (V)');
    expect(mwMwhHeaders[9]).toBe('PCS Temperature (°C)');
    expect(mwMwhHeaders[10]).toBe('Line Voltage (V)');
    expect(mwMwhHeaders[11]).toBe('AC Current (A)');
    expect(mwMwhHeaders[12]).toBe('Operating Mode');
    expect(mwMwhHeaders[13]).toBe('Ambient Temperature (°C)');
    expect(mwMwhHeaders[14]).toBe('Battery Coolant Return Temperature (°C)');
    expect(mwMwhHeaders[15]).toBe('Battery Coolant Inlet Temperature (°C)');
    expect(mwMwhHeaders[16]).toBe('Coolant Return Pressure (bar)');
    expect(mwMwhHeaders[17]).toBe('Coolant Inlet Pressure (bar)');
    expect(mwMwhHeaders[18]).toBe('SOC (%)');
    expect(mwMwhHeaders[20]).toBe('BMS Current (A)');
    expect(mwMwhHeaders[21]).toBe('BMS DC Voltage (V)');
    expect(mwMwhHeaders[22]).toBe('Cabinet State');
    expect(mwMwhHeaders[23]).toBe('Cell V Max (V)');
    expect(mwMwhHeaders[24]).toBe('Cell V Min (V)');
    expect(mwMwhHeaders[25]).toBe('Cell Temp Max (°C)');
    expect(mwMwhHeaders[26]).toBe('Cell Temp Min (°C)');
    expect(mwMwhHeaders[27]).toBe('Battery Ambient Temperature (°C)');
    expect(mwMwhHeaders[28]).toBe('Pack 01 Average Temperature (°C)');
    expect(mwMwhHeaders[29]).toBe('Pack 01 Maximum Temperature (°C)');
    expect(mwMwhHeaders[37]).toBe('Pack 05 Maximum Temperature (°C)');

    // 2c. Verify Telemetry Data Table renders dynamic authoritative headers and all 43 columns without legacy unreferenced columns
    const reportsPagePath = path.resolve(__dirname, '../../../frontend/src/pages/EMSApp/ReportsPage.tsx');
    const content = fs.readFileSync(reportsPagePath, 'utf8');

    expect(content).toContain('Telemetry Data Table');
    expect(content).toContain('<table className="w-full text-left border-collapse">');
    expect(content).toContain('tableSnapshots');
    expect(content).toContain('handlePageChange');
    expect(content).toContain('Previous');
    expect(content).toContain('Next');
    expect(content).toContain('authoritativeHeaders.map');

    // DC Voltage column header and data cell are removed from the table; BMS DC Voltage is used
    expect(content).not.toContain('>DC Voltage (V)<');
    expect(content).not.toContain('DC Voltage (V)</th>');
    expect(content).not.toContain('pt.dcVoltage');
    expect(content).not.toContain('Cabinet Voltage A (V)');
    expect(content).not.toContain('Cabinet Meter Power');
    expect(content).not.toContain('pt.voltageA');

    // Authoritative signals are present in data rows
    expect(content).toContain('pt.pcsLineVoltage');
    expect(content).toContain('pt.pcsAcCurrent');
    expect(content).toContain('pt.pcsActivePower');
    expect(content).toContain('pt.pcsTemperature');
    expect(content).toContain('pt.bmsDcVoltage');
    expect(content).toContain('pt.bmsCabinetState');
    expect(content).toContain('pt.tmsCoolantReturnTemp');
    expect(content).toContain('pt.pack01AvgTemp');
    expect(content).toContain('pt.todayChargeEnergy');
    expect(content).toContain('pt.solarPower');
    expect(content).toContain('formatPowerValue');
    expect(content).toContain('formatEnergyValue');

    // Verify TelemetryPage.tsx KPI cards alignment: Cabinet Meter Power removed, Grid and BESS retained
    const telemetryPagePath = path.resolve(__dirname, '../../../frontend/src/pages/EMSApp/TelemetryPage.tsx');
    const telemetryPageContent = fs.readFileSync(telemetryPagePath, 'utf8');
    expect(telemetryPageContent).not.toContain('Cabinet Meter Power');
    expect(telemetryPageContent).not.toContain('cabinetPowerDisplay');
    expect(telemetryPageContent).not.toContain('CABINET METER');
    expect(telemetryPageContent).toContain('Grid Power');
    expect(telemetryPageContent).toContain('Grid Frequency');
    expect(telemetryPageContent).toContain('Grid Power Factor');
    expect(telemetryPageContent).toContain('BESS Power');
    expect(telemetryPageContent).toContain('BESS Frequency');
    expect(telemetryPageContent).toContain('BESS Power Factor');

    // 2d. Runtime unit conversion for power cell values
    expect(formatPowerValue(250.4, 'kW')).toBe('250.40');
    expect(formatPowerValue(250.4, 'MW')).toBe('0.25'); // (250.4 / 1000).toFixed(2)
    expect(formatPowerValue(250.4, 'MW', 2)).toBe('0.25');
    expect(formatPowerValue(0, 'kW')).toBe('0.00');
    expect(formatPowerValue(0, 'MW')).toBe('0.00');
    expect(formatPowerValue(null, 'kW')).toBe('--');
    expect(formatPowerValue(null, 'MW')).toBe('--');
    expect(formatPowerValue(undefined, 'MW')).toBe('--');
    expect(formatPowerValue(NaN, 'MW')).toBe('--');
    expect(formatPowerValue(-25.5, 'kW')).toBe('-25.50');
    expect(formatPowerValue(-25.5, 'MW', 2)).toBe('-0.03');

    // 2e. Runtime unit conversion for energy cell values
    expect(formatEnergyValue(1500.5, 'kWh')).toBe('1500.50');
    expect(formatEnergyValue(1500.5, 'MWh')).toBe('1.50'); // (1500.5 / 1000).toFixed(2)
    expect(formatEnergyValue(1500.5, 'MWh', 2)).toBe('1.50');
    expect(formatEnergyValue(0, 'kWh')).toBe('0.00');
    expect(formatEnergyValue(0, 'MWh')).toBe('0.00');
    expect(formatEnergyValue(null, 'kWh')).toBe('--');
    expect(formatEnergyValue(null, 'MWh')).toBe('--');
    expect(formatEnergyValue(undefined, 'MWh')).toBe('--');
    expect(formatEnergyValue(NaN, 'MWh')).toBe('--');
  });

  it('3. Single-BESS download: remains CSV and exposes all 29 columns with correct value alignment', async () => {
    const mockRes = new MockResponse() as any;
    const from = new Date('2026-10-10T00:00:00.000Z');
    const to = new Date('2026-10-11T00:00:00.000Z');

    vi.spyOn(prisma.site, 'findUnique').mockResolvedValueOnce({
      id: 'site-single-29',
      name: 'Single Site 29',
      businessIdentifier: 'SITE-29',
      timezone: 'Asia/Kolkata',
      client: { id: 'c1', name: 'Alpha Corp' }
    } as any);

    vi.spyOn(prisma.bESSAsset, 'findMany').mockResolvedValueOnce([
      { id: 'bess-single-1', name: 'StorEDGE 01', emuId: 'EMU-SN-001', siteId: 'site-single-29' }
    ] as any);

    const mockRows = [
      {
        bessAssetId: 'bess-single-1',
        bessName: 'StorEDGE 01',
        emuId: 'EMU-SN-001',
        bucketTimestamp: new Date('2026-10-10T12:00:00.000Z'),
        gridSideLoad: 125.4,
        gridFrequency: 50.05,
        powerFactor: 0.99,
        totalPower: 30.2,
        voltageA: 231.5,
        voltageB: 231.2,
        voltageC: 230.8,
        currentA: 12.1,
        currentB: 12.0,
        currentC: 11.9,
        bessFrequency: 50.02,
        bessPowerFactor: 0.98,
        pcsActivePower: 50.0,
        dcVoltage: 780.5,
        ambientTemp: 26.4,
        soc: 88.5,
        soh: 99.1,
        bmsCurrent: 14.2,
        cellVMax: 3.38,
        cellVMin: 3.34,
        cellTempMax: 27.5,
        batteryAmbientTemp: 26.4,
        pack01AvgTemp: 28.5,
        pack01MaxTemp: 29.2,
        pack02AvgTemp: 28.6,
        pack02MaxTemp: 29.3,
        pack03AvgTemp: 28.7,
        pack03MaxTemp: 29.4,
        pack04AvgTemp: 28.8,
        pack04MaxTemp: 29.5,
        pack05AvgTemp: 28.9,
        pack05MaxTemp: 29.6,
        todayChargeEnergy: 65.2,
        todayDischargeEnergy: 25.1,
        accumChargeEnergy: 1500.5,
        accumDischargeEnergy: 950.2,
        solarPower: 80.0
      }
    ];

    vi.spyOn(prisma, '$queryRawUnsafe').mockResolvedValueOnce(mockRows as any);

    await reportExportService.exportDynamicReport(mockRes, 'site-single-29', 15, from, to);

    expect(mockRes.ended).toBe(true);
    expect(mockRes.headers['content-type']).toBe('text/csv; charset=utf-8');

    const content = mockRes.getContent();
    expect(content.startsWith('\uFEFF')).toBe(true);

    const stripped = content.slice(1);
    const lines = stripped.split('\r\n');

    // Header row 11 (index 10)
    const headerRow = lines[10];
    expect(headerRow).toBe(EXPECTED_43_HEADERS.join(','));

    // Data row 12 (index 11)
    const dataLine = lines[11];
    const dataCols = dataLine.split(',');

    // Note: Col 0 timestamp is quoted if it contains a comma
    // Let's verify field alignment by checking key columns:
    expect(dataLine).toContain('StorEDGE 01'); // Col 2: BESS Name
    expect(dataLine).toContain('EMU-SN-001');  // Col 3: EMU Serial No.
    expect(dataLine).toContain('125.4');       // Col 4: Grid Side Load (kW)
    expect(dataLine).toContain('50.05');       // Col 5: Grid Frequency (Hz)
    expect(dataLine).toContain('50.02');       // BESS Frequency (Hz)
    expect(dataLine).toContain('0.98');        // BESS Power Factor
    expect(dataLine).toContain('50');          // PCS Active Power (kW)
    expect(dataLine).toContain('26.4');        // Battery Ambient Temperature (°C)
    expect(dataLine).toContain('28.5');        // Pack 01 Average Temperature (°C)
    expect(dataLine).toContain('29.6');        // Pack 05 Maximum Temperature (°C)
    expect(dataLine).toContain('80');          // Solar Power (kW)

    // Save and verify physical CSV file
    const outCsvPath = path.resolve(__dirname, '../../scripts/scratch/test-single-bess-verified.csv');
    fs.writeFileSync(outCsvPath, mockRes.getContent(), 'utf8');
    const diskCsv = fs.readFileSync(outCsvPath, 'utf8');
    expect(diskCsv).toBe(mockRes.getContent());
    expect(diskCsv.split('\r\n')[10]).toBe(EXPECTED_43_HEADERS.join(','));
  });

  it('4. Multi-BESS download: remains CSV and exposes sequential sections & authoritative 23 headers', async () => {
    const mockRes = new MockResponse() as any;
    const from = new Date('2026-10-10T00:00:00.000Z');
    const to = new Date('2026-10-11T00:00:00.000Z');

    vi.spyOn(prisma.site, 'findUnique').mockResolvedValueOnce({
      id: 'site-multi-29',
      name: 'Multi Site 29',
      businessIdentifier: 'SITE-MULTI-29',
      timezone: 'Asia/Kolkata',
      client: { id: 'c2', name: 'Beta Corp' }
    } as any);

    vi.spyOn(prisma.bESSAsset, 'findMany').mockResolvedValueOnce([
      { id: 'bess-m1', name: 'Unit 1', emuId: 'EMU-U1', siteId: 'site-multi-29' },
      { id: 'bess-m2', name: 'Unit 2', emuId: 'EMU-U2', siteId: 'site-multi-29' }
    ] as any);

    const mockBoundaries = [
      { bessAssetId: 'bess-m1', bessName: 'Unit 1', firstCharge: 100, lastCharge: 120, firstDischarge: 50, lastDischarge: 60 },
      { bessAssetId: 'bess-m2', bessName: 'Unit 2', firstCharge: 200, lastCharge: 230, firstDischarge: 80, lastDischarge: 95 },
    ];

    const bucketTs = new Date('2026-10-10T12:00:00.000Z');
    const mockDataRows = [
      {
        bessAssetId: 'bess-m1',
        bessName: 'Unit 1',
        emuId: 'EMU-U1',
        bucketTimestamp: bucketTs,
        gridSideLoad: 50,
        gridFrequency: 50.01,
        powerFactor: 0.97,
        totalPower: 10,
        voltageA: 230,
        voltageB: 230,
        voltageC: 230,
        currentA: 5,
        currentB: 5,
        currentC: 5,
        bessFrequency: 50.00,
        bessPowerFactor: 0.95,
        pcsActivePower: 15,
        dcVoltage: 700,
        ambientTemp: 25,
        soc: 75,
        soh: 99,
        bmsCurrent: 8,
        cellVMax: 3.33,
        cellVMin: 3.30,
        cellTempMax: 26,
        todayChargeEnergy: 20,
        todayDischargeEnergy: 10,
        accumChargeEnergy: 120,
        accumDischargeEnergy: 60,
        solarPower: 25
      },
      {
        bessAssetId: 'bess-m2',
        bessName: 'Unit 2',
        emuId: 'EMU-U2',
        bucketTimestamp: bucketTs,
        gridSideLoad: 60,
        gridFrequency: 50.01,
        powerFactor: 0.98,
        totalPower: 12,
        voltageA: 231,
        voltageB: 231,
        voltageC: 231,
        currentA: 6,
        currentB: 6,
        currentC: 6,
        bessFrequency: 49.99,
        bessPowerFactor: 0.96,
        pcsActivePower: 18,
        dcVoltage: 710,
        ambientTemp: 26,
        soc: 80,
        soh: 98,
        bmsCurrent: 9,
        cellVMax: 3.34,
        cellVMin: 3.31,
        cellTempMax: 27,
        todayChargeEnergy: 30,
        todayDischargeEnergy: 15,
        accumChargeEnergy: 230,
        accumDischargeEnergy: 95,
        solarPower: 35
      }
    ];

    vi.spyOn(prisma, '$queryRawUnsafe')
      .mockResolvedValueOnce(mockBoundaries as any)
      .mockResolvedValueOnce(mockDataRows as any);

    await reportExportService.exportMultiBessCsv(mockRes, 'site-multi-29', 15, from, to);

    expect(mockRes.ended).toBe(true);
    expect(mockRes.headers['content-type']).toBe('text/csv; charset=utf-8');

    const content = mockRes.getContent();
    expect(content.startsWith('\uFEFF')).toBe(true);

    const stripped = content.slice(1);

    // Verify 4 sequential sections in order:
    const idxSec1 = stripped.indexOf('EMS Reports Export (Multi-BESS)');
    const idxSec2Site = stripped.indexOf('--- SITE ENERGY SUMMARY ---');
    const idxSec2PerBess = stripped.indexOf('--- PER-BESS ENERGY SUMMARY ---');
    const idxSec3 = stripped.indexOf('--- SITE SUMMARY (INTERVAL TELEMETRY) ---');
    const idxSec4 = stripped.indexOf('--- PER-BESS DETAILS (INTERVAL TELEMETRY) ---');

    expect(idxSec1).toBeGreaterThanOrEqual(0);
    expect(idxSec2Site).toBeGreaterThan(idxSec1);
    expect(idxSec2PerBess).toBeGreaterThan(idxSec2Site);
    expect(idxSec3).toBeGreaterThan(idxSec2PerBess);
    expect(idxSec4).toBeGreaterThan(idxSec3);

    // Verify Section 4 Per-BESS Details has exact 43 headers
    const sec4Content = stripped.slice(idxSec4);
    const sec4Headers = sec4Content.split('\r\n')[1].split(',');
    expect(sec4Headers).not.toContain('DC Voltage (V)');
    expect(sec4Headers).toContain('BMS DC Voltage (V)');
    expect(sec4Headers).not.toContain('Cabinet Meter Power (kW)');
    expect(sec4Headers).toHaveLength(43);

    // Verify both BESS rows exist with proper EMU serial number association
    expect(sec4Content).toContain('Unit 1,EMU-U1,50,50.01,0.97,50,0.95,15');
    expect(sec4Content).toContain('Unit 2,EMU-U2,60,50.01,0.98,49.99,0.96,18');
  });

  it('4b. Multi-BESS dynamic report: restores Excel workbook containing Per-BESS Details and Site Summary', async () => {
    const mockRes = new MockResponse() as any;
    const from = new Date('2026-10-10T00:00:00.000Z');
    const to = new Date('2026-10-11T00:00:00.000Z');

    vi.spyOn(prisma.site, 'findUnique').mockResolvedValueOnce({
      id: 'site-multi-wb-29',
      name: 'Multi Site 29',
      businessIdentifier: 'SITE-29',
      timezone: 'Asia/Kolkata',
      client: { id: 'c1', name: 'Power Client' }
    } as any);

    vi.spyOn(prisma.bESSAsset, 'findMany').mockResolvedValueOnce([
      { id: 'bess-u1', name: 'Unit 1', emuId: 'EMU-U1', siteId: 'site-multi-wb-29' },
      { id: 'bess-u2', name: 'Unit 2', emuId: 'EMU-U2', siteId: 'site-multi-wb-29' }
    ] as any);

    vi.spyOn(prisma, '$queryRawUnsafe')
      .mockResolvedValueOnce([]) // boundaries
      .mockResolvedValueOnce([]); // data

    await reportExportService.exportDynamicReport(mockRes, 'site-multi-wb-29', 15, from, to);

    expect(mockRes.ended).toBe(true);
    expect(mockRes.headers['content-type']).toBe('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');

    const ExcelJS = (await import('exceljs')).default;
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(mockRes.getBuffer());

    const sheetNames = workbook.worksheets.map(w => w.name);
    expect(sheetNames).toEqual(['Site Summary', 'Unit 1', 'Unit 2']);
    expect(workbook.getWorksheet('Per-BESS Details')).toBeUndefined();

    const sUnit1 = workbook.getWorksheet('Unit 1')!;
    // Row 12 has the 43 column headers
    const headerRow = sUnit1.getRow(12);
    expect(headerRow.getCell(1).value).toBe('Timestamp');
    expect(headerRow.getCell(2).value).toBe('BESS Name');
    expect(headerRow.getCell(3).value).toBe('EMU Serial No.');
    expect(headerRow.getCell(4).value).toBe('Grid Side Load (kW)');
    expect(headerRow.getCell(5).value).toBe('Grid Frequency (Hz)');
    expect(headerRow.getCell(6).value).toBe('Grid Power Factor');
    expect(headerRow.getCell(7).value).toBe('BESS Frequency (Hz)');
    expect(headerRow.getCell(8).value).toBe('BESS Power Factor');
    expect(headerRow.getCell(9).value).toBe('PCS Active Power (kW)');
    expect(headerRow.getCell(10).value).toBe('PCS Temperature (°C)');
    expect(headerRow.getCell(11).value).toBe('Line Voltage (V)');
    expect(headerRow.getCell(22).value).toBe('BMS DC Voltage (V)');
    expect(headerRow.getCell(23).value).toBe('Cabinet State');
    expect(headerRow.getCell(24).value).toBe('Cell V Max (V)');
    expect(headerRow.getCell(43).value).toBe('Solar Power (kW)');
    expect(headerRow.getCell(44).value).toBeNull();

    // Verify Site Summary grouped headers and merged ranges for the 2 BESS assets (11 site + 2 bess = 13 cols)
    const sSummary = workbook.getWorksheet('Site Summary')!;
    expect(sSummary).toBeDefined();
    const sumRow11 = sSummary.getRow(11);
    const sumRow12 = sSummary.getRow(12);

    expect(sumRow11.getCell(2).value).toBe('Grid Power (kW)');
    expect(sumRow11.getCell(4).value).toBe('Solar Power (kW)');
    expect(sumRow11.getCell(9).value).toBe('Average Grid Frequency (Hz)');
    expect(sumRow11.getCell(10).value).toBe('Average BESS Frequency (Hz)');
    expect(sumRow11.getCell(11).value).toBe('Average Solar Frequency (Hz)');

    // Max PCS Temperature (°C) is removed
    const allHeaders = (sumRow11.values as any[]).filter(Boolean);
    expect(allHeaders).not.toContain('Max PCS Temperature (°C)');

    // Per-BESS Grid frequency section is completely removed from Site Summary
    expect(allHeaders).not.toContain('Grid Frequency (Hz)');
    expect(sumRow11.getCell(12).value).toBeNull();
    expect(sumRow12.getCell(12).value).toBeNull();

    // Save and verify physical XLSX workbook file on disk
    const outXlsxPath = path.resolve(__dirname, '../../scripts/scratch/test-multi-bess-verified.xlsx');
    fs.writeFileSync(outXlsxPath, mockRes.getBuffer());
    const diskWorkbook = new ExcelJS.Workbook();
    await diskWorkbook.xlsx.readFile(outXlsxPath);
    expect(diskWorkbook.worksheets.map(w => w.name)).toEqual(['Site Summary', 'Unit 1', 'Unit 2']);
    expect(diskWorkbook.getWorksheet('Per-BESS Details')).toBeUndefined();
    const diskSummary = diskWorkbook.getWorksheet('Site Summary')!;
    expect(diskSummary.getRow(11).getCell(2).value).toBe('Grid Power (kW)');
    expect(diskSummary.getRow(11).getCell(4).value).toBe('Solar Power (kW)');
    expect(diskSummary.getRow(11).getCell(9).value).toBe('Average Grid Frequency (Hz)');
    expect(diskSummary.getRow(11).getCell(10).value).toBe('Average BESS Frequency (Hz)');
    expect(diskSummary.getRow(11).getCell(11).value).toBe('Average Solar Frequency (Hz)');
    expect(diskSummary.getRow(11).getCell(12).value).toBeNull();
    expect(diskSummary.getRow(12).getCell(12).value).toBeNull();
    const diskUnit1 = diskWorkbook.getWorksheet('Unit 1')!;
    expect(diskUnit1.getRow(12).getCell(43).value).toBe('Solar Power (kW)');
    expect(diskUnit1.getRow(12).getCell(44).value).toBeNull();
  });

  it('5. Handles numeric zero, negative values, and missing values correctly in CSV', async () => {
    const mockRes = new MockResponse() as any;
    const from = new Date('2026-10-10T00:00:00.000Z');
    const to = new Date('2026-10-11T00:00:00.000Z');

    vi.spyOn(prisma.site, 'findUnique').mockResolvedValueOnce({
      id: 'site-edge',
      name: 'Edge Site',
      businessIdentifier: 'SITE-EDGE',
      timezone: 'Asia/Kolkata',
      client: { id: 'c1', name: 'Edge Client' }
    } as any);

    vi.spyOn(prisma.bESSAsset, 'findMany').mockResolvedValueOnce([
      { id: 'bess-edge', name: 'Edge BESS', emuId: null, siteId: 'site-edge' }
    ] as any);

    const mockRows = [
      {
        bessAssetId: 'bess-edge',
        bessName: 'Edge BESS',
        emuId: null, // missing serial
        bucketTimestamp: new Date('2026-10-10T12:00:00.000Z'),
        gridSideLoad: 0, // numeric zero preserved
        gridFrequency: 50.0,
        powerFactor: null, // missing value as empty
        totalPower: 0,
        voltageA: null,
        voltageB: null,
        voltageC: null,
        currentA: null,
        currentB: null,
        currentC: null,
        bessFrequency: 0,
        bessPowerFactor: null,
        pcsActivePower: -25.5, // negative number preserved
        dcVoltage: 750.0,
        pcsTemperature: -2.5, // negative temp preserved
        ambientTemp: -2.5,
        soc: 0, // 0% SOC preserved
        soh: 100,
        bmsCurrent: -15.0,
        cellVMax: null,
        cellVMin: null,
        cellTempMax: null,
        todayChargeEnergy: 0,
        todayDischargeEnergy: 0,
        accumChargeEnergy: 1000,
        accumDischargeEnergy: 500,
        solarPower: 0 // 0 kW solar preserved
      }
    ];

    vi.spyOn(prisma, '$queryRawUnsafe').mockResolvedValueOnce(mockRows as any);

    await reportExportService.exportDynamicReport(mockRes, 'site-edge', 15, from, to);

    const content = mockRes.getContent();
    const stripped = content.slice(1);
    const lines = stripped.split('\r\n');
    const dataLine = lines[11];

    // Missing EMU serial is empty between commas
    expect(dataLine).toContain('Edge BESS,,0,50,,0');
    // Negative PCS Active Power (-25.5) and ambient temp (-2.5) preserved
    expect(dataLine).toContain('-25.5');
    expect(dataLine).toContain('-2.5');
    // Numeric zeros preserved (soc=0, todayCharge=0, solarPower=0)
    expect(dataLine).toContain(',0,100,-15');
    expect(dataLine.endsWith(',0')).toBe(true);
  });

  it('6. Regression: PCS Active Power, BESS metrics, null handling, interval isolation, and exports', async () => {
    // 6a. Single-BESS with consecutive intervals: 12:00 has null pcsActivePower, 12:15 has -0.10 kW
    const mockRes = new MockResponse() as any;
    const from = new Date('2026-10-19T06:00:00.000Z');
    const to = new Date('2026-10-19T07:00:00.000Z');

    vi.spyOn(prisma.site, 'findUnique').mockResolvedValueOnce({
      id: 'site-angad',
      name: 'Angad Food Main Site',
      businessIdentifier: 'ANGAD-FOOD-SITE-001',
      timezone: 'Asia/Kolkata',
      client: { id: 'c-angad', name: 'Angad Food' }
    } as any);

    vi.spyOn(prisma.bESSAsset, 'findMany').mockResolvedValueOnce([
      { id: 'bess-angad-1', name: 'Angad Food BESS 01', emuId: '2410031073', siteId: 'site-angad' }
    ] as any);

    const rows = [
      {
        bessAssetId: 'bess-angad-1',
        bessName: 'Angad Food BESS 01',
        emuId: '2410031073',
        bucketTimestamp: new Date('2026-10-19T06:45:00.000Z'), // 12:15 PM IST
        gridSideLoad: 0,
        gridFrequency: 50.01,
        powerFactor: 0.98,
        totalPower: 0,
        voltageA: null,
        voltageB: null,
        voltageC: null,
        currentA: null,
        currentB: null,
        currentC: null,
        bessFrequency: 50.02,
        bessPowerFactor: 0.95,
        pcsActivePower: -0.10, // Non-null value
        dcVoltage: 720.0,
        ambientTemp: 25.0,
        soc: 85,
        soh: 99,
        bmsCurrent: -1.2,
        cellVMax: 3.32,
        cellVMin: 3.31,
        cellTempMax: 26.0,
        todayChargeEnergy: 10,
        todayDischargeEnergy: 5,
        accumChargeEnergy: 500,
        accumDischargeEnergy: 250,
        solarPower: 30
      },
      {
        bessAssetId: 'bess-angad-1',
        bessName: 'Angad Food BESS 01',
        emuId: '2410031073',
        bucketTimestamp: new Date('2026-10-19T06:30:00.000Z'), // 12:00 PM IST
        gridSideLoad: 0,
        gridFrequency: 50.00,
        powerFactor: 0.98,
        totalPower: 0,
        voltageA: null,
        voltageB: null,
        voltageC: null,
        currentA: null,
        currentB: null,
        currentC: null,
        bessFrequency: 50.00,
        bessPowerFactor: 0.96,
        pcsActivePower: null, // Genuinely null interval
        dcVoltage: 720.0,
        ambientTemp: 25.0,
        soc: 85,
        soh: 99,
        bmsCurrent: 0,
        cellVMax: 3.32,
        cellVMin: 3.31,
        cellTempMax: 26.0,
        todayChargeEnergy: 10,
        todayDischargeEnergy: 5,
        accumChargeEnergy: 500,
        accumDischargeEnergy: 250,
        solarPower: 30
      }
    ];

    vi.spyOn(prisma, '$queryRawUnsafe').mockResolvedValueOnce(rows as any);

    await reportExportService.exportDynamicReport(mockRes, 'site-angad', 15, from, to);

    const csvContent = mockRes.getContent();
    const stripped = csvContent.slice(1);
    const lines = stripped.split('\r\n');

    // Headers on line 10 (index 10)
    expect(lines[10]).toBe(EXPECTED_43_HEADERS.join(','));

    // 12:15 PM row (index 11) has pcsActivePower = -0.1
    const row1215 = lines[11];
    expect(row1215).toContain('Angad Food BESS 01,2410031073,0,50.01,0.98,50.02,0.95,-0.1');

    // 12:00 PM row (index 12) has null pcsActivePower -> blank between commas
    const row1200 = lines[12];
    expect(row1200).toContain('Angad Food BESS 01,2410031073,0,50,0.98,50,0.96,,');
    // Verify it is NOT replaced by 0 or previous interval's -0.10
    expect(row1200).not.toContain('0.96,-0.1');
    expect(row1200).not.toContain('0.96,0,');

    // 6b. Verify UI formatPowerValue renders matching values
    expect(formatPowerValue(-0.10, 'kW')).toBe('-0.10');
    expect(formatPowerValue(null, 'kW')).toBe('--');
    expect(formatPowerValue(undefined, 'kW')).toBe('--');
    expect(formatPowerValue(0, 'kW')).toBe('0.00');

    // 6c. Verify Multi-BESS Excel export preserves nulls without zero/forward fill
    const mockExcelRes = new MockResponse() as any;
    vi.spyOn(prisma.site, 'findUnique').mockResolvedValueOnce({
      id: 'site-angad-multi',
      name: 'Angad Food Site',
      businessIdentifier: 'ANGAD-SITE',
      timezone: 'Asia/Kolkata',
      client: { id: 'c-angad', name: 'Angad Food' }
    } as any);

    vi.spyOn(prisma.bESSAsset, 'findMany').mockResolvedValueOnce([
      { id: 'bess-angad-1', name: 'Angad Food BESS 01', emuId: '2410031073', siteId: 'site-angad-multi' },
      { id: 'bess-2', name: 'Angad Food BESS 02', emuId: '2410031074', siteId: 'site-angad-multi' }
    ] as any);

    vi.spyOn(prisma, '$queryRawUnsafe')
      .mockResolvedValueOnce([]) // boundaries
      .mockResolvedValueOnce(rows as any); // data

    await reportExportService.exportDynamicReport(mockExcelRes, 'site-angad-multi', 15, from, to);

    const ExcelJS = (await import('exceljs')).default;
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(mockExcelRes.getBuffer());
    expect(wb.getWorksheet('Per-BESS Details')).toBeUndefined();
    const detailsSheet = wb.getWorksheet('Angad Food BESS 01')!;

    // Header at row 12
    expect(detailsSheet.getRow(12).getCell(9).value).toBe('PCS Active Power (kW)');
    // 12:15 row (row 13) has -0.10
    expect(detailsSheet.getRow(13).getCell(9).value).toBe(-0.10);
    // 12:00 row (row 14) has null
    expect(detailsSheet.getRow(14).getCell(9).value).toBeNull();
  });

  it('7. Comprehensive Parity & Unit Preferences: CSV, Multi-BESS Excel, and On-Screen Table parity with MW/MWh scaling', async () => {
    // 7a. Header parity between single-BESS CSV, multi-BESS Excel Per-BESS Details, and on-screen table
    const csvHeaders = getAuthoritativeTelemetryHeaders();
    const tableHeaders = getAuthoritativeReportsHeaders();
    expect(csvHeaders).toEqual(tableHeaders);
    expect(csvHeaders).toHaveLength(43);

    // 7b. Unit preference dynamic header parity (MW and MWh)
    const mwMwhCsvHeaders = getAuthoritativeTelemetryHeaders({ powerUnit: 'MW', energyUnit: 'MWh' });
    const mwMwhTableHeaders = getAuthoritativeReportsHeaders({ powerUnit: 'MW', energyUnit: 'MWh' });
    expect(mwMwhCsvHeaders).toEqual(mwMwhTableHeaders);
    expect(mwMwhCsvHeaders).toHaveLength(43);

    expect(mwMwhCsvHeaders[3]).toBe('Grid Side Load (MW)');
    expect(mwMwhCsvHeaders[8]).toBe('PCS Active Power (MW)');
    expect(mwMwhCsvHeaders[38]).toBe('Today Charge Energy (MWh)');
    expect(mwMwhCsvHeaders[39]).toBe('Today Discharge Energy (MWh)');
    expect(mwMwhCsvHeaders[40]).toBe('Accum Charge Energy (MWh)');
    expect(mwMwhCsvHeaders[41]).toBe('Accum Discharge Energy (MWh)');
    expect(mwMwhCsvHeaders[42]).toBe('Solar Power (MW)');

    // 7c. Multi-BESS Excel export with MW and MWh options
    const mockExcelRes = new MockResponse() as any;
    const from = new Date('2026-10-10T00:00:00.000Z');
    const to = new Date('2026-10-11T00:00:00.000Z');

    vi.spyOn(prisma.site, 'findUnique').mockResolvedValueOnce({
      id: 'site-mw-mwh',
      name: 'MW Site',
      businessIdentifier: 'MW-01',
      timezone: 'Asia/Kolkata',
      client: { id: 'c-mw', name: 'MW Client' }
    } as any);

    vi.spyOn(prisma.bESSAsset, 'findMany').mockResolvedValueOnce([
      { id: 'bess-mw-1', name: 'BESS Unit A', emuId: 'EMU-A', siteId: 'site-mw-mwh' },
      { id: 'bess-mw-2', name: 'BESS Unit B', emuId: 'EMU-B', siteId: 'site-mw-mwh' }
    ] as any);

    const testRow = {
      bessAssetId: 'bess-mw-1',
      bessName: 'BESS Unit A',
      emuId: 'EMU-A',
      bucketTimestamp: new Date('2026-10-10T12:00:00.000Z'),
      gridSideLoad: 2500, // 2500 kW -> 2.50 MW
      gridFrequency: 50.02,
      powerFactor: 0.99,
      bessFrequency: 50.01,
      bessPowerFactor: 0.98,
      pcsActivePower: 1200, // 1200 kW -> 1.20 MW
      pcsTemperature: 25.5,
      pcsLineVoltage: 415.0,
      pcsAcCurrent: 100.2,
      tmsOperatingMode: 1, // SELF-CIRCULATION
      tmsAmbientTemp: 28.0,
      tmsCoolantReturnTemp: 22.1,
      tmsCoolantInletTemp: 19.4,
      tmsCoolantReturnPressure: 2.15,
      tmsCoolantInletPressure: 2.35,
      soc: 85.0,
      soh: 99.0,
      bmsCurrent: 45.2,
      bmsDcVoltage: 720.5,
      bmsCabinetState: 2, // CHARGING
      cellVMax: 3.335,
      cellVMin: 3.315,
      cellTempMax: 26.5,
      cellTempMin: 23.2,
      batteryAmbientTemp: 27.1,
      pack01AvgTemp: 25.0,
      pack01MaxTemp: 26.0,
      pack02AvgTemp: 25.1,
      pack02MaxTemp: 26.1,
      pack03AvgTemp: 25.2,
      pack03MaxTemp: 26.2,
      pack04AvgTemp: 25.3,
      pack04MaxTemp: 26.3,
      pack05AvgTemp: 25.4,
      pack05MaxTemp: 26.4,
      todayChargeEnergy: 5000, // 5000 kWh -> 5.00 MWh
      todayDischargeEnergy: 2000, // 2000 kWh -> 2.00 MWh
      accumChargeEnergy: 50000, // 50000 kWh -> 50.00 MWh
      accumDischargeEnergy: 25000, // 25000 kWh -> 25.00 MWh
      solarPower: 800 // 800 kW -> 0.80 MW
    };

    vi.spyOn(prisma, '$queryRawUnsafe')
      .mockResolvedValueOnce([]) // boundaries
      .mockResolvedValueOnce([testRow] as any);

    await reportExportService.exportDynamicReport(
      mockExcelRes,
      'site-mw-mwh',
      15,
      from,
      to,
      { powerUnit: 'MW', energyUnit: 'MWh' }
    );

    const ExcelJS = (await import('exceljs')).default;
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(mockExcelRes.getBuffer());

    expect(wb.getWorksheet('Per-BESS Details')).toBeUndefined();
    const details = wb.getWorksheet('BESS Unit A')!;
    // Header row 12 has dynamic MW and MWh units
    expect(details.getRow(12).getCell(4).value).toBe('Grid Side Load (MW)');
    expect(details.getRow(12).getCell(9).value).toBe('PCS Active Power (MW)');
    expect(details.getRow(12).getCell(39).value).toBe('Today Charge Energy (MWh)');
    expect(details.getRow(12).getCell(40).value).toBe('Today Discharge Energy (MWh)');
    expect(details.getRow(12).getCell(41).value).toBe('Accum Charge Energy (MWh)');
    expect(details.getRow(12).getCell(42).value).toBe('Accum Discharge Energy (MWh)');
    expect(details.getRow(12).getCell(43).value).toBe('Solar Power (MW)');

    // Row 13 data cells scaled to MW and MWh
    expect(details.getRow(13).getCell(4).value).toBe(2.5); // 2500 / 1000
    expect(details.getRow(13).getCell(9).value).toBe(1.2); // 1200 / 1000
    expect(details.getRow(13).getCell(13).value).toBe('SELF-CIRCULATION');
    expect(details.getRow(13).getCell(23).value).toBe('CHARGING');
    expect(details.getRow(13).getCell(39).value).toBe(5); // 5000 / 1000
    expect(details.getRow(13).getCell(40).value).toBe(2); // 2000 / 1000
    expect(details.getRow(13).getCell(41).value).toBe(50); // 50000 / 1000
    expect(details.getRow(13).getCell(42).value).toBe(25); // 25000 / 1000
    expect(details.getRow(13).getCell(43).value).toBe(0.8); // 800 / 1000

    // Non-power/energy fields remain in unscaled canonical units
    expect(details.getRow(13).getCell(5).value).toBe(50.02); // Grid Frequency
    expect(details.getRow(13).getCell(11).value).toBe(415); // Line Voltage
    expect(details.getRow(13).getCell(22).value).toBe(720.5); // BMS DC Voltage
    expect(details.getRow(13).getCell(24).value).toBe(3.335); // Cell V Max

    // 7d. Frontend cell formatters produce exact same scaled strings without double conversion
    expect(formatPowerValue(testRow.gridSideLoad, 'MW')).toBe('2.50');
    expect(formatPowerValue(testRow.pcsActivePower, 'MW')).toBe('1.20');
    expect(formatPowerValue(testRow.solarPower, 'MW')).toBe('0.80');
    expect(formatEnergyValue(testRow.todayChargeEnergy, 'MWh')).toBe('5.00');
    expect(formatEnergyValue(testRow.todayDischargeEnergy, 'MWh')).toBe('2.00');
    expect(formatEnergyValue(testRow.accumChargeEnergy, 'MWh')).toBe('50.00');
    expect(formatEnergyValue(testRow.accumDischargeEnergy, 'MWh')).toBe('25.00');
  });

  describe('8. Separate Worksheets per BESS, Name Sanitization, Empty-Data Retention, and Scoping', () => {
    it('8a. sanitizeWorksheetName handles invalid, long, and quoted names', () => {
      expect(sanitizeWorksheetName('Simple BESS')).toBe('Simple BESS');
      // Prohibited chars \ / ? * [ ] : replaced by _
      expect(sanitizeWorksheetName('Rack [1]: East/West? *Test* \\5')).toBe('Rack _1__ East_West_ _Test_ _5');
      // Leading and trailing single quotes stripped
      expect(sanitizeWorksheetName("'Quoted BESS'")).toBe('Quoted BESS');
      // Max 31 characters truncated
      const longName = 'This Is A Very Long Name That Exceeds Thirty One Characters Easily';
      const sanitized = sanitizeWorksheetName(longName);
      expect(sanitized.length).toBeLessThanOrEqual(31);
      expect(sanitized).toBe('This Is A Very Long Name That E');
      // Empty string fallback
      expect(sanitizeWorksheetName('')).toBe('BESS');
      expect(sanitizeWorksheetName('   ')).toBe('BESS');
    });

    it('8b. generateBessWorksheetNames handles reserved Site Summary, duplicates, case-insensitivity, and 31-char limit', () => {
      const assets = [
        { id: 'b1', name: 'Site Summary' }, // reserved!
        { id: 'b2', name: 'site summary' }, // case-insensitive reserved!
        { id: 'b3', name: 'Duplicate BESS' },
        { id: 'b4', name: 'Duplicate BESS' }, // duplicate!
        { id: 'b5', name: 'duplicate bess' }, // case-insensitive duplicate!
        { id: 'b6', name: 'Very Long BESS Name That Exceeds Limit 1' },
        { id: 'b7', name: 'Very Long BESS Name That Exceeds Limit 2' }, // collisions after 31 chars!
      ];

      const namesMap = generateBessWorksheetNames(assets, ['Site Summary']);

      expect(namesMap.get('b1')).toBe('Site Summary (2)');
      expect(namesMap.get('b2')).toBe('site summary (3)');
      expect(namesMap.get('b3')).toBe('Duplicate BESS');
      expect(namesMap.get('b4')).toBe('Duplicate BESS (2)');
      expect(namesMap.get('b5')).toBe('duplicate bess (3)');

      const nameB6 = namesMap.get('b6')!;
      const nameB7 = namesMap.get('b7')!;
      expect(nameB6.length).toBeLessThanOrEqual(31);
      expect(nameB7.length).toBeLessThanOrEqual(31);
      expect(nameB6).not.toEqual(nameB7);

      // Verify all generated names are mutually unique (case-insensitive)
      const allNames = Array.from(namesMap.values());
      const lowerNames = allNames.map(n => n.toLowerCase());
      expect(new Set(lowerNames).size).toBe(allNames.length);
    });

    it('8c. Multi-BESS Excel export creates dedicated worksheets per BESS, excludes Per-BESS Details, includes empty-data assets, and strictly scopes rows', async () => {
      const mockRes = new MockResponse() as any;
      const from = new Date('2026-10-10T00:00:00.000Z');
      const to = new Date('2026-10-11T00:00:00.000Z');

      vi.spyOn(prisma.site, 'findUnique').mockResolvedValueOnce({
        id: 'site-separate-sheets',
        name: 'Separate Sheets Site',
        businessIdentifier: 'SITE-SEP-01',
        timezone: 'Asia/Kolkata',
        client: { id: 'c-sep', name: 'Green Power Corp' }
      } as any);

      vi.spyOn(prisma.bESSAsset, 'findMany').mockResolvedValueOnce([
        { id: 'asset-1', name: 'BESS Unit 01', emuId: 'EMU-01', siteId: 'site-separate-sheets' },
        { id: 'asset-2', name: 'BESS Unit 01', emuId: 'EMU-02', siteId: 'site-separate-sheets' }, // duplicate name
        { id: 'asset-3', name: 'BESS Unit 03 [Offline]', emuId: 'EMU-03', siteId: 'site-separate-sheets' } // empty data asset
      ] as any);

      // Boundaries mock
      vi.spyOn(prisma, '$queryRawUnsafe')
        .mockResolvedValueOnce([
          { bessAssetId: 'asset-1', firstCharge: 100, lastCharge: 150, firstDischarge: 50, lastDischarge: 80 },
          { bessAssetId: 'asset-2', firstCharge: 200, lastCharge: 275, firstDischarge: 100, lastDischarge: 140 }
          // asset-3 has no boundary records
        ] as any)
        .mockResolvedValueOnce([
          // Rows for asset-1
          {
            bessAssetId: 'asset-1',
            bessName: 'BESS Unit 01',
            emuId: 'EMU-01',
            bucketTimestamp: new Date('2026-10-10T12:00:00.000Z'),
            gridSideLoad: 250,
            gridFrequency: 50.00,
            powerFactor: 0.98,
            bessFrequency: 50.01,
            bessPowerFactor: 0.96,
            pcsActivePower: 120,
            accumChargeEnergy: 150,
            accumDischargeEnergy: 80
          },
          // Rows for asset-2
          {
            bessAssetId: 'asset-2',
            bessName: 'BESS Unit 01',
            emuId: 'EMU-02',
            bucketTimestamp: new Date('2026-10-10T12:00:00.000Z'),
            gridSideLoad: 350,
            gridFrequency: 50.02,
            powerFactor: 0.97,
            bessFrequency: 50.03,
            bessPowerFactor: 0.95,
            pcsActivePower: 220,
            accumChargeEnergy: 275,
            accumDischargeEnergy: 140
          }
          // asset-3 has ZERO data rows
        ] as any);

      await reportExportService.exportDynamicReport(mockRes, 'site-separate-sheets', 15, from, to);

      expect(mockRes.ended).toBe(true);
      expect(mockRes.headers['content-type']).toBe('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');

      const ExcelJS = (await import('exceljs')).default;
      const wb = new ExcelJS.Workbook();
      await wb.xlsx.load(mockRes.getBuffer());

      // 1. Workbook contains Site Summary followed by one worksheet per exported BESS
      const sheetNames = wb.worksheets.map(w => w.name);
      expect(sheetNames).toEqual([
        'Site Summary',
        'BESS Unit 01',
        'BESS Unit 01 (2)',
        'BESS Unit 03 _Offline_'
      ]);

      // 2. The combined Per-BESS Details sheet is no longer present
      expect(wb.getWorksheet('Per-BESS Details')).toBeUndefined();

      // 3. Site Summary remains intact with correct calculations
      const summarySheet = wb.getWorksheet('Site Summary')!;
      expect(summarySheet.getRow(1).getCell(1).value).toBe('EMS Site Summary');
      expect(summarySheet.getRow(8).getCell(1).value).toBe('Total Charge Difference');
      expect(summarySheet.getRow(8).getCell(2).value).toBe(125); // (150-100) + (275-200) = 50 + 75
      expect(summarySheet.getRow(9).getCell(2).value).toBe(70);  // (80-50) + (140-100) = 30 + 40
      // Aggregated data row 12
      expect(summarySheet.getRow(12).getCell(2).value).toBe(600); // 250 + 350
      expect(summarySheet.getRow(12).getCell(3).value).toBe(340); // 120 + 220

      // 4. Asset 1 worksheet: verified headers, energy diff, and strict row scoping
      const sheet1 = wb.getWorksheet('BESS Unit 01')!;
      expect(sheet1.getRow(1).getCell(1).value).toBe('EMS Reports Export (Multi-BESS)');
      expect(sheet1.getRow(8).getCell(1).value).toBe('BESS Unit 01');
      expect(sheet1.getRow(9).getCell(1).value).toBe('Total Charge Difference');
      expect(sheet1.getRow(9).getCell(2).value).toBe(50);
      expect(sheet1.getRow(10).getCell(2).value).toBe(30);

      // Verify all 43 authoritative headers in row 12
      const headerRow1 = sheet1.getRow(12);
      expect(headerRow1.getCell(1).value).toBe('Timestamp');
      expect(headerRow1.getCell(2).value).toBe('BESS Name');
      expect(headerRow1.getCell(3).value).toBe('EMU Serial No.');
      expect(headerRow1.getCell(4).value).toBe('Grid Side Load (kW)');
      expect(headerRow1.getCell(9).value).toBe('PCS Active Power (kW)');
      expect(headerRow1.getCell(43).value).toBe('Solar Power (kW)');
      expect(headerRow1.getCell(44).value).toBeNull();

      // Scoping: sheet1 contains ONLY asset-1 rows
      let sheet1DataRows = 0;
      sheet1.eachRow((row, rowNumber) => {
        if (rowNumber > 12) {
          sheet1DataRows++;
          expect(row.getCell(2).value).toBe('BESS Unit 01');
          expect(row.getCell(3).value).toBe('EMU-01');
          expect(row.getCell(4).value).toBe(250);
        }
      });
      expect(sheet1DataRows).toBe(1);

      // 5. Asset 2 worksheet: verified deduplicated name, diff, and strict row scoping
      const sheet2 = wb.getWorksheet('BESS Unit 01 (2)')!;
      expect(sheet2.getRow(8).getCell(1).value).toBe('BESS Unit 01');
      expect(sheet2.getRow(9).getCell(2).value).toBe(75);
      expect(sheet2.getRow(10).getCell(2).value).toBe(40);
      let sheet2DataRows = 0;
      sheet2.eachRow((row, rowNumber) => {
        if (rowNumber > 12) {
          sheet2DataRows++;
          expect(row.getCell(2).value).toBe('BESS Unit 01');
          expect(row.getCell(3).value).toBe('EMU-02');
          expect(row.getCell(4).value).toBe(350);
        }
      });
      expect(sheet2DataRows).toBe(1);

      // 6. Asset 3 worksheet: empty-data BESS still receives worksheet with metadata & headers
      const sheet3 = wb.getWorksheet('BESS Unit 03 _Offline_')!;
      expect(sheet3.getRow(1).getCell(1).value).toBe('EMS Reports Export (Multi-BESS)');
      expect(sheet3.getRow(8).getCell(1).value).toBe('BESS Unit 03 [Offline]');
      expect(sheet3.getRow(9).getCell(2).value).toBeNull(); // No boundary data
      expect(sheet3.getRow(10).getCell(2).value).toBeNull();
      // Headers present in row 12
      expect(sheet3.getRow(12).getCell(1).value).toBe('Timestamp');
      expect(sheet3.getRow(12).getCell(43).value).toBe('Solar Power (kW)');
      // Exactly zero data rows
      let sheet3DataRows = 0;
      sheet3.eachRow((row, rowNumber) => {
        if (rowNumber > 12) {
          sheet3DataRows++;
        }
      });
      expect(sheet3DataRows).toBe(0);
    });
  });
});


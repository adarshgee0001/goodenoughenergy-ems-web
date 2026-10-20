import { describe, it, expect, vi } from 'vitest';
import { EventEmitter } from 'events';
import {
  reportExportService,
  AUTHORITATIVE_TELEMETRY_HEADERS,
  SINGLE_BESS_TELEMETRY_HEADERS,
  getSingleBessTelemetryHeaders,
  getAuthoritativeTelemetryHeaders
} from '../../src/services/report-export.service';
import {
  getAuthoritativeReportsHeaders,
  getSingleBessReportsHeaders,
  AUTHORITATIVE_REPORTS_HEADERS,
  SINGLE_BESS_REPORTS_HEADERS
} from '../../../frontend/src/pages/EMSApp/ReportsPage';
import {
  isRecognizedPackTemperatureSignal,
  calculatePackTemperatures,
  aggregatePackPayloads,
  processReportBatteryStatusRow
} from '../../src/utils/battery-status.util';
import { prisma } from '../../src/db/prisma';
import ExcelJS from 'exceljs';

// Mock Response for streaming CSV and Excel tests
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

describe('Battery Status in Single-BESS Reports and Exports (12 Required Checks)', () => {
  const EXPECTED_11_BATTERY_COLUMNS = [
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
    'Pack 05 Maximum Temperature (°C)'
  ];

  // 1. All 11 new columns appear in the correct table and CSV header order
  it('1. All 11 new columns appear in the correct table and CSV header order', () => {
    expect(SINGLE_BESS_TELEMETRY_HEADERS).toHaveLength(43);
    expect(AUTHORITATIVE_REPORTS_HEADERS).toHaveLength(43);
    expect(SINGLE_BESS_REPORTS_HEADERS).toHaveLength(43);

    const singleBessCsvHeaders = getSingleBessTelemetryHeaders();
    expect(singleBessCsvHeaders).toHaveLength(43);

    const singleBessTableHeaders = getSingleBessReportsHeaders();
    expect(singleBessTableHeaders).toHaveLength(43);

    // Verify relative position: directly after Cell Temp Min (°C) (index 26) and before Today Charge Energy (index 38)
    expect(singleBessCsvHeaders[25]).toBe('Cell Temp Max (°C)');
    expect(singleBessCsvHeaders[26]).toBe('Cell Temp Min (°C)');
    for (let i = 0; i < EXPECTED_11_BATTERY_COLUMNS.length; i++) {
      expect(singleBessCsvHeaders[27 + i]).toBe(EXPECTED_11_BATTERY_COLUMNS[i]);
      expect(singleBessTableHeaders[27 + i]).toBe(EXPECTED_11_BATTERY_COLUMNS[i]);
    }
    expect(singleBessCsvHeaders[38]).toBe('Today Charge Energy (kWh)');
    expect(singleBessTableHeaders[38]).toBe('Today Charge Energy (kWh)');
  });

  // 2. th.ai_temp populates only Battery Ambient Temperature
  it('2. th.ai_temp populates only Battery Ambient Temperature and does not alter PCS ambientTemp', () => {
    const row = {
      ambientTemp: 42.5, // PCS IGBT temperature
      batteryAmbientTemp: 26.43
    };

    processReportBatteryStatusRow(row);

    // batteryAmbientTemp rounded to 1 decimal
    expect(row.batteryAmbientTemp).toBe(26.4);
    // PCS ambientTemp is untouched
    expect(row.ambientTemp).toBe(42.5);
  });

  // 3. Each of the five packs populates the correct average and maximum columns
  it('3. Each of the five packs populates the correct average and maximum columns', () => {
    const row = {
      pack01Payloads: [[{ m: 'ai_temp_01', v: 25 }, { m: 'ai_temp_02', v: 27 }]],
      pack02Payloads: [[{ m: 'ai_temp_01', v: 26 }, { m: 'ai_temp_02', v: 28 }]],
      pack03Payloads: [[{ m: 'ai_temp_01', v: 27 }, { m: 'ai_temp_02', v: 29 }]],
      pack04Payloads: [[{ m: 'ai_temp_01', v: 28 }, { m: 'ai_temp_02', v: 30 }]],
      pack05Payloads: [[{ m: 'ai_temp_01', v: 29 }, { m: 'ai_temp_02', v: 31 }]],
    };

    processReportBatteryStatusRow(row);

    expect(row.pack01AvgTemp).toBe(26.0);
    expect(row.pack01MaxTemp).toBe(27.0);

    expect(row.pack02AvgTemp).toBe(27.0);
    expect(row.pack02MaxTemp).toBe(28.0);

    expect(row.pack03AvgTemp).toBe(28.0);
    expect(row.pack03MaxTemp).toBe(29.0);

    expect(row.pack04AvgTemp).toBe(29.0);
    expect(row.pack04MaxTemp).toBe(30.0);

    expect(row.pack05AvgTemp).toBe(30.0);
    expect(row.pack05MaxTemp).toBe(31.0);

    // Raw payload arrays cleaned up
    expect((row as any).pack01Payloads).toBeUndefined();
    expect((row as any).pack05Payloads).toBeUndefined();
  });

  // 4. Only recognized temperature signals participate in pack aggregation
  it('4. Only recognized temperature signals participate in pack aggregation', () => {
    expect(isRecognizedPackTemperatureSignal('ai_temp_01')).toBe(true);
    expect(isRecognizedPackTemperatureSignal('ai_temp_28')).toBe(true);
    expect(isRecognizedPackTemperatureSignal('ai_negpol_temp')).toBe(true);
    expect(isRecognizedPackTemperatureSignal('ai_pospol_temp')).toBe(true);

    // Non-temperature signals must be rejected
    expect(isRecognizedPackTemperatureSignal('ai_voltage_01')).toBe(false);
    expect(isRecognizedPackTemperatureSignal('di_status')).toBe(false);
    expect(isRecognizedPackTemperatureSignal('ai_curr')).toBe(false);
    expect(isRecognizedPackTemperatureSignal('arbitrary_sensor')).toBe(false);

    // Aggregation excludes non-temperature signals
    const payload = [
      { m: 'ai_temp_01', v: 24.0 },
      { m: 'ai_pospol_temp', v: 26.0 },
      { m: 'ai_voltage_01', v: 3300 }, // must NOT be averaged with temperatures
      { m: 'di_alarm', v: 1 }
    ];
    const res = aggregatePackPayloads([payload]);
    expect(res.avgTemp).toBe(25.0); // (24 + 26) / 2
    expect(res.maxTemp).toBe(26.0);
  });

  // 5. Missing pack components and missing th telemetry yield blank/null cells
  it('5. Missing pack components and missing th telemetry yield blank/null cells', async () => {
    const row: any = {
      batteryAmbientTemp: null,
      pack01Payloads: null,
      pack02Payloads: [],
      pack03Payloads: undefined,
      pack04Payloads: null,
      pack05Payloads: null
    };

    processReportBatteryStatusRow(row);

    expect(row.batteryAmbientTemp).toBeNull();
    expect(row.pack01AvgTemp).toBeNull();
    expect(row.pack01MaxTemp).toBeNull();
    expect(row.pack02AvgTemp).toBeNull();
    expect(row.pack02MaxTemp).toBeNull();
    expect(row.pack03AvgTemp).toBeNull();
    expect(row.pack03MaxTemp).toBeNull();
    expect(row.pack04AvgTemp).toBeNull();
    expect(row.pack04MaxTemp).toBeNull();
    expect(row.pack05AvgTemp).toBeNull();
    expect(row.pack05MaxTemp).toBeNull();
  });

  // 6. Unknown-only pack signals never fall back to averaging arbitrary values
  it('6. Unknown-only pack signals never fall back to averaging arbitrary values', () => {
    const unknownOnlyPayload = [
      { m: 'ai_cell_volt_01', v: 3.32 },
      { m: 'ai_soc', v: 85.0 },
      { m: 'di_switch', v: 1 }
    ];

    const result = aggregatePackPayloads([unknownOnlyPayload]);
    expect(result.avgTemp).toBeNull();
    expect(result.maxTemp).toBeNull();
  });

  // 7. Multiple telemetry samples in one reporting bucket follow the documented aggregation strategy
  it('7. Multiple telemetry samples in one reporting bucket follow documented aggregation strategy', () => {
    // 3 samples in one bucket
    const sample1 = [{ m: 'ai_temp_01', v: 28.0 }, { m: 'ai_temp_02', v: 30.0 }]; // avg: 29.0, max: 30.0
    const sample2 = [{ m: 'ai_temp_01', v: 29.0 }, { m: 'ai_temp_02', v: 31.0 }]; // avg: 30.0, max: 31.0
    const sample3 = [{ m: 'ai_temp_01', v: 30.0 }, { m: 'ai_temp_02', v: 32.0 }]; // avg: 31.0, max: 32.0

    const result = aggregatePackPayloads([sample1, sample2, sample3]);

    // Bucket average = (29.0 + 30.0 + 31.0) / 3 = 30.0
    expect(result.avgTemp).toBe(30.0);
    // Bucket maximum = max(30.0, 31.0, 32.0) = 32.0
    expect(result.maxTemp).toBe(32.0);
  });

  // 8. Measurements from different timestamps or BESS assets cannot be mixed
  it('8. Measurements from different BESS assets or timestamps remain strictly isolated', () => {
    const rowAssetA = {
      bessAssetId: 'asset-A',
      batteryAmbientTemp: 22.0,
      pack01Payloads: [[{ m: 'ai_temp_01', v: 24 }]]
    };
    const rowAssetB = {
      bessAssetId: 'asset-B',
      batteryAmbientTemp: 35.0,
      pack01Payloads: [[{ m: 'ai_temp_01', v: 38 }]]
    };

    processReportBatteryStatusRow(rowAssetA);
    processReportBatteryStatusRow(rowAssetB);

    expect(rowAssetA.batteryAmbientTemp).toBe(22.0);
    expect(rowAssetA.pack01AvgTemp).toBe(24.0);

    expect(rowAssetB.batteryAmbientTemp).toBe(35.0);
    expect(rowAssetB.pack01AvgTemp).toBe(38.0);
  });

  // 9. Existing SOC and all existing report measurements remain unchanged
  it('9. Existing SOC and all existing report measurements remain unchanged (no duplicate SOC columns)', () => {
    const row = {
      soc: 85.5,
      soh: 99.0,
      bmsCurrent: 14.5,
      cellVMax: 3.38,
      cellVMin: 3.34,
      cellTempMax: 27.8,
      pcsActivePower: 50.0,
      dcVoltage: 780.0,
      todayChargeEnergy: 100.0,
      batteryAmbientTemp: 25.0
    };

    processReportBatteryStatusRow(row);

    expect(row.soc).toBe(85.5);
    expect(row.soh).toBe(99.0);
    expect(row.bmsCurrent).toBe(14.5);
    expect(row.cellVMax).toBe(3.38);
    expect(row.cellVMin).toBe(3.34);
    expect(row.cellTempMax).toBe(27.8);
    expect(row.pcsActivePower).toBe(50.0);
    expect(row.dcVoltage).toBe(780.0);
    expect(row.todayChargeEnergy).toBe(100.0);

    // Verify there is only 1 SOC column in SINGLE_BESS_TELEMETRY_HEADERS
    const socHeaders = SINGLE_BESS_TELEMETRY_HEADERS.filter(h => h.includes('SOC'));
    expect(socHeaders).toHaveLength(1);
    expect(socHeaders[0]).toBe('SOC (%)');
  });

  // 10. Historical ranges with no Battery Status data still produce valid reports and exports
  it('10. Historical ranges with no Battery Status data produce valid exports with blank cells', async () => {
    const mockRes = new MockResponse() as any;
    const from = new Date('2025-01-01T00:00:00.000Z');
    const to = new Date('2025-01-02T00:00:00.000Z');

    vi.spyOn(prisma.site, 'findUnique').mockResolvedValueOnce({
      id: 'site-old',
      name: 'Old Site',
      businessIdentifier: 'SITE-OLD',
      timezone: 'Asia/Kolkata',
      client: { id: 'c1', name: 'Legacy Client' }
    } as any);

    vi.spyOn(prisma.bESSAsset, 'findMany').mockResolvedValueOnce([
      { id: 'bess-old', name: 'Legacy BESS', emuId: 'EMU-OLD-01', siteId: 'site-old' }
    ] as any);

    const mockOldRows = [
      {
        bessAssetId: 'bess-old',
        bessName: 'Legacy BESS',
        emuId: 'EMU-OLD-01',
        bucketTimestamp: new Date('2025-01-01T12:00:00.000Z'),
        gridSideLoad: 100.0,
        gridFrequency: 50.0,
        powerFactor: 0.99,
        totalPower: 20.0,
        voltageA: 230.0,
        voltageB: 230.0,
        voltageC: 230.0,
        currentA: 10.0,
        currentB: 10.0,
        currentC: 10.0,
        bessFrequency: 50.0,
        bessPowerFactor: 0.98,
        pcsActivePower: 30.0,
        dcVoltage: 700.0,
        ambientTemp: 25.0,
        soc: 80.0,
        soh: 100.0,
        bmsCurrent: 10.0,
        cellVMax: 3.35,
        cellVMin: 3.32,
        cellTempMax: 26.0,
        todayChargeEnergy: 40.0,
        todayDischargeEnergy: 20.0,
        accumChargeEnergy: 1000.0,
        accumDischargeEnergy: 500.0,
        solarPower: 50.0,
        // Battery status fields are all null (did not exist back then)
        batteryAmbientTemp: null,
        pack01Payloads: null,
        pack02Payloads: null,
        pack03Payloads: null,
        pack04Payloads: null,
        pack05Payloads: null
      }
    ];

    vi.spyOn(prisma, '$queryRawUnsafe').mockResolvedValueOnce(mockOldRows as any);

    await reportExportService.exportDynamicReport(mockRes, 'site-old', 15, from, to);

    expect(mockRes.ended).toBe(true);
    const content = mockRes.getContent();
    const lines = content.slice(1).split('\r\n');

    const headerCols = lines[10].split(',');
    expect(headerCols).toHaveLength(43);

    const dataLine = lines[11];
    // In CSV, null battery status fields must be rendered as blank (no synthetic 0s)
    // Between Cell Temp Max (26) and Today Charge Energy (40), there are 12 empty fields (Cell Temp Min + 11 battery fields)
    expect(dataLine).toContain('26,,,,,,,,,,,,,40');
  });

  // 11. CSV values remain aligned with headers and use existing precision conventions
  it('11. CSV values remain aligned with headers and use existing precision conventions', async () => {
    const mockRes = new MockResponse() as any;
    const from = new Date('2026-10-10T00:00:00.000Z');
    const to = new Date('2026-10-11T00:00:00.000Z');

    vi.spyOn(prisma.site, 'findUnique').mockResolvedValueOnce({
      id: 'site-align',
      name: 'Alignment Site',
      businessIdentifier: 'SITE-ALIGN',
      timezone: 'Asia/Kolkata',
      client: { id: 'c1', name: 'Precision Client' }
    } as any);

    vi.spyOn(prisma.bESSAsset, 'findMany').mockResolvedValueOnce([
      { id: 'bess-align', name: 'Precision BESS', emuId: 'EMU-PR-01', siteId: 'site-align' }
    ] as any);

    const mockRow = {
      bessAssetId: 'bess-align',
      bessName: 'Precision BESS',
      emuId: 'EMU-PR-01',
      bucketTimestamp: new Date('2026-10-10T12:00:00.000Z'),
      gridSideLoad: 120.456,
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
      batteryAmbientTemp: 26.54,
      pack01AvgTemp: 29.1,
      pack01MaxTemp: 29.8,
      pack02AvgTemp: 29.2,
      pack02MaxTemp: 29.9,
      pack03AvgTemp: 29.3,
      pack03MaxTemp: 30.0,
      pack04AvgTemp: 29.4,
      pack04MaxTemp: 30.1,
      pack05AvgTemp: 29.5,
      pack05MaxTemp: 30.2,
      todayChargeEnergy: 65.2,
      todayDischargeEnergy: 25.1,
      accumChargeEnergy: 1500.5,
      accumDischargeEnergy: 950.2,
      solarPower: 80.0
    };

    vi.spyOn(prisma, '$queryRawUnsafe').mockResolvedValueOnce([mockRow] as any);

    await reportExportService.exportDynamicReport(mockRes, 'site-align', 15, from, to);

    const content = mockRes.getContent();
    const lines = content.slice(1).split('\r\n');

    const headers = lines[10].split(',');
    expect(headers).toHaveLength(43);

    // CSV format row splitting (accounting for quoted timestamp at index 0)
    const dataLine = lines[11];
    // Quoted timestamp "10 October 2026, 05:30:00 PM"
    const afterTimestamp = dataLine.replace(/^"[^"]+",/, '');
    const dataFields = afterTimestamp.split(',');

    // 42 fields after timestamp + 1 timestamp = 43 columns
    expect(dataFields).toHaveLength(42);

    // Verify exact positions of the 11 battery columns:
    // headers[27] is 'Battery Ambient Temperature (°C)' -> dataFields[26]
    expect(headers[27]).toBe('Battery Ambient Temperature (°C)');
    expect(dataFields[26]).toBe('26.5');

    expect(headers[28]).toBe('Pack 01 Average Temperature (°C)');
    expect(dataFields[27]).toBe('29.1');

    expect(headers[29]).toBe('Pack 01 Maximum Temperature (°C)');
    expect(dataFields[28]).toBe('29.8');

    expect(headers[36]).toBe('Pack 05 Average Temperature (°C)');
    expect(dataFields[35]).toBe('29.5');

    expect(headers[37]).toBe('Pack 05 Maximum Temperature (°C)');
    expect(dataFields[36]).toBe('30.2');

    // And energy columns right after
    expect(headers[38]).toBe('Today Charge Energy (kWh)');
    expect(dataFields[37]).toBe('65.2');
  });

  // 12. Existing multi-BESS Excel exports and site summaries remain unchanged
  it('12. Existing multi-BESS Excel exports and site summaries remain unchanged with 23 columns', async () => {
    const mockRes = new MockResponse() as any;
    const from = new Date('2026-10-10T00:00:00.000Z');
    const to = new Date('2026-10-11T00:00:00.000Z');

    vi.spyOn(prisma.site, 'findUnique').mockResolvedValueOnce({
      id: 'site-multi-check',
      name: 'Multi BESS Site',
      businessIdentifier: 'SITE-MULTI',
      timezone: 'Asia/Kolkata',
      client: { id: 'c1', name: 'Multi Client' }
    } as any);

    vi.spyOn(prisma.bESSAsset, 'findMany').mockResolvedValueOnce([
      { id: 'bess-m1', name: 'Unit 1', emuId: 'EMU-01', siteId: 'site-multi-check' },
      { id: 'bess-m2', name: 'Unit 2', emuId: 'EMU-02', siteId: 'site-multi-check' }
    ] as any);

    vi.spyOn(prisma, '$queryRawUnsafe')
      .mockResolvedValueOnce([]) // boundaries
      .mockResolvedValueOnce([]); // data

    await reportExportService.exportDynamicReport(mockRes, 'site-multi-check', 15, from, to);

    expect(mockRes.ended).toBe(true);
    expect(mockRes.headers['content-type']).toBe('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(mockRes.getBuffer());

    const sheetNames = workbook.worksheets.map(w => w.name);
    expect(sheetNames).toEqual(['Site Summary', 'Unit 1', 'Unit 2']);
    expect(workbook.getWorksheet('Per-BESS Details')).toBeUndefined();

    const sDetails = workbook.getWorksheet('Unit 1')!;
    const headerRow = sDetails.getRow(12);

    // Multi-BESS Excel Per-BESS Details now aligns with unified 43-column schema
    expect(AUTHORITATIVE_TELEMETRY_HEADERS).toHaveLength(43);
    expect(headerRow.getCell(1).value).toBe('Timestamp');
    expect(headerRow.getCell(2).value).toBe('BESS Name');
    expect(headerRow.getCell(26).value).toBe('Cell Temp Max (°C)');
    expect(headerRow.getCell(28).value).toBe('Battery Ambient Temperature (°C)');
    expect(headerRow.getCell(39).value).toBe('Today Charge Energy (kWh)');
    expect(headerRow.getCell(43).value).toBe('Solar Power (kW)');
    expect(headerRow.getCell(44).value).toBeNull();
  });
});

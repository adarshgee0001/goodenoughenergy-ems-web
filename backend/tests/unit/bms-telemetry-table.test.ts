import { describe, it, expect, vi } from 'vitest';
import { normalizeComponentSignals } from '../../src/services/mqtt.service';
import { telemetryService, TelemetryWithDevice } from '../../src/services/telemetry.service';
import {
  isValidFiniteNumber,
  normalizeCabinetState,
  formatCabinetState,
  formatCabinetStateUi,
  round1Dec,
  round3Dec,
  processReportBmsRow
} from '../../src/utils/bms-telemetry.util';
import {
  SINGLE_BESS_TELEMETRY_HEADERS,
  AUTHORITATIVE_TELEMETRY_HEADERS,
  getSingleBessTelemetryHeaders,
  getAuthoritativeTelemetryHeaders,
  reportExportService
} from '../../src/services/report-export.service';
import { prisma } from '../../src/db/prisma';

// Mock response object for CSV export
class MockResponse {
  public content: string = '';
  public headers: Record<string, string> = {};
  public statusCode: number = 200;
  public ended: boolean = false;

  setHeader(name: string, value: string) {
    this.headers[name] = value;
  }

  write(chunk: string) {
    this.content += chunk;
    return true;
  }

  end() {
    this.ended = true;
  }

  getContent() {
    return this.content;
  }
}

describe('BMS Telemetry Table (Phase 2) - Comprehensive Production Tests', () => {
  // =========================================================================
  // A. Signal Normalization
  // =========================================================================
  describe('A. Signal Normalization (mqtt.service)', () => {
    it('A.1 Maps all 7 authoritative BMS signals from bcms component', () => {
      const signals = [
        { m: 'ai_max_cell_vol', v: 3.385 },
        { m: 'ai_min_vol', v: 3.312 },
        { m: 'ai_max_temp', v: 28.4 },
        { m: 'ai_min_temp', v: 24.1 },
        { m: 'ai_sum_u', v: 875.6 },
        { m: 'ai_sum_i', v: -45.2 },
        { m: 'di_rcdhg_stat', v: 1 },
        { m: 'ai_sum_soc', v: 88.0 },
        { m: 'ai_sum_soh', v: 99.5 },
      ];

      const norm = normalizeComponentSignals('bcms', signals);

      // Named DB columns
      expect(norm.cellVMax).toBe(3.385);
      expect(norm.cellVMin).toBe(3.312);
      expect(norm.cellTempMax).toBe(28.4);
      expect(norm.bmsCurrent).toBe(-45.2);
      expect(norm.soc).toBe(88.0);
      expect(norm.soh).toBe(99.5);

      // WebSocket data
      expect(norm.wsData.cellVMax).toBe(3.385);
      expect(norm.wsData.cellVMin).toBe(3.312);
      expect(norm.wsData.cellTempMax).toBe(28.4);
      expect(norm.wsData.cellTempMin).toBe(24.1);
      expect(norm.wsData.bmsDcVoltage).toBe(875.6);
      expect(norm.wsData.bmsCurrent).toBe(-45.2);
      expect(norm.wsData.bmsCabinetState).toBe(1);
    });

    it('A.2 Confirms ai_min_vol is the sole source for Min Cell Voltage (never falls back to ai_min_cell_vol)', () => {
      const signalsWithOnlyMinCellVol = [
        { m: 'ai_min_cell_vol', v: 3.299 }, // Erroneous legacy signal
        { m: 'ai_max_cell_vol', v: 3.410 },
      ];

      const norm = normalizeComponentSignals('bcms', signalsWithOnlyMinCellVol);
      expect(norm.cellVMin).toBeUndefined();
      expect(norm.wsData.cellVMin).toBeUndefined();
      expect(norm.cellVMax).toBe(3.41);
    });

    it('A.3 Preserves legitimate zero and negative DC current readings', () => {
      const zeroSignals = [
        { m: 'ai_sum_i', v: 0 },
        { m: 'ai_sum_u', v: 850.0 },
        { m: 'di_rcdhg_stat', v: 0 },
      ];
      const normZero = normalizeComponentSignals('bcms', zeroSignals);
      expect(normZero.bmsCurrent).toBe(0);
      expect(normZero.wsData.bmsCurrent).toBe(0);
      expect(normZero.wsData.bmsCabinetState).toBe(0);

      const negSignals = [
        { m: 'ai_sum_i', v: -120.5 },
      ];
      const normNeg = normalizeComponentSignals('bcms', negSignals);
      expect(normNeg.bmsCurrent).toBe(-120.5);
      expect(normNeg.wsData.bmsCurrent).toBe(-120.5);
    });

    it('A.4 Rejects null, undefined, NaN, Infinity, and non-numeric strings (no synthetic zeros)', () => {
      const invalidSignals = [
        { m: 'ai_max_cell_vol', v: null },
        { m: 'ai_min_vol', v: undefined },
        { m: 'ai_max_temp', v: NaN },
        { m: 'ai_min_temp', v: Infinity },
        { m: 'ai_sum_u', v: 'malformed_volts' },
        { m: 'ai_sum_i', v: '' },
      ];

      const norm = normalizeComponentSignals('bcms', invalidSignals);
      expect(norm.cellVMax).toBeUndefined();
      expect(norm.cellVMin).toBeUndefined();
      expect(norm.cellTempMax).toBeUndefined();
      expect(norm.wsData.cellTempMin).toBeUndefined();
      expect(norm.wsData.bmsDcVoltage).toBeUndefined();
      expect(norm.bmsCurrent).toBeUndefined();
    });

    it('A.5 Enforces strict component isolation (does not substitute PCS, TMS, or TH signals into BMS)', () => {
      const pcsSignals = [
        { m: 'ai_dc_u', v: 750.0 },   // PCS DC Voltage - MUST NOT become BMS DC Voltage
        { m: 'ai_temp', v: 45.0 },   // PCS Temperature - MUST NOT become BMS Temp
      ];
      const pcsNorm = normalizeComponentSignals('pcs', pcsSignals);
      expect(pcsNorm.dcVoltage).toBe(750.0);
      expect(pcsNorm.wsData.bmsDcVoltage).toBeUndefined();
      expect(pcsNorm.wsData.cellTempMax).toBeUndefined();

      const tmsSignals = [
        { m: 'ai_at', v: 25.5 },
      ];
      const tmsNorm = normalizeComponentSignals('tms', tmsSignals);
      expect(tmsNorm.wsData.cellTempMax).toBeUndefined();
      expect(tmsNorm.wsData.cellTempMin).toBeUndefined();
    });
  });

  // =========================================================================
  // B. Cabinet State Normalization and Formatting
  // =========================================================================
  describe('B. Cabinet State (bms-telemetry.util)', () => {
    it('B.1 Normalizes valid state codes 0, 1, 2', () => {
      expect(normalizeCabinetState(0)).toBe(0);
      expect(normalizeCabinetState(1)).toBe(1);
      expect(normalizeCabinetState(2)).toBe(2);
      expect(normalizeCabinetState('0')).toBe(0);
      expect(normalizeCabinetState('1')).toBe(1);
      expect(normalizeCabinetState('2')).toBe(2);
    });

    it('B.2 Rejects out-of-range, non-finite, and malformed state values', () => {
      expect(normalizeCabinetState(3)).toBeUndefined();
      expect(normalizeCabinetState(-1)).toBeUndefined();
      expect(normalizeCabinetState(1.5)).toBeUndefined();
      expect(normalizeCabinetState('STANDBY')).toBeUndefined();
      expect(normalizeCabinetState(null)).toBeUndefined();
      expect(normalizeCabinetState(undefined)).toBeUndefined();
      expect(normalizeCabinetState(NaN)).toBeUndefined();
      expect(normalizeCabinetState(Infinity)).toBeUndefined();
    });

    it('B.3 Formats state codes into authoritative readable labels', () => {
      expect(formatCabinetState(0)).toBe('STANDBY');
      expect(formatCabinetState(1)).toBe('DISCHARGING');
      expect(formatCabinetState(2)).toBe('CHARGING');
      expect(formatCabinetState(null)).toBe('');
      expect(formatCabinetState(undefined)).toBe('');
      expect(formatCabinetState(3)).toBe('');
      expect(formatCabinetState(-1)).toBe('');

      expect(formatCabinetStateUi(0)).toBe('STANDBY');
      expect(formatCabinetStateUi(1)).toBe('DISCHARGING');
      expect(formatCabinetStateUi(2)).toBe('CHARGING');
      expect(formatCabinetStateUi(null)).toBe('NO DATA');
      expect(formatCabinetStateUi(undefined)).toBe('NO DATA');
    });

    it('B.4 Ensures state code 0 is never treated as falsy or missing', () => {
      const code = normalizeCabinetState(0);
      expect(code).not.toBeUndefined();
      expect(code).toBe(0);
      // Falsy bug check: code ? 'ACTIVE' : 'STANDBY' would be wrong, code !== undefined check is required
      expect(formatCabinetState(code)).toBe('STANDBY');
    });
  });

  // =========================================================================
  // C. Cold-Load Hydration and rawPayload Reconstruction
  // =========================================================================
  describe('C. Cold-Load Hydration and rawPayload Reconstruction (telemetry.service)', () => {
    it('C.1 Reconstructs cellTempMin, bmsDcVoltage, and bmsCabinetState from rawPayload', () => {
      const mockRow: TelemetryWithDevice = {
        id: 'th-1',
        deviceId: 'dev-bcms-01',
        timestamp: new Date('2026-10-17T04:00:00Z'),
        ingestedAt: new Date(),
        soc: 82.5,
        soh: 98.0,
        bmsCurrent: -15.4,
        cellVMax: 3.395,
        cellVMin: 3.320,
        cellTempMax: 29.1,
        // Other legacy fields null
        voltageA: null, voltageB: null, voltageC: null,
        currentA: null, currentB: null, currentC: null,
        totalPower: null, pcsActivePower: null, dcVoltage: null,
        ambientTemp: null, todayChargeEnergy: null, todayDischargeEnergy: null,
        accumChargeEnergy: null, accumDischargeEnergy: null, gridSideLoad: null,
        solarPower: null, gridFrequency: null, powerFactor: null,
        bessFrequency: null, bessPowerFactor: null, solarFrequency: null,
        solarPowerFactor: null, gridVoltageUab: null, gridVoltageUbc: null,
        gridVoltageUca: null, gridOnState: null, gridOffState: null,
        bessVoltageUa: null, bessVoltageUb: null, bessVoltageUc: null,
        rawPayload: [
          { m: 'ai_min_temp', v: 24.3 },
          { m: 'ai_sum_u', v: 881.2 },
          { m: 'di_rcdhg_stat', v: 0 },
        ],
        device: {
          id: 'dev-bcms-01',
          componentId: 'bcms',
          type: 'BMS' as any,
          name: 'BCMS Unit',
          bessAssetId: 'bess-01',
          bessAsset: { emuId: 'EMU-01' },
          hardwareId: 'HW-01',
          createdAt: new Date(),
          updatedAt: new Date()
        }
      };

      const payload = telemetryService.mapToLivePayload('site-01', mockRow);

      expect(payload.data.bessSoc).toBe(82.5);
      expect(payload.data.bmsSoh).toBe(98.0);
      expect(payload.data.bmsCurrent).toBe(-15.4);
      expect(payload.data.cellVMax).toBe(3.395);
      expect(payload.data.cellVMin).toBe(3.320);
      expect(payload.data.cellTempMax).toBe(29.1);

      // Reconstructed from rawPayload
      expect(payload.data.cellTempMin).toBe(24.3);
      expect(payload.data.bmsDcVoltage).toBe(881.2);
      expect(payload.data.bmsCabinetState).toBe(0);
    });

    it('C.2 Reconstructs cellVMin from rawPayload ai_min_vol if database column was null', () => {
      const mockRow: TelemetryWithDevice = {
        id: 'th-2',
        deviceId: 'dev-bcms-02',
        timestamp: new Date('2026-10-17T04:00:00Z'),
        ingestedAt: new Date(),
        soc: null, soh: null, bmsCurrent: null, cellVMax: null,
        cellVMin: null, // Null in DB
        cellTempMax: null,
        voltageA: null, voltageB: null, voltageC: null,
        currentA: null, currentB: null, currentC: null,
        totalPower: null, pcsActivePower: null, dcVoltage: null,
        ambientTemp: null, todayChargeEnergy: null, todayDischargeEnergy: null,
        accumChargeEnergy: null, accumDischargeEnergy: null, gridSideLoad: null,
        solarPower: null, gridFrequency: null, powerFactor: null,
        bessFrequency: null, bessPowerFactor: null, solarFrequency: null,
        solarPowerFactor: null, gridVoltageUab: null, gridVoltageUbc: null,
        gridVoltageUca: null, gridOnState: null, gridOffState: null,
        bessVoltageUa: null, bessVoltageUb: null, bessVoltageUc: null,
        rawPayload: [
          { m: 'ai_min_vol', v: 3.284 },
          { m: 'ai_min_cell_vol', v: 3.100 }, // Should be ignored
        ],
        device: {
          id: 'dev-bcms-02',
          componentId: 'bcms',
          type: 'BMS' as any,
          name: 'BCMS Unit 2',
          bessAssetId: 'bess-02',
          bessAsset: { emuId: 'EMU-02' },
          hardwareId: 'HW-02',
          createdAt: new Date(),
          updatedAt: new Date()
        }
      };

      const payload = telemetryService.mapToLivePayload('site-01', mockRow);
      expect(payload.data.cellVMin).toBe(3.284);
    });
  });

  // =========================================================================
  // D. Reports Row Processing and Display Precision
  // =========================================================================
  describe('D. Reports Row Processing (processReportBmsRow)', () => {
    it('D.1 Applies confirmed display precision (Cell voltages: 3 dec, temps/V/I: 1 dec)', () => {
      const row = {
        cellVMax: 3.3854,
        cellVMin: 3.2987,
        cellTempMax: 28.45,
        cellTempMin: 22.34,
        bmsDcVoltage: 876.54,
        bmsCurrent: -45.67,
        bmsCabinetState: 1,
      };

      processReportBmsRow(row);

      expect(row.cellVMax).toBe(3.385);
      expect(row.cellVMin).toBe(3.299);
      expect(row.cellTempMax).toBe(28.5);
      expect(row.cellTempMin).toBe(22.3);
      expect(row.bmsDcVoltage).toBe(876.5);
      expect(row.bmsCurrent).toBe(-45.7);
      expect(row.bmsCabinetState).toBe(1);
    });

    it('D.2 Preserves legitimate zeros and sets unavailable fields to strict null', () => {
      const row = {
        cellVMax: null,
        cellVMin: null,
        cellTempMax: null,
        cellTempMin: null,
        bmsDcVoltage: 0,
        bmsCurrent: 0,
        bmsCabinetState: 0,
      };

      processReportBmsRow(row);

      expect(row.cellVMax).toBeNull();
      expect(row.cellVMin).toBeNull();
      expect(row.cellTempMax).toBeNull();
      expect(row.cellTempMin).toBeNull();
      expect(row.bmsDcVoltage).toBe(0);
      expect(row.bmsCurrent).toBe(0);
      expect(row.bmsCabinetState).toBe(0);
    });
  });

  // =========================================================================
  // E. Single-BESS CSV Export Contract (51 columns)
  // =========================================================================
  describe('E. Single-BESS CSV Export and Multi-BESS Excel Contract', () => {
    it('E.1 SINGLE_BESS_TELEMETRY_HEADERS contains exactly 43 columns in authoritative order', () => {
      expect(SINGLE_BESS_TELEMETRY_HEADERS).toHaveLength(43);
      const headers = getSingleBessTelemetryHeaders();
      expect(headers).toHaveLength(43);
      expect(headers).not.toContain('Cabinet Meter Power (kW)');

      // Check required BMS block grouping (indices 20-26 without DC Voltage):
      expect(headers[20]).toBe('BMS Current (A)');
      expect(headers[21]).toBe('BMS DC Voltage (V)');
      expect(headers[22]).toBe('Cabinet State');
      expect(headers[23]).toBe('Cell V Max (V)');
      expect(headers[24]).toBe('Cell V Min (V)');
      expect(headers[25]).toBe('Cell Temp Max (°C)');
      expect(headers[26]).toBe('Cell Temp Min (°C)');

      // Immediately followed by battery ambient temperature
      expect(headers[27]).toBe('Battery Ambient Temperature (°C)');
      expect(headers[38]).toBe('Today Charge Energy (kWh)');
    });

    it('E.2 AUTHORITATIVE_TELEMETRY_HEADERS aligns with unified 43-column schema including BMS fields', () => {
      expect(AUTHORITATIVE_TELEMETRY_HEADERS).toHaveLength(43);
      const multiBessHeaders = getAuthoritativeTelemetryHeaders();
      expect(multiBessHeaders).toHaveLength(43);
      expect(multiBessHeaders).not.toContain('Cabinet Meter Power (kW)');

      // Verify that BMS fields are present in the unified schema
      expect(multiBessHeaders).toContain('BMS DC Voltage (V)');
      expect(multiBessHeaders).toContain('Cabinet State');
      expect(multiBessHeaders).toContain('Cell Temp Min (°C)');
      expect(multiBessHeaders).toContain('Battery Ambient Temperature (°C)');
      expect(multiBessHeaders).not.toContain('DC Voltage (V)');
    });

    it('E.3 Single-BESS CSV export produces 43 aligned fields and formats text labels for Cabinet State', async () => {
      const mockRes = new MockResponse() as any;
      const from = new Date('2026-10-10T00:00:00.000Z');
      const to = new Date('2026-10-11T00:00:00.000Z');

      vi.spyOn(prisma.site, 'findUnique').mockResolvedValueOnce({
        id: 'site-bms-test',
        name: 'BMS Production Site',
        businessIdentifier: 'SITE-BMS-01',
        timezone: 'Asia/Kolkata',
        client: { id: 'c1', name: 'Clean Energy Corp' }
      } as any);

      vi.spyOn(prisma.bESSAsset, 'findMany').mockResolvedValueOnce([
        { id: 'bess-01', name: 'Alpha BESS', emuId: 'EMU-BMS-001', siteId: 'site-bms-test' }
      ] as any);

      const mockDataRows = [
        {
          bessAssetId: 'bess-01',
          bessName: 'Alpha BESS',
          emuId: 'EMU-BMS-001',
          bucketTimestamp: new Date('2026-10-10T12:00:00.000Z'),
          gridSideLoad: 100.0,
          gridFrequency: 50.0,
          powerFactor: 0.99,
          totalPower: 20.0,
          voltageA: 230.0, voltageB: 230.0, voltageC: 230.0,
          currentA: 10.0, currentB: 10.0, currentC: 10.0,
          bessFrequency: 50.0,
          bessPowerFactor: 0.98,
          pcsActivePower: 45.0,
          dcVoltage: 780.0,
          pcsTemperature: 35.0,
          pcsLineVoltage: 400.0,
          pcsAcCurrent: 45.0,
          tmsAmbientTemp: 26.5,
          soc: 85.0,
          soh: 99.0,
          bmsCurrent: -30.5,
          bmsDcVoltage: 876.4,
          bmsCabinetState: 1, // DISCHARGING
          cellVMax: 3.385,
          cellVMin: 3.312,
          cellTempMax: 29.5,
          cellTempMin: 23.8,
          batteryAmbientTemp: 25.0,
          pack01AvgTemp: 28.0, pack01MaxTemp: 29.0,
          pack02AvgTemp: 28.1, pack02MaxTemp: 29.1,
          pack03AvgTemp: 28.2, pack03MaxTemp: 29.2,
          pack04AvgTemp: 28.3, pack04MaxTemp: 29.3,
          pack05AvgTemp: 28.4, pack05MaxTemp: 29.4,
          todayChargeEnergy: 50.0,
          todayDischargeEnergy: 25.0,
          accumChargeEnergy: 1000.0,
          accumDischargeEnergy: 500.0,
          solarPower: 60.0
        },
        {
          bessAssetId: 'bess-01',
          bessName: 'Alpha BESS',
          emuId: 'EMU-BMS-001',
          bucketTimestamp: new Date('2026-10-10T12:15:00.000Z'),
          gridSideLoad: null, gridFrequency: null, powerFactor: null, totalPower: null,
          voltageA: null, voltageB: null, voltageC: null,
          currentA: null, currentB: null, currentC: null,
          bessFrequency: null, bessPowerFactor: null, pcsActivePower: null,
          dcVoltage: null, pcsTemperature: null, pcsLineVoltage: null, pcsAcCurrent: null,
          tmsAmbientTemp: null, soc: null, soh: null,
          bmsCurrent: 0,
          bmsDcVoltage: 850.0,
          bmsCabinetState: 0, // STANDBY
          cellVMax: 3.350,
          cellVMin: 3.320,
          cellTempMax: 26.0,
          cellTempMin: 24.0,
          batteryAmbientTemp: null,
          pack01AvgTemp: null, pack01MaxTemp: null,
          pack02AvgTemp: null, pack02MaxTemp: null,
          pack03AvgTemp: null, pack03MaxTemp: null,
          pack04AvgTemp: null, pack04MaxTemp: null,
          pack05AvgTemp: null, pack05MaxTemp: null,
          todayChargeEnergy: null, todayDischargeEnergy: null,
          accumChargeEnergy: null, accumDischargeEnergy: null,
          solarPower: null
        }
      ];

      vi.spyOn(prisma, '$queryRawUnsafe').mockResolvedValueOnce(mockDataRows as any);

      await reportExportService.exportDynamicReport(mockRes, 'site-bms-test', 15, from, to);

      expect(mockRes.ended).toBe(true);
      const content = mockRes.getContent();
      const lines = content.slice(1).split('\r\n');

      // Row 11: Header row has 43 columns
      const headers = lines[10].split(',');
      expect(headers).toHaveLength(43);
      expect(headers).not.toContain('Cabinet Meter Power (kW)');

      // Data row 1: Verify BMS values and Cabinet State label
      const dataRow1 = lines[11];
      expect(dataRow1).toContain('-30.5');       // BMS Current (preserves negative)
      expect(dataRow1).toContain('876.4');       // BMS DC Voltage
      expect(dataRow1).toContain('DISCHARGING'); // Cabinet State 1 -> DISCHARGING
      expect(dataRow1).toContain('3.385');       // Cell V Max (3 decimals)
      expect(dataRow1).toContain('3.312');       // Cell V Min (3 decimals)
      expect(dataRow1).toContain('29.5');        // Cell Temp Max (1 decimal)
      expect(dataRow1).toContain('23.8');        // Cell Temp Min (1 decimal)

      // Data row 2: Verify zero current, standby label, and blank null fields
      const dataRow2 = lines[12];
      expect(dataRow2).toContain('STANDBY');     // Cabinet State 0 -> STANDBY
      expect(dataRow2).not.toContain('null');
      expect(dataRow2).not.toContain('undefined');
      expect(dataRow2).not.toContain('NaN');
    });
  });
});

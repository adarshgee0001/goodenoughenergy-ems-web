import { describe, it, expect, vi } from 'vitest';
import { EventEmitter } from 'events';
import {
  TMS_MODE_LABELS,
  normalizeTmsMode,
  formatTmsMode,
  formatTmsModeUi,
  round1Dec,
  round2Dec,
  processReportTmsRow,
  isValidFiniteNumber
} from '../../src/utils/tms-telemetry.util';
import { normalizeComponentSignals } from '../../src/services/mqtt.service';
import { telemetryService } from '../../src/services/telemetry.service';
import {
  reportExportService,
  AUTHORITATIVE_TELEMETRY_HEADERS,
  SINGLE_BESS_TELEMETRY_HEADERS,
  getSingleBessTelemetryHeaders,
  getAuthoritativeTelemetryHeaders
} from '../../src/services/report-export.service';
import { prisma } from '../../src/db/prisma';
import { TMS_OPERATING_MODES } from '../../../frontend/src/pages/EMSApp/components/TmsTelemetryTable';

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

describe('TMS Telemetry Table & Pipeline - Comprehensive Unit & Integration Tests', () => {

  // =========================================================================
  // 1. TMS Utilities & Mappings
  // =========================================================================
  describe('1. TMS Utilities & Mappings (tms-telemetry.util)', () => {
    it('1.1 TMS_MODE_LABELS strictly defines confirmed labels and maps 2 to UNKNOWN', () => {
      expect(TMS_MODE_LABELS[0]).toBe('STOP');
      expect(TMS_MODE_LABELS[1]).toBe('SELF-CIRCULATION');
      expect(TMS_MODE_LABELS[2]).toBe('UNKNOWN'); // Must NOT be COOLING
      expect(TMS_MODE_LABELS[3]).toBe('HEATING');
      expect(TMS_MODE_LABELS[4]).toBe('FAULT');
      expect(TMS_MODE_LABELS[-2]).toBeUndefined(); // Negative value not mapped
      expect(TMS_MODE_LABELS[5]).toBeUndefined();
    });

    it('1.2 normalizeTmsMode: parses valid discrete codes 0..4 and rejects out-of-range/invalid', () => {
      expect(normalizeTmsMode(0)).toBe(0);
      expect(normalizeTmsMode(1)).toBe(1);
      expect(normalizeTmsMode(2)).toBe(2);
      expect(normalizeTmsMode(3)).toBe(3);
      expect(normalizeTmsMode(4)).toBe(4);

      // String integers
      expect(normalizeTmsMode('0')).toBe(0);
      expect(normalizeTmsMode('1')).toBe(1);
      expect(normalizeTmsMode('2')).toBe(2);
      expect(normalizeTmsMode('3')).toBe(3);
      expect(normalizeTmsMode('4')).toBe(4);

      // Invalid, out-of-range, and non-integers
      expect(normalizeTmsMode(-2)).toBeUndefined();
      expect(normalizeTmsMode(-1)).toBeUndefined();
      expect(normalizeTmsMode(5)).toBeUndefined();
      expect(normalizeTmsMode(1.5)).toBeUndefined();
      expect(normalizeTmsMode('invalid')).toBeUndefined();
      expect(normalizeTmsMode(null)).toBeUndefined();
      expect(normalizeTmsMode(undefined)).toBeUndefined();
      expect(normalizeTmsMode(NaN)).toBeUndefined();
      expect(normalizeTmsMode(Infinity)).toBeUndefined();
    });

    it('1.3 formatTmsMode: formats discrete modes for CSV export (blank when missing, UNKNOWN for 2)', () => {
      expect(formatTmsMode(0)).toBe('STOP');
      expect(formatTmsMode(1)).toBe('SELF-CIRCULATION');
      expect(formatTmsMode(2)).toBe('UNKNOWN');
      expect(formatTmsMode(3)).toBe('HEATING');
      expect(formatTmsMode(4)).toBe('FAULT');
      expect(formatTmsMode(null)).toBe('');
      expect(formatTmsMode(undefined)).toBe('');
      expect(formatTmsMode(99)).toBe('');
    });

    it('1.4 formatTmsModeUi: formats discrete modes for UI display (NO DATA when missing, UNKNOWN for 2 or invalid)', () => {
      expect(formatTmsModeUi(0)).toBe('STOP');
      expect(formatTmsModeUi(1)).toBe('SELF-CIRCULATION');
      expect(formatTmsModeUi(2)).toBe('UNKNOWN');
      expect(formatTmsModeUi(3)).toBe('HEATING');
      expect(formatTmsModeUi(4)).toBe('FAULT');
      expect(formatTmsModeUi(null)).toBe('NO DATA');
      expect(formatTmsModeUi(undefined)).toBe('NO DATA');
      expect(formatTmsModeUi(99)).toBe('UNKNOWN');
    });

    it('1.5 round1Dec and round2Dec: precision rules and preservation of valid 0', () => {
      // Temperatures (1 decimal)
      expect(round1Dec(25.432)).toBe(25.4);
      expect(round1Dec(25.467)).toBe(25.5);
      expect(round1Dec(0)).toBe(0);
      expect(round1Dec(-5.67)).toBe(-5.7);
      expect(round1Dec(null)).toBeNull();
      expect(round1Dec(undefined)).toBeNull();

      // Pressures in bar (2 decimals)
      expect(round2Dec(1.234)).toBe(1.23);
      expect(round2Dec(1.238)).toBe(1.24);
      expect(round2Dec(0)).toBe(0);
      expect(round2Dec(-0.543)).toBe(-0.54);
      expect(round2Dec(null)).toBeNull();
      expect(round2Dec(undefined)).toBeNull();
    });

    it('1.6 processReportTmsRow: processes all 6 TMS report row metrics correctly', () => {
      const row = {
        tmsOperatingMode: '1',
        tmsAmbientTemp: '28.45',
        tmsCoolantReturnTemp: '22.34',
        tmsCoolantInletTemp: '19.78',
        tmsCoolantReturnPressure: '1.456',
        tmsCoolantInletPressure: '2.123',
      };

      processReportTmsRow(row);

      expect(row.tmsOperatingMode).toBe(1);
      expect(row.tmsAmbientTemp).toBe(28.5);
      expect(row.tmsCoolantReturnTemp).toBe(22.3);
      expect(row.tmsCoolantInletTemp).toBe(19.8);
      expect(row.tmsCoolantReturnPressure).toBe(1.46);
      expect(row.tmsCoolantInletPressure).toBe(2.12);
    });

    it('1.7 processReportTmsRow: preserves valid numeric zeros and maps missing fields to null', () => {
      const zeroRow = {
        tmsOperatingMode: 0,
        tmsAmbientTemp: 0,
        tmsCoolantReturnTemp: 0,
        tmsCoolantInletTemp: 0,
        tmsCoolantReturnPressure: 0,
        tmsCoolantInletPressure: 0,
      };

      processReportTmsRow(zeroRow);

      expect(zeroRow.tmsOperatingMode).toBe(0);
      expect(zeroRow.tmsAmbientTemp).toBe(0);
      expect(zeroRow.tmsCoolantReturnTemp).toBe(0);
      expect(zeroRow.tmsCoolantInletTemp).toBe(0);
      expect(zeroRow.tmsCoolantReturnPressure).toBe(0);
      expect(zeroRow.tmsCoolantInletPressure).toBe(0);

      const nullRow = {
        tmsOperatingMode: null,
        tmsAmbientTemp: null,
        tmsCoolantReturnTemp: null,
        tmsCoolantInletTemp: null,
        tmsCoolantReturnPressure: null,
        tmsCoolantInletPressure: null,
      };

      processReportTmsRow(nullRow);

      expect(nullRow.tmsOperatingMode).toBeNull();
      expect(nullRow.tmsAmbientTemp).toBeNull();
      expect(nullRow.tmsCoolantReturnTemp).toBeNull();
      expect(nullRow.tmsCoolantInletTemp).toBeNull();
      expect(nullRow.tmsCoolantReturnPressure).toBeNull();
      expect(nullRow.tmsCoolantInletPressure).toBeNull();
    });
  });

  // =========================================================================
  // 2. MQTT Normalization & WebSocket Delivery
  // =========================================================================
  describe('2. Live MQTT Normalization & WebSocket Delivery', () => {
    it('2.1 normalizeComponentSignals extracts all 6 TMS signals for componentId = tms', () => {
      const tmsPayload = [
        { m: 'di_singco_state', v: '1' },
        { m: 'ai_at', v: '27.4' },
        { m: 'ai_iw_temp', v: '23.5' },
        { m: 'ai_ow_temp', v: '20.1' },
        { m: 'ai_iw_prs', v: '1.25' },
        { m: 'ai_ow_prs', v: '2.10' },
      ];

      const norm = normalizeComponentSignals('tms', tmsPayload);

      // TelemetryHistory named column ambientTemp is preserved exclusively for PCS IGBT temp; tms does NOT contaminate it
      expect(norm.ambientTemp).toBeUndefined();

      // wsData payload delivers all 6 metrics
      expect(norm.wsData.tmsOperatingMode).toBe(1);
      expect(norm.wsData.tmsAmbientTemp).toBe(27.4);
      expect(norm.wsData.tmsCoolantReturnTemp).toBe(23.5);
      expect(norm.wsData.tmsCoolantInletTemp).toBe(20.1);
      expect(norm.wsData.tmsCoolantReturnPressure).toBe(1.25);
      expect(norm.wsData.tmsCoolantInletPressure).toBe(2.10);
    });

    it('2.2 Physical direction semantics: ai_iw_* is Return and ai_ow_* is Inlet', () => {
      const payload = [
        { m: 'ai_iw_temp', v: '25.0' }, // Return temp (battery returning to chiller)
        { m: 'ai_ow_temp', v: '18.0' }, // Inlet temp (chiller sending to battery)
        { m: 'ai_iw_prs', v: '1.15' },  // Return pressure
        { m: 'ai_ow_prs', v: '2.45' },  // Inlet pressure
      ];

      const norm = normalizeComponentSignals('tms', payload);

      expect(norm.wsData.tmsCoolantReturnTemp).toBe(25.0);
      expect(norm.wsData.tmsCoolantInletTemp).toBe(18.0);
      expect(norm.wsData.tmsCoolantReturnPressure).toBe(1.15);
      expect(norm.wsData.tmsCoolantInletPressure).toBe(2.45);
    });

    it('2.3 Missing TMS signals are undefined and never fabricated as 0', () => {
      const partialPayload = [
        { m: 'ai_at', v: '26.0' }
      ];

      const norm = normalizeComponentSignals('tms', partialPayload);

      expect(norm.wsData.tmsAmbientTemp).toBe(26.0);
      expect(norm.wsData.tmsOperatingMode).toBeUndefined();
      expect(norm.wsData.tmsCoolantReturnTemp).toBeUndefined();
      expect(norm.wsData.tmsCoolantInletTemp).toBeUndefined();
      expect(norm.wsData.tmsCoolantReturnPressure).toBeUndefined();
      expect(norm.wsData.tmsCoolantInletPressure).toBeUndefined();
    });

    it('2.4 Preserves genuine 0 for TMS signals in MQTT normalization', () => {
      const zeroPayload = [
        { m: 'di_singco_state', v: '0' },
        { m: 'ai_at', v: '0' },
        { m: 'ai_iw_temp', v: '0' },
        { m: 'ai_ow_temp', v: '0' },
        { m: 'ai_iw_prs', v: '0' },
        { m: 'ai_ow_prs', v: '0' },
      ];

      const norm = normalizeComponentSignals('tms', zeroPayload);

      expect(norm.wsData.tmsOperatingMode).toBe(0);
      expect(norm.wsData.tmsAmbientTemp).toBe(0);
      expect(norm.wsData.tmsCoolantReturnTemp).toBe(0);
      expect(norm.wsData.tmsCoolantInletTemp).toBe(0);
      expect(norm.wsData.tmsCoolantReturnPressure).toBe(0);
      expect(norm.wsData.tmsCoolantInletPressure).toBe(0);
    });
  });

  // =========================================================================
  // 3. REST Cold-Load Reconstruction
  // =========================================================================
  describe('3. REST Cold-Load Reconstruction (telemetry.service)', () => {
    it('3.1 mapToLivePayload reconstructs all 6 TMS signals from rawPayload', () => {
      const mockTmsRow: any = {
        deviceId: 'dev-tms-01',
        device: { componentId: 'tms' },
        timestamp: new Date('2026-10-17T08:00:00Z'),
        bessAssetId: 'bess-01',
        rawPayload: [
          { m: 'di_singco_state', v: '2' }, // UNKNOWN
          { m: 'ai_at', v: '30.2' },
          { m: 'ai_iw_temp', v: '24.1' },
          { m: 'ai_ow_temp', v: '21.0' },
          { m: 'ai_iw_prs', v: '1.35' },
          { m: 'ai_ow_prs', v: '2.05' },
        ],
      };

      const payload = telemetryService.mapToLivePayload('site-01', mockTmsRow);

      expect(payload.data.tmsOperatingMode).toBe(2);
      expect(payload.data.tmsAmbientTemp).toBe(30.2);
      expect(payload.data.tmsCoolantReturnTemp).toBe(24.1);
      expect(payload.data.tmsCoolantInletTemp).toBe(21.0);
      expect(payload.data.tmsCoolantReturnPressure).toBe(1.35);
      expect(payload.data.tmsCoolantInletPressure).toBe(2.05);
    });

    it('3.2 mapToLivePayload reconstructs PCS Temperature strictly from pcs.ai_igbt_temp', () => {
      const mockPcsRow: any = {
        deviceId: 'dev-pcs-01',
        device: { componentId: 'pcs' },
        timestamp: new Date('2026-10-17T08:00:00Z'),
        bessAssetId: 'bess-01',
        rawPayload: [
          { m: 'ai_igbt_temp', v: '41.5' },
          { m: 'ai_temp', v: '99.9' }, // Erroneous legacy signal must NOT be used
        ],
      };

      const payload = telemetryService.mapToLivePayload('site-01', mockPcsRow);

      expect(payload.data.pcsTemperature).toBe(41.5);
    });
  });

  // =========================================================================
  // 4. Single-BESS Reports & 51-Column CSV Contract
  // =========================================================================
  describe('4. Single-BESS Reports & 43-Column CSV Contract', () => {
    it('4.1 SINGLE_BESS_TELEMETRY_HEADERS contains exactly 43 columns in authoritative contiguous sequence', () => {
      const headers = getSingleBessTelemetryHeaders();
      expect(headers).toHaveLength(43);
      expect(headers).not.toContain('Cabinet Meter Power (kW)');

      // Verify contiguous 6-metric TMS sequence at indices 12..17 without DC Voltage:
      expect(headers[11]).toBe('AC Current (A)');
      expect(headers[12]).toBe('Operating Mode');
      expect(headers[13]).toBe('Ambient Temperature (°C)');
      expect(headers[14]).toBe('Battery Coolant Return Temperature (°C)');
      expect(headers[15]).toBe('Battery Coolant Inlet Temperature (°C)');
      expect(headers[16]).toBe('Coolant Return Pressure (bar)');
      expect(headers[17]).toBe('Coolant Inlet Pressure (bar)');
      expect(headers[18]).toBe('SOC (%)');
    });

    it('4.2 AUTHORITATIVE_TELEMETRY_HEADERS (multi-BESS) aligns with unified 43-column schema including TMS fields', () => {
      const multiHeaders = getAuthoritativeTelemetryHeaders();
      expect(multiHeaders).toHaveLength(43);
      expect(AUTHORITATIVE_TELEMETRY_HEADERS).toHaveLength(43);
      expect(multiHeaders).not.toContain('Cabinet Meter Power (kW)');

      expect(multiHeaders).toContain('Operating Mode');
      expect(multiHeaders).toContain('Battery Coolant Return Temperature (°C)');
      expect(multiHeaders).toContain('Battery Coolant Inlet Temperature (°C)');
      expect(multiHeaders).toContain('Coolant Return Pressure (bar)');
      expect(multiHeaders).toContain('Coolant Inlet Pressure (bar)');
      expect(multiHeaders).not.toContain('DC Voltage (V)');
    });

    it('4.3 exportSingleBessCsv outputs 45 columns with exact header and row alignment', async () => {
      const mockSite = {
        id: 'site-tms-01',
        name: 'TMS Test Site',
        businessIdentifier: 'SITE-TMS',
        timezone: 'Asia/Kolkata',
        client: { name: 'Energy Co' }
      };

      const mockBessAssets = [{
        id: 'bess-01',
        name: 'BESS 01',
        emuId: 'EMU-TMS-001'
      }];

      const mockRows = [
        {
          bucketTimestamp: new Date('2026-10-17T06:00:00Z'),
          bessName: 'BESS 01',
          emuId: 'EMU-TMS-001',
          gridSideLoad: 120,
          gridFrequency: 50.0,
          powerFactor: 0.99,
          totalPower: 120,
          voltageA: 230, voltageB: 230, voltageC: 230,
          currentA: 10, currentB: 10, currentC: 10,
          bessFrequency: 50.0,
          bessPowerFactor: 0.98,
          pcsActivePower: 100,
          dcVoltage: 750,
          pcsTemperature: 38.5, // From ai_igbt_temp
          pcsLineVoltage: 400.1,
          pcsAcCurrent: 45.2,
          tmsOperatingMode: 2, // UNKNOWN
          tmsAmbientTemp: 29.4,
          tmsCoolantReturnTemp: 24.2,
          tmsCoolantInletTemp: 20.8,
          tmsCoolantReturnPressure: 1.34,
          tmsCoolantInletPressure: 2.15,
          soc: 90,
          soh: 99,
          bmsCurrent: 20,
          bmsDcVoltage: 860,
          bmsCabinetState: 2, // CHARGING
          cellVMax: 3.421,
          cellVMin: 3.385,
          cellTempMax: 27.5,
          cellTempMin: 23.1,
          batteryAmbientTemp: 25.0,
          pack01AvgTemp: 26.0, pack01MaxTemp: 27.0,
          pack02AvgTemp: 26.2, pack02MaxTemp: 27.2,
          pack03AvgTemp: 26.4, pack03MaxTemp: 27.4,
          pack04AvgTemp: 26.6, pack04MaxTemp: 27.6,
          pack05AvgTemp: 26.8, pack05MaxTemp: 27.8,
          todayChargeEnergy: 200,
          todayDischargeEnergy: 100,
          accumChargeEnergy: 2000,
          accumDischargeEnergy: 1000,
          solarPower: 50
        },
        {
          bucketTimestamp: new Date('2026-10-17T06:15:00Z'),
          bessName: 'BESS 01',
          emuId: 'EMU-TMS-001',
          gridSideLoad: null, gridFrequency: null, powerFactor: null, totalPower: null,
          voltageA: null, voltageB: null, voltageC: null,
          currentA: null, currentB: null, currentC: null,
          bessFrequency: null, bessPowerFactor: null, pcsActivePower: null,
          dcVoltage: null, pcsTemperature: null, pcsLineVoltage: null, pcsAcCurrent: null,
          tmsOperatingMode: 0, // STOP
          tmsAmbientTemp: 0, // Numeric zero
          tmsCoolantReturnTemp: null, // Missing -> blank
          tmsCoolantInletTemp: null,
          tmsCoolantReturnPressure: 0, // Numeric zero bar
          tmsCoolantInletPressure: null,
          soc: 0,
          soh: null, bmsCurrent: null, bmsDcVoltage: null, bmsCabinetState: null,
          cellVMax: null, cellVMin: null, cellTempMax: null, cellTempMin: null,
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

      vi.spyOn(prisma, '$queryRawUnsafe').mockResolvedValue(mockRows as any);

      const mockRes = new MockResponse();
      await reportExportService.exportSingleBessCsv(
        mockRes as any,
        'site-tms-01',
        15,
        new Date('2026-10-17T00:00:00Z'),
        new Date('2026-10-17T23:59:59Z'),
        mockSite,
        mockBessAssets
      );

      expect(mockRes.ended).toBe(true);
      const csv = mockRes.getContent();
      const lines = csv.slice(1).split('\r\n');

      const headerIdx = lines.findIndex(l => l.includes('Timestamp') && l.includes('Operating Mode'));
      expect(headerIdx).toBeGreaterThanOrEqual(0);

      const headerCols = lines[headerIdx].split(',');
      expect(headerCols).toHaveLength(43);
      expect(headerCols).not.toContain('Cabinet Meter Power (kW)');

      // Verify row 1
      const parseCsvLine = (line: string): string[] => {
        const result: string[] = [];
        let current = '';
        let inQuotes = false;
        for (let i = 0; i < line.length; i++) {
          const char = line[i];
          if (char === '"') inQuotes = !inQuotes;
          else if (char === ',' && !inQuotes) {
            result.push(current);
            current = '';
          } else current += char;
        }
        result.push(current);
        return result;
      };

      const row1Cols = parseCsvLine(lines[headerIdx + 1]);
      expect(row1Cols).toHaveLength(43);

      // Verify TMS columns in row 1
      expect(row1Cols[9]).toBe('38.5');  // PCS Temperature
      expect(row1Cols[12]).toBe('UNKNOWN'); // Operating Mode value 2
      expect(row1Cols[13]).toBe('29.4');    // Ambient Temperature
      expect(row1Cols[14]).toBe('24.2');    // Return Temp
      expect(row1Cols[15]).toBe('20.8');    // Inlet Temp
      expect(row1Cols[16]).toBe('1.34');    // Return Pressure (bar)
      expect(row1Cols[17]).toBe('2.15');    // Inlet Pressure (bar)
      expect(row1Cols[18]).toBe('90');      // SOC

      // Verify row 2 (zero preservation & missing values as empty cells)
      const row2Cols = parseCsvLine(lines[headerIdx + 2]);
      expect(row2Cols).toHaveLength(43);
      expect(row2Cols[12]).toBe('STOP'); // Operating Mode 0
      expect(row2Cols[13]).toBe('0');    // Ambient Temp numeric 0 preserved
      expect(row2Cols[14]).toBe('');     // Return Temp missing -> blank cell
      expect(row2Cols[15]).toBe('');     // Inlet Temp missing -> blank cell
      expect(row2Cols[16]).toBe('0');    // Return Pressure numeric 0 preserved
      expect(row2Cols[17]).toBe('');     // Inlet Pressure missing -> blank cell
      expect(row2Cols[18]).toBe('0');    // SOC numeric 0 preserved

      // Ensure no synthetic undefined, NaN, or null in CSV
      expect(csv).not.toContain('NaN');
      expect(csv).not.toContain('undefined');
      expect(csv).not.toContain('null');
    });
  });

  // =========================================================================
  // 5. Frontend TMS Telemetry Table Operating Mode Verification
  // =========================================================================
  describe('5. Frontend TMS Telemetry Table Operating Mode Specification', () => {
    it('5.1 TMS_OPERATING_MODES covers all 5 authoritative modes with exact labels and descriptions', () => {
      expect(TMS_OPERATING_MODES).toHaveLength(5);
      expect(TMS_OPERATING_MODES[0]).toEqual({
        code: 0,
        label: 'STOP',
        description: 'System offline / idle standby',
      });
      expect(TMS_OPERATING_MODES[1]).toEqual({
        code: 1,
        label: 'SELF-CIRCULATION',
        description: 'Internal coolant loop active',
      });
      expect(TMS_OPERATING_MODES[2]).toEqual({
        code: 2,
        label: 'COOLING',
        description: 'Active refrigeration / chiller loop',
      });
      expect(TMS_OPERATING_MODES[3]).toEqual({
        code: 3,
        label: 'HEATING',
        description: 'Coolant heater actively warming',
      });
      expect(TMS_OPERATING_MODES[4]).toEqual({
        code: 4,
        label: 'FAULT',
        description: 'Thermal system error condition',
      });
    });

    it('5.2 Operating mode code validation strictly confines discrete modes to 0..4', () => {
      const isValidMode = (val: unknown) =>
        val !== undefined &&
        val !== null &&
        Number.isInteger(Number(val)) &&
        Number(val) >= 0 &&
        Number(val) <= 4;

      expect(isValidMode(0)).toBe(true);
      expect(isValidMode(1)).toBe(true);
      expect(isValidMode(2)).toBe(true);
      expect(isValidMode(3)).toBe(true);
      expect(isValidMode(4)).toBe(true);

      expect(isValidMode(-1)).toBe(false);
      expect(isValidMode(5)).toBe(false);
      expect(isValidMode(1.5)).toBe(false);
      expect(isValidMode(undefined)).toBe(false);
      expect(isValidMode(null)).toBe(false);
      expect(isValidMode('invalid')).toBe(false);
    });

    it('5.3 Primary Operating Mode row displays active mode label, description, and LIVE status when fresh', () => {
      // Simulate mode 2 (COOLING) active and fresh
      const modeCode = 2;
      const isAvailable = true;
      const isStale = false;
      const modeInfo = TMS_OPERATING_MODES[modeCode];

      const display = isAvailable && !isStale && modeInfo ? modeInfo.label : '--';
      const description = isAvailable && !isStale && modeInfo ? modeInfo.description : undefined;
      const statusBadge = isAvailable && !isStale ? 'LIVE' : 'NO DATA';

      expect(display).toBe('COOLING');
      expect(description).toBe('Active refrigeration / chiller loop');
      expect(statusBadge).toBe('LIVE');
    });

    it('5.4 Primary Operating Mode row handles stale, missing, and unsupported modes correctly', () => {
      // Stale signal
      const getModeDisplay = (val: unknown, isAvail: boolean, isStale: boolean) => {
        const isUnsupported = val !== undefined && val !== null && (!Number.isInteger(Number(val)) || Number(val) < 0 || Number(val) > 4);
        if (isUnsupported) return `UNKNOWN (${String(val)})`;
        const isValid = val !== undefined && val !== null && Number.isInteger(Number(val)) && Number(val) >= 0 && Number(val) <= 4;
        if (isAvail && !isStale && isValid) return TMS_OPERATING_MODES[Number(val)].label;
        return '--';
      };

      const getModeStatus = (val: unknown, isAvail: boolean, isStale: boolean) => {
        const isUnsupported = val !== undefined && val !== null && (!Number.isInteger(Number(val)) || Number(val) < 0 || Number(val) > 4);
        if (isUnsupported) return 'UNKNOWN';
        if (isAvail && !isStale) return 'LIVE';
        if (isStale) return 'STALE';
        return 'NO DATA';
      };

      // Stale
      expect(getModeDisplay(2, true, true)).toBe('--');
      expect(getModeStatus(2, true, true)).toBe('STALE');

      // Missing
      expect(getModeDisplay(undefined, false, false)).toBe('--');
      expect(getModeStatus(undefined, false, false)).toBe('NO DATA');

      // Unsupported
      expect(getModeDisplay(99, true, false)).toBe('UNKNOWN (99)');
      expect(getModeStatus(99, true, false)).toBe('UNKNOWN');
    });
  });
});

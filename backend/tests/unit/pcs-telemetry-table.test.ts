import { describe, it, expect, vi } from 'vitest';
import { EventEmitter } from 'events';
import {
  calculateLineVoltage,
  calculateAcCurrent,
  getPcsTemperature,
  getTmsAmbientTemperature,
  round1Dec,
  processReportPcsRow,
  isValidFiniteNumber
} from '../../src/utils/pcs-telemetry.util';
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

describe('PCS Telemetry Table (Phase 1) - Comprehensive Unit & Integration Tests', () => {

  describe('1. Calculation Tests: Line Voltage & AC Current & PCS Temperature', () => {
    it('1.1 calculateLineVoltage: calculates correct arithmetic mean for 3 valid phases', () => {
      const avg = calculateLineVoltage(400, 402, 404);
      expect(avg).toBe(402);
    });

    it('1.2 calculateLineVoltage: calculates fractional average correctly without premature rounding', () => {
      const avg = calculateLineVoltage(400.1, 400.2, 400.6);
      expect(avg).toBeCloseTo(400.3, 5);
    });

    it('1.3 calculateLineVoltage: genuine numeric zero is preserved and valid', () => {
      const avg = calculateLineVoltage(0, 0, 0);
      expect(avg).toBe(0);

      const mixedWithZero = calculateLineVoltage(0, 300, 600);
      expect(mixedWithZero).toBe(300);
    });

    it('1.4 calculateLineVoltage: returns undefined if any phase is missing (strict 3-phase rule)', () => {
      expect(calculateLineVoltage(undefined, 400, 400)).toBeUndefined();
      expect(calculateLineVoltage(400, undefined, 400)).toBeUndefined();
      expect(calculateLineVoltage(400, 400, undefined)).toBeUndefined();
      expect(calculateLineVoltage(null, 400, 400)).toBeUndefined();
      expect(calculateLineVoltage(400, null, 400)).toBeUndefined();
      expect(calculateLineVoltage(400, 400, null)).toBeUndefined();
    });

    it('1.5 calculateLineVoltage: rejects non-numeric, NaN, and Infinity', () => {
      expect(calculateLineVoltage('400', 400, 400)).toBeUndefined();
      expect(calculateLineVoltage(NaN, 400, 400)).toBeUndefined();
      expect(calculateLineVoltage(400, Infinity, 400)).toBeUndefined();
      expect(calculateLineVoltage(400, 400, -Infinity)).toBeUndefined();
    });

    it('1.6 calculateAcCurrent: calculates correct arithmetic mean for 3 valid phases', () => {
      const avg = calculateAcCurrent(45, 50, 55);
      expect(avg).toBe(50);
    });

    it('1.7 calculateAcCurrent: calculates fractional average correctly', () => {
      const avg = calculateAcCurrent(10.2, 10.3, 10.7);
      expect(avg).toBeCloseTo(10.4, 5);
    });

    it('1.8 calculateAcCurrent: genuine zero current is preserved', () => {
      expect(calculateAcCurrent(0, 0, 0)).toBe(0);
      expect(calculateAcCurrent(0, 15, 30)).toBe(15);
    });

    it('1.9 calculateAcCurrent: returns undefined if any phase is missing or invalid', () => {
      expect(calculateAcCurrent(undefined, 50, 50)).toBeUndefined();
      expect(calculateAcCurrent(50, undefined, 50)).toBeUndefined();
      expect(calculateAcCurrent(50, 50, undefined)).toBeUndefined();
      expect(calculateAcCurrent(null, 50, 50)).toBeUndefined();
      expect(calculateAcCurrent(NaN, 50, 50)).toBeUndefined();
      expect(calculateAcCurrent(50, Infinity, 50)).toBeUndefined();
      expect(calculateAcCurrent('50', 50, 50)).toBeUndefined();
    });

    it('1.10 getPcsTemperature: strictly requires valid pcs.ai_igbt_temp with no fallbacks', () => {
      expect(getPcsTemperature(35.5)).toBe(35.5);
      expect(getPcsTemperature(0)).toBe(0);
      expect(getPcsTemperature(-10.2)).toBe(-10.2);

      expect(getPcsTemperature(undefined)).toBeUndefined();
      expect(getPcsTemperature(null)).toBeUndefined();
      expect(getPcsTemperature(NaN)).toBeUndefined();
      expect(getPcsTemperature(Infinity)).toBeUndefined();
      expect(getPcsTemperature('35.5')).toBeUndefined();
    });

    it('1.11 getTmsAmbientTemperature: strictly requires valid finite numeric tms.ai_at with no fallbacks', () => {
      expect(getTmsAmbientTemperature(26.5)).toBe(26.5);
      expect(getTmsAmbientTemperature(0)).toBe(0);
      expect(getTmsAmbientTemperature(-5.5)).toBe(-5.5);

      expect(getTmsAmbientTemperature(undefined)).toBeUndefined();
      expect(getTmsAmbientTemperature(null)).toBeUndefined();
      expect(getTmsAmbientTemperature(NaN)).toBeUndefined();
      expect(getTmsAmbientTemperature(Infinity)).toBeUndefined();
      expect(getTmsAmbientTemperature(-Infinity)).toBeUndefined();
      expect(getTmsAmbientTemperature('26.5')).toBeUndefined();
      expect(getTmsAmbientTemperature('0')).toBeUndefined();
      expect(getTmsAmbientTemperature('invalid')).toBeUndefined();
      expect(getTmsAmbientTemperature('')).toBeUndefined();
    });

    it('1.12 processReportPcsRow: formats measurements to 1-decimal rounding and leaves missing as null', () => {
      const row = {
        pcsTemperature: 36.789,
        pcsLineVoltage: 400.3333,
        pcsAcCurrent: 49.999,
        tmsAmbientTemp: 27.845,
      };
      processReportPcsRow(row);
      expect(row.pcsTemperature).toBe(36.8);
      expect(row.pcsLineVoltage).toBe(400.3);
      expect(row.pcsAcCurrent).toBe(50.0);
      expect(row.tmsAmbientTemp).toBe(27.8);

      const emptyRow = {
        pcsTemperature: null,
        pcsLineVoltage: undefined,
        pcsAcCurrent: null,
        tmsAmbientTemp: null,
      };
      processReportPcsRow(emptyRow);
      expect(emptyRow.pcsTemperature).toBeNull();
      expect(emptyRow.pcsLineVoltage).toBeNull();
      expect(emptyRow.pcsAcCurrent).toBeNull();
      expect(emptyRow.tmsAmbientTemp).toBeNull();

      const zeroRow = {
        pcsTemperature: 0,
        pcsLineVoltage: 0,
        pcsAcCurrent: 0,
        tmsAmbientTemp: 0,
      };
      processReportPcsRow(zeroRow);
      expect(zeroRow.pcsTemperature).toBe(0);
      expect(zeroRow.pcsLineVoltage).toBe(0);
      expect(zeroRow.pcsAcCurrent).toBe(0);
      expect(zeroRow.tmsAmbientTemp).toBe(0);
    });
  });

  describe('2. Live Telemetry Pipeline & Normalization Tests', () => {
    it('2.1 normalizeComponentSignals correctly extracts PCS signals for componentId = pcs', () => {
      const pcsPayload = [
        { m: 'ai_out_uab', v: '400.5' },
        { m: 'ai_out_ubc', v: '401.0' },
        { m: 'ai_out_uca', v: '401.5' },
        { m: 'ai_ia', v: '45.0' },
        { m: 'ai_ib', v: '46.0' },
        { m: 'ai_ic', v: '47.0' },
        { m: 'ai_igbt_temp', v: '32.5' },
        { m: 'ai_cos', v: '0.99' },
        { m: 'ai_freq', v: '50.01' },
      ];

      const normalized = normalizeComponentSignals('pcs', pcsPayload);

      expect(normalized.wsData.pcsLineVoltage).toBeCloseTo(401.0, 4);
      expect(normalized.wsData.pcsAcCurrent).toBeCloseTo(46.0, 4);
      expect(normalized.wsData.pcsTemperature).toBe(32.5);
      expect(normalized.wsData.bessPowerFactor).toBe(0.99);
      expect(normalized.wsData.bessFrequency).toBe(50.01);
    });

    it('2.2 normalizeComponentSignals does NOT fallback to ai_temp or ai_ta when ai_igbt_temp is absent', () => {
      const realWorldPcsPayload = [
        { m: 'ai_out_uab', v: '399.8' },
        { m: 'ai_out_ubc', v: '400.1' },
        { m: 'ai_out_uca', v: '400.4' },
        { m: 'ai_ia', v: '48.2' },
        { m: 'ai_ib', v: '48.5' },
        { m: 'ai_ic', v: '48.8' },
        { m: 'ai_temp', v: '45.0' }, // Legacy ai_temp must not be used as pcs.ai_igbt_temp!
        { m: 'ai_ta', v: '30.2' },        // Cabinet ambient temp must not be used as pcs.ai_igbt_temp!
      ];

      const normalized = normalizeComponentSignals('pcs', realWorldPcsPayload);

      expect(normalized.wsData.pcsLineVoltage).toBeCloseTo(400.1, 4);
      expect(normalized.wsData.pcsAcCurrent).toBeCloseTo(48.5, 4);
      // Critical check: pcsTemperature must be undefined (NO FALLBACK to ai_temp)
      expect(normalized.wsData.pcsTemperature).toBeUndefined();
    });

    it('2.3 normalizeComponentSignals returns undefined line voltage and current if phases are incomplete', () => {
      const incompletePayload = [
        { m: 'ai_out_uab', v: '400.0' },
        { m: 'ai_out_ubc', v: '400.0' },
        // ai_out_uca missing!
        { m: 'ai_ia', v: '50.0' },
        // ai_ib missing!
        { m: 'ai_ic', v: '50.0' },
      ];

      const normalized = normalizeComponentSignals('pcs', incompletePayload);

      expect(normalized.wsData.pcsLineVoltage).toBeUndefined();
      expect(normalized.wsData.pcsAcCurrent).toBeUndefined();
    });

    it('2.4 mapToLivePayload cold-load reconstructs PCS signals accurately', () => {
      const mockPcsRow: any = {
        deviceId: 'dev-pcs-1',
        device: { componentId: 'pcs' },
        timestamp: new Date('2026-10-17T06:00:00Z'),
        bessAssetId: 'bess-01',
        rawPayload: [
          { m: 'ai_out_uab', v: '405.0' },
          { m: 'ai_out_ubc', v: '405.0' },
          { m: 'ai_out_uca', v: '405.0' },
          { m: 'ai_ia', v: '30.0' },
          { m: 'ai_ib', v: '30.0' },
          { m: 'ai_ic', v: '30.0' },
          { m: 'ai_igbt_temp', v: '28.4' }
        ],
        bessVoltageUa: 405.0,
        bessVoltageUb: 405.0,
        bessVoltageUc: 405.0,
        pcsActivePower: 120.5,
        dcVoltage: 750.2,
        ambientTemp: 40.0,
        todayChargeEnergy: 100,
        todayDischargeEnergy: 200,
        accumChargeEnergy: 1000,
        accumDischargeEnergy: 2000,
        bessFrequency: 50.0,
        bessPowerFactor: 0.98,
        gridSideLoad: null,
        voltageA: null,
        voltageB: null,
        voltageC: null,
        currentA: null,
        currentB: null,
        currentC: null,
        gridFrequency: null,
        powerFactor: null,
        soc: null,
        soh: null,
        bmsCurrent: null,
        cellVMax: null,
        cellVMin: null,
        cellTempMax: null,
        solarPower: null,
        solarFrequency: null,
        solarPowerFactor: null,
      };

      const payload = telemetryService.mapToLivePayload('site-01', mockPcsRow);

      expect(payload.data.pcsLineVoltage).toBe(405.0);
      expect(payload.data.pcsAcCurrent).toBe(30.0);
      expect(payload.data.pcsTemperature).toBe(28.4);
      expect(payload.data.bessPower).toBe(120.5);
      expect(payload.data.pcsDcVoltage).toBe(750.2);
    });

    it('2.5 mapToLivePayload cold-load falls back to named columns for line voltage if rawPayload absent', () => {
      const mockPcsRowWithoutRaw: any = {
        deviceId: 'dev-pcs-1',
        device: { componentId: 'pcs' },
        timestamp: new Date('2026-10-17T06:00:00Z'),
        bessAssetId: 'bess-01',
        rawPayload: null,
        bessVoltageUa: 410.0,
        bessVoltageUb: 410.0,
        bessVoltageUc: 410.0,
        pcsActivePower: 80.0,
        dcVoltage: 700.0,
        ambientTemp: 38.0,
        todayChargeEnergy: null,
        todayDischargeEnergy: null,
        accumChargeEnergy: null,
        accumDischargeEnergy: null,
        bessFrequency: null,
        bessPowerFactor: null,
        gridSideLoad: null,
        voltageA: null,
        voltageB: null,
        voltageC: null,
        currentA: null,
        currentB: null,
        currentC: null,
        gridFrequency: null,
        powerFactor: null,
        soc: null,
        soh: null,
        bmsCurrent: null,
        cellVMax: null,
        cellVMin: null,
        cellTempMax: null,
        solarPower: null,
        solarFrequency: null,
        solarPowerFactor: null,
      };

      const payload = telemetryService.mapToLivePayload('site-01', mockPcsRowWithoutRaw);

      expect(payload.data.pcsLineVoltage).toBe(410.0);
      expect(payload.data.pcsAcCurrent).toBeUndefined();
      expect(payload.data.pcsTemperature).toBeUndefined();
    });

    it('2.6 normalizeComponentSignals correctly extracts Ambient Temperature (ai_at) for componentId = tms', () => {
      const tmsPayload = [
        { m: 'ai_at', v: '26.8' },
        { m: 'ai_tms_out_temp', v: '18.5' }
      ];

      const normalized = normalizeComponentSignals('tms', tmsPayload);

      expect(normalized.wsData.tmsAmbientTemp).toBe(26.8);
      // Ensure it does NOT contaminate PCS ambientTemp or pcsTemperature
      expect(normalized.ambientTemp).toBeUndefined();
      expect(normalized.wsData.pcsTemperature).toBeUndefined();
    });

    it('2.7 normalizeComponentSignals leaves tmsAmbientTemp undefined when ai_at is absent or nonnumeric', () => {
      const invalidTmsPayload = [
        { m: 'ai_tms_out_temp', v: '18.5' },
        { m: 'ai_at', v: 'invalid' }
      ];

      const normalized = normalizeComponentSignals('tms', invalidTmsPayload);
      expect(normalized.wsData.tmsAmbientTemp).toBeUndefined();
    });

    it('2.8 Strict signal separation: tms.ai_at, th.ai_temp, and pcs.ai_temp never cross-contaminate', () => {
      // 1. TMS packet with ai_at
      const tmsNorm = normalizeComponentSignals('tms', [{ m: 'ai_at', v: '25.5' }]);
      expect(tmsNorm.wsData.tmsAmbientTemp).toBe(25.5);
      expect(tmsNorm.batteryAmbientTemp).toBeUndefined();
      expect(tmsNorm.ambientTemp).toBeUndefined();
      expect(tmsNorm.wsData.pcsTemperature).toBeUndefined();

      // 2. TH packet with ai_temp (Battery Ambient Temp)
      const thNorm = normalizeComponentSignals('th', [{ m: 'ai_temp', v: '23.0' }]);
      expect(thNorm.wsData.batteryAmbientTemp).toBe(23.0);
      expect(thNorm.batteryAmbientTemp).toBeUndefined();
      expect(thNorm.wsData.tmsAmbientTemp).toBeUndefined();
      expect(thNorm.ambientTemp).toBeUndefined();
      expect(thNorm.wsData.pcsTemperature).toBeUndefined();

      // 3. PCS packet with ai_igbt_temp (PCS Temperature)
      const pcsNorm = normalizeComponentSignals('pcs', [{ m: 'ai_igbt_temp', v: '31.2' }]);
      expect(pcsNorm.wsData.pcsTemperature).toBe(31.2);
      expect(pcsNorm.wsData.tmsAmbientTemp).toBeUndefined();
      expect(pcsNorm.batteryAmbientTemp).toBeUndefined();

      // Legacy pcs.ai_temp must not populate pcsTemperature
      const legacyPcsNorm = normalizeComponentSignals('pcs', [{ m: 'ai_temp', v: '31.2' }]);
      expect(legacyPcsNorm.wsData.pcsTemperature).toBeUndefined();
    });

    it('2.9 mapToLivePayload cold-load reconstructs tmsAmbientTemp accurately from tms rawPayload', () => {
      const mockTmsRow: any = {
        deviceId: 'dev-tms-1',
        device: { componentId: 'tms' },
        timestamp: new Date('2026-10-17T06:00:00Z'),
        bessAssetId: 'bess-01',
        rawPayload: [
          { m: 'ai_at', v: '27.4' },
          { m: 'ai_comp_freq', v: '45.0' }
        ]
      };

      const payload = telemetryService.mapToLivePayload('site-01', mockTmsRow);
      expect(payload.data.tmsAmbientTemp).toBe(27.4);
    });
  });

  describe('3. Single-BESS Reports & CSV Export Contracts', () => {
    it('3.1 Single-BESS CSV headers contain exactly 43 columns in authoritative order', () => {
      const headers = getSingleBessTelemetryHeaders();
      expect(headers).toHaveLength(43);
      expect(headers).not.toContain('Cabinet Meter Power (kW)');

      // Verify PCS & TMS block without DC Voltage
      expect(headers).not.toContain('DC Voltage (V)');
      expect(headers[9]).toBe('PCS Temperature (°C)');
      expect(headers[10]).toBe('Line Voltage (V)');
      expect(headers[11]).toBe('AC Current (A)');
      expect(headers[12]).toBe('Operating Mode');
      expect(headers[13]).toBe('Ambient Temperature (°C)');
      expect(headers[14]).toBe('Battery Coolant Return Temperature (°C)');
      expect(headers[15]).toBe('Battery Coolant Inlet Temperature (°C)');
      expect(headers[16]).toBe('Coolant Return Pressure (bar)');
      expect(headers[17]).toBe('Coolant Inlet Pressure (bar)');
      expect(headers[18]).toBe('SOC (%)');
    });

    it('3.2 Multi-BESS per-BESS headers align with unified 43-column schema without DC Voltage', () => {
      const multiBessHeaders = getAuthoritativeTelemetryHeaders();
      expect(multiBessHeaders).toHaveLength(43);
      expect(AUTHORITATIVE_TELEMETRY_HEADERS).toHaveLength(43);
      expect(multiBessHeaders).not.toContain('Cabinet Meter Power (kW)');

      expect(multiBessHeaders).not.toContain('DC Voltage (V)');
      expect(multiBessHeaders).toContain('Line Voltage (V)');
      expect(multiBessHeaders).toContain('AC Current (A)');
      expect(multiBessHeaders).toContain('Ambient Temperature (°C)');
    });

    it('3.3 Single-BESS CSV export properly formats PCS values, genuine zeros, and blank missing cells', async () => {
      const mockSite = {
        id: 'site-single-01',
        name: 'Single BESS Site',
        businessIdentifier: 'SITE-01',
        timezone: 'Asia/Kolkata',
        client: { name: 'Acme Client' }
      };

      const mockBessAssets = [{
        id: 'bess-01',
        name: 'BESS 01',
        emuId: 'EMU-001'
      }];

      const mockSingleBessRows = [
        {
          bucketTimestamp: new Date('2026-10-17T05:00:00Z'),
          bessName: 'BESS 01',
          emuId: 'EMU-001',
          gridSideLoad: 100,
          gridFrequency: 50.0,
          powerFactor: 0.99,
          totalPower: 100,
          voltageA: 230,
          voltageB: 230,
          voltageC: 230,
          currentA: 10,
          currentB: 10,
          currentC: 10,
          bessFrequency: 50.0,
          bessPowerFactor: 0.98,
          pcsActivePower: 120,
          dcVoltage: 750,
          pcsTemperature: null, // ai_temp unavailable -> blank cell
          pcsLineVoltage: 400.25,
          pcsAcCurrent: 48.75,
          tmsAmbientTemp: 27.84, // tms.ai_at present
          soc: 85.5,
          soh: 98.0,
          bmsCurrent: 30,
          cellVMax: 3.45,
          cellVMin: 3.40,
          cellTempMax: 28.5,
          batteryAmbientTemp: 25.0,
          pack01AvgTemp: 26.0,
          pack01MaxTemp: 27.0,
          pack02AvgTemp: 26.2,
          pack02MaxTemp: 27.2,
          pack03AvgTemp: 26.4,
          pack03MaxTemp: 27.4,
          pack04AvgTemp: 26.6,
          pack04MaxTemp: 27.6,
          pack05AvgTemp: 26.8,
          pack05MaxTemp: 27.8,
          todayChargeEnergy: 150,
          todayDischargeEnergy: 250,
          accumChargeEnergy: 1500,
          accumDischargeEnergy: 2500,
          solarPower: 50
        },
        {
          bucketTimestamp: new Date('2026-10-17T05:15:00Z'),
          bessName: 'BESS 01',
          emuId: 'EMU-001',
          gridSideLoad: 0,
          gridFrequency: 50.0,
          powerFactor: 1.0,
          totalPower: 0,
          voltageA: 230,
          voltageB: 230,
          voltageC: 230,
          currentA: 0,
          currentB: 0,
          currentC: 0,
          bessFrequency: 50.0,
          bessPowerFactor: 1.0,
          pcsActivePower: 0,
          dcVoltage: 740,
          pcsTemperature: 33.5, // ai_temp present
          pcsLineVoltage: 0,    // genuine 0
          pcsAcCurrent: 0,      // genuine 0
          tmsAmbientTemp: null, // tms.ai_at missing -> blank cell
          soc: 85.0,
          soh: 98.0,
          bmsCurrent: 0,
          cellVMax: 3.42,
          cellVMin: 3.39,
          cellTempMax: 28.0,
          batteryAmbientTemp: 25.0,
          pack01AvgTemp: 26.0,
          pack01MaxTemp: 27.0,
          pack02AvgTemp: 26.2,
          pack02MaxTemp: 27.2,
          pack03AvgTemp: 26.4,
          pack03MaxTemp: 27.4,
          pack04AvgTemp: 26.6,
          pack04MaxTemp: 27.6,
          pack05AvgTemp: 26.8,
          pack05MaxTemp: 27.8,
          todayChargeEnergy: 150,
          todayDischargeEnergy: 250,
          accumChargeEnergy: 1500,
          accumDischargeEnergy: 2500,
          solarPower: 0
        }
      ];

      // Mock prisma query
      vi.spyOn(prisma, '$queryRawUnsafe').mockResolvedValue(mockSingleBessRows as any);

      const mockRes = new MockResponse();
      await reportExportService.exportSingleBessCsv(
        mockRes as any,
        'site-single-01',
        15,
        new Date('2026-10-17T00:00:00Z'),
        new Date('2026-10-17T12:00:00Z'),
        mockSite,
        mockBessAssets
      );

      const csvContent = mockRes.getContent();
      const lines = csvContent.split(/\r?\n/).filter(line => line.length > 0);

      // Helper to parse RFC 4180 CSV row respecting quoted fields
      const parseCsvLine = (line: string): string[] => {
        const result: string[] = [];
        let current = '';
        let inQuotes = false;
        for (let i = 0; i < line.length; i++) {
          const char = line[i];
          if (char === '"') {
            if (inQuotes && line[i + 1] === '"') {
              current += '"';
              i++;
            } else {
              inQuotes = !inQuotes;
            }
          } else if (char === ',' && !inQuotes) {
            result.push(current);
            current = '';
          } else {
            current += char;
          }
        }
        result.push(current);
        return result;
      };

      // Find headers line
      const headerIdx = lines.findIndex(l => l.includes('Timestamp') && l.includes('BESS Name'));
      expect(headerIdx).toBeGreaterThanOrEqual(0);
      const headerLine = lines[headerIdx];
      expect(headerLine).toContain('PCS Temperature (°C),Line Voltage (V),AC Current (A),Operating Mode,Ambient Temperature (°C),Battery Coolant Return Temperature (°C),Battery Coolant Inlet Temperature (°C),Coolant Return Pressure (bar),Coolant Inlet Pressure (bar),SOC (%)');

      // First data row (pcsTemperature is null -> blank cell, tmsAmbientTemp = 27.84 -> 27.8)
      const dataRow1 = parseCsvLine(lines[headerIdx + 1]);
      expect(dataRow1).toHaveLength(43);
      expect(dataRow1[9]).toBe('');         // PCS Temperature (blank)
      expect(dataRow1[10]).toBe('400.3');   // Line Voltage (rounded to 1-dec by processReportPcsRow)
      expect(dataRow1[11]).toBe('48.8');    // AC Current (rounded to 1-dec by processReportPcsRow)
      expect(dataRow1[12]).toBe('');        // Operating Mode (blank)
      expect(dataRow1[13]).toBe('27.8');    // Ambient Temperature (°C)
      expect(dataRow1[18]).toBe('85.5');    // SOC (%)

      // Second data row (pcsTemperature=33.5, pcsLineVoltage=0, pcsAcCurrent=0, tmsAmbientTemp is null -> blank)
      const dataRow2 = parseCsvLine(lines[headerIdx + 2]);
      expect(dataRow2).toHaveLength(43);
      expect(dataRow2[9]).toBe('33.5');     // PCS Temperature
      expect(dataRow2[10]).toBe('0');       // Line Voltage (genuine zero preserved)
      expect(dataRow2[11]).toBe('0');       // AC Current (genuine zero preserved)
      expect(dataRow2[12]).toBe('');        // Operating Mode (blank)
      expect(dataRow2[13]).toBe('');        // Ambient Temperature (blank)
      expect(dataRow2[18]).toBe('85');      // SOC (%)
    });
  });
});

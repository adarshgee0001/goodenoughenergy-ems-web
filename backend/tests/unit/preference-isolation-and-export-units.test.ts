import { describe, it, expect, beforeEach } from 'vitest';
import {
  getStorageKey,
  PREFERENCES_KEY_PREFIX,
} from '../../../frontend/src/features/settings/context/UserSettingsContext';
import {
  AUTHORITATIVE_TELEMETRY_HEADERS,
  getAuthoritativeTelemetryHeaders,
  getExportUnitConverters,
} from '../../src/services/report-export.service';

describe('Client Preference Isolation & Export Unit Synchronization', () => {
  // --------------------------------------------------------------------------
  // Phase 3 — Preference Isolation by Authenticated Context
  // --------------------------------------------------------------------------
  describe('Phase 3: Preference Isolation by Authenticated Account Context', () => {
    it('generates isolated storage keys per client account', () => {
      const clientAKey = getStorageKey({ clientId: 'client-aaa-111' });
      const clientBKey = getStorageKey({ clientId: 'client-bbb-222' });

      expect(clientAKey).toBe(`${PREFERENCES_KEY_PREFIX}client_client-aaa-111`);
      expect(clientBKey).toBe(`${PREFERENCES_KEY_PREFIX}client_client-bbb-222`);
      expect(clientAKey).not.toEqual(clientBKey);
    });

    it('falls back to user scope when no client context exists (e.g. system admin)', () => {
      const adminKey = getStorageKey({ userId: 'admin-user-999' });
      expect(adminKey).toBe(`${PREFERENCES_KEY_PREFIX}user_admin-user-999`);
    });

    it('falls back to anonymous when neither client nor user is present', () => {
      const anonKey = getStorageKey(null);
      expect(anonKey).toBe(`${PREFERENCES_KEY_PREFIX}anonymous`);
    });

    it('prioritizes client scope over user scope when both are present', () => {
      const scopedKey = getStorageKey({ clientId: 'client-corp-1', userId: 'user-emp-5' });
      expect(scopedKey).toBe(`${PREFERENCES_KEY_PREFIX}client_client-corp-1`);
    });

    it('handles legacy and explicit string scopes correctly', () => {
      expect(getStorageKey('client_tenant-xyz')).toBe(`${PREFERENCES_KEY_PREFIX}client_tenant-xyz`);
      expect(getStorageKey('user_admin-123')).toBe(`${PREFERENCES_KEY_PREFIX}user_admin-123`);
    });

    it('simulates isolated client preference persistence without cross-account leakage', () => {
      const storageMock: Record<string, string> = {};
      const mockLocalStorage = {
        getItem: (k: string) => storageMock[k] || null,
        setItem: (k: string, v: string) => { storageMock[k] = v; },
        removeItem: (k: string) => { delete storageMock[k]; }
      };

      const clientAKey = getStorageKey({ clientId: 'client-alpha' });
      const clientBKey = getStorageKey({ clientId: 'client-beta' });

      // Client A selects MW and MWh
      const clientAPrefs = { powerUnit: 'MW', energyUnit: 'MWh' };
      mockLocalStorage.setItem(clientAKey, JSON.stringify(clientAPrefs));

      // Client B selects kW and kWh
      const clientBPrefs = { powerUnit: 'kW', energyUnit: 'kWh' };
      mockLocalStorage.setItem(clientBKey, JSON.stringify(clientBPrefs));

      // Verify Client A settings remain MW/MWh
      const loadedA = JSON.parse(mockLocalStorage.getItem(clientAKey)!);
      expect(loadedA.powerUnit).toBe('MW');
      expect(loadedA.energyUnit).toBe('MWh');

      // Verify Client B settings remain kW/kWh
      const loadedB = JSON.parse(mockLocalStorage.getItem(clientBKey)!);
      expect(loadedB.powerUnit).toBe('kW');
      expect(loadedB.energyUnit).toBe('kWh');

      // Modifying Client A does not alter Client B
      mockLocalStorage.setItem(clientAKey, JSON.stringify({ powerUnit: 'kW', energyUnit: 'MWh' }));
      const reloadedB = JSON.parse(mockLocalStorage.getItem(clientBKey)!);
      expect(reloadedB.powerUnit).toBe('kW');
      expect(reloadedB.energyUnit).toBe('kWh');
    });
  });

  // --------------------------------------------------------------------------
  // Phase 4 — Export Unit Preferences & Dynamic Headers
  // --------------------------------------------------------------------------
  describe('Phase 4: Export Unit Headers & Presentation Converters', () => {
    it('returns default kW and kWh headers when no options or default options are specified', () => {
      const defaultHeaders = getAuthoritativeTelemetryHeaders();
      expect(defaultHeaders).toEqual([...AUTHORITATIVE_TELEMETRY_HEADERS]);
      expect(defaultHeaders).toContain('Grid Side Load (kW)');
      expect(defaultHeaders).not.toContain('Cabinet Meter Power (kW)');
      expect(defaultHeaders).toContain('PCS Active Power (kW)');
      expect(defaultHeaders).toContain('Solar Power (kW)');
      expect(defaultHeaders).toContain('Today Charge Energy (kWh)');
      expect(defaultHeaders).toContain('Today Discharge Energy (kWh)');
      expect(defaultHeaders).toContain('Accum Charge Energy (kWh)');
      expect(defaultHeaders).toContain('Accum Discharge Energy (kWh)');
    });

    it('replaces power unit with MW in relevant headers when powerUnit=MW', () => {
      const mwHeaders = getAuthoritativeTelemetryHeaders({ powerUnit: 'MW' });
      expect(mwHeaders).toContain('Grid Side Load (MW)');
      expect(mwHeaders).not.toContain('Cabinet Meter Power (MW)');
      expect(mwHeaders).toContain('PCS Active Power (MW)');
      expect(mwHeaders).toContain('Solar Power (MW)');

      // Unrelated power headers are not mislabelled
      expect(mwHeaders).not.toContain('Grid Side Load (kW)');
      expect(mwHeaders).toContain('Today Charge Energy (kWh)'); // Energy remains kWh
    });

    it('replaces energy unit with MWh in relevant headers when energyUnit=MWh', () => {
      const mwhHeaders = getAuthoritativeTelemetryHeaders({ energyUnit: 'MWh' });
      expect(mwhHeaders).toContain('Today Charge Energy (MWh)');
      expect(mwhHeaders).toContain('Today Discharge Energy (MWh)');
      expect(mwhHeaders).toContain('Accum Charge Energy (MWh)');
      expect(mwhHeaders).toContain('Accum Discharge Energy (MWh)');

      // Power headers remain kW
      expect(mwhHeaders).toContain('Grid Side Load (kW)');
    });

    it('preserves non-power and non-energy measurements without modification', () => {
      const customHeaders = getAuthoritativeTelemetryHeaders({ powerUnit: 'MW', energyUnit: 'MWh' });

      expect(customHeaders[0]).toBe('Timestamp');
      expect(customHeaders[1]).toBe('BESS Name');
      expect(customHeaders[2]).toBe('EMU Serial No.');
      expect(customHeaders).toContain('Grid Frequency (Hz)');
      expect(customHeaders).toContain('Grid Power Factor');
      expect(customHeaders).not.toContain('Cabinet Voltage A (V)');
      expect(customHeaders).not.toContain('Cabinet Voltage B (V)');
      expect(customHeaders).not.toContain('Cabinet Voltage C (V)');
      expect(customHeaders).not.toContain('Cabinet Current A (A)');
      expect(customHeaders).not.toContain('Cabinet Current B (A)');
      expect(customHeaders).not.toContain('Cabinet Current C (A)');
      expect(customHeaders).toContain('BESS Frequency (Hz)');
      expect(customHeaders).toContain('BESS Power Factor');
      expect(customHeaders).not.toContain('DC Voltage (V)');
      expect(customHeaders).toContain('BMS DC Voltage (V)');
      expect(customHeaders).toContain('PCS Temperature (°C)');
      expect(customHeaders).toContain('SOC (%)');
      expect(customHeaders).toContain('SOH (%)');
      expect(customHeaders).toContain('BMS Current (A)');
      expect(customHeaders).toContain('Cell V Max (V)');
      expect(customHeaders).toContain('Cell V Min (V)');
      expect(customHeaders).toContain('Cell Temp Max (°C)');
    });

    it('converts power values correctly by dividing by 1000 in MW mode and leaving kW unchanged', () => {
      const kwConverter = getExportUnitConverters({ powerUnit: 'kW' });
      const mwConverter = getExportUnitConverters({ powerUnit: 'MW' });

      // Canonical kW: 250
      expect(kwConverter.convertPower(250)).toBe(250);
      expect(mwConverter.convertPower(250)).toBe(0.25);

      // Canonical kW: 5000
      expect(kwConverter.convertPower(5000)).toBe(5000);
      expect(mwConverter.convertPower(5000)).toBe(5);

      // Zero preserved
      expect(kwConverter.convertPower(0)).toBe(0);
      expect(mwConverter.convertPower(0)).toBe(0);

      // Negative values preserved (e.g. discharging or reactive flow)
      expect(kwConverter.convertPower(-120.5)).toBe(-120.5);
      expect(mwConverter.convertPower(-120.5)).toBeCloseTo(-0.1205);

      // Null and undefined handled safely
      expect(kwConverter.convertPower(null)).toBeNull();
      expect(mwConverter.convertPower(null)).toBeNull();
      expect(kwConverter.convertPower(undefined)).toBeNull();
      expect(mwConverter.convertPower(undefined)).toBeNull();
      expect(mwConverter.convertPower('invalid')).toBeNull();
    });

    it('converts energy values correctly by dividing by 1000 in MWh mode and leaving kWh unchanged', () => {
      const kwhConverter = getExportUnitConverters({ energyUnit: 'kWh' });
      const mwhConverter = getExportUnitConverters({ energyUnit: 'MWh' });

      // Canonical kWh: 1250.50
      expect(kwhConverter.convertEnergy(1250.50)).toBe(1250.50);
      expect(mwhConverter.convertEnergy(1250.50)).toBe(1.2505);

      // Canonical kWh: 39.75
      expect(kwhConverter.convertEnergy(39.75)).toBe(39.75);
      expect(mwhConverter.convertEnergy(39.75)).toBe(0.03975);

      // Zero preserved
      expect(kwhConverter.convertEnergy(0)).toBe(0);
      expect(mwhConverter.convertEnergy(0)).toBe(0);

      // Negative difference preserved
      expect(kwhConverter.convertEnergy(-15.2)).toBe(-15.2);
      expect(mwhConverter.convertEnergy(-15.2)).toBeCloseTo(-0.0152);

      // Null and undefined handled safely
      expect(kwhConverter.convertEnergy(null)).toBeNull();
      expect(mwhConverter.convertEnergy(null)).toBeNull();
      expect(kwhConverter.convertEnergy(undefined)).toBeNull();
      expect(mwhConverter.convertEnergy(undefined)).toBeNull();
    });

    it('aggregates canonical values first before conversion (site summary invariant)', () => {
      const { convertPower, convertEnergy } = getExportUnitConverters({ powerUnit: 'MW', energyUnit: 'MWh' });

      // Two BESS units: BESS 1 = 15.2 kW, BESS 2 = -10.2 kW
      const bess1Power = 15.2;
      const bess2Power = -10.2;

      // Canonical sum
      const canonicalSumPower = bess1Power + bess2Power; // 5.0 kW
      expect(canonicalSumPower).toBeCloseTo(5.0);

      // Convert the aggregated result
      const convertedTotalPower = convertPower(canonicalSumPower);
      expect(convertedTotalPower).toBeCloseTo(0.005); // 0.005 MW

      // Energy differences across two BESS units:
      // BESS 1 charge diff = 18.25 kWh, BESS 2 charge diff = 21.50 kWh
      const canonicalSiteChargeDiff = 18.25 + 21.50; // 39.75 kWh
      const convertedSiteChargeDiff = convertEnergy(canonicalSiteChargeDiff);
      expect(convertedSiteChargeDiff).toBeCloseTo(0.03975); // 0.03975 MWh
    });
  });
});

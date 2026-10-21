import { describe, it, expect } from 'vitest';
import {
  resolveBessPreview,
  formatPowerDisplay,
  formatEnergyDisplay,
  formatDateTimeCustom,
} from '../../../frontend/src/features/settings/settings.utils';
import { STOREDGE_CATALOG_PRESETS } from '../../../frontend/src/features/settings/settings.types';
import type {
  PowerUnit,
  EnergyUnit,
  TimeFormat,
  DateFormat,
} from '../../../frontend/src/features/settings/settings.types';

describe('Settings: Product-Aware BESS Details in Live Format Preview', () => {
  // Test assets representing deployed StorEDGE units with verified ratings
  const configuredStorEdge025 = {
    id: 'bess-025',
    name: 'Beta BESS 01',
    model: 'StorEDGE 0.25',
    powerRating: 125, // kW (configured active power)
    energyCapacity: 250, // kWh
  };

  const configuredStorEdge50 = {
    id: 'bess-50',
    name: 'Alpha BESS 01',
    model: 'StorEDGE 5.0',
    powerRating: 2500, // kW (configured active power)
    energyCapacity: 5000, // kWh
  };

  describe('1. Configured StorEDGE 0.25 Asset', () => {
    it('displays actual configured capacity (250 kWh) and supported rating (125 kW) with correct units', () => {
      const result = resolveBessPreview({
        bessAssets: [configuredStorEdge025],
        powerUnit: 'kW',
        energyUnit: 'kWh',
      });

      expect(result.source).toBe('configured');
      expect(result.assetName).toBe('Beta BESS 01');
      expect(result.modelName).toBe('StorEDGE 0.25');
      expect(result.powerRating).toEqual({
        displayValue: '125',
        unit: 'kW',
        isApparentPower: false,
      });
      expect(result.energyCapacity).toEqual({
        displayValue: '250',
        unit: 'kWh',
        isApparentPower: false,
      });
      expect(result.isApparentPower).toBe(false);
      expect(result.contextBadge).toBe('Configured Asset');
    });
  });

  describe('2. Configured StorEDGE 5.0 Asset', () => {
    it('displays actual configured capacity (5000 kWh) and supported rating (2500 kW) with correct units', () => {
      const result = resolveBessPreview({
        bessAssets: [configuredStorEdge50],
        powerUnit: 'kW',
        energyUnit: 'kWh',
      });

      expect(result.source).toBe('configured');
      expect(result.assetName).toBe('Alpha BESS 01');
      expect(result.modelName).toBe('StorEDGE 5.0');
      expect(result.powerRating).toEqual({
        displayValue: '2500',
        unit: 'kW',
        isApparentPower: false,
      });
      expect(result.energyCapacity).toEqual({
        displayValue: '5000',
        unit: 'kWh',
        isApparentPower: false,
      });
      expect(result.isApparentPower).toBe(false);
      expect(result.contextBadge).toBe('Configured Asset');
    });
  });

  describe('3. Switching kWh ↔ MWh Updates Preview Correctly', () => {
    it('converts configured StorEDGE 0.25 capacity from 250 kWh to 0.25 MWh', () => {
      const kwhResult = resolveBessPreview({
        bessAssets: [configuredStorEdge025],
        energyUnit: 'kWh',
      });
      expect(kwhResult.energyCapacity).toEqual({
        displayValue: '250',
        unit: 'kWh',
        isApparentPower: false,
      });

      const mwhResult = resolveBessPreview({
        bessAssets: [configuredStorEdge025],
        energyUnit: 'MWh',
      });
      expect(mwhResult.energyCapacity).toEqual({
        displayValue: '0.25',
        unit: 'MWh',
        isApparentPower: false,
      });
    });

    it('converts configured StorEDGE 5.0 capacity from 5000 kWh to 5 MWh', () => {
      const kwhResult = resolveBessPreview({
        bessAssets: [configuredStorEdge50],
        energyUnit: 'kWh',
      });
      expect(kwhResult.energyCapacity).toEqual({
        displayValue: '5000',
        unit: 'kWh',
        isApparentPower: false,
      });

      const mwhResult = resolveBessPreview({
        bessAssets: [configuredStorEdge50],
        energyUnit: 'MWh',
      });
      expect(mwhResult.energyCapacity).toEqual({
        displayValue: '5',
        unit: 'MWh',
        isApparentPower: false,
      });
    });

    it('converts illustrative catalog preset capacity when switching kWh ↔ MWh', () => {
      const kwhIllustrative = resolveBessPreview({
        bessAssets: [],
        fallbackPresetId: 'storedge-025',
        energyUnit: 'kWh',
      });
      expect(kwhIllustrative.energyCapacity).toEqual({
        displayValue: '250',
        unit: 'kWh',
        isApparentPower: false,
      });

      const mwhIllustrative = resolveBessPreview({
        bessAssets: [],
        fallbackPresetId: 'storedge-025',
        energyUnit: 'MWh',
      });
      expect(mwhIllustrative.energyCapacity).toEqual({
        displayValue: '0.25',
        unit: 'MWh',
        isApparentPower: false,
      });
    });
  });

  describe('4. Switching kW ↔ MW Formatting', () => {
    it('scales compatible kW ratings to MW for configured assets', () => {
      const kwResult = resolveBessPreview({
        bessAssets: [configuredStorEdge50],
        powerUnit: 'kW',
      });
      expect(kwResult.powerRating).toEqual({
        displayValue: '2500',
        unit: 'kW',
        isApparentPower: false,
      });

      const mwResult = resolveBessPreview({
        bessAssets: [configuredStorEdge50],
        powerUnit: 'MW',
      });
      expect(mwResult.powerRating).toEqual({
        displayValue: '2.5',
        unit: 'MW',
        isApparentPower: false,
      });
    });

    it('scales 125 kW to 0.13 MW with 2 decimal precision', () => {
      const mwResult = resolveBessPreview({
        bessAssets: [configuredStorEdge025],
        powerUnit: 'MW',
      });
      expect(mwResult.powerRating).toEqual({
        displayValue: '0.13',
        unit: 'MW',
        isApparentPower: false,
      });
    });

    it('does NOT force kVA/MVA values through the kW/MW formatter in illustrative mode', () => {
      // StorEDGE 0.25 catalogue reference is 125 kVA
      const resultKw = resolveBessPreview({
        bessAssets: null,
        fallbackPresetId: 'storedge-025',
        powerUnit: 'kW',
      });
      expect(resultKw.powerRating).toEqual({
        displayValue: '125',
        unit: 'kVA',
        isApparentPower: true,
      });

      const resultMw = resolveBessPreview({
        bessAssets: null,
        fallbackPresetId: 'storedge-025',
        powerUnit: 'MW',
      });
      // Should STILL be 125 kVA, NOT converted or divided by 1000
      expect(resultMw.powerRating).toEqual({
        displayValue: '125',
        unit: 'kVA',
        isApparentPower: true,
      });
    });
  });

  describe('5. Apparent Power Unit Integrity (kVA / MVA not relabelled as kW / MW)', () => {
    it('preserves 125 kVA for StorEDGE 0.25 catalogue preset without kW relabelling', () => {
      const result = resolveBessPreview({
        bessAssets: [],
        fallbackPresetId: 'storedge-025',
      });
      expect(result.powerRating.unit).toBe('kVA');
      expect(result.powerRating.unit).not.toBe('kW');
      expect(result.powerRating.unit).not.toBe('MW');
      expect(result.powerRating.displayValue).toBe('125');
      expect(result.isApparentPower).toBe(true);
    });

    it('preserves 2.5 MVA for StorEDGE 5.0 catalogue preset without MW relabelling', () => {
      const result = resolveBessPreview({
        bessAssets: [],
        fallbackPresetId: 'storedge-50',
      });
      expect(result.powerRating.unit).toBe('MVA');
      expect(result.powerRating.unit).not.toBe('MW');
      expect(result.powerRating.unit).not.toBe('kW');
      expect(result.powerRating.displayValue).toBe('2.5');
      expect(result.isApparentPower).toBe(true);
    });

    it('catalog presets contain official published specifications matching product references', () => {
      expect(STOREDGE_CATALOG_PRESETS['storedge-025']).toEqual({
        id: 'storedge-025',
        name: 'StorEDGE 0.25',
        model: 'StorEDGE 0.25',
        publishedEnergyCapacityKwh: 250,
        publishedPowerRatingValue: 125,
        publishedPowerRatingUnit: 'kVA',
      });

      expect(STOREDGE_CATALOG_PRESETS['storedge-50']).toEqual({
        id: 'storedge-50',
        name: 'StorEDGE 5.0',
        model: 'StorEDGE 5.0',
        publishedEnergyCapacityKwh: 5000,
        publishedPowerRatingValue: 2.5,
        publishedPowerRatingUnit: 'MVA',
      });
    });
  });

  describe('6. Multi-BESS Site Handling (Deterministic Representative Asset, No Aggregation)', () => {
    const multiBessList = [
      {
        id: 'bess-1',
        name: 'Alpha BESS 01',
        model: 'StorEDGE 5.0',
        powerRating: 2500,
        energyCapacity: 5000,
      },
      {
        id: 'bess-2',
        name: 'Alpha BESS 02',
        model: 'StorEDGE 5.0',
        powerRating: 2500,
        energyCapacity: 5000,
      },
    ];

    it('previews one identified asset rather than an aggregate', () => {
      const result = resolveBessPreview({
        bessAssets: multiBessList,
        powerUnit: 'kW',
        energyUnit: 'kWh',
      });

      // Must be individual asset rating (2500 kW / 5000 kWh), NOT aggregate (5000 kW / 10000 kWh)
      expect(result.powerRating.displayValue).toBe('2500');
      expect(result.powerRating.displayValue).not.toBe('5000');
      expect(result.energyCapacity.displayValue).toBe('5000');
      expect(result.energyCapacity.displayValue).not.toBe('10000');

      // Asset name must clearly identify the representative asset
      expect(result.assetName).toBe('Alpha BESS 01');
      expect(result.contextBadge).toBe('Representative Asset (1 of 2)');
      expect(result.contextDescription).toContain('reflect this individual asset, not site aggregate');
    });
  });

  describe('7. Missing Configuration and Defensive Fallbacks', () => {
    it('uses clearly labelled illustrative fallback when bessAssets is empty', () => {
      const result = resolveBessPreview({
        bessAssets: [],
        fallbackPresetId: 'storedge-025',
      });

      expect(result.source).toBe('illustrative');
      expect(result.contextBadge).toBe('Catalogue Example');
      expect(result.contextTitle).toContain('Illustrative product configuration');
      expect(result.contextDescription).toContain('No configured BESS found');
    });

    it('uses clearly labelled illustrative fallback when bessAssets is null or undefined', () => {
      const resultNull = resolveBessPreview({ bessAssets: null });
      expect(resultNull.source).toBe('illustrative');
      expect(resultNull.contextBadge).toBe('Catalogue Example');

      const resultUndef = resolveBessPreview({ bessAssets: undefined });
      expect(resultUndef.source).toBe('illustrative');
      expect(resultUndef.contextBadge).toBe('Catalogue Example');
    });

    it('handles missing fields (null/undefined powerRating, energyCapacity, model) with "--" without fabricating 0', () => {
      const assetWithMissingFields = {
        id: 'bess-incomplete',
        name: 'Incomplete BESS',
        model: null,
        powerRating: null,
        energyCapacity: undefined,
      };

      const result = resolveBessPreview({
        bessAssets: [assetWithMissingFields],
        powerUnit: 'kW',
        energyUnit: 'kWh',
      });

      expect(result.source).toBe('configured');
      expect(result.assetName).toBe('Incomplete BESS');
      expect(result.modelName).toBe('--');
      expect(result.powerRating.displayValue).toBe('--');
      expect(result.powerRating.displayValue).not.toBe('0');
      expect(result.energyCapacity.displayValue).toBe('--');
      expect(result.energyCapacity.displayValue).not.toBe('0');
    });
  });

  describe('8. Timestamp and Timezone Formatting Continuity', () => {
    const testDate = new Date(2026, 9, 16, 14, 30, 0); // 16 Oct 2026 14:30:00 local

    it('continues to format timestamps correctly with 12h/24h and date formats', () => {
      const formatted12h = formatDateTimeCustom(testDate, 'DD MMM YYYY', '12h', false);
      expect(formatted12h).toContain('16 Oct 2026');
      expect(formatted12h).toContain('02:30 PM');

      const formatted24h = formatDateTimeCustom(testDate, 'YYYY-MM-DD', '24h', false);
      expect(formatted24h).toContain('2026-10-16');
      expect(formatted24h).toContain('14:30');
    });
  });

  describe('9. Immutability and State Safety', () => {
    it('does not mutate the input assets or options', () => {
      const originalAsset = Object.freeze({
        id: 'frozen-bess',
        name: 'Frozen BESS',
        model: 'StorEDGE 5.0',
        powerRating: 2500,
        energyCapacity: 5000,
      });

      const options = Object.freeze({
        bessAssets: Object.freeze([originalAsset]) as any,
        powerUnit: 'MW' as PowerUnit,
        energyUnit: 'MWh' as EnergyUnit,
      });

      expect(() => resolveBessPreview(options)).not.toThrow();
      expect(originalAsset.powerRating).toBe(2500);
      expect(originalAsset.energyCapacity).toBe(5000);
    });
  });
});

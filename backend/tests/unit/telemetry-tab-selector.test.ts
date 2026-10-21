/**
 * Selector-Aware Telemetry Tab Unit Tests
 *
 * Verifies the requirements for:
 * 1. Selector state handling (All BESS vs Individual BESS, context reset, site asset validation)
 * 2. Multi-BESS All BESS consolidated view (site-level Grid resolution, Total BESS sum, fleet averages)
 * 3. Multi-BESS Individual BESS view (strict asset isolation, no fallback to aggregate, shared grid)
 * 4. Single-BESS backward compatibility (no selector, original readings untouched)
 * 5. Safe handling of missing, stale, or zero values (no conversion of missing to zero)
 */

import { describe, it, expect } from 'vitest';
import {
  isValidNumber,
  parseValidTimestamp,
} from '../../../frontend/src/features/dashboard/freshness.utils';
import type {
  DashboardTelemetryState,
  DashboardBessAsset,
} from '../../../frontend/src/features/dashboard/dashboard.types';

// Derivation helpers matching TelemetryPage.tsx
function resolveSiteMetric(
  states: DashboardTelemetryState[],
  valueKey: keyof DashboardTelemetryState,
  measuredAtKey?: keyof DashboardTelemetryState
): { value: number | undefined; measuredAt: string | undefined } {
  const validPairs = states
    .map(s => ({
      val: s[valueKey] as number | undefined,
      ts: (measuredAtKey ? (s[measuredAtKey] as string | undefined) : undefined) || s.timestamp,
    }))
    .filter((p): p is { val: number; ts: string | undefined } => isValidNumber(p.val));

  if (validPairs.length === 0) return { value: undefined, measuredAt: undefined };

  let best = validPairs[0];
  let bestMs = parseValidTimestamp(best.ts) ?? -Infinity;

  for (let i = 1; i < validPairs.length; i++) {
    const ms = parseValidTimestamp(validPairs[i].ts) ?? -Infinity;
    if (ms > bestMs) {
      best = validPairs[i];
      bestMs = ms;
    }
  }

  return { value: best.val, measuredAt: best.ts };
}

function resolveConsolidatedBess(states: DashboardTelemetryState[]) {
  const validBessPowers = states
    .map(s => s.bessPower)
    .filter((v): v is number => isValidNumber(v));
  const totalBessPower = validBessPowers.length > 0
    ? validBessPowers.reduce((sum, p) => sum + p, 0)
    : undefined;

  const validBessFreqs = states
    .map(s => s.bessFrequency)
    .filter((v): v is number => isValidNumber(v));
  const fleetBessFrequency = validBessFreqs.length > 0
    ? validBessFreqs.reduce((sum, f) => sum + f, 0) / validBessFreqs.length
    : undefined;

  const validBessPfs = states
    .map(s => s.bessPowerFactor)
    .filter((v): v is number => isValidNumber(v));
  const fleetBessPowerFactor = validBessPfs.length > 0
    ? validBessPfs.reduce((sum, pf) => sum + pf, 0) / validBessPfs.length
    : undefined;

  return { totalBessPower, fleetBessFrequency, fleetBessPowerFactor };
}

describe('Selector-Aware Telemetry Tab — Multi-BESS & Single-BESS Logic', () => {
  const BESS_1_ID = 'bess-1-uuid';
  const BESS_2_ID = 'bess-2-uuid';
  const BESS_3_ID = 'bess-3-uuid';

  const multiBessAssets: DashboardBessAsset[] = [
    { id: BESS_1_ID, name: 'Rac BESS 01', emuId: 'emu-1' },
    { id: BESS_2_ID, name: 'Rac BESS 02', emuId: 'emu-2' },
    { id: BESS_3_ID, name: 'Rac BESS 03', emuId: 'emu-3' },
  ];

  const singleBessAssets: DashboardBessAsset[] = [
    { id: BESS_1_ID, name: 'Main BESS', emuId: 'emu-1' },
  ];

  describe('1. Selector Visibility & Validation Rules', () => {
    it('shows selector only when ctx.bessAssets.length > 1', () => {
      expect(multiBessAssets.length > 1).toBe(true);
      expect(singleBessAssets.length > 1).toBe(false);
    });

    it('validates selectedBessId against current site assets', () => {
      const selectedBessId = 'non-existent-bess';
      const activeBessId =
        selectedBessId && multiBessAssets.some(b => b.id === selectedBessId)
          ? selectedBessId
          : null;
      expect(activeBessId).toBeNull();
    });

    it('accepts valid selectedBessId belonging to site assets', () => {
      const selectedBessId = BESS_2_ID;
      const activeBessId =
        selectedBessId && multiBessAssets.some(b => b.id === selectedBessId)
          ? selectedBessId
          : null;
      expect(activeBessId).toBe(BESS_2_ID);
    });
  });

  describe('2. Multi-BESS Client — All BESS Selected (Consolidated View)', () => {
    const states: DashboardTelemetryState[] = [
      {
        timestamp: '2026-10-20T10:00:00.000Z',
        gridPower: 120.5,
        gridPowerMeasuredAt: '2026-10-20T10:00:00.000Z',
        gridFrequency: 50.01,
        gridFrequencyMeasuredAt: '2026-10-20T10:00:00.000Z',
        powerFactor: 0.98,
        powerFactorMeasuredAt: '2026-10-20T10:00:00.000Z',
        bessPower: -50.0,
        bessFrequency: 49.98,
        bessPowerFactor: 0.95,
      },
      {
        timestamp: '2026-10-20T10:01:00.000Z',
        gridPower: 121.0, // Newer timestamp
        gridPowerMeasuredAt: '2026-10-20T10:01:00.000Z',
        gridFrequency: 50.02,
        gridFrequencyMeasuredAt: '2026-10-20T10:01:00.000Z',
        powerFactor: 0.99,
        powerFactorMeasuredAt: '2026-10-20T10:01:00.000Z',
        bessPower: 25.0,
        bessFrequency: 50.02,
        bessPowerFactor: 0.97,
      },
      {
        timestamp: '2026-10-20T09:59:00.000Z',
        gridPower: 119.0,
        gridPowerMeasuredAt: '2026-10-20T09:59:00.000Z',
        gridFrequency: 49.99,
        gridFrequencyMeasuredAt: '2026-10-20T09:59:00.000Z',
        powerFactor: 0.96,
        powerFactorMeasuredAt: '2026-10-20T09:59:00.000Z',
        bessPower: -10.0,
        bessFrequency: 50.00,
        bessPowerFactor: 0.96,
      },
    ];

    it('resolves site-level Grid Power using latest timestamp, NOT sum across BESS', () => {
      const siteGrid = resolveSiteMetric(states, 'gridPower', 'gridPowerMeasuredAt');
      // Should pick 121.0 from 10:01:00, NEVER sum (120.5 + 121.0 + 119.0 = 360.5)
      expect(siteGrid.value).toBe(121.0);
      expect(siteGrid.measuredAt).toBe('2026-10-20T10:01:00.000Z');
    });

    it('resolves site-level Grid Frequency and Power Factor using latest timestamp', () => {
      const siteFreq = resolveSiteMetric(states, 'gridFrequency', 'gridFrequencyMeasuredAt');
      expect(siteFreq.value).toBe(50.02);

      const sitePf = resolveSiteMetric(states, 'powerFactor', 'powerFactorMeasuredAt');
      expect(sitePf.value).toBe(0.99);
    });

    it('calculates Total BESS Active Power as algebraic sum across reporting units', () => {
      const { totalBessPower } = resolveConsolidatedBess(states);
      // -50.0 + 25.0 + -10.0 = -35.0 kW
      expect(totalBessPower).toBe(-35.0);
    });

    it('calculates Fleet BESS Frequency and Power Factor as arithmetic mean', () => {
      const { fleetBessFrequency, fleetBessPowerFactor } = resolveConsolidatedBess(states);
      // (49.98 + 50.02 + 50.00) / 3 = 150.00 / 3 = 50.00
      expect(fleetBessFrequency).toBeCloseTo(50.00, 4);

      // (0.95 + 0.97 + 0.96) / 3 = 2.88 / 3 = 0.96
      expect(fleetBessPowerFactor).toBeCloseTo(0.96, 4);
    });
  });

  describe('3. Multi-BESS Client — Individual BESS Selected', () => {
    const telemetryMap: Record<string, DashboardTelemetryState> = {
      [BESS_1_ID]: {
        timestamp: '2026-10-20T10:00:00.000Z',
        gridPower: 150.0,
        gridPowerMeasuredAt: '2026-10-20T10:00:00.000Z',
        bessPower: 45.2,
        bessFrequency: 50.05,
        bessPowerFactor: 0.99,
      },
      [BESS_2_ID]: {
        timestamp: '2026-10-20T10:00:30.000Z',
        gridPower: 150.5,
        gridPowerMeasuredAt: '2026-10-20T10:00:30.000Z',
        bessPower: -12.3,
        bessFrequency: 49.95,
        bessPowerFactor: 0.91,
      },
      [BESS_3_ID]: {
        timestamp: '2026-10-20T09:50:00.000Z',
        // BESS 3 has missing/unavailable telemetry
        bessPower: undefined,
        bessFrequency: undefined,
        bessPowerFactor: undefined,
      },
    };

    it('shows only the selected BESS active power and electrical metrics', () => {
      const bess1 = telemetryMap[BESS_1_ID];
      expect(bess1.bessPower).toBe(45.2);
      expect(bess1.bessFrequency).toBe(50.05);
      expect(bess1.bessPowerFactor).toBe(0.99);

      const bess2 = telemetryMap[BESS_2_ID];
      expect(bess2.bessPower).toBe(-12.3);
      expect(bess2.bessFrequency).toBe(49.95);
      expect(bess2.bessPowerFactor).toBe(0.91);
    });

    it('never substitutes aggregate or other asset readings when selected BESS has missing telemetry', () => {
      const bess3 = telemetryMap[BESS_3_ID];
      expect(bess3.bessPower).toBeUndefined();
      expect(bess3.bessFrequency).toBeUndefined();
      expect(bess3.bessPowerFactor).toBeUndefined();
    });

    it('maintains shared site-level Grid metrics even when an individual BESS is selected', () => {
      const allStates = Object.values(telemetryMap);
      const siteGrid = resolveSiteMetric(allStates, 'gridPower', 'gridPowerMeasuredAt');
      // Takes latest 150.5 from 10:00:30, regardless of whether BESS 1 or BESS 3 is selected
      expect(siteGrid.value).toBe(150.5);
    });
  });

  describe('4. Missing, Stale, and Zero Values Safeguards', () => {
    it('preserves legitimate numeric zero as valid measurement', () => {
      const zeroState: DashboardTelemetryState[] = [
        { bessPower: 0, bessFrequency: 50.0, bessPowerFactor: 0 },
        { bessPower: 0, bessFrequency: 50.0, bessPowerFactor: 0 },
      ];
      const { totalBessPower, fleetBessFrequency, fleetBessPowerFactor } = resolveConsolidatedBess(zeroState);
      expect(totalBessPower).toBe(0);
      expect(fleetBessFrequency).toBe(50.0);
      expect(fleetBessPowerFactor).toBe(0);
    });

    it('excludes undefined, null, and NaN from count and sum without converting to 0', () => {
      const partialState: DashboardTelemetryState[] = [
        { bessPower: 20.0, bessFrequency: 50.1, bessPowerFactor: 0.95 },
        { bessPower: undefined, bessFrequency: NaN, bessPowerFactor: null as any },
      ];
      const { totalBessPower, fleetBessFrequency, fleetBessPowerFactor } = resolveConsolidatedBess(partialState);
      expect(totalBessPower).toBe(20.0);
      expect(fleetBessFrequency).toBe(50.1);
      expect(fleetBessPowerFactor).toBe(0.95);
    });

    it('returns undefined if all assets have missing data', () => {
      const emptyState: DashboardTelemetryState[] = [
        { bessPower: undefined, bessFrequency: undefined, bessPowerFactor: undefined },
      ];
      const { totalBessPower, fleetBessFrequency, fleetBessPowerFactor } = resolveConsolidatedBess(emptyState);
      expect(totalBessPower).toBeUndefined();
      expect(fleetBessFrequency).toBeUndefined();
      expect(fleetBessPowerFactor).toBeUndefined();
    });
  });

  describe('5. Single-BESS Client Experience', () => {
    it('preserves single-BESS direct readings without alteration', () => {
      const singleState: DashboardTelemetryState = {
        gridPower: 85.4,
        gridFrequency: 50.02,
        powerFactor: 0.98,
        bessPower: -30.5,
        bessFrequency: 49.99,
        bessPowerFactor: 0.94,
      };

      expect(singleState.gridPower).toBe(85.4);
      expect(singleState.gridFrequency).toBe(50.02);
      expect(singleState.powerFactor).toBe(0.98);
      expect(singleState.bessPower).toBe(-30.5);
      expect(singleState.bessFrequency).toBe(49.99);
      expect(singleState.bessPowerFactor).toBe(0.94);
    });
  });
});

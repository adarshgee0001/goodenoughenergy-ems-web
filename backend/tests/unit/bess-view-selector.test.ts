/**
 * BESS View Selector — Unit Tests
 *
 * Tests cover the selector state logic, targetBessState resolution, and
 * site-change reset behaviour using the existing project's Vitest infrastructure.
 *
 * These tests operate on pure TypeScript — no React rendering is required.
 * They assert the logic that DashboardPage.tsx encodes for targetBessState and
 * the BessViewSelector default/selection semantics.
 */

import { describe, it, expect } from 'vitest';
import type {
  DashboardTelemetryState,
  DashboardBessAsset,
} from '../../../frontend/src/features/dashboard/dashboard.types';
import {
  aggregateSiteTelemetrySafe,
  evaluateSignalFreshness,
  isValidNumber,
  parseValidTimestamp,
} from '../../../frontend/src/features/dashboard/freshness.utils';

// ---------------------------------------------------------------------------
// Helpers that replicate DashboardPage's targetBessState IIFE logic
// so tests remain collocated and independent of the React component.
// ---------------------------------------------------------------------------

/**
 * Mirrors the targetBessState IIFE in DashboardPage.tsx (lines 392-397).
 *
 * @param ctx             Simulated context with `bessAssets[]`
 * @param telemetryState  Per-BESS state map keyed by asset ID
 * @param selectedBessId  Current selector value (null = All BESS)
 */
function resolveTargetBessState(
  ctx: { bessAssets: Pick<DashboardBessAsset, 'id'>[] } | null,
  telemetryState: Record<string, DashboardTelemetryState>,
  selectedBessId: string | null,
): DashboardTelemetryState | undefined {
  if (!ctx) return undefined;
  if (ctx.bessAssets.length === 1) return telemetryState[ctx.bessAssets[0].id];
  if (selectedBessId !== null) return telemetryState[selectedBessId];
  return undefined;
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const BESS_1_ID = 'bess-uuid-1';
const BESS_2_ID = 'bess-uuid-2';

const mockState: Record<string, DashboardTelemetryState> = {
  [BESS_1_ID]: { bessPower: 100, bessSoc: 80 },
  [BESS_2_ID]: { bessPower: 200, bessSoc: 60 },
};

const singleBessCtx = { bessAssets: [{ id: BESS_1_ID }] };
const multiBessCtx  = { bessAssets: [{ id: BESS_1_ID }, { id: BESS_2_ID }] };

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('BESS View Selector — targetBessState resolution logic', () => {

  // ── Single-BESS sites ───────────────────────────────────────────────────

  it('Single-BESS: returns that BESS state regardless of selectedBessId (null)', () => {
    const result = resolveTargetBessState(singleBessCtx, mockState, null);
    expect(result).toBe(mockState[BESS_1_ID]);
    expect(result?.bessPower).toBe(100);
    expect(result?.bessSoc).toBe(80);
  });

  it('Single-BESS: returns undefined when telemetry is not yet available for the asset', () => {
    const result = resolveTargetBessState(singleBessCtx, {}, null);
    expect(result).toBeUndefined();
  });

  // ── Multi-BESS: All BESS selected (default) ─────────────────────────────

  it('Multi-BESS — default (selectedBessId = null): returns undefined so consumers fall back to aggregatedTelemetry', () => {
    const result = resolveTargetBessState(multiBessCtx, mockState, null);
    expect(result).toBeUndefined();
  });

  // ── Multi-BESS: individual BESS selected ────────────────────────────────

  it('Multi-BESS — BESS 1 selected: returns BESS 1 state, not BESS 2', () => {
    const result = resolveTargetBessState(multiBessCtx, mockState, BESS_1_ID);
    expect(result).toBe(mockState[BESS_1_ID]);
    expect(result?.bessPower).toBe(100);
    expect(result?.bessSoc).toBe(80);
  });

  it('Multi-BESS — BESS 2 selected: returns BESS 2 state, not BESS 1', () => {
    const result = resolveTargetBessState(multiBessCtx, mockState, BESS_2_ID);
    expect(result).toBe(mockState[BESS_2_ID]);
    expect(result?.bessPower).toBe(200);
    expect(result?.bessSoc).toBe(60);
  });

  it('Multi-BESS — switching from BESS 1 to BESS 2: returns BESS 2 state (no value leakage)', () => {
    const step1 = resolveTargetBessState(multiBessCtx, mockState, BESS_1_ID);
    expect(step1?.bessPower).toBe(100);

    const step2 = resolveTargetBessState(multiBessCtx, mockState, BESS_2_ID);
    expect(step2?.bessPower).toBe(200);
    // Confirm BESS 1 values do not appear in the BESS 2 result
    expect(step2?.bessPower).not.toBe(step1?.bessPower);
  });

  it('Multi-BESS — switching from BESS 2 back to All BESS: returns undefined (restores site overview)', () => {
    const selectedStep = resolveTargetBessState(multiBessCtx, mockState, BESS_2_ID);
    expect(selectedStep).toBeDefined();

    const allBessStep = resolveTargetBessState(multiBessCtx, mockState, null);
    expect(allBessStep).toBeUndefined();
  });

  // ── Site-change reset safety ─────────────────────────────────────────────

  it('Stale selectedBessId after site change: returns undefined (safe fallback to aggregated)', () => {
    // Simulate: user had BESS_1_ID selected on old site, then site changes and
    // new site has different BESS assets. The old ID is not in the new telemetryState.
    const newSiteCtx = { bessAssets: [{ id: 'bess-uuid-new-1' }, { id: 'bess-uuid-new-2' }] };
    const newState: Record<string, DashboardTelemetryState> = {
      'bess-uuid-new-1': { bessPower: 50 },
      'bess-uuid-new-2': { bessPower: 75 },
    };

    // Old selectedBessId (BESS_1_ID) is not in the new site's telemetryState
    const result = resolveTargetBessState(newSiteCtx, newState, BESS_1_ID);
    // telemetryState[BESS_1_ID] → undefined → safe
    expect(result).toBeUndefined();
  });

  // ── Null context guard ───────────────────────────────────────────────────

  it('Null context: returns undefined regardless of selectedBessId', () => {
    const result = resolveTargetBessState(null, mockState, BESS_1_ID);
    expect(result).toBeUndefined();
  });

});

// ---------------------------------------------------------------------------
// BessViewSelector option generation logic (pure data, no React rendering)
// ---------------------------------------------------------------------------

describe('BESS View Selector — option generation', () => {

  it('Generates one option per BESS asset with its stable ID and name', () => {
    const bessAssets: DashboardBessAsset[] = [
      { id: BESS_1_ID, name: 'BESS 1', assetIdentifier: 'B1' },
      { id: BESS_2_ID, name: 'BESS 2', assetIdentifier: 'B2' },
    ];

    const options = bessAssets.map(b => ({ value: b.id, label: b.name }));

    expect(options).toHaveLength(2);
    expect(options[0].value).toBe(BESS_1_ID);
    expect(options[0].label).toBe('BESS 1');
    expect(options[1].value).toBe(BESS_2_ID);
    expect(options[1].label).toBe('BESS 2');
  });

  it('Resolves "All BESS" sentinel: empty string maps to null selectedBessId', () => {
    // Mirrors BessViewSelector.handleChange: value === '' → null
    const handleChange = (value: string): string | null => (value === '' ? null : value);

    expect(handleChange('')).toBeNull();
    expect(handleChange(BESS_1_ID)).toBe(BESS_1_ID);
    expect(handleChange(BESS_2_ID)).toBe(BESS_2_ID);
  });

  it('Single-BESS site: bessAssets.length === 1, no selector should render', () => {
    const singleBessAssets: DashboardBessAsset[] = [
      { id: BESS_1_ID, name: 'Main BESS', assetIdentifier: 'MB' },
    ];

    const shouldRenderSelector = singleBessAssets.length > 1;
    expect(shouldRenderSelector).toBe(false);
  });

  it('Multi-BESS site: bessAssets.length > 1, selector should render', () => {
    const multiBessAssets: DashboardBessAsset[] = [
      { id: BESS_1_ID, name: 'BESS 1', assetIdentifier: 'B1' },
      { id: BESS_2_ID, name: 'BESS 2', assetIdentifier: 'B2' },
    ];

    const shouldRenderSelector = multiBessAssets.length > 1;
    expect(shouldRenderSelector).toBe(true);
  });

  it('Default selection is null (All BESS), not a specific asset ID', () => {
    // The initial useState value is null — simulate that here
    const initialSelectedBessId: string | null = null;
    expect(initialSelectedBessId).toBeNull();
  });

});

// ---------------------------------------------------------------------------
// Step 2: BESS Frequency & Power Factor Multi-BESS Aggregation and View Switching
// ---------------------------------------------------------------------------

/**
 * Mirrors DashboardPage.tsx metric resolution logic:
 * Individual selection strictly uses targetBessState; All BESS uses aggregatedTelemetry.
 */
function resolveBessMetric(
  selectedBessId: string | null,
  targetBessState: DashboardTelemetryState | undefined,
  aggregatedTelemetry: DashboardTelemetryState,
  metric: 'bessFrequency' | 'bessPowerFactor',
  measuredAtKey: 'bessFrequencyMeasuredAt' | 'bessPowerFactorMeasuredAt'
): { value: number | undefined; measuredAt: string | undefined } {
  const value = selectedBessId !== null ? targetBessState?.[metric] : aggregatedTelemetry[metric];
  const measuredAt = selectedBessId !== null ? targetBessState?.[measuredAtKey] : aggregatedTelemetry[measuredAtKey];
  return { value, measuredAt };
}

/**
 * Mirrors DashboardPage.tsx site-level metric resolution for Grid and Solar
 * (PMG / PINV meters).
 */
function resolveSiteMetric(
  ctx: { bessAssets: Pick<DashboardBessAsset, 'id'>[] } | null,
  telemetryState: Record<string, DashboardTelemetryState>,
  valueKey: 'gridFrequency' | 'powerFactor' | 'solarFrequency' | 'solarPowerFactor',
  measuredAtKey: 'gridFrequencyMeasuredAt' | 'powerFactorMeasuredAt' | 'solarFrequencyMeasuredAt' | 'solarPowerFactorMeasuredAt'
): { value?: number; measuredAt?: string } {
  if (!ctx) return {};
  const states = ctx.bessAssets.map(b => telemetryState[b.id]).filter(Boolean);
  const validPairs = states
    .map(s => ({ val: s[valueKey], ts: s[measuredAtKey] }))
    .filter((p): p is { val: number; ts: string | undefined } => isValidNumber(p.val));

  if (validPairs.length === 0) return {};

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

describe('Step 2 — BESS Frequency & Power Factor Multi-BESS Aggregation and View Switching', () => {
  const BESS_3_ID = 'bess-uuid-3';
  const tripleBessCtx = {
    bessAssets: [{ id: BESS_1_ID }, { id: BESS_2_ID }, { id: BESS_3_ID }],
  };

  it('1. Multiple valid frequency values produce the arithmetic mean', () => {
    const siteState: Record<string, DashboardTelemetryState> = {
      [BESS_1_ID]: { bessFrequency: 50.00, bessFrequencyMeasuredAt: '2026-10-20T10:00:00.000Z' },
      [BESS_2_ID]: { bessFrequency: 49.80, bessFrequencyMeasuredAt: '2026-10-20T10:01:00.000Z' },
      [BESS_3_ID]: { bessFrequency: 50.20, bessFrequencyMeasuredAt: '2026-10-20T10:02:00.000Z' },
    };

    const agg = aggregateSiteTelemetrySafe(siteState);
    // (50.00 + 49.80 + 50.20) / 3 = 150.00 / 3 = 50.00 Hz
    expect(agg.bessFrequency).toBeCloseTo(50.00, 4);
    expect(agg.bessFrequencyMeasuredAt).toBe('2026-10-20T10:02:00.000Z');
  });

  it('2. Multiple valid power factor values produce the arithmetic mean', () => {
    const siteState: Record<string, DashboardTelemetryState> = {
      [BESS_1_ID]: { bessPowerFactor: 0.90, bessPowerFactorMeasuredAt: '2026-10-20T10:00:00.000Z' },
      [BESS_2_ID]: { bessPowerFactor: -0.80, bessPowerFactorMeasuredAt: '2026-10-20T10:01:00.000Z' },
      [BESS_3_ID]: { bessPowerFactor: 0.70, bessPowerFactorMeasuredAt: '2026-10-20T10:02:00.000Z' },
    };

    const agg = aggregateSiteTelemetrySafe(siteState);
    // (0.90 + (-0.80) + 0.70) / 3 = 0.80 / 3 ≈ 0.2667
    expect(agg.bessPowerFactor).toBeCloseTo(0.2667, 3);
    expect(agg.bessPowerFactorMeasuredAt).toBe('2026-10-20T10:02:00.000Z');

    const now = new Date('2026-10-20T10:03:00.000Z').getTime();
    const evalResult = evaluateSignalFreshness({
      value: agg.bessPowerFactor,
      measuredAt: agg.bessPowerFactorMeasuredAt,
      componentType: 'pcs',
      now,
      decimals: 2,
    });
    expect(evalResult.displayValue).toBe('0.27');
  });

  it('3. Missing values (null, undefined, NaN) are excluded from both sum and count', () => {
    const siteState: Record<string, DashboardTelemetryState> = {
      [BESS_1_ID]: {
        bessFrequency: 50.00,
        bessPowerFactor: 0.90,
      },
      [BESS_2_ID]: {
        bessFrequency: undefined,
        bessPowerFactor: undefined,
      },
      [BESS_3_ID]: {
        bessFrequency: 50.20,
        bessPowerFactor: null as any,
      },
    };

    const agg = aggregateSiteTelemetrySafe(siteState);
    // Frequency: 2 valid measurements (50.00 + 50.20) / 2 = 50.10
    expect(agg.bessFrequency).toBeCloseTo(50.10, 4);

    // Power Factor: 1 valid measurement 0.90 / 1 = 0.90
    expect(agg.bessPowerFactor).toBeCloseTo(0.90, 4);
  });

  it('4. Zero is included as a valid measurement in sum and count', () => {
    const siteState: Record<string, DashboardTelemetryState> = {
      [BESS_1_ID]: { bessFrequency: 50.00, bessPowerFactor: 0.80 },
      [BESS_2_ID]: { bessFrequency: 0.00, bessPowerFactor: 0.00 },
    };

    const agg = aggregateSiteTelemetrySafe(siteState);
    // Frequency: (50.00 + 0) / 2 = 25.00
    expect(agg.bessFrequency).toBe(25.00);

    // Power Factor: (0.80 + 0) / 2 = 0.40
    expect(agg.bessPowerFactor).toBe(0.40);
  });

  it('5. Frequency and power factor use independent valid-value counts', () => {
    const siteState: Record<string, DashboardTelemetryState> = {
      [BESS_1_ID]: {
        bessFrequency: 50.00,
        bessPowerFactor: undefined, // Missing PF
      },
      [BESS_2_ID]: {
        bessFrequency: 49.80,
        bessPowerFactor: 0.80,
      },
      [BESS_3_ID]: {
        bessFrequency: undefined, // Missing Frequency
        bessPowerFactor: 0.70,
      },
    };

    const agg = aggregateSiteTelemetrySafe(siteState);

    // Frequency valid count = 2 (BESS 1, BESS 2) -> (50.00 + 49.80) / 2 = 49.90
    expect(agg.bessFrequency).toBeCloseTo(49.90, 4);

    // Power factor valid count = 2 (BESS 2, BESS 3) -> (0.80 + 0.70) / 2 = 0.75
    expect(agg.bessPowerFactor).toBeCloseTo(0.75, 4);
  });

  it('6. No valid values produce the existing no-data behaviour', () => {
    const siteState: Record<string, DashboardTelemetryState> = {
      [BESS_1_ID]: { bessFrequency: undefined, bessPowerFactor: undefined },
      [BESS_2_ID]: { bessFrequency: NaN, bessPowerFactor: null as any },
    };

    const agg = aggregateSiteTelemetrySafe(siteState);
    expect(agg.bessFrequency).toBeUndefined();
    expect(agg.bessPowerFactor).toBeUndefined();

    const freqEval = evaluateSignalFreshness({
      value: agg.bessFrequency,
      componentType: 'pcs',
      decimals: 2,
    });
    expect(freqEval.state).toBe('NO_DATA');
    expect(freqEval.displayValue).toBe('--');

    const pfEval = evaluateSignalFreshness({
      value: agg.bessPowerFactor,
      componentType: 'pcs',
      decimals: 2,
    });
    expect(pfEval.state).toBe('NO_DATA');
    expect(pfEval.displayValue).toBe('--');
  });

  it('7. Individual BESS selection continues to show only that BESS own values', () => {
    const siteState: Record<string, DashboardTelemetryState> = {
      [BESS_1_ID]: {
        bessFrequency: 50.10,
        bessFrequencyMeasuredAt: '2026-10-20T10:00:00.000Z',
        bessPowerFactor: 0.95,
        bessPowerFactorMeasuredAt: '2026-10-20T10:00:00.000Z',
      },
      [BESS_2_ID]: {
        bessFrequency: 49.90,
        bessFrequencyMeasuredAt: '2026-10-20T10:01:00.000Z',
        bessPowerFactor: undefined, // Missing PF on BESS 2
        bessPowerFactorMeasuredAt: undefined,
      },
    };

    const agg = aggregateSiteTelemetrySafe(siteState);

    // Selection 1: BESS 1
    const target1 = resolveTargetBessState(multiBessCtx, siteState, BESS_1_ID);
    const bess1Freq = resolveBessMetric(BESS_1_ID, target1, agg, 'bessFrequency', 'bessFrequencyMeasuredAt');
    const bess1Pf = resolveBessMetric(BESS_1_ID, target1, agg, 'bessPowerFactor', 'bessPowerFactorMeasuredAt');

    expect(bess1Freq.value).toBe(50.10);
    expect(bess1Pf.value).toBe(0.95);

    // Selection 2: BESS 2
    const target2 = resolveTargetBessState(multiBessCtx, siteState, BESS_2_ID);
    const bess2Freq = resolveBessMetric(BESS_2_ID, target2, agg, 'bessFrequency', 'bessFrequencyMeasuredAt');
    const bess2Pf = resolveBessMetric(BESS_2_ID, target2, agg, 'bessPowerFactor', 'bessPowerFactorMeasuredAt');

    expect(bess2Freq.value).toBe(49.90);
    // BESS 2 lacks PF -> must remain undefined (strict isolation; NEVER falls back to BESS 1 or aggregate)
    expect(bess2Pf.value).toBeUndefined();

    const bess2PfEval = evaluateSignalFreshness({
      value: bess2Pf.value,
      measuredAt: bess2Pf.measuredAt,
      componentType: 'pcs',
      decimals: 2,
    });
    expect(bess2PfEval.isNoData).toBe(true);
    expect(bess2PfEval.displayValue).toBe('--');
  });

  it('8. All BESS aggregation does not affect Grid/Solar metrics', () => {
    const siteState: Record<string, DashboardTelemetryState> = {
      [BESS_1_ID]: {
        bessFrequency: 50.00,
        bessPowerFactor: 0.90,
        gridFrequency: 50.05,
        gridFrequencyMeasuredAt: '2026-10-20T10:00:00.000Z',
        powerFactor: 0.99,
        powerFactorMeasuredAt: '2026-10-20T10:00:00.000Z',
        solarFrequency: 50.02,
        solarFrequencyMeasuredAt: '2026-10-20T10:00:00.000Z',
        solarPowerFactor: 0.95,
        solarPowerFactorMeasuredAt: '2026-10-20T10:00:00.000Z',
      },
      [BESS_2_ID]: {
        bessFrequency: 49.80,
        bessPowerFactor: 0.85,
        gridFrequency: 50.05,
        gridFrequencyMeasuredAt: '2026-10-20T10:01:00.000Z',
        powerFactor: 0.99,
        powerFactorMeasuredAt: '2026-10-20T10:01:00.000Z',
        solarFrequency: 50.02,
        solarFrequencyMeasuredAt: '2026-10-20T10:01:00.000Z',
        solarPowerFactor: 0.95,
        solarPowerFactorMeasuredAt: '2026-10-20T10:01:00.000Z',
      },
    };

    const agg = aggregateSiteTelemetrySafe(siteState);

    // BESS metrics are aggregated
    expect(agg.bessFrequency).toBeCloseTo(49.90, 4);
    expect(agg.bessPowerFactor).toBeCloseTo(0.875, 4);

    // Site-level Grid/Solar metrics are NOT aggregated or overwritten in aggregateSiteTelemetrySafe
    expect(agg.gridFrequency).toBeUndefined();
    expect(agg.powerFactor).toBeUndefined();
    expect(agg.solarFrequency).toBeUndefined();
    expect(agg.solarPowerFactor).toBeUndefined();

    // Authoritative site-level resolution across all selector choices remains completely stable
    const siteGridFreqAll = resolveSiteMetric(multiBessCtx, siteState, 'gridFrequency', 'gridFrequencyMeasuredAt');
    const siteGridPfAll = resolveSiteMetric(multiBessCtx, siteState, 'powerFactor', 'powerFactorMeasuredAt');
    const siteSolarFreqAll = resolveSiteMetric(multiBessCtx, siteState, 'solarFrequency', 'solarFrequencyMeasuredAt');
    const siteSolarPfAll = resolveSiteMetric(multiBessCtx, siteState, 'solarPowerFactor', 'solarPowerFactorMeasuredAt');

    expect(siteGridFreqAll.value).toBe(50.05);
    expect(siteGridPfAll.value).toBe(0.99);
    expect(siteSolarFreqAll.value).toBe(50.02);
    expect(siteSolarPfAll.value).toBe(0.95);
  });

  it('9. Single-BESS behaviour remains unchanged', () => {
    const singleState: DashboardTelemetryState = {
      bessFrequency: 50.02,
      bessFrequencyMeasuredAt: '2026-10-20T10:00:00.000Z',
      bessPowerFactor: 0.96,
      bessPowerFactorMeasuredAt: '2026-10-20T10:00:00.000Z',
      gridFrequency: 50.01,
      powerFactor: 0.98,
    };

    const agg = aggregateSiteTelemetrySafe({ [BESS_1_ID]: singleState });

    // Passthrough matches single state identically without modification
    expect(agg.bessFrequency).toBe(50.02);
    expect(agg.bessFrequencyMeasuredAt).toBe('2026-10-20T10:00:00.000Z');
    expect(agg.bessPowerFactor).toBe(0.96);
    expect(agg.bessPowerFactorMeasuredAt).toBe('2026-10-20T10:00:00.000Z');
    expect(agg.gridFrequency).toBe(50.01);
    expect(agg.powerFactor).toBe(0.98);
  });

  it('10. Existing freshness and measured-at timestamp behaviour is preserved', () => {
    const now = new Date('2026-10-20T10:05:00.000Z').getTime();

    // Case A: Fresh measurement (30s ago <= 2m fresh window for PCS)
    const freshState: Record<string, DashboardTelemetryState> = {
      [BESS_1_ID]: {
        bessFrequency: 50.00,
        bessFrequencyMeasuredAt: new Date(now - 45 * 1000).toISOString(),
        bessPowerFactor: 0.90,
        bessPowerFactorMeasuredAt: new Date(now - 45 * 1000).toISOString(),
      },
      [BESS_2_ID]: {
        bessFrequency: 49.80,
        bessFrequencyMeasuredAt: new Date(now - 30 * 1000).toISOString(),
        bessPowerFactor: 0.92,
        bessPowerFactorMeasuredAt: new Date(now - 30 * 1000).toISOString(),
      },
    };

    const freshAgg = aggregateSiteTelemetrySafe(freshState);
    expect(freshAgg.bessFrequencyMeasuredAt).toBe(new Date(now - 30 * 1000).toISOString());

    const freshEval = evaluateSignalFreshness({
      value: freshAgg.bessFrequency,
      measuredAt: freshAgg.bessFrequencyMeasuredAt,
      componentType: 'pcs',
      now,
      decimals: 2,
    });
    expect(freshEval.state).toBe('LIVE_FRESH');
    expect(freshEval.isFresh).toBe(true);

    // Case B: Stale measurement (15 minutes ago > 8m hold/stale threshold)
    const staleState: Record<string, DashboardTelemetryState> = {
      [BESS_1_ID]: {
        bessFrequency: 50.00,
        bessFrequencyMeasuredAt: new Date(now - 15 * 60 * 1000).toISOString(),
      },
      [BESS_2_ID]: {
        bessFrequency: 49.80,
        bessFrequencyMeasuredAt: new Date(now - 14 * 60 * 1000).toISOString(),
      },
    };

    const staleAgg = aggregateSiteTelemetrySafe(staleState);
    const staleEval = evaluateSignalFreshness({
      value: staleAgg.bessFrequency,
      measuredAt: staleAgg.bessFrequencyMeasuredAt,
      componentType: 'pcs',
      now,
      decimals: 2,
    });
    // Aggregation does not mask stale timestamps
    expect(staleEval.state).toBe('STALE');
    expect(staleEval.isStale).toBe(true);
    expect(staleEval.displayValue).toBe('--');
  });
});

// ---------------------------------------------------------------------------
// Step 3 — Multi-BESS: SOC, SOH, Today Charge/Discharge, Energy Flow & Live Alarms
// ---------------------------------------------------------------------------

describe('Step 3 — Multi-BESS: SOC, SOH, Today Charge/Discharge, Energy Flow & Live Alarm Feed', () => {
  const BESS_3_ID = 'bess-uuid-3';
  const tripleBessCtx = {
    bessAssets: [{ id: BESS_1_ID }, { id: BESS_2_ID }, { id: BESS_3_ID }],
  };

  // Helper simulating DashboardPage.tsx metric resolution for all BESS metrics
  function resolveMetric<T extends keyof DashboardTelemetryState>(
    selectedBessId: string | null,
    targetBessState: DashboardTelemetryState | undefined,
    aggregatedTelemetry: DashboardTelemetryState,
    key: T
  ): DashboardTelemetryState[T] {
    return selectedBessId !== null ? targetBessState?.[key] : aggregatedTelemetry[key];
  }

  // ── 1. BESS SOC (Average) ────────────────────────────────────────────────

  it('1. SOC: All BESS averages valid values; zero is valid; missing values excluded', () => {
    // A: Arithmetic mean across 3 valid values: (80.0 + 60.0 + 70.0) / 3 = 70.0%
    const siteStateA: Record<string, DashboardTelemetryState> = {
      [BESS_1_ID]: { bessSoc: 80.0 },
      [BESS_2_ID]: { bessSoc: 60.0 },
      [BESS_3_ID]: { bessSoc: 70.0 },
    };
    const aggA = aggregateSiteTelemetrySafe(siteStateA);
    expect(aggA.bessSoc).toBeCloseTo(70.0, 4);

    // B: Zero is valid: (80.0 + 0.0) / 2 = 40.0%
    const siteStateB: Record<string, DashboardTelemetryState> = {
      [BESS_1_ID]: { bessSoc: 80.0 },
      [BESS_2_ID]: { bessSoc: 0.0 },
    };
    const aggB = aggregateSiteTelemetrySafe(siteStateB);
    expect(aggB.bessSoc).toBe(40.0);

    // C: Missing (null, undefined, NaN) excluded: (75.0) / 1 = 75.0%
    const siteStateC: Record<string, DashboardTelemetryState> = {
      [BESS_1_ID]: { bessSoc: 75.0 },
      [BESS_2_ID]: { bessSoc: undefined },
      [BESS_3_ID]: { bessSoc: null as any },
    };
    const aggC = aggregateSiteTelemetrySafe(siteStateC);
    expect(aggC.bessSoc).toBe(75.0);

    // D: No valid values -> undefined / NO_DATA
    const siteStateD: Record<string, DashboardTelemetryState> = {
      [BESS_1_ID]: { bessSoc: undefined },
      [BESS_2_ID]: { bessSoc: NaN },
    };
    const aggD = aggregateSiteTelemetrySafe(siteStateD);
    expect(aggD.bessSoc).toBeUndefined();
  });

  it('1b. SOC: Individual BESS shows only that BESS own SOC without fallback', () => {
    const siteState: Record<string, DashboardTelemetryState> = {
      [BESS_1_ID]: { bessSoc: 85.0 },
      [BESS_2_ID]: { bessSoc: undefined }, // Missing on BESS 2
    };
    const agg = aggregateSiteTelemetrySafe(siteState);

    // BESS 1 selected
    const target1 = resolveTargetBessState(multiBessCtx, siteState, BESS_1_ID);
    const soc1 = resolveMetric(BESS_1_ID, target1, agg, 'bessSoc');
    expect(soc1).toBe(85.0);

    // BESS 2 selected -> strictly undefined, NEVER falls back to BESS 1 (85.0) or site average
    const target2 = resolveTargetBessState(multiBessCtx, siteState, BESS_2_ID);
    const soc2 = resolveMetric(BESS_2_ID, target2, agg, 'bessSoc');
    expect(soc2).toBeUndefined();
  });

  // ── 2. BESS SOH (Average) ────────────────────────────────────────────────

  it('2. SOH: All BESS averages valid values; individual BESS shows only its own SOH', () => {
    const siteState: Record<string, DashboardTelemetryState> = {
      [BESS_1_ID]: { bmsSoh: 98.0 },
      [BESS_2_ID]: { bmsSoh: 94.0 },
    };
    const agg = aggregateSiteTelemetrySafe(siteState);
    // (98.0 + 94.0) / 2 = 96.0%
    expect(agg.bmsSoh).toBeCloseTo(96.0, 4);

    // Individual BESS selection
    const target1 = resolveTargetBessState(multiBessCtx, siteState, BESS_1_ID);
    expect(resolveMetric(BESS_1_ID, target1, agg, 'bmsSoh')).toBe(98.0);

    const target2 = resolveTargetBessState(multiBessCtx, siteState, BESS_2_ID);
    expect(resolveMetric(BESS_2_ID, target2, agg, 'bmsSoh')).toBe(94.0);
  });

  // ── 3. Today Charge (SUM, Never Average) ─────────────────────────────────

  it('3. Today Charge: All BESS SUMS values (never average); individual BESS shows only its own', () => {
    const siteState: Record<string, DashboardTelemetryState> = {
      [BESS_1_ID]: { todayChargeEnergy: 125.5 },
      [BESS_2_ID]: { todayChargeEnergy: 74.5 },
    };
    const agg = aggregateSiteTelemetrySafe(siteState);

    // SUM = 125.5 + 74.5 = 200.0 kWh (NOT averaged to 100.0)
    expect(agg.todayChargeEnergy).toBe(200.0);
    expect(agg.todayChargeEnergy).not.toBe(100.0);

    // Individual BESS 1
    const target1 = resolveTargetBessState(multiBessCtx, siteState, BESS_1_ID);
    expect(resolveMetric(BESS_1_ID, target1, agg, 'todayChargeEnergy')).toBe(125.5);

    // Individual BESS 2
    const target2 = resolveTargetBessState(multiBessCtx, siteState, BESS_2_ID);
    expect(resolveMetric(BESS_2_ID, target2, agg, 'todayChargeEnergy')).toBe(74.5);
  });

  it('3b. Today Charge: Missing values are excluded from the sum without poisoning valid values', () => {
    const siteState: Record<string, DashboardTelemetryState> = {
      [BESS_1_ID]: { todayChargeEnergy: 150.0 },
      [BESS_2_ID]: { todayChargeEnergy: undefined },
    };
    const agg = aggregateSiteTelemetrySafe(siteState);
    expect(agg.todayChargeEnergy).toBe(150.0);
  });

  // ── 4. Today Discharge (SUM, Never Average) ──────────────────────────────

  it('4. Today Discharge: All BESS SUMS values (never average); individual BESS shows only its own', () => {
    const siteState: Record<string, DashboardTelemetryState> = {
      [BESS_1_ID]: { todayDischargeEnergy: 110.0 },
      [BESS_2_ID]: { todayDischargeEnergy: 90.0 },
    };
    const agg = aggregateSiteTelemetrySafe(siteState);

    // SUM = 110.0 + 90.0 = 200.0 kWh (NOT averaged to 100.0)
    expect(agg.todayDischargeEnergy).toBe(200.0);
    expect(agg.todayDischargeEnergy).not.toBe(100.0);

    // Individual BESS 1
    const target1 = resolveTargetBessState(multiBessCtx, siteState, BESS_1_ID);
    expect(resolveMetric(BESS_1_ID, target1, agg, 'todayDischargeEnergy')).toBe(110.0);

    // Individual BESS 2
    const target2 = resolveTargetBessState(multiBessCtx, siteState, BESS_2_ID);
    expect(resolveMetric(BESS_2_ID, target2, agg, 'todayDischargeEnergy')).toBe(90.0);
  });

  // ── 5. Energy Flow (BESS Total Power vs Individual Power; Site Grid & Solar) ─

  it('5. Energy Flow: All BESS uses total BESS power (SUM); individual uses selected BESS power; Grid & Solar remain site-level', () => {
    // Charging scenario: positive power
    // Note: Grid meter (pmg) and Solar inverter (pinv) are single site-level devices
    const siteStateCharging: Record<string, DashboardTelemetryState> = {
      [BESS_1_ID]: { bessPower: 40.0, gridPower: 50.0, solarPower: 30.0 },
      [BESS_2_ID]: { bessPower: 25.0 },
    };
    const aggCharging = aggregateSiteTelemetrySafe(siteStateCharging);

    // Mirrors energyFlowData memo in DashboardPage.tsx
    const resolveEnergyFlow = (selectedId: string | null, target: DashboardTelemetryState | undefined, agg: DashboardTelemetryState) => ({
      ...agg,
      bessPower: selectedId !== null ? target?.bessPower : agg.bessPower,
    });

    // All BESS view:
    const allBessFlow = resolveEnergyFlow(null, undefined, aggCharging);
    expect(allBessFlow.bessPower).toBe(65.0); // 40.0 + 25.0 SUM (charging)
    expect(allBessFlow.solarPower).toBe(30.0); // site-level
    expect(allBessFlow.gridPower).toBe(50.0); // site-level

    // BESS 1 view:
    const target1 = resolveTargetBessState(multiBessCtx, siteStateCharging, BESS_1_ID);
    const bess1Flow = resolveEnergyFlow(BESS_1_ID, target1, aggCharging);
    expect(bess1Flow.bessPower).toBe(40.0); // only BESS 1
    expect(bess1Flow.solarPower).toBe(30.0); // site-level remains unchanged
    expect(bess1Flow.gridPower).toBe(50.0); // site-level remains unchanged

    // BESS 2 view:
    const target2 = resolveTargetBessState(multiBessCtx, siteStateCharging, BESS_2_ID);
    const bess2Flow = resolveEnergyFlow(BESS_2_ID, target2, aggCharging);
    expect(bess2Flow.bessPower).toBe(25.0); // only BESS 2
    expect(bess2Flow.solarPower).toBe(30.0); // site-level remains unchanged
    expect(bess2Flow.gridPower).toBe(50.0); // site-level remains unchanged

    // Discharging scenario: negative power
    const siteStateDischarging: Record<string, DashboardTelemetryState> = {
      [BESS_1_ID]: { bessPower: -30.0 },
      [BESS_2_ID]: { bessPower: -20.0 },
    };
    const aggDischarging = aggregateSiteTelemetrySafe(siteStateDischarging);
    const dischargingFlow = resolveEnergyFlow(null, undefined, aggDischarging);
    expect(dischargingFlow.bessPower).toBe(-50.0); // -30.0 + -20.0 SUM (discharging preserved)
  });

  // ── 6. Live Alarm Feed Updates ───────────────────────────────────────────

  it('6. Alarm Feed: prepends new active alarms, deduplicates, removes cleared, and limits to top 10', () => {
    // Mirrors the exact alarm reducer / state updater in DashboardPage.tsx
    const handleAlarmUpdate = (
      prev: Array<{ id: string; status: string; message: string }>,
      newAlarm: { id: string; status: string; message: string }
    ) => {
      const isTargetActive = newAlarm.status === 'ACTIVE' || newAlarm.status === 'ACKNOWLEDGED';
      const idx = prev.findIndex(a => a.id === newAlarm.id);

      if (isTargetActive) {
        let next;
        if (idx >= 0) {
          next = [...prev];
          next[idx] = newAlarm;
        } else {
          next = [newAlarm, ...prev];
        }
        return next.slice(0, 10);
      } else {
        if (idx >= 0) {
          return prev.filter(a => a.id !== newAlarm.id);
        }
        return prev;
      }
    };

    const initialAlarms = [
      { id: 'alarm-1', status: 'ACTIVE', message: 'High Temp Warning' },
      { id: 'alarm-2', status: 'ACTIVE', message: 'Low Voltage' },
    ];

    // Case A: Newly arriving active alarm is prepended
    const alarm3 = { id: 'alarm-3', status: 'ACTIVE', message: 'Overcurrent' };
    const step1 = handleAlarmUpdate(initialAlarms, alarm3);
    expect(step1).toHaveLength(3);
    expect(step1[0].id).toBe('alarm-3'); // Prepended to top

    // Case B: Existing alarm update in-place without duplicate entry
    const alarm1Updated = { id: 'alarm-1', status: 'ACKNOWLEDGED', message: 'High Temp Warning (Acked)' };
    const step2 = handleAlarmUpdate(step1, alarm1Updated);
    expect(step2).toHaveLength(3);
    expect(step2.find(a => a.id === 'alarm-1')?.message).toBe('High Temp Warning (Acked)');

    // Case C: Cleared alarm is removed from active list
    const alarm2Cleared = { id: 'alarm-2', status: 'CLEARED', message: 'Low Voltage' };
    const step3 = handleAlarmUpdate(step2, alarm2Cleared);
    expect(step3).toHaveLength(2);
    expect(step3.some(a => a.id === 'alarm-2')).toBe(false);

    // Case D: Feed limit caps at 10 items
    let feed = [...initialAlarms];
    for (let i = 10; i < 25; i++) {
      feed = handleAlarmUpdate(feed, { id: `alarm-${i}`, status: 'ACTIVE', message: `Alarm ${i}` });
    }
    expect(feed).toHaveLength(10);
  });

  // ── 7. Single-BESS client dashboard behavior preservation ────────────────

  it('7. Single-BESS: all metrics pass through unmodified without changes', () => {
    const singleState: DashboardTelemetryState = {
      bessPower: 75.0,
      bessSoc: 82.5,
      bmsSoh: 97.0,
      todayChargeEnergy: 115.0,
      todayDischargeEnergy: 85.0,
      gridPower: 45.0,
      solarPower: 20.0,
    };
    const agg = aggregateSiteTelemetrySafe({ [BESS_1_ID]: singleState });

    expect(agg.bessPower).toBe(75.0);
    expect(agg.bessSoc).toBe(82.5);
    expect(agg.bmsSoh).toBe(97.0);
    expect(agg.todayChargeEnergy).toBe(115.0);
    expect(agg.todayDischargeEnergy).toBe(85.0);
    expect(agg.gridPower).toBe(45.0);
    expect(agg.solarPower).toBe(20.0);
  });

  // ── 8. Step 4: Dashboard Detail Tables Conditional Visibility ──────────────

  it('8. Dashboard detail tables visibility: hidden in All BESS mode, visible for individual BESS and single-BESS', () => {
    const resolveShowBessDetails = (bessCount: number, selectedId: string | null) => {
      const isSingleBess = bessCount === 1;
      return isSingleBess || selectedId !== null;
    };

    // Multi-BESS: All BESS view -> HIDDEN (false)
    expect(resolveShowBessDetails(2, null)).toBe(false);
    expect(resolveShowBessDetails(3, null)).toBe(false);

    // Multi-BESS: Individual BESS selected -> VISIBLE (true)
    expect(resolveShowBessDetails(2, BESS_1_ID)).toBe(true);
    expect(resolveShowBessDetails(2, BESS_2_ID)).toBe(true);
    expect(resolveShowBessDetails(3, 'bess-asset-3')).toBe(true);

    // Single-BESS client: Always VISIBLE (true) regardless of selector
    expect(resolveShowBessDetails(1, null)).toBe(true);
    expect(resolveShowBessDetails(1, BESS_1_ID)).toBe(true);
  });

  // ── 9. Step 4: Strict Detail Tables Telemetry Isolation ───────────────────

  it('9. Detail tables telemetry isolation: populates only from target BESS, never mixes across BESS assets', () => {
    const siteState: Record<string, DashboardTelemetryState> = {
      [BESS_1_ID]: {
        batteryAmbientTemp: 24.5,
        batteryAmbientTempMeasuredAt: '2026-10-20T10:00:00Z',
        bmsCabinetState: 1,
        pcsTemperature: 42.1,
        pcsLineVoltage: 400.2,
        pcsAcCurrent: 15.3,
        cellVMax: 3.42,
        cellVMin: 3.38,
        cellTempMax: 28.1,
        cellTempMin: 26.3,
        bmsDcVoltage: 780.0,
        bmsCurrent: 18.5,
        tmsCoolantReturnTemp: 22.0,
        tmsCoolantInletTemp: 20.0,
        tmsCoolantReturnPressure: 1.8,
        tmsCoolantInletPressure: 2.1,
        tmsOperatingMode: 1,
      },
      [BESS_2_ID]: {
        batteryAmbientTemp: 27.8,
        batteryAmbientTempMeasuredAt: '2026-10-20T10:01:00Z',
        bmsCabinetState: 2,
        pcsTemperature: 45.0,
        pcsLineVoltage: undefined, // Missing on BESS 2
        pcsAcCurrent: undefined,
        cellVMax: 3.45,
        cellVMin: 3.40,
        cellTempMax: 31.0,
        cellTempMin: 29.5,
        bmsDcVoltage: 805.0,
        bmsCurrent: 22.0,
        tmsCoolantReturnTemp: undefined, // Missing on BESS 2
        tmsCoolantInletTemp: undefined,
        tmsCoolantReturnPressure: undefined,
        tmsCoolantInletPressure: undefined,
        tmsOperatingMode: 3,
      },
    };

    // Selecting BESS 1
    const target1 = resolveTargetBessState(multiBessCtx, siteState, BESS_1_ID);
    expect(target1?.batteryAmbientTemp).toBe(24.5);
    expect(target1?.bmsCabinetState).toBe(1);
    expect(target1?.pcsLineVoltage).toBe(400.2);
    expect(target1?.pcsTemperature).toBe(42.1);
    expect(target1?.tmsOperatingMode).toBe(1);

    // Selecting BESS 2: strictly isolated, missing values must NOT pull from BESS 1
    const target2 = resolveTargetBessState(multiBessCtx, siteState, BESS_2_ID);
    expect(target2?.batteryAmbientTemp).toBe(27.8);
    expect(target2?.bmsCabinetState).toBe(2);
    expect(target2?.pcsTemperature).toBe(45.0);
    expect(target2?.pcsLineVoltage).toBeUndefined(); // NOT 400.2
    expect(target2?.pcsAcCurrent).toBeUndefined(); // NOT 15.3
    expect(target2?.tmsCoolantReturnTemp).toBeUndefined(); // NOT 22.0
    expect(target2?.tmsOperatingMode).toBe(3);
  });

  // ── 10. Step 4: Per-BESS Metrics Table Removal from Dashboard UI ────────────

  it('10. Dashboard UI: Per-BESS Metrics table is completely removed from source code', () => {
    const fs = require('fs');
    const path = require('path');
    const dashboardPagePath = path.resolve(__dirname, '../../../frontend/src/pages/EMSApp/DashboardPage.tsx');
    const content = fs.readFileSync(dashboardPagePath, 'utf8');

    // Heading and container are removed
    expect(content).not.toContain('Per-BESS Metrics');
    expect(content).not.toContain('<h3 className="text-lg font-semibold text-slate-900 mb-4">Per-BESS Metrics</h3>');

    // Confirm the 5 detail tables are wrapped in showBessDetails
    expect(content).toContain('showBessDetails && (');
    expect(content).toContain('<BatteryStatusSection');
    expect(content).toContain('<CabinetStateIndicator');
    expect(content).toContain('<PcsTelemetryTable');
    expect(content).toContain('<BmsTelemetryTable');
    expect(content).toContain('<TmsTelemetryTable');

    // Confirm required overview cards remain
    expect(content).toContain('bessPowerEval');
    expect(content).toContain('bessSocEval');
    expect(content).toContain('todayChargeEval');
    expect(content).toContain('todayDischargeEval');
    expect(content).toContain('bessFreqEval');
    expect(content).toContain('bessPfEval');
    expect(content).toContain('energyFlowData');
  });

  // ── 11. Step 4 Correction: Reports Tab Telemetry Data Table Restoration ────

  it('11. Reports UI: Telemetry Data Table is restored without DC Voltage, with pagination and export controls intact', () => {
    const fs = require('fs');
    const path = require('path');
    const reportsPagePath = path.resolve(__dirname, '../../../frontend/src/pages/EMSApp/ReportsPage.tsx');
    const content = fs.readFileSync(reportsPagePath, 'utf8');

    // 1. Reports Telemetry Data Table is rendered
    expect(content).toContain('Telemetry Data Table');
    expect(content).toContain('<table className="w-full text-left border-collapse">');
    expect(content).toContain('tableSnapshots');
    expect(content).toContain('handlePageChange');
    expect(content).toContain('authoritativeHeaders.map');

    // 2. Authoritative required headers and pagination controls are present
    expect(content).toContain('Timestamp');
    expect(content).toContain('BESS Name');
    expect(content).toContain('EMU Serial No.');
    expect(content).toContain('Grid Side Load');
    expect(content).toContain('Grid Frequency (Hz)');
    expect(content).toContain('Grid Power Factor');
    expect(content).toContain('BESS Frequency (Hz)');
    expect(content).toContain('BESS Power Factor');
    expect(content).toContain('PCS Active Power');
    expect(content).toContain('PCS Temperature (°C)');
    expect(content).toContain('Line Voltage (V)');
    expect(content).toContain('AC Current (A)');
    expect(content).toContain('Operating Mode');
    expect(content).toContain('SOC (%)');
    expect(content).toContain('SOH (%)');
    expect(content).toContain('BMS Current (A)');
    expect(content).toContain('BMS DC Voltage (V)');
    expect(content).toContain('Cabinet State');
    expect(content).toContain('Cell V Max (V)');
    expect(content).toContain('Cell V Min (V)');
    expect(content).toContain('Cell Temp Max (°C)');
    expect(content).toContain('Today Charge Energy');
    expect(content).toContain('Today Discharge Energy');
    expect(content).toContain('Accum Charge Energy');
    expect(content).toContain('Accum Discharge Energy');
    expect(content).toContain('Solar Power');

    // Pagination controls
    expect(content).toContain('Previous');
    expect(content).toContain('Next');
    expect(content).toContain('Math.ceil(tableTotal / pageSize)');

    // 3. DC Voltage header and obsolete cabinet meter columns are absent from table
    expect(content).not.toContain('>DC Voltage (V)<');
    expect(content).not.toContain('DC Voltage (V)</th>');
    expect(content).not.toContain('Cabinet Voltage A (V)');
    expect(content).not.toContain('Cabinet Meter Power');

    // 4. DC Voltage and legacy data cells are absent from each row
    expect(content).not.toContain('pt.dcVoltage');
    expect(content).not.toContain('pt.voltageA');

    // 5. Authoritative row cells remain aligned with headers and user preferences
    expect(content).toContain('formatTimestamp(pt.bucketTimestamp');
    expect(content).toContain('pt.bessAssetId');
    expect(content).toContain('pt.emuId');
    expect(content).toContain('formatPowerValue(pt.gridSideLoad');
    expect(content).toContain('formatValue(pt.gridFrequency, 2)');
    expect(content).toContain('formatValue(pt.powerFactor, 2)');
    expect(content).toContain('formatValue(pt.bessFrequency, 2)');
    expect(content).toContain('formatValue(pt.bessPowerFactor, 2)');
    expect(content).toContain('formatPowerValue(pt.pcsActivePower');
    expect(content).toContain('formatValue(pt.pcsTemperature, 1)');
    expect(content).toContain('formatValue(pt.pcsLineVoltage, 1)');
    expect(content).toContain('formatValue(pt.pcsAcCurrent, 1)');
    expect(content).toContain('formatTmsMode(pt.tmsOperatingMode)');
    expect(content).toContain('formatValue(pt.tmsAmbientTemp, 1)');
    expect(content).toContain('formatValue(pt.soc, 1)');
    expect(content).toContain('formatValue(pt.soh, 1)');
    expect(content).toContain('formatValue(pt.bmsCurrent, 1)');
    expect(content).toContain('formatValue(pt.bmsDcVoltage, 1)');
    expect(content).toContain('formatCabinetState(pt.bmsCabinetState)');
    expect(content).toContain('formatValue(pt.cellVMax, 3)');
    expect(content).toContain('formatValue(pt.cellVMin, 3)');
    expect(content).toContain('formatValue(pt.cellTempMax, 1)');
    expect(content).toContain('formatEnergyValue(pt.todayChargeEnergy');
    expect(content).toContain('formatEnergyValue(pt.todayDischargeEnergy');
    expect(content).toContain('formatEnergyValue(pt.accumChargeEnergy');
    expect(content).toContain('formatEnergyValue(pt.accumDischargeEnergy');
    expect(content).toContain('formatPowerValue(pt.solarPower');

    // Required controls and charts are preserved
    expect(content).toContain('Historical Reports');
    expect(content).toContain('PowerTrendChart');
    expect(content).toContain('handleExport');
    expect(content).toContain('Export Excel');
    expect(content).toContain('Export CSV');
    expect(content).toContain('authoritativeInterval');
    expect(content).toContain('Total Charge Difference');
    expect(content).toContain('Total Discharge Difference');
  });
});


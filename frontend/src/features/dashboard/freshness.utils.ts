/**
 * Phase 14C.3 — Telemetry Freshness & KPI Reliability Utilities
 *
 * Provides generic, component-independent partial-packet merging,
 * cadence-aware freshness state evaluation, timestamp validation,
 * and safe REST/WebSocket reconciliation.
 */

import type {
  DashboardTelemetryState,
  LatestTelemetryRow,
  DashboardDevice,
} from './dashboard.types';

export type ComponentType = 'pcs' | 'pmg' | 'pinv' | 'bcms' | 'rjl' | 'jl' | 'th' | 'tms' | 'default';

export type FreshnessState =
  | 'LIVE_FRESH'
  | 'HELD'
  | 'STALE'
  | 'NO_DATA';

export interface CadencePolicy {
  /** Maximum age in milliseconds for a measurement to be considered LIVE_FRESH. */
  freshWindowMs: number;
  /**
   * Retention boundary in milliseconds.
   * Measurements beyond freshWindowMs remain HELD as last-known while ageMs <= holdWindowMs.
   * Measurements beyond holdWindowMs become STALE.
   */
  holdWindowMs: number;
  /**
   * Stale threshold in milliseconds, marking the boundary beyond which measurements are STALE.
   * By definition, this equals the retention boundary `holdWindowMs` to ensure policy consistency.
   */
  staleThresholdMs: number;
}

export interface SignalFreshnessResult {
  state: FreshnessState;
  isAvailable: boolean;
  isFresh: boolean;
  isHeld: boolean;
  isStale: boolean;
  isNoData: boolean;
  isMeasuredZero: boolean;
  value: number | undefined;
  measuredAt?: string;
  ageMs?: number;
  displayValue: string;
  subtitle: string;
}

/**
 * Component-specific reporting intervals and freshness policies.
 *
 * Single documented interpretation:
 * - Fresh measurements remain LIVE_FRESH within `freshWindowMs`.
 * - Measurements beyond `freshWindowMs` can be HELD only while within `holdWindowMs`.
 * - Measurements beyond the retention boundary (`holdWindowMs` / `staleThresholdMs`) become STALE.
 * - `staleThresholdMs` is strictly aligned with `holdWindowMs`.
 *
 * Hardware reporting intervals:
 * - pcs: 60s cadence for standard power/voltages (2m fresh window, 8m retention boundary);
 *        infrequent signals like BESS PF (5m cadence) use custom 6m fresh / 8m hold windows.
 * - pmg: Grid meter reporting on ~5m cadence (6m fresh window, 8m retention boundary).
 * - pinv: Solar PV inverter reporting ~5m full packets (6m fresh window, 8m retention boundary).
 * - bcms / rjl / jl / default: ~5m reporting cadences (6m fresh window, 8m retention boundary).
 */
export const COMPONENT_CADENCE_POLICIES: Record<ComponentType, CadencePolicy> = {
  pcs: {
    freshWindowMs: 2 * 60 * 1000,    // 2 minutes for standard 60s cadence
    holdWindowMs: 8 * 60 * 1000,     // 8 minutes retention boundary
    staleThresholdMs: 8 * 60 * 1000, // 8 minutes stale boundary
  },
  pmg: {
    freshWindowMs: 6 * 60 * 1000,    // 6 minutes covers 5-minute reporting interval + jitter
    holdWindowMs: 8 * 60 * 1000,     // 8 minutes retention boundary
    staleThresholdMs: 8 * 60 * 1000, // 8 minutes stale boundary
  },
  pinv: {
    freshWindowMs: 6 * 60 * 1000,    // 6 minutes covers 5-minute full packet interval
    holdWindowMs: 8 * 60 * 1000,
    staleThresholdMs: 8 * 60 * 1000,
  },
  bcms: {
    freshWindowMs: 6 * 60 * 1000,
    holdWindowMs: 8 * 60 * 1000,
    staleThresholdMs: 8 * 60 * 1000,
  },
  rjl: {
    freshWindowMs: 6 * 60 * 1000,
    holdWindowMs: 8 * 60 * 1000,
    staleThresholdMs: 8 * 60 * 1000,
  },
  jl: {
    freshWindowMs: 6 * 60 * 1000,
    holdWindowMs: 8 * 60 * 1000,
    staleThresholdMs: 8 * 60 * 1000,
  },
  th: {
    freshWindowMs: 6 * 60 * 1000,
    holdWindowMs: 8 * 60 * 1000,
    staleThresholdMs: 8 * 60 * 1000,
  },
  tms: {
    freshWindowMs: 6 * 60 * 1000,
    holdWindowMs: 8 * 60 * 1000,
    staleThresholdMs: 8 * 60 * 1000,
  },
  default: {
    freshWindowMs: 6 * 60 * 1000,
    holdWindowMs: 8 * 60 * 1000,
    staleThresholdMs: 8 * 60 * 1000,
  },
};

/**
 * Validates that a value is a finite number.
 * Distinctly treats 0 as a valid numeric measurement.
 */
export function isValidNumber(value: unknown): value is number {
  return typeof value === 'number' && !Number.isNaN(value) && Number.isFinite(value);
}

/**
 * Validates and parses an ISO or Date timestamp to milliseconds epoch.
 * Returns null if invalid or missing.
 */
export function parseValidTimestamp(ts: unknown): number | null {
  if (typeof ts !== 'string' && !(ts instanceof Date)) return null;
  if (typeof ts === 'string' && (ts.trim() === '' || !/\d{4}/.test(ts))) return null;
  const parsed = new Date(ts).getTime();
  return Number.isNaN(parsed) ? null : parsed;
}

/**
 * Selects the chronologically latest valid timestamp from a collection of candidate strings.
 *
 * Replaces naive lexicographical string comparisons (`a > b`) with parsed epoch comparisons,
 * ensuring correct ordering across varying timezone offsets, formats, and UTC representations.
 *
 * Returns the exact original timestamp string corresponding to the chronologically newest instant,
 * or undefined if no candidates have valid timestamps.
 */
export function getLatestTimestamp(
  timestamps: (string | undefined | null)[]
): string | undefined {
  const validCandidates: { raw: string; epoch: number }[] = [];

  for (const ts of timestamps) {
    if (typeof ts === 'string') {
      const epoch = parseValidTimestamp(ts);
      if (epoch !== null) {
        validCandidates.push({ raw: ts, epoch });
      }
    }
  }

  if (validCandidates.length === 0) return undefined;

  let latest = validCandidates[0];
  for (let i = 1; i < validCandidates.length; i++) {
    if (validCandidates[i].epoch >= latest.epoch) {
      latest = validCandidates[i];
    }
  }

  return latest.raw;
}

/**
 * Detects whether a measurement timestamp is implausibly in the future
 * beyond acceptable clock drift tolerance.
 */
export function isFutureTimestamp(tsMs: number, now: number, toleranceMs = 60_000): boolean {
  return tsMs > now + toleranceMs;
}

/**
 * Safely formats a number or returns '--'.
 * Preserves 0 as a valid formatted number ('0.0' or '0.00').
 */
export function formatValue(v: number | undefined | null, decimals = 1): string {
  return isValidNumber(v) ? v.toFixed(decimals) : '--';
}

/**
 * Formats power values for presentation display (e.g. Energy Flow Diagram).
 *
 * Rules:
 * - Up to 2 decimal places with standard numeric rounding.
 * - Trailing zeros omitted (e.g. 26.50 -> '26.5', 12.00 -> '12', 0 -> '0').
 * - Preserves negative signs (e.g. -0.1 -> '-0.1', -0.123456 -> '-0.12').
 * - Preserves numeric 0 as '0'.
 * - Rejects NaN, Infinity, null, undefined, non-numbers -> returns '--'.
 */
export function formatPowerValue(v: unknown, maxDecimals = 2): string {
  if (!isValidNumber(v)) return '--';
  const rounded = Number(v.toFixed(maxDecimals));
  return (Object.is(rounded, -0) ? 0 : rounded).toString();
}

export interface EvaluateFreshnessOptions {
  value?: number | null;
  measuredAt?: string | null;
  componentType: ComponentType;
  now?: number;
  decimals?: number;
  defaultSubtitle?: string;
  isPowerSignal?: boolean;
  powerKind?: 'grid' | 'bess' | 'solar';
  customFreshWindowMs?: number;
  customHoldWindowMs?: number;
}

/**
 * Evaluates the freshness state of a telemetry signal.
 * Correctly distinguishes LIVE_FRESH, HELD, STALE, and NO_DATA.
 * Correctly preserves MEASURED ZERO as an active value rather than missing data.
 */
export function evaluateSignalFreshness({
  value,
  measuredAt,
  componentType,
  now = Date.now(),
  decimals = 1,
  defaultSubtitle = '',
  isPowerSignal = false,
  powerKind,
  customFreshWindowMs,
  customHoldWindowMs,
}: EvaluateFreshnessOptions): SignalFreshnessResult {
  // 1. Missing or non-numeric value -> NO_DATA
  if (!isValidNumber(value)) {
    return {
      state: 'NO_DATA',
      isAvailable: false,
      isFresh: false,
      isHeld: false,
      isStale: false,
      isNoData: true,
      isMeasuredZero: false,
      value: undefined,
      measuredAt: undefined,
      ageMs: undefined,
      displayValue: '--',
      subtitle: 'No data',
    };
  }

  const isMeasuredZero = value === 0;

  // 2. Missing or invalid measurement timestamp -> Cannot establish freshness
  const tsMs = parseValidTimestamp(measuredAt);
  if (tsMs === null) {
    return {
      state: 'NO_DATA',
      isAvailable: true,
      isFresh: false,
      isHeld: false,
      isStale: false,
      isNoData: true,
      isMeasuredZero,
      value,
      measuredAt: undefined,
      ageMs: undefined,
      displayValue: '--',
      subtitle: 'No data',
    };
  }

  // 3. Implausibly future-dated timestamp -> Reject as STALE
  if (isFutureTimestamp(tsMs, now)) {
    return {
      state: 'STALE',
      isAvailable: true,
      isFresh: false,
      isHeld: false,
      isStale: true,
      isNoData: false,
      isMeasuredZero,
      value,
      measuredAt: measuredAt ?? undefined,
      ageMs: undefined,
      displayValue: '--',
      subtitle: 'Stale',
    };
  }

  // 4. Age calculation against policy
  const policy = COMPONENT_CADENCE_POLICIES[componentType] || COMPONENT_CADENCE_POLICIES.default;
  const freshWindow = customFreshWindowMs ?? policy.freshWindowMs;

  // Retention boundary beyond which the signal becomes STALE:
  // - If caller specifies customHoldWindowMs, that explicitly governs the retention boundary.
  // - Otherwise, default to policy.holdWindowMs (strictly equal to policy.staleThresholdMs).
  // - To ensure a custom fresh window cannot eliminate the HELD state,
  //   if the configured retention boundary <= freshWindow, maintain the policy's configured
  //   hold grace duration (or a minimum of 60s) above freshWindow.
  const policyRetention = policy.holdWindowMs ?? policy.staleThresholdMs;
  let holdWindow: number;
  if (customHoldWindowMs !== undefined) {
    holdWindow = customHoldWindowMs;
  } else if (policyRetention > freshWindow) {
    holdWindow = policyRetention;
  } else {
    const policyGrace = Math.max(policy.holdWindowMs - policy.freshWindowMs, 60_000);
    holdWindow = freshWindow + policyGrace;
  }

  const ageMs = Math.max(0, now - tsMs);

  let state: FreshnessState;
  if (ageMs <= freshWindow) {
    state = 'LIVE_FRESH';
  } else if (ageMs <= holdWindow) {
    state = 'HELD';
  } else {
    state = 'STALE';
  }

  // 5. Build display text and subtitle based on state
  if (state === 'STALE') {
    return {
      state: 'STALE',
      isAvailable: true,
      isFresh: false,
      isHeld: false,
      isStale: true,
      isNoData: false,
      isMeasuredZero,
      value,
      measuredAt: measuredAt ?? undefined,
      ageMs,
      displayValue: '--',
      subtitle: 'Stale',
    };
  }

  const displayVal = formatValue(isPowerSignal && powerKind === 'grid' ? Math.abs(value) : value, decimals);

  let sub = defaultSubtitle;
  if (isPowerSignal) {
    if (powerKind === 'grid') {
      sub = value !== 0 ? 'Active' : 'Idle';
    } else if (powerKind === 'bess') {
      sub = value > 0 ? 'Charging' : value < 0 ? 'Discharging' : 'Idle';
    } else if (powerKind === 'solar') {
      sub = value > 0 ? 'Generating' : 'Idle';
    }
  }

  if (state === 'HELD') {
    sub = sub ? `${sub} • Last known` : 'Last known';
  }

  return {
    state,
    isAvailable: true,
    isFresh: state === 'LIVE_FRESH',
    isHeld: state === 'HELD',
    isStale: false,
    isNoData: false,
    isMeasuredZero,
    value,
    measuredAt: measuredAt ?? undefined,
    ageMs,
    displayValue: displayVal,
    subtitle: sub,
  };
}

/**
 * Merges a single WS LiveTelemetryPayload into the current telemetry state.
 *
 * Rules enforced:
 * 1. Only updates signals present and valid in the delta packet.
 * 2. Omitted signals retain their prior values and prior measurement timestamps.
 * 3. Does not advance measurement timestamps for omitted signals.
 * 4. Out-of-order older packets cannot overwrite newer measurements.
 * 5. React immutability preserved.
 */
export function mergeWsPayload(
  prev: DashboardTelemetryState,
  componentId: string,
  data: Record<string, unknown>,
  timestamp: string
): DashboardTelemetryState {
  const tsMs = parseValidTimestamp(timestamp);
  if (tsMs === null) {
    // Malformed packet timestamp: reject packet
    return prev;
  }

  const next: DashboardTelemetryState = { ...prev };

  // Helper to update a numeric signal only if present and valid
  const updateSignal = (
    valueKey: keyof DashboardTelemetryState,
    measuredAtKey: keyof DashboardTelemetryState,
    val: unknown,
    signalMeasuredAt?: unknown
  ) => {
    if (val === undefined || val === null) return; // Omitted: retain previous value and timestamp!
    if (!isValidNumber(val)) return; // Reject NaN, Infinity, non-numbers

    const effectiveTimestamp = (typeof signalMeasuredAt === 'string' && parseValidTimestamp(signalMeasuredAt) !== null)
      ? signalMeasuredAt
      : timestamp;
    const effectiveMs = parseValidTimestamp(effectiveTimestamp);
    if (effectiveMs === null) return;

    const currentMeasuredAt = prev[measuredAtKey] as string | undefined;
    const currentMs = parseValidTimestamp(currentMeasuredAt);
    if (currentMs !== null && effectiveMs < currentMs) {
      // Out-of-order older packet: do not overwrite newer measurement
      return;
    }

    (next as any)[valueKey] = val;
    (next as any)[measuredAtKey] = effectiveTimestamp;
  };

  const updateStringSignal = (
    key: keyof DashboardTelemetryState,
    val: unknown
  ) => {
    if (val === undefined || val === null || typeof val !== 'string') return;
    (next as any)[key] = val;
  };

  // Component-specific signal merging
  if (componentId === 'pcs') {
    const prevPcsMs = parseValidTimestamp(prev.pcsTimestamp);
    if (prevPcsMs === null || tsMs >= prevPcsMs) {
      next.pcsTimestamp = timestamp;
    }

    updateSignal('bessPower', 'bessPowerMeasuredAt', data.bessPower);
    updateSignal('bessFrequency', 'bessFrequencyMeasuredAt', data.bessFrequency);
    updateSignal('bessPowerFactor', 'bessPowerFactorMeasuredAt', data.bessPowerFactor, data.bessPowerFactorMeasuredAt);
    updateStringSignal('pcsState', data.pcsState);
    updateSignal('pcsDcVoltage', 'pcsDcVoltageMeasuredAt', data.pcsDcVoltage);
    updateSignal('pcsTemp', 'pcsTempMeasuredAt', data.pcsTemp);
    updateSignal('pcsTemperature', 'pcsTemperatureMeasuredAt', data.pcsTemperature);
    updateSignal('pcsLineVoltage', 'pcsLineVoltageMeasuredAt', data.pcsLineVoltage);
    updateSignal('pcsAcCurrent', 'pcsAcCurrentMeasuredAt', data.pcsAcCurrent);
    updateSignal('todayChargeEnergy', 'todayChargeEnergyMeasuredAt', data.todayChargeEnergy);
    updateSignal('todayDischargeEnergy', 'todayDischargeEnergyMeasuredAt', data.todayDischargeEnergy);
    updateSignal('accChargeEnergy', 'accChargeEnergyMeasuredAt', data.accChargeEnergy);
    updateSignal('accDischargeEnergy', 'accDischargeEnergyMeasuredAt', data.accDischargeEnergy);
  } else if (componentId === 'pmg') {
    const prevPmgMs = parseValidTimestamp(prev.pmgTimestamp);
    if (prevPmgMs === null || tsMs >= prevPmgMs) {
      next.pmgTimestamp = timestamp;
    }

    updateSignal('gridPower', 'gridPowerMeasuredAt', data.gridPower);
    if (data.gridPhaseAVoltage !== undefined && next.voltageA === undefined) {
      updateSignal('voltageA', 'voltageAMeasuredAt', data.gridPhaseAVoltage);
    }
    updateSignal('gridFrequency', 'gridFrequencyMeasuredAt', data.gridFrequency);
    updateSignal('powerFactor', 'powerFactorMeasuredAt', data.powerFactor);
  } else if (componentId === 'rjl' || componentId === 'jl') {
    const prevRjlMs = parseValidTimestamp(prev.rjlTimestamp);
    if (prevRjlMs === null || tsMs >= prevRjlMs) {
      next.rjlTimestamp = timestamp;
    }

    updateSignal('voltageA', 'voltageAMeasuredAt', data.phaseAVoltage);
    updateSignal('voltageB', 'voltageBMeasuredAt', data.phaseBVoltage);
    updateSignal('voltageC', 'voltageCMeasuredAt', data.phaseCVoltage);
    updateSignal('currentA', 'currentAMeasuredAt', data.phaseACurrent);
    updateSignal('currentB', 'currentBMeasuredAt', data.phaseBCurrent);
    updateSignal('currentC', 'currentCMeasuredAt', data.phaseCCurrent);
  } else if (componentId === 'bcms') {
    const prevBcmsMs = parseValidTimestamp(prev.bcmsTimestamp);
    if (prevBcmsMs === null || tsMs >= prevBcmsMs) {
      next.bcmsTimestamp = timestamp;
    }

    updateSignal('bessSoc', 'bessSocMeasuredAt', data.bessSoc);
    updateSignal('bmsSoh', 'bmsSohMeasuredAt', data.bmsSoh);
    updateSignal('bmsCurrent', 'bmsCurrentMeasuredAt', data.bmsCurrent);
    updateSignal('cellVMax', 'cellVMaxMeasuredAt', data.cellVMax);
    updateSignal('cellVMin', 'cellVMinMeasuredAt', data.cellVMin);
    updateSignal('cellTempMax', 'cellTempMaxMeasuredAt', data.cellTempMax);
    updateSignal('cellTempMin', 'cellTempMinMeasuredAt', data.cellTempMin);
    updateSignal('bmsDcVoltage', 'bmsDcVoltageMeasuredAt', data.bmsDcVoltage);
    updateSignal('bmsCabinetState', 'bmsCabinetStateMeasuredAt', data.bmsCabinetState);
  } else if (componentId === 'pinv') {
    const prevPinvMs = parseValidTimestamp(prev.pinvTimestamp);
    if (prevPinvMs === null || tsMs >= prevPinvMs) {
      next.pinvTimestamp = timestamp;
    }

    updateSignal('solarPower', 'solarPowerMeasuredAt', data.solarPower);
    updateSignal('solarFrequency', 'solarFrequencyMeasuredAt', data.solarFrequency);
    updateSignal('solarPowerFactor', 'solarPowerFactorMeasuredAt', data.solarPowerFactor);
  } else if (componentId === 'th') {
    const prevThMs = parseValidTimestamp(prev.thTimestamp);
    if (prevThMs === null || tsMs >= prevThMs) {
      next.thTimestamp = timestamp;
    }

    updateSignal('batteryAmbientTemp', 'batteryAmbientTempMeasuredAt', data.batteryAmbientTemp);
  } else if (componentId === 'tms') {
    const prevTmsMs = parseValidTimestamp(prev.tmsTimestamp);
    if (prevTmsMs === null || tsMs >= prevTmsMs) {
      next.tmsTimestamp = timestamp;
    }

    updateSignal('tmsOperatingMode', 'tmsOperatingModeMeasuredAt', data.tmsOperatingMode);
    updateSignal('tmsAmbientTemp', 'tmsAmbientTempMeasuredAt', data.tmsAmbientTemp);
    updateSignal('tmsCoolantReturnTemp', 'tmsCoolantReturnTempMeasuredAt', data.tmsCoolantReturnTemp);
    updateSignal('tmsCoolantInletTemp', 'tmsCoolantInletTempMeasuredAt', data.tmsCoolantInletTemp);
    updateSignal('tmsCoolantReturnPressure', 'tmsCoolantReturnPressureMeasuredAt', data.tmsCoolantReturnPressure);
    updateSignal('tmsCoolantInletPressure', 'tmsCoolantInletPressureMeasuredAt', data.tmsCoolantInletPressure);
  } else if (componentId.startsWith('pack_')) {
    const currentPacks = prev.packTemperatures || {};
    const prevPackMs = parseValidTimestamp(currentPacks[componentId]?.measuredAt);
    if (prevPackMs === null || tsMs >= prevPackMs) {
      next.packTemperatures = {
        ...currentPacks,
        [componentId]: {
          avgTemp: isValidNumber(data.packAvgTemp) ? (data.packAvgTemp as number) : undefined,
          maxTemp: isValidNumber(data.packMaxTemp) ? (data.packMaxTemp as number) : undefined,
          measuredAt: timestamp,
        }
      };
    }
  }

  // Overall latest packet timestamp
  const prevTsMs = parseValidTimestamp(prev.timestamp);
  if (prevTsMs === null || tsMs >= prevTsMs) {
    next.timestamp = timestamp;
  }

  return next;
}

/**
 * Builds the initial telemetry state from REST snapshot rows.
 * Only assigns a signal-level measuredAt timestamp if that signal's
 * value is actually non-null in the row.
 */
export function buildStateFromRest(
  rows: LatestTelemetryRow[],
  devices: DashboardDevice[]
): Record<string, DashboardTelemetryState> {
  const state: Record<string, DashboardTelemetryState> = {};
  const bessAssetIds = new Set(devices.map(d => d.bessAssetId).filter(Boolean));

  for (const bessId of bessAssetIds) {
    const bessDevices = devices.filter(d => d.bessAssetId === bessId);
    const bessRows = rows.filter(r => bessDevices.some(d => d.id === r.deviceId));

    const pcs = bessRows.find(r => r.device.componentId === 'pcs');
    const pmg = bessRows.find(r => r.device.componentId === 'pmg');
    const rjl = bessRows.find(r => r.device.componentId === 'rjl');
    const bcms = bessRows.find(r => r.device.componentId === 'bcms');
    const pinv = bessRows.find(r => r.device.componentId === 'pinv');
    const th = bessRows.find(r => r.device.componentId === 'th');
    const tms = bessRows.find(r => r.device.componentId === 'tms');
    const packRows = bessRows.filter(r => r.device.componentId?.startsWith('pack_'));

    let batteryAmbientTemp: number | undefined;
    let batteryAmbientTempMeasuredAt: string | undefined;
    if (th && Array.isArray(th.rawPayload)) {
      const sig = (th.rawPayload as Array<{ m?: string; v?: unknown }>).find(s => s && s.m === 'ai_temp');
      if (sig && isValidNumber(sig.v)) {
        batteryAmbientTemp = sig.v as number;
        batteryAmbientTempMeasuredAt = th.timestamp;
      }
    }

    let tmsAmbientTemp: number | undefined;
    let tmsAmbientTempMeasuredAt: string | undefined;
    let tmsOperatingMode: number | undefined;
    let tmsOperatingModeMeasuredAt: string | undefined;
    let tmsCoolantReturnTemp: number | undefined;
    let tmsCoolantReturnTempMeasuredAt: string | undefined;
    let tmsCoolantInletTemp: number | undefined;
    let tmsCoolantInletTempMeasuredAt: string | undefined;
    let tmsCoolantReturnPressure: number | undefined;
    let tmsCoolantReturnPressureMeasuredAt: string | undefined;
    let tmsCoolantInletPressure: number | undefined;
    let tmsCoolantInletPressureMeasuredAt: string | undefined;

    if (tms && Array.isArray(tms.rawPayload)) {
      const raw = tms.rawPayload as Array<{ m?: string; v?: unknown }>;
      const atSig = raw.find(s => s && s.m === 'ai_at');
      if (atSig && isValidNumber(atSig.v)) {
        tmsAmbientTemp = atSig.v as number;
        tmsAmbientTempMeasuredAt = tms.timestamp;
      }

      const modeSig = raw.find(s => s && s.m === 'di_singco_state');
      if (modeSig && isValidNumber(modeSig.v)) {
        tmsOperatingMode = Number(modeSig.v);
        tmsOperatingModeMeasuredAt = tms.timestamp;
      }

      const iwTempSig = raw.find(s => s && s.m === 'ai_iw_temp');
      if (iwTempSig && isValidNumber(iwTempSig.v)) {
        tmsCoolantReturnTemp = iwTempSig.v as number;
        tmsCoolantReturnTempMeasuredAt = tms.timestamp;
      }

      const owTempSig = raw.find(s => s && s.m === 'ai_ow_temp');
      if (owTempSig && isValidNumber(owTempSig.v)) {
        tmsCoolantInletTemp = owTempSig.v as number;
        tmsCoolantInletTempMeasuredAt = tms.timestamp;
      }

      const iwPrsSig = raw.find(s => s && s.m === 'ai_iw_prs');
      if (iwPrsSig && isValidNumber(iwPrsSig.v)) {
        tmsCoolantReturnPressure = iwPrsSig.v as number;
        tmsCoolantReturnPressureMeasuredAt = tms.timestamp;
      }

      const owPrsSig = raw.find(s => s && s.m === 'ai_ow_prs');
      if (owPrsSig && isValidNumber(owPrsSig.v)) {
        tmsCoolantInletPressure = owPrsSig.v as number;
        tmsCoolantInletPressureMeasuredAt = tms.timestamp;
      }
    }

    const packTemperatures: Record<string, { avgTemp?: number; maxTemp?: number; measuredAt?: string }> = {};
    for (const pRow of packRows) {
      const compId = pRow.device.componentId;
      if (!compId || !Array.isArray(pRow.rawPayload)) continue;
      const tempSignals = (pRow.rawPayload as Array<{ m?: string; v?: unknown }>)
        .filter(s => s && typeof s.m === 'string' && /^(ai_temp_\d+|ai_negpol_temp|ai_pospol_temp)$/.test(s.m));
      if (tempSignals.length > 0) {
        const nums = tempSignals.map(s => isValidNumber(s.v) ? (s.v as number) : null);
        let lastNonZero = -1;
        for (let i = nums.length - 1; i >= 0; i--) {
          if (nums[i] !== null && nums[i] !== 0) { lastNonZero = i; break; }
        }
        if (lastNonZero !== -1) {
          const eligible: number[] = [];
          for (let i = 0; i <= lastNonZero; i++) {
            if (nums[i] !== null) eligible.push(nums[i]!);
          }
          if (eligible.length > 0) {
            const avg = Number((eligible.reduce((a, b) => a + b, 0) / eligible.length).toFixed(1));
            const max = Number(Math.max(...eligible).toFixed(1));
            packTemperatures[compId] = { avgTemp: avg, maxTemp: max, measuredAt: pRow.timestamp };
          }
        }
      }
    }

    let pcsTemperature: number | undefined;
    let pcsTemperatureMeasuredAt: string | undefined;
    let pcsLineVoltage: number | undefined;
    let pcsLineVoltageMeasuredAt: string | undefined;
    let pcsAcCurrent: number | undefined;
    let pcsAcCurrentMeasuredAt: string | undefined;

    if (pcs) {
      if (Array.isArray(pcs.rawPayload)) {
        const raw = pcs.rawPayload as Array<{ m?: string; v?: unknown }>;
        const tempSig = raw.find(s => s && s.m === 'ai_igbt_temp');
        if (tempSig && isValidNumber(tempSig.v)) {
          pcsTemperature = tempSig.v as number;
          pcsTemperatureMeasuredAt = pcs.timestamp;
        }

        const iaSig = raw.find(s => s && s.m === 'ai_ia');
        const ibSig = raw.find(s => s && s.m === 'ai_ib');
        const icSig = raw.find(s => s && s.m === 'ai_ic');
        if (iaSig && ibSig && icSig && isValidNumber(iaSig.v) && isValidNumber(ibSig.v) && isValidNumber(icSig.v)) {
          pcsAcCurrent = ((iaSig.v as number) + (ibSig.v as number) + (icSig.v as number)) / 3;
          pcsAcCurrentMeasuredAt = pcs.timestamp;
        }

        const uabSig = raw.find(s => s && s.m === 'ai_out_uab');
        const ubcSig = raw.find(s => s && s.m === 'ai_out_ubc');
        const ucaSig = raw.find(s => s && s.m === 'ai_out_uca');
        if (uabSig && ubcSig && ucaSig && isValidNumber(uabSig.v) && isValidNumber(ubcSig.v) && isValidNumber(ucaSig.v)) {
          pcsLineVoltage = ((uabSig.v as number) + (ubcSig.v as number) + (ucaSig.v as number)) / 3;
          pcsLineVoltageMeasuredAt = pcs.timestamp;
        }
      }

      if (pcsLineVoltage === undefined && isValidNumber((pcs as any).bessVoltageUa) && isValidNumber((pcs as any).bessVoltageUb) && isValidNumber((pcs as any).bessVoltageUc)) {
        pcsLineVoltage = (((pcs as any).bessVoltageUa as number) + ((pcs as any).bessVoltageUb as number) + ((pcs as any).bessVoltageUc as number)) / 3;
        pcsLineVoltageMeasuredAt = pcs.timestamp;
      }
    }

    let cellTempMin: number | undefined;
    let cellTempMinMeasuredAt: string | undefined;
    let bmsDcVoltage: number | undefined;
    let bmsDcVoltageMeasuredAt: string | undefined;
    let bmsCabinetState: number | undefined;
    let bmsCabinetStateMeasuredAt: string | undefined;
    let cellVMin: number | undefined;
    let cellVMinMeasuredAt: string | undefined;

    if (bcms) {
      if (Array.isArray(bcms.rawPayload)) {
        const raw = bcms.rawPayload as Array<{ m?: string; v?: unknown }>;
        const tempMinSig = raw.find(s => s && s.m === 'ai_min_temp');
        if (tempMinSig && isValidNumber(tempMinSig.v)) {
          cellTempMin = tempMinSig.v as number;
          cellTempMinMeasuredAt = bcms.timestamp;
        }

        const sumUSig = raw.find(s => s && s.m === 'ai_sum_u');
        if (sumUSig && isValidNumber(sumUSig.v)) {
          bmsDcVoltage = sumUSig.v as number;
          bmsDcVoltageMeasuredAt = bcms.timestamp;
        }

        const stateSig = raw.find(s => s && s.m === 'di_rcdhg_stat');
        if (stateSig && isValidNumber(stateSig.v)) {
          const sNum = Number(stateSig.v);
          if (sNum === 0 || sNum === 1 || sNum === 2) {
            bmsCabinetState = sNum;
            bmsCabinetStateMeasuredAt = bcms.timestamp;
          }
        }

        const minVolSig = raw.find(s => s && s.m === 'ai_min_vol');
        if (minVolSig && isValidNumber(minVolSig.v)) {
          cellVMin = minVolSig.v as number;
          cellVMinMeasuredAt = bcms.timestamp;
        }
      }

      if (cellVMin === undefined && isValidNumber(bcms.cellVMin)) {
        cellVMin = bcms.cellVMin;
        cellVMinMeasuredAt = bcms.timestamp;
      }
    }

    const latestTimestamp = getLatestTimestamp(bessRows.map(r => r.timestamp));

    const withMeasuredAt = (val: number | null | undefined, ts?: string) => {
      return isValidNumber(val) && ts ? ts : undefined;
    };

    state[bessId as string] = {
      timestamp: latestTimestamp,
      pcsTimestamp: pcs?.timestamp,
      pmgTimestamp: pmg?.timestamp,
      pinvTimestamp: pinv?.timestamp,
      bcmsTimestamp: bcms?.timestamp,
      rjlTimestamp: rjl?.timestamp,
      thTimestamp: th?.timestamp,
      tmsTimestamp: tms?.timestamp,

      // PCS
      bessPower: isValidNumber(pcs?.pcsActivePower) ? pcs!.pcsActivePower : undefined,
      bessPowerMeasuredAt: withMeasuredAt(pcs?.pcsActivePower, pcs?.timestamp),
      bessFrequency: isValidNumber(pcs?.bessFrequency) ? pcs!.bessFrequency : undefined,
      bessFrequencyMeasuredAt: withMeasuredAt(pcs?.bessFrequency, pcs?.timestamp),
      bessPowerFactor: isValidNumber(pcs?.bessPowerFactor) ? pcs!.bessPowerFactor : undefined,
      bessPowerFactorMeasuredAt: withMeasuredAt(pcs?.bessPowerFactor, pcs?.bessPowerFactorMeasuredAt || pcs?.timestamp),
      pcsDcVoltage: isValidNumber(pcs?.dcVoltage) ? pcs!.dcVoltage : undefined,
      pcsDcVoltageMeasuredAt: withMeasuredAt(pcs?.dcVoltage, pcs?.timestamp),
      pcsTemp: isValidNumber(pcs?.ambientTemp) ? pcs!.ambientTemp : undefined,
      pcsTempMeasuredAt: withMeasuredAt(pcs?.ambientTemp, pcs?.timestamp),
      pcsTemperature,
      pcsTemperatureMeasuredAt,
      pcsLineVoltage,
      pcsLineVoltageMeasuredAt,
      pcsAcCurrent,
      pcsAcCurrentMeasuredAt,
      tmsAmbientTemp,
      tmsAmbientTempMeasuredAt,
      tmsOperatingMode,
      tmsOperatingModeMeasuredAt,
      tmsCoolantReturnTemp,
      tmsCoolantReturnTempMeasuredAt,
      tmsCoolantInletTemp,
      tmsCoolantInletTempMeasuredAt,
      tmsCoolantReturnPressure,
      tmsCoolantReturnPressureMeasuredAt,
      tmsCoolantInletPressure,
      tmsCoolantInletPressureMeasuredAt,
      todayChargeEnergy: isValidNumber(pcs?.todayChargeEnergy) ? pcs!.todayChargeEnergy : undefined,
      todayChargeEnergyMeasuredAt: withMeasuredAt(pcs?.todayChargeEnergy, pcs?.timestamp),
      todayDischargeEnergy: isValidNumber(pcs?.todayDischargeEnergy) ? pcs!.todayDischargeEnergy : undefined,
      todayDischargeEnergyMeasuredAt: withMeasuredAt(pcs?.todayDischargeEnergy, pcs?.timestamp),
      accChargeEnergy: isValidNumber(pcs?.accumChargeEnergy) ? pcs!.accumChargeEnergy : undefined,
      accChargeEnergyMeasuredAt: withMeasuredAt(pcs?.accumChargeEnergy, pcs?.timestamp),
      accDischargeEnergy: isValidNumber(pcs?.accumDischargeEnergy) ? pcs!.accumDischargeEnergy : undefined,
      accDischargeEnergyMeasuredAt: withMeasuredAt(pcs?.accumDischargeEnergy, pcs?.timestamp),

      // Grid Meter
      gridPower: isValidNumber(pmg?.gridSideLoad) ? pmg!.gridSideLoad : undefined,
      gridPowerMeasuredAt: withMeasuredAt(pmg?.gridSideLoad, pmg?.timestamp),
      gridFrequency: isValidNumber(pmg?.gridFrequency) ? pmg!.gridFrequency : undefined,
      gridFrequencyMeasuredAt: withMeasuredAt(pmg?.gridFrequency, pmg?.timestamp),
      powerFactor: isValidNumber(pmg?.powerFactor) ? pmg!.powerFactor : undefined,
      powerFactorMeasuredAt: withMeasuredAt(pmg?.powerFactor, pmg?.timestamp),

      // Cabinet Meter
      voltageA: isValidNumber(rjl?.voltageA) ? rjl!.voltageA : isValidNumber(pmg?.voltageA) ? pmg!.voltageA : undefined,
      voltageAMeasuredAt: withMeasuredAt(rjl?.voltageA, rjl?.timestamp) || withMeasuredAt(pmg?.voltageA, pmg?.timestamp),
      voltageB: isValidNumber(rjl?.voltageB) ? rjl!.voltageB : undefined,
      voltageBMeasuredAt: withMeasuredAt(rjl?.voltageB, rjl?.timestamp),
      voltageC: isValidNumber(rjl?.voltageC) ? rjl!.voltageC : undefined,
      voltageCMeasuredAt: withMeasuredAt(rjl?.voltageC, rjl?.timestamp),
      currentA: isValidNumber(rjl?.currentA) ? rjl!.currentA : undefined,
      currentAMeasuredAt: withMeasuredAt(rjl?.currentA, rjl?.timestamp),
      currentB: isValidNumber(rjl?.currentB) ? rjl!.currentB : undefined,
      currentBMeasuredAt: withMeasuredAt(rjl?.currentB, rjl?.timestamp),
      currentC: isValidNumber(rjl?.currentC) ? rjl!.currentC : undefined,
      currentCMeasuredAt: withMeasuredAt(rjl?.currentC, rjl?.timestamp),
      totalPower: isValidNumber(rjl?.totalPower) ? rjl!.totalPower : undefined,
      totalPowerMeasuredAt: withMeasuredAt(rjl?.totalPower, rjl?.timestamp),

      // BMS
      bessSoc: isValidNumber(bcms?.soc) ? bcms!.soc : undefined,
      bessSocMeasuredAt: withMeasuredAt(bcms?.soc, bcms?.timestamp),
      bmsSoh: isValidNumber(bcms?.soh) ? bcms!.soh : undefined,
      bmsSohMeasuredAt: withMeasuredAt(bcms?.soh, bcms?.timestamp),
      bmsCurrent: isValidNumber(bcms?.bmsCurrent) ? bcms!.bmsCurrent : undefined,
      bmsCurrentMeasuredAt: withMeasuredAt(bcms?.bmsCurrent, bcms?.timestamp),
      cellVMax: isValidNumber(bcms?.cellVMax) ? bcms!.cellVMax : undefined,
      cellVMaxMeasuredAt: withMeasuredAt(bcms?.cellVMax, bcms?.timestamp),
      cellVMin,
      cellVMinMeasuredAt,
      cellTempMax: isValidNumber(bcms?.cellTempMax) ? bcms!.cellTempMax : undefined,
      cellTempMaxMeasuredAt: withMeasuredAt(bcms?.cellTempMax, bcms?.timestamp),
      cellTempMin,
      cellTempMinMeasuredAt,
      bmsDcVoltage,
      bmsDcVoltageMeasuredAt,
      bmsCabinetState,
      bmsCabinetStateMeasuredAt,

      // Solar PV
      solarPower: isValidNumber(pinv?.solarPower) ? pinv!.solarPower : undefined,
      solarPowerMeasuredAt: withMeasuredAt(pinv?.solarPower, pinv?.timestamp),
      solarFrequency: isValidNumber(pinv?.solarFrequency) ? pinv!.solarFrequency : undefined,
      solarFrequencyMeasuredAt: withMeasuredAt(pinv?.solarFrequency, pinv?.timestamp),
      solarPowerFactor: isValidNumber(pinv?.solarPowerFactor) ? pinv!.solarPowerFactor : undefined,
      solarPowerFactorMeasuredAt: withMeasuredAt(pinv?.solarPowerFactor, pinv?.timestamp),

      // Battery Status & Ambient
      batteryAmbientTemp,
      batteryAmbientTempMeasuredAt,
      packTemperatures: Object.keys(packTemperatures).length > 0 ? packTemperatures : undefined,
    };
  }

  return state;
}

/**
 * Reconciles initial REST hydration with live WebSocket state.
 *
 * Rules:
 * 1. Does not overwrite newer live WebSocket data with older REST rows.
 * 2. Does not erase live signals when REST row fields are null.
 * 3. Populates missing signals from REST if available.
 */
export function reconcileRestWithLive(
  liveState: Record<string, DashboardTelemetryState>,
  restState: Record<string, DashboardTelemetryState>
): Record<string, DashboardTelemetryState> {
  const result: Record<string, DashboardTelemetryState> = { ...liveState };
  const allAssetIds = new Set([...Object.keys(liveState), ...Object.keys(restState)]);

  const signalKeys: (keyof DashboardTelemetryState)[] = [
    'bessPower', 'bessFrequency', 'bessPowerFactor', 'pcsDcVoltage', 'pcsTemp',
    'pcsTemperature', 'pcsLineVoltage', 'pcsAcCurrent', 'tmsAmbientTemp',
    'todayChargeEnergy', 'todayDischargeEnergy', 'accChargeEnergy', 'accDischargeEnergy',
    'gridPower', 'gridFrequency', 'powerFactor',
    'voltageA', 'voltageB', 'voltageC', 'currentA', 'currentB', 'currentC', 'totalPower',
    'bessSoc', 'bmsSoh', 'bmsCurrent', 'cellVMax', 'cellVMin', 'cellTempMax', 'cellTempMin', 'bmsDcVoltage', 'bmsCabinetState',
    'solarPower', 'solarFrequency', 'solarPowerFactor',
  ];

  for (const assetId of allAssetIds) {
    const live = liveState[assetId];
    const rest = restState[assetId];

    if (!live && rest) {
      result[assetId] = rest;
      continue;
    }
    if (live && !rest) {
      result[assetId] = live;
      continue;
    }
    if (!live && !rest) continue;

    const merged: DashboardTelemetryState = { ...live };

    for (const key of signalKeys) {
      const measuredAtKey = `${key}MeasuredAt` as keyof DashboardTelemetryState;
      const liveVal = live[key];
      const liveTs = parseValidTimestamp(live[measuredAtKey]);
      const restVal = rest[key];
      const restTs = parseValidTimestamp(rest[measuredAtKey]);

      if (liveVal === undefined && restVal !== undefined) {
        // Live was missing this signal; populate from REST
        (merged as any)[key] = restVal;
        (merged as any)[measuredAtKey] = rest[measuredAtKey];
      } else if (liveVal !== undefined && restVal !== undefined) {
        // Both have values; compare timestamps
        if (restTs !== null && (liveTs === null || restTs > liveTs)) {
          // REST measurement is strictly newer
          (merged as any)[key] = restVal;
          (merged as any)[measuredAtKey] = rest[measuredAtKey];
        }
      }
    }

    // Packet-level timestamps: retain newest
    const componentTsKeys: (keyof DashboardTelemetryState)[] = [
      'timestamp', 'pcsTimestamp', 'pmgTimestamp', 'pinvTimestamp', 'bcmsTimestamp', 'rjlTimestamp', 'thTimestamp', 'tmsTimestamp',
    ];
    for (const tsKey of componentTsKeys) {
      const liveTs = parseValidTimestamp(live[tsKey]);
      const restTs = parseValidTimestamp(rest[tsKey]);
      if (restTs !== null && (liveTs === null || restTs > liveTs)) {
        (merged as any)[tsKey] = rest[tsKey];
      }
    }

    // Battery status fields
    if (merged.batteryAmbientTemp === undefined && rest.batteryAmbientTemp !== undefined) {
      merged.batteryAmbientTemp = rest.batteryAmbientTemp;
      merged.batteryAmbientTempMeasuredAt = rest.batteryAmbientTempMeasuredAt;
    }
    if (!merged.packTemperatures && rest.packTemperatures) {
      merged.packTemperatures = rest.packTemperatures;
    }

    result[assetId] = merged;
  }

  return result;
}

/**
 * Aggregates site-level telemetry safely across multiple BESS assets.
 * Preserves math safety: sums power metrics, averages SOC, avoids invalid
 * frequency/PF summing.
 */
export function aggregateSiteTelemetrySafe(
  state: Record<string, DashboardTelemetryState>
): DashboardTelemetryState {
  const bessStates = Object.values(state);
  if (bessStates.length === 0) return {};

  const agg: DashboardTelemetryState = {};

  const sumMetric = (
    key: keyof DashboardTelemetryState,
    measuredAtKey: keyof DashboardTelemetryState
  ) => {
    const validPairs = bessStates
      .map(s => ({ val: s[key], ts: s[measuredAtKey] as string | undefined }))
      .filter((p): p is { val: number; ts: string | undefined } => isValidNumber(p.val));

    if (validPairs.length === 0) return;

    (agg as any)[key] = validPairs.reduce((acc, p) => acc + p.val, 0);

    const latestTs = getLatestTimestamp(validPairs.map(p => p.ts));
    if (latestTs) {
      (agg as any)[measuredAtKey] = latestTs;
    }
  };

  const avgMetric = (
    key: keyof DashboardTelemetryState,
    measuredAtKey: keyof DashboardTelemetryState
  ) => {
    const validPairs = bessStates
      .map(s => ({ val: s[key], ts: s[measuredAtKey] as string | undefined }))
      .filter((p): p is { val: number; ts: string | undefined } => isValidNumber(p.val));

    if (validPairs.length === 0) return;

    (agg as any)[key] = validPairs.reduce((acc, p) => acc + p.val, 0) / validPairs.length;

    const latestTs = getLatestTimestamp(validPairs.map(p => p.ts));
    if (latestTs) {
      (agg as any)[measuredAtKey] = latestTs;
    }
  };

  const extremeMetric = (
    key: keyof DashboardTelemetryState,
    measuredAtKey: keyof DashboardTelemetryState,
    isMax: boolean
  ) => {
    const validPairs = bessStates
      .map(s => ({ val: s[key], ts: s[measuredAtKey] as string | undefined }))
      .filter((p): p is { val: number; ts: string | undefined } => isValidNumber(p.val));

    if (validPairs.length === 0) return;

    (agg as any)[key] = isMax
      ? Math.max(...validPairs.map(p => p.val))
      : Math.min(...validPairs.map(p => p.val));

    const latestTs = getLatestTimestamp(validPairs.map(p => p.ts));
    if (latestTs) {
      (agg as any)[measuredAtKey] = latestTs;
    }
  };

  // Additive metrics
  sumMetric('bessPower', 'bessPowerMeasuredAt');
  sumMetric('gridPower', 'gridPowerMeasuredAt');
  sumMetric('solarPower', 'solarPowerMeasuredAt');
  sumMetric('todayChargeEnergy', 'todayChargeEnergyMeasuredAt');
  sumMetric('todayDischargeEnergy', 'todayDischargeEnergyMeasuredAt');
  sumMetric('accChargeEnergy', 'accChargeEnergyMeasuredAt');
  sumMetric('accDischargeEnergy', 'accDischargeEnergyMeasuredAt');

  // Averages
  avgMetric('bessSoc', 'bessSocMeasuredAt');
  avgMetric('bmsSoh', 'bmsSohMeasuredAt');
  avgMetric('bessFrequency', 'bessFrequencyMeasuredAt');
  avgMetric('bessPowerFactor', 'bessPowerFactorMeasuredAt');

  // Extremes
  extremeMetric('cellTempMax', 'cellTempMaxMeasuredAt', true);
  extremeMetric('cellTempMin', 'cellTempMinMeasuredAt', false);
  extremeMetric('cellVMax', 'cellVMaxMeasuredAt', true);
  extremeMetric('pcsTemp', 'pcsTempMeasuredAt', true);
  extremeMetric('cellVMin', 'cellVMinMeasuredAt', false);
  sumMetric('bmsCurrent', 'bmsCurrentMeasuredAt');

  // For single BESS, pass through per-BESS electrical metrics
  if (bessStates.length === 1) {
    const single = bessStates[0];
    agg.gridFrequency = single.gridFrequency;
    agg.gridFrequencyMeasuredAt = single.gridFrequencyMeasuredAt;
    agg.powerFactor = single.powerFactor;
    agg.powerFactorMeasuredAt = single.powerFactorMeasuredAt;
    agg.bessFrequency = single.bessFrequency;
    agg.bessFrequencyMeasuredAt = single.bessFrequencyMeasuredAt;
    agg.bessPowerFactor = single.bessPowerFactor;
    agg.bessPowerFactorMeasuredAt = single.bessPowerFactorMeasuredAt;
    agg.solarFrequency = single.solarFrequency;
    agg.solarFrequencyMeasuredAt = single.solarFrequencyMeasuredAt;
    agg.solarPowerFactor = single.solarPowerFactor;
    agg.solarPowerFactorMeasuredAt = single.solarPowerFactorMeasuredAt;
    agg.pcsDcVoltage = single.pcsDcVoltage;
    agg.pcsDcVoltageMeasuredAt = single.pcsDcVoltageMeasuredAt;
    agg.voltageA = single.voltageA;
    agg.voltageAMeasuredAt = single.voltageAMeasuredAt;
    agg.voltageB = single.voltageB;
    agg.voltageBMeasuredAt = single.voltageBMeasuredAt;
    agg.voltageC = single.voltageC;
    agg.voltageCMeasuredAt = single.voltageCMeasuredAt;
    agg.currentA = single.currentA;
    agg.currentAMeasuredAt = single.currentAMeasuredAt;
    agg.currentB = single.currentB;
    agg.currentBMeasuredAt = single.currentBMeasuredAt;
    agg.currentC = single.currentC;
    agg.currentCMeasuredAt = single.currentCMeasuredAt;
    agg.batteryAmbientTemp = single.batteryAmbientTemp;
    agg.batteryAmbientTempMeasuredAt = single.batteryAmbientTempMeasuredAt;
    agg.packTemperatures = single.packTemperatures;
    agg.pcsTemperature = single.pcsTemperature;
    agg.pcsTemperatureMeasuredAt = single.pcsTemperatureMeasuredAt;
    agg.pcsLineVoltage = single.pcsLineVoltage;
    agg.pcsLineVoltageMeasuredAt = single.pcsLineVoltageMeasuredAt;
    agg.pcsAcCurrent = single.pcsAcCurrent;
    agg.pcsAcCurrentMeasuredAt = single.pcsAcCurrentMeasuredAt;
    agg.tmsAmbientTemp = single.tmsAmbientTemp;
    agg.tmsAmbientTempMeasuredAt = single.tmsAmbientTempMeasuredAt;
    agg.tmsOperatingMode = single.tmsOperatingMode;
    agg.tmsOperatingModeMeasuredAt = single.tmsOperatingModeMeasuredAt;
    agg.tmsCoolantReturnTemp = single.tmsCoolantReturnTemp;
    agg.tmsCoolantReturnTempMeasuredAt = single.tmsCoolantReturnTempMeasuredAt;
    agg.tmsCoolantInletTemp = single.tmsCoolantInletTemp;
    agg.tmsCoolantInletTempMeasuredAt = single.tmsCoolantInletTempMeasuredAt;
    agg.tmsCoolantReturnPressure = single.tmsCoolantReturnPressure;
    agg.tmsCoolantReturnPressureMeasuredAt = single.tmsCoolantReturnPressureMeasuredAt;
    agg.tmsCoolantInletPressure = single.tmsCoolantInletPressure;
    agg.tmsCoolantInletPressureMeasuredAt = single.tmsCoolantInletPressureMeasuredAt;
    agg.bmsCurrent = single.bmsCurrent;
    agg.bmsCurrentMeasuredAt = single.bmsCurrentMeasuredAt;
    agg.cellTempMin = single.cellTempMin;
    agg.cellTempMinMeasuredAt = single.cellTempMinMeasuredAt;
    agg.bmsDcVoltage = single.bmsDcVoltage;
    agg.bmsDcVoltageMeasuredAt = single.bmsDcVoltageMeasuredAt;
    agg.bmsCabinetState = single.bmsCabinetState;
    agg.bmsCabinetStateMeasuredAt = single.bmsCabinetStateMeasuredAt;
  }

  // Component timestamps: latest across BESS states
  const componentKeys: (keyof DashboardTelemetryState)[] = [
    'timestamp', 'pcsTimestamp', 'pmgTimestamp', 'pinvTimestamp', 'bcmsTimestamp', 'rjlTimestamp', 'thTimestamp', 'tmsTimestamp',
  ];
  for (const k of componentKeys) {
    const latestTs = getLatestTimestamp(bessStates.map(s => s[k] as string | undefined));
    if (latestTs) {
      (agg as any)[k] = latestTs;
    }
  }

  return agg;
}

// ---------------------------------------------------------------------------
// Overall Telemetry & Subsystem Freshness Status Evaluation
// ---------------------------------------------------------------------------

export type OverallTelemetryState =
  | 'DISCONNECTED'
  | 'WAITING_FOR_DATA'
  | 'LIVE'
  | 'PARTIAL_STREAM'
  | 'STALE';

export interface SubsystemFreshnessInput {
  id: string; // e.g. 'pcs', 'pmg', 'pinv'
  name: string; // e.g. 'BESS', 'Grid Meter', 'Solar Inverter'
  isConfigured: boolean;
  evaluation: SignalFreshnessResult;
}

export interface OverallTelemetryStatusResult {
  state: OverallTelemetryState;
  isLive: boolean;
  isDegraded: boolean;
  isStale: boolean;
  badgeLabel: string;
  badgeVariant: 'emerald' | 'amber' | 'slate';
  systemStatusLabel: string;
  configuredCount: number;
  healthyCount: number;
  staleCount: number;
  noDataCount: number;
}

export interface EvaluateOverallTelemetryOptions {
  isConnected: boolean;
  hasPacketsReceived: boolean;
  subsystems: SubsystemFreshnessInput[];
}

/**
 * Evaluates overall dashboard status across configured telemetry subsystems.
 *
 * Rules:
 * 1. BESS Power freshness alone does NOT imply all subsystems are healthy.
 * 2. Unconfigured subsystems (e.g. no solar inverter installed) NEVER penalize health.
 * 3. Distinguishes fully live (all configured fresh/held) from partial/degraded (at least one fresh/held, but at least one stale/missing).
 * 4. Preserves connection/disconnection state.
 * 5. Free from client-specific hardcoding.
 */
export function evaluateOverallTelemetryStatus({
  isConnected,
  hasPacketsReceived,
  subsystems,
}: EvaluateOverallTelemetryOptions): OverallTelemetryStatusResult {
  if (!isConnected) {
    return {
      state: 'DISCONNECTED',
      isLive: false,
      isDegraded: false,
      isStale: false,
      badgeLabel: 'DISCONNECTED',
      badgeVariant: 'slate',
      systemStatusLabel: 'Disconnected',
      configuredCount: 0,
      healthyCount: 0,
      staleCount: 0,
      noDataCount: 0,
    };
  }

  // Filter strictly to subsystems configured at this site
  const configured = subsystems.filter(s => s.isConfigured);
  const configuredCount = configured.length;

  let healthyCount = 0; // LIVE_FRESH or HELD
  let staleCount = 0;   // STALE
  let noDataCount = 0;  // NO_DATA

  for (const sub of configured) {
    if (sub.evaluation.isFresh || sub.evaluation.isHeld) {
      healthyCount++;
    } else if (sub.evaluation.isStale) {
      staleCount++;
    } else {
      noDataCount++;
    }
  }

  // Not yet received packets or all configured subsystems have no data
  if (!hasPacketsReceived || (configuredCount > 0 && noDataCount === configuredCount)) {
    return {
      state: 'WAITING_FOR_DATA',
      isLive: false,
      isDegraded: false,
      isStale: false,
      badgeLabel: 'CONNECTED — Waiting for live updates',
      badgeVariant: 'slate',
      systemStatusLabel: 'Connected',
      configuredCount,
      healthyCount,
      staleCount,
      noDataCount,
    };
  }

  // All configured subsystems are healthy (fresh or held)
  if (configuredCount > 0 && healthyCount === configuredCount) {
    return {
      state: 'LIVE',
      isLive: true,
      isDegraded: false,
      isStale: false,
      badgeLabel: 'LIVE',
      badgeVariant: 'emerald',
      systemStatusLabel: 'System Online',
      configuredCount,
      healthyCount,
      staleCount,
      noDataCount,
    };
  }

  // Degraded / Partial stream: some configured components healthy, but at least one stale or missing
  if (healthyCount > 0 && healthyCount < configuredCount) {
    return {
      state: 'PARTIAL_STREAM',
      isLive: false,
      isDegraded: true,
      isStale: false,
      badgeLabel: 'PARTIAL STREAM',
      badgeVariant: 'amber',
      systemStatusLabel: 'Partial Stream',
      configuredCount,
      healthyCount,
      staleCount,
      noDataCount,
    };
  }

  // All configured subsystems with telemetry are stale
  if (staleCount > 0) {
    return {
      state: 'STALE',
      isLive: false,
      isDegraded: false,
      isStale: true,
      badgeLabel: 'STALE',
      badgeVariant: 'slate',
      systemStatusLabel: 'System Stale',
      configuredCount,
      healthyCount,
      staleCount,
      noDataCount,
    };
  }

  // Default fallback for edge cases
  return {
    state: 'WAITING_FOR_DATA',
    isLive: false,
    isDegraded: false,
    isStale: false,
    badgeLabel: 'CONNECTED — Waiting for live updates',
    badgeVariant: 'slate',
    systemStatusLabel: 'Connected',
    configuredCount,
    healthyCount,
    staleCount,
    noDataCount,
  };
}

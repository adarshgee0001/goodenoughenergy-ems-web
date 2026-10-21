/**
 * BMS Telemetry Utilities
 *
 * Provides shared calculation, validation, normalization, and formatting helpers
 * for the 7 R&D-confirmed BMS measurements (component: bcms):
 *
 * 1. Max Cell Voltage: bcms.ai_max_cell_vol (V, 3 decimals)
 * 2. Min Cell Voltage: bcms.ai_min_vol strictly (V, 3 decimals). No fallback to ai_min_cell_vol.
 * 3. Max Cell Temperature: bcms.ai_max_temp (°C, 1 decimal)
 * 4. Min Cell Temperature: bcms.ai_min_temp (°C, 1 decimal)
 * 5. DC Voltage: bcms.ai_sum_u (V, 1 decimal) - never substitute PCS DC Voltage.
 * 6. DC Current: bcms.ai_sum_i (A, 1 decimal) - preserve valid 0 and negative current.
 * 7. Cabinet State: bcms.di_rcdhg_stat (Discrete state: 0=STANDBY, 1=DISCHARGING, 2=CHARGING)
 *
 * Rules:
 * - Genuine numeric zero (0) is preserved as an active measurement across all metrics.
 * - Negative current readings are preserved.
 * - Non-numeric, null, undefined, NaN, and Infinity are rejected (never converted to 0).
 */

export function isValidFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && !Number.isNaN(value) && Number.isFinite(value);
}

/**
 * Normalizes raw Cabinet State from bcms.di_rcdhg_stat into discrete state code 0, 1, or 2.
 * Returns undefined for missing, non-finite, out-of-range, or invalid values.
 *
 * State mapping:
 *   0 = STANDBY
 *   1 = DISCHARGING
 *   2 = CHARGING
 */
export function normalizeCabinetState(rawValue: unknown): number | undefined {
  if (rawValue === null || rawValue === undefined) {
    return undefined;
  }
  const num = typeof rawValue === 'number' ? rawValue : Number(rawValue);
  if (!Number.isFinite(num) || !Number.isInteger(num)) {
    return undefined;
  }
  if (num === 0 || num === 1 || num === 2) {
    return num;
  }
  return undefined;
}

/**
 * Formats a discrete state code into its authoritative human-readable label.
 * Returns an empty string if code is unavailable or invalid (ideal for CSV export).
 */
export function formatCabinetState(code: number | null | undefined): string {
  if (code === 0) return 'STANDBY';
  if (code === 1) return 'DISCHARGING';
  if (code === 2) return 'CHARGING';
  return '';
}

/**
 * Formats a discrete state code into its UI display label ('NO DATA' when unavailable).
 */
export function formatCabinetStateUi(code: number | null | undefined): string {
  if (code === 0) return 'STANDBY';
  if (code === 1) return 'DISCHARGING';
  if (code === 2) return 'CHARGING';
  return 'NO DATA';
}

/**
 * Rounds a numeric measurement to 1 decimal place.
 * Returns null if input is null, undefined, or non-finite.
 */
export function round1Dec(val: number | null | undefined): number | null {
  if (val === null || val === undefined || !Number.isFinite(Number(val))) {
    return null;
  }
  const n = Number(val);
  return Math.round(n * 10) / 10;
}

/**
 * Rounds a numeric measurement to 3 decimal places.
 * Returns null if input is null, undefined, or non-finite.
 */
export function round3Dec(val: number | null | undefined): number | null {
  if (val === null || val === undefined || !Number.isFinite(Number(val))) {
    return null;
  }
  const n = Number(val);
  return Math.round(n * 1000) / 1000;
}

/**
 * Post-processes BMS measurements on report rows to ensure standard rounding
 * and strict null formatting according to confirmed display precision.
 */
export function processReportBmsRow(row: any): void {
  if (!row) return;

  // Max Cell Voltage (3 decimals)
  if (row.cellVMax != null) {
    const num = Number(row.cellVMax);
    row.cellVMax = Number.isFinite(num) ? round3Dec(num) : null;
  } else {
    row.cellVMax = null;
  }

  // Min Cell Voltage (3 decimals)
  if (row.cellVMin != null) {
    const num = Number(row.cellVMin);
    row.cellVMin = Number.isFinite(num) ? round3Dec(num) : null;
  } else {
    row.cellVMin = null;
  }

  // Max Cell Temperature (1 decimal)
  if (row.cellTempMax != null) {
    const num = Number(row.cellTempMax);
    row.cellTempMax = Number.isFinite(num) ? round1Dec(num) : null;
  } else {
    row.cellTempMax = null;
  }

  // Min Cell Temperature (1 decimal)
  if (row.cellTempMin != null) {
    const num = Number(row.cellTempMin);
    row.cellTempMin = Number.isFinite(num) ? round1Dec(num) : null;
  } else {
    row.cellTempMin = null;
  }

  // BMS DC Voltage (1 decimal)
  if (row.bmsDcVoltage != null) {
    const num = Number(row.bmsDcVoltage);
    row.bmsDcVoltage = Number.isFinite(num) ? round1Dec(num) : null;
  } else {
    row.bmsDcVoltage = null;
  }

  // BMS Current (1 decimal) - preserves zero and negative values
  if (row.bmsCurrent != null) {
    const num = Number(row.bmsCurrent);
    row.bmsCurrent = Number.isFinite(num) ? round1Dec(num) : null;
  } else {
    row.bmsCurrent = null;
  }

  // Cabinet State - normalized discrete integer
  if (row.bmsCabinetState != null) {
    const norm = normalizeCabinetState(row.bmsCabinetState);
    row.bmsCabinetState = norm !== undefined ? norm : null;
  } else {
    row.bmsCabinetState = null;
  }
}

/**
 * TMS Telemetry Utilities
 *
 * Provides shared calculation, validation, normalization, and formatting helpers
 * for the 6 R&D-confirmed TMS measurements (component: tms):
 *
 * 1. Operating Mode: tms.di_singco_state (Discrete mode: 0=STOP, 1=SELF-CIRCULATION, 2=UNKNOWN until confirmed, 3=HEATING, 4=FAULT)
 * 2. Ambient Temperature: tms.ai_at (°C, 1 decimal)
 * 3. Battery Coolant Return Temperature: tms.ai_iw_temp (°C, 1 decimal) - Coolant entering chiller from battery
 * 4. Battery Coolant Inlet Temperature: tms.ai_ow_temp (°C, 1 decimal) - Coolant returning to battery from chiller
 * 5. Coolant Return Pressure: tms.ai_iw_prs (bar, 2 decimals)
 * 6. Coolant Inlet Pressure: tms.ai_ow_prs (bar, 2 decimals)
 *
 * Physical Direction:
 * - ai_iw_*: coolant returning from battery to chiller; display as Return
 * - ai_ow_*: coolant leaving chiller and going to battery; display as Inlet
 *
 * Rules:
 * - Genuine numeric zero (0) is preserved as an active measurement across all metrics.
 * - Negative temperature readings are preserved.
 * - Non-numeric, null, undefined, NaN, and Infinity are rejected (never converted to 0).
 */

export function isValidFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && !Number.isNaN(value) && Number.isFinite(value);
}

/**
 * Authoritative operating mode labels.
 * Value 2 remains 'UNKNOWN' pending explicit R&D confirmation.
 */
export const TMS_MODE_LABELS: Record<number, string> = {
  0: 'STOP',
  1: 'SELF-CIRCULATION',
  2: 'UNKNOWN', // Value 2 is explicitly UNKNOWN until R&D confirms label
  3: 'HEATING',
  4: 'FAULT',
};

/**
 * Normalizes raw Operating Mode from tms.di_singco_state into discrete code 0..4.
 * Returns undefined for missing, non-finite, out-of-range, or invalid values.
 */
export function normalizeTmsMode(rawValue: unknown): number | undefined {
  if (rawValue === null || rawValue === undefined) {
    return undefined;
  }
  const num = typeof rawValue === 'number' ? rawValue : Number(rawValue);
  if (!Number.isFinite(num) || !Number.isInteger(num)) {
    return undefined;
  }
  if (num in TMS_MODE_LABELS) {
    return num;
  }
  return undefined;
}

/**
 * Formats a discrete mode code into its export label.
 * Returns an empty string if code is unavailable or invalid (ideal for CSV export).
 * For value 2, returns 'UNKNOWN' per requirement.
 */
export function formatTmsMode(code: number | null | undefined): string {
  if (code === null || code === undefined) {
    return '';
  }
  const num = Number(code);
  if (num in TMS_MODE_LABELS) {
    return TMS_MODE_LABELS[num];
  }
  return '';
}

/**
 * Formats a discrete mode code into its UI display label ('NO DATA' when unavailable, 'UNKNOWN' when unconfirmed/unsupported).
 */
export function formatTmsModeUi(code: number | null | undefined): string {
  if (code === null || code === undefined) {
    return 'NO DATA';
  }
  const num = Number(code);
  if (num in TMS_MODE_LABELS) {
    return TMS_MODE_LABELS[num];
  }
  return 'UNKNOWN';
}

/**
 * Rounds a numeric measurement to 1 decimal place (temperatures).
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
 * Rounds a numeric measurement to 2 decimal places (pressures in bar).
 * Returns null if input is null, undefined, or non-finite.
 */
export function round2Dec(val: number | null | undefined): number | null {
  if (val === null || val === undefined || !Number.isFinite(Number(val))) {
    return null;
  }
  const n = Number(val);
  return Math.round(n * 100) / 100;
}

/**
 * Post-processes TMS measurements on report rows to ensure standard rounding
 * and strict null formatting according to confirmed display precision.
 */
export function processReportTmsRow(row: any): void {
  if (!row) return;

  // Operating Mode - discrete integer code
  if (row.tmsOperatingMode != null) {
    const norm = normalizeTmsMode(row.tmsOperatingMode);
    row.tmsOperatingMode = norm !== undefined ? norm : null;
  } else {
    row.tmsOperatingMode = null;
  }

  // Ambient Temperature (1 decimal)
  if (row.tmsAmbientTemp != null) {
    const num = Number(row.tmsAmbientTemp);
    row.tmsAmbientTemp = Number.isFinite(num) ? round1Dec(num) : null;
  } else {
    row.tmsAmbientTemp = null;
  }

  // Battery Coolant Return Temperature (1 decimal)
  if (row.tmsCoolantReturnTemp != null) {
    const num = Number(row.tmsCoolantReturnTemp);
    row.tmsCoolantReturnTemp = Number.isFinite(num) ? round1Dec(num) : null;
  } else {
    row.tmsCoolantReturnTemp = null;
  }

  // Battery Coolant Inlet Temperature (1 decimal)
  if (row.tmsCoolantInletTemp != null) {
    const num = Number(row.tmsCoolantInletTemp);
    row.tmsCoolantInletTemp = Number.isFinite(num) ? round1Dec(num) : null;
  } else {
    row.tmsCoolantInletTemp = null;
  }

  // Coolant Return Pressure (2 decimals, bar)
  if (row.tmsCoolantReturnPressure != null) {
    const num = Number(row.tmsCoolantReturnPressure);
    row.tmsCoolantReturnPressure = Number.isFinite(num) ? round2Dec(num) : null;
  } else {
    row.tmsCoolantReturnPressure = null;
  }

  // Coolant Inlet Pressure (2 decimals, bar)
  if (row.tmsCoolantInletPressure != null) {
    const num = Number(row.tmsCoolantInletPressure);
    row.tmsCoolantInletPressure = Number.isFinite(num) ? round2Dec(num) : null;
  } else {
    row.tmsCoolantInletPressure = null;
  }
}

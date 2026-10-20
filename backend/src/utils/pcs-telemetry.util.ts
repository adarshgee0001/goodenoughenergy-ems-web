/**
 * PCS Telemetry Utilities
 *
 * Provides shared calculation and normalization helpers for PCS measurements:
 * - PCS Temperature: strictly pcs.ai_igbt_temp (no fallback)
 * - Line Voltage: arithmetic mean of pcs.ai_out_uab, pcs.ai_out_ubc, pcs.ai_out_uca
 * - AC Current: arithmetic mean of pcs.ai_ia, pcs.ai_ib, pcs.ai_ic
 *
 * Rules:
 * - Requires all 3 corresponding phase readings to be present and finite.
 * - Genuine numeric zero (0) is preserved as an active measurement.
 * - If any required phase reading is unavailable or invalid, returns undefined.
 * - Rejects null, undefined, NaN, and Infinity.
 * - Intermediate values are not rounded before calculating the mean.
 */

export function isValidFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && !Number.isNaN(value) && Number.isFinite(value);
}

/**
 * Calculates PCS Line Voltage as the arithmetic mean of the three line-to-line voltages:
 * ai_out_uab, ai_out_ubc, ai_out_uca.
 *
 * Returns undefined if any of the three phases is missing or non-finite.
 */
export function calculateLineVoltage(
  uab: unknown,
  ubc: unknown,
  uca: unknown
): number | undefined {
  if (!isValidFiniteNumber(uab) || !isValidFiniteNumber(ubc) || !isValidFiniteNumber(uca)) {
    return undefined;
  }
  return (uab + ubc + uca) / 3;
}

/**
 * Calculates PCS AC Current as the arithmetic mean of the three phase currents:
 * ai_ia, ai_ib, ai_ic.
 *
 * Returns undefined if any of the three phases is missing or non-finite.
 */
export function calculateAcCurrent(
  ia: unknown,
  ib: unknown,
  ic: unknown
): number | undefined {
  if (!isValidFiniteNumber(ia) || !isValidFiniteNumber(ib) || !isValidFiniteNumber(ic)) {
    return undefined;
  }
  return (ia + ib + ic) / 3;
}

/**
 * Validates PCS Temperature strictly from pcs.ai_igbt_temp.
 * Does not substitute ai_temp, ai_ta, th.ai_temp, or tms.ai_at.
 */
export function getPcsTemperature(aiIgbtTemp: unknown): number | undefined {
  if (!isValidFiniteNumber(aiIgbtTemp)) {
    return undefined;
  }
  return aiIgbtTemp;
}

/**
 * Validates Ambient Temperature strictly from tms.ai_at.
 * Does not substitute th.ai_temp, pcs.ai_temp, or pcs.ai_ta.
 */
export function getTmsAmbientTemperature(aiAt: unknown): number | undefined {
  if (!isValidFiniteNumber(aiAt)) {
    return undefined;
  }
  return aiAt;
}

/**
 * Rounds a numeric measurement to 1 decimal place.
 * Returns null if input is null or undefined.
 */
export function round1Dec(val: number | null | undefined): number | null {
  if (val === null || val === undefined || !Number.isFinite(val)) {
    return null;
  }
  return Math.round(val * 10) / 10;
}

/**
 * Post-processes PCS and TMS measurements on report rows to ensure standard 1-decimal rounding
 * and strict null formatting.
 */
export function processReportPcsRow(row: any): void {
  if (!row) return;

  if (row.pcsTemperature != null) {
    const num = Number(row.pcsTemperature);
    row.pcsTemperature = Number.isFinite(num) ? round1Dec(num) : null;
  } else {
    row.pcsTemperature = null;
  }

  if (row.pcsLineVoltage != null) {
    const num = Number(row.pcsLineVoltage);
    row.pcsLineVoltage = Number.isFinite(num) ? round1Dec(num) : null;
  } else {
    row.pcsLineVoltage = null;
  }

  if (row.pcsAcCurrent != null) {
    const num = Number(row.pcsAcCurrent);
    row.pcsAcCurrent = Number.isFinite(num) ? round1Dec(num) : null;
  } else {
    row.pcsAcCurrent = null;
  }

  if (row.tmsAmbientTemp != null) {
    const num = Number(row.tmsAmbientTemp);
    row.tmsAmbientTemp = Number.isFinite(num) ? round1Dec(num) : null;
  } else {
    row.tmsAmbientTemp = null;
  }
}


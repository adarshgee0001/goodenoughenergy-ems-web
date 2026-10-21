export interface PackTemperatureResult {
  avgTemp?: number;
  maxTemp?: number;
  eligibleCount: number;
}

/**
 * Identifies recognized battery pack temperature signals based on verified firmware payload schemas:
 * - Pole temperatures: ai_negpol_temp, ai_pospol_temp
 * - Cell temperature probes: ai_temp_01 .. ai_temp_NN (e.g. /^ai_temp_\d+$/)
 *
 * Explicitly rejects non-temperature measurements (voltages, currents, states, alarms, arbitrary keys).
 */
export function isRecognizedPackTemperatureSignal(signalName: unknown): boolean {
  if (typeof signalName !== 'string' || !signalName) return false;
  return /^(ai_temp_\d+|ai_negpol_temp|ai_pospol_temp)$/.test(signalName);
}

/**
 * Calculates battery pack average and maximum temperature following the manager's rule:
 * 1. Discards non-numeric, null, undefined, NaN, and non-finite values without converting them to 0.
 * 2. Identifies the index of the last non-zero reading (L) in the ordered sequence.
 * 3. Legitimate zeros occurring at indices <= L are strictly included in the average and max.
 * 4. Trailing zeros occurring at indices > L are strictly excluded.
 * 5. Negative values are preserved if present (valid temperature measurements).
 * 6. If all values are 0 (or no non-zero reading exists), returns undefined for avgTemp and maxTemp
 *    to avoid inventing an unverified 0.0°C measurement.
 */
export function calculatePackTemperatures(
  readings: Array<number | null | undefined | unknown>
): PackTemperatureResult {
  if (!Array.isArray(readings) || readings.length === 0) {
    return { avgTemp: undefined, maxTemp: undefined, eligibleCount: 0 };
  }

  // Filter and map valid numeric values while preserving array positions
  const numericReadings = readings.map((v) => {
    if (v === null || v === undefined) return null;
    const num = Number(v);
    return Number.isFinite(num) ? num : null;
  });

  // Find index of last non-zero valid reading
  let lastNonZeroIdx = -1;
  for (let i = numericReadings.length - 1; i >= 0; i--) {
    const val = numericReadings[i];
    if (val !== null && val !== 0) {
      lastNonZeroIdx = i;
      break;
    }
  }

  // If all values are 0 or no valid non-zero reading was found, do not invent a measurement
  if (lastNonZeroIdx === -1) {
    return { avgTemp: undefined, maxTemp: undefined, eligibleCount: 0 };
  }

  // Collect eligible values up to and including lastNonZeroIdx
  const eligibleValues: number[] = [];
  for (let i = 0; i <= lastNonZeroIdx; i++) {
    const val = numericReadings[i];
    if (val !== null) {
      eligibleValues.push(val);
    }
  }

  if (eligibleValues.length === 0) {
    return { avgTemp: undefined, maxTemp: undefined, eligibleCount: 0 };
  }

  const sum = eligibleValues.reduce((acc, v) => acc + v, 0);
  const avgTemp = Number((sum / eligibleValues.length).toFixed(1));
  const maxTemp = Number(Math.max(...eligibleValues).toFixed(1));

  return { avgTemp, maxTemp, eligibleCount: eligibleValues.length };
}

export interface AggregatedPackTemperature {
  avgTemp: number | null;
  maxTemp: number | null;
}

/**
 * Aggregates multiple pack raw payloads within a report time bucket.
 * Strategy:
 * 1. For each payload, extracts only recognized temperature signals.
 * 2. Computes the sample average and maximum using calculatePackTemperatures().
 * 3. Bucket avgTemp is the mean of sample averages across the bucket (rounded to 1 decimal).
 * 4. Bucket maxTemp is the maximum of sample maximums across the bucket (rounded to 1 decimal).
 * 5. Returns { avgTemp: null, maxTemp: null } if no valid samples are found.
 */
export function aggregatePackPayloads(payloads: any[] | null | undefined): AggregatedPackTemperature {
  if (!Array.isArray(payloads) || payloads.length === 0) {
    return { avgTemp: null, maxTemp: null };
  }

  const sampleAverages: number[] = [];
  const sampleMaximums: number[] = [];

  for (const payload of payloads) {
    if (!Array.isArray(payload) || payload.length === 0) continue;
    const tempSignals = payload.filter((s: any) => s && s.m && isRecognizedPackTemperatureSignal(s.m));
    if (tempSignals.length === 0) continue;
    const calc = calculatePackTemperatures(tempSignals.map((s: any) => s.v));
    if (calc.avgTemp !== undefined) sampleAverages.push(calc.avgTemp);
    if (calc.maxTemp !== undefined) sampleMaximums.push(calc.maxTemp);
  }

  if (sampleAverages.length === 0 || sampleMaximums.length === 0) {
    return { avgTemp: null, maxTemp: null };
  }

  const avg = Number((sampleAverages.reduce((sum, v) => sum + v, 0) / sampleAverages.length).toFixed(1));
  const max = Number(Math.max(...sampleMaximums).toFixed(1));
  return { avgTemp: avg, maxTemp: max };
}

/**
 * Normalizes report battery status fields for a single report row.
 * Computes batteryAmbientTemp and pack 01-05 average and maximum temperatures,
 * cleaning up raw payload arrays.
 */
export function processReportBatteryStatusRow(row: any): void {
  if (!row) return;

  // Battery Ambient Temperature
  if (row.batteryAmbientTemp != null) {
    const num = Number(row.batteryAmbientTemp);
    row.batteryAmbientTemp = Number.isFinite(num) ? Number(num.toFixed(1)) : null;
  } else {
    row.batteryAmbientTemp = null;
  }

  // Pack 01 .. Pack 05
  if (row.pack01Payloads !== undefined) {
    const p1 = aggregatePackPayloads(row.pack01Payloads);
    row.pack01AvgTemp = p1.avgTemp;
    row.pack01MaxTemp = p1.maxTemp;
    delete row.pack01Payloads;
  } else if (row.pack01AvgTemp !== undefined) {
    row.pack01AvgTemp = row.pack01AvgTemp != null ? Number(Number(row.pack01AvgTemp).toFixed(1)) : null;
    row.pack01MaxTemp = row.pack01MaxTemp != null ? Number(Number(row.pack01MaxTemp).toFixed(1)) : null;
  } else {
    row.pack01AvgTemp = null;
    row.pack01MaxTemp = null;
  }

  if (row.pack02Payloads !== undefined) {
    const p2 = aggregatePackPayloads(row.pack02Payloads);
    row.pack02AvgTemp = p2.avgTemp;
    row.pack02MaxTemp = p2.maxTemp;
    delete row.pack02Payloads;
  } else if (row.pack02AvgTemp !== undefined) {
    row.pack02AvgTemp = row.pack02AvgTemp != null ? Number(Number(row.pack02AvgTemp).toFixed(1)) : null;
    row.pack02MaxTemp = row.pack02MaxTemp != null ? Number(Number(row.pack02MaxTemp).toFixed(1)) : null;
  } else {
    row.pack02AvgTemp = null;
    row.pack02MaxTemp = null;
  }

  if (row.pack03Payloads !== undefined) {
    const p3 = aggregatePackPayloads(row.pack03Payloads);
    row.pack03AvgTemp = p3.avgTemp;
    row.pack03MaxTemp = p3.maxTemp;
    delete row.pack03Payloads;
  } else if (row.pack03AvgTemp !== undefined) {
    row.pack03AvgTemp = row.pack03AvgTemp != null ? Number(Number(row.pack03AvgTemp).toFixed(1)) : null;
    row.pack03MaxTemp = row.pack03MaxTemp != null ? Number(Number(row.pack03MaxTemp).toFixed(1)) : null;
  } else {
    row.pack03AvgTemp = null;
    row.pack03MaxTemp = null;
  }

  if (row.pack04Payloads !== undefined) {
    const p4 = aggregatePackPayloads(row.pack04Payloads);
    row.pack04AvgTemp = p4.avgTemp;
    row.pack04MaxTemp = p4.maxTemp;
    delete row.pack04Payloads;
  } else if (row.pack04AvgTemp !== undefined) {
    row.pack04AvgTemp = row.pack04AvgTemp != null ? Number(Number(row.pack04AvgTemp).toFixed(1)) : null;
    row.pack04MaxTemp = row.pack04MaxTemp != null ? Number(Number(row.pack04MaxTemp).toFixed(1)) : null;
  } else {
    row.pack04AvgTemp = null;
    row.pack04MaxTemp = null;
  }

  if (row.pack05Payloads !== undefined) {
    const p5 = aggregatePackPayloads(row.pack05Payloads);
    row.pack05AvgTemp = p5.avgTemp;
    row.pack05MaxTemp = p5.maxTemp;
    delete row.pack05Payloads;
  } else if (row.pack05AvgTemp !== undefined) {
    row.pack05AvgTemp = row.pack05AvgTemp != null ? Number(Number(row.pack05AvgTemp).toFixed(1)) : null;
    row.pack05MaxTemp = row.pack05MaxTemp != null ? Number(Number(row.pack05MaxTemp).toFixed(1)) : null;
  } else {
    row.pack05AvgTemp = null;
    row.pack05MaxTemp = null;
  }
}


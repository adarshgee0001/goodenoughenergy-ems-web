import { describe, it, expect } from 'vitest';
import { formatPowerValue } from '../../../frontend/src/features/dashboard/freshness.utils';
import type { DashboardTelemetryState } from '../../../frontend/src/features/dashboard/dashboard.types';

describe('Energy Flow Power Formatting Suite', () => {
  // 1. Standard decimal values
  it('1. Formats standard two-decimal values correctly', () => {
    expect(formatPowerValue(26.65)).toBe('26.65');
    expect(formatPowerValue(10.55)).toBe('10.55');
  });

  // 2. Values with excessive precision
  it('2. Rounds values with excessive decimal precision to at most 2 decimal places', () => {
    expect(formatPowerValue(0.468253)).toBe('0.47');
    expect(formatPowerValue(1.2345678)).toBe('1.23');
    expect(formatPowerValue(99.9876)).toBe('99.99');
  });

  // 3. Negative values
  it('3. Preserves negative signs correctly and caps decimals at 2 places', () => {
    expect(formatPowerValue(-0.1)).toBe('-0.1');
    expect(formatPowerValue(-0.123456)).toBe('-0.12');
    expect(formatPowerValue(-50.567)).toBe('-50.57');
    expect(formatPowerValue(-100)).toBe('-100');
  });

  // 4. Values that round up
  it('4. Rounds up values correctly', () => {
    expect(formatPowerValue(12.999)).toBe('13');
    expect(formatPowerValue(0.009)).toBe('0.01');
    expect(formatPowerValue(9.996)).toBe('10');
  });

  // 5. Integer values
  it('5. Formats integer values without unnecessary trailing decimals', () => {
    expect(formatPowerValue(12)).toBe('12');
    expect(formatPowerValue(100)).toBe('100');
    expect(formatPowerValue(25)).toBe('25');
  });

  // 6. Numeric zero
  it('6. Preserves numeric zero as valid measurement', () => {
    expect(formatPowerValue(0)).toBe('0');
    // Avoid -0 representation
    expect(formatPowerValue(-0)).toBe('0');
    expect(formatPowerValue(-0.001)).toBe('0');
  });

  // 7. Null, undefined, missing, NaN, and infinite values
  it('7. Returns "--" for null, undefined, NaN, and non-finite numbers', () => {
    expect(formatPowerValue(null)).toBe('--');
    expect(formatPowerValue(undefined)).toBe('--');
    expect(formatPowerValue(NaN)).toBe('--');
    expect(formatPowerValue(Infinity)).toBe('--');
    expect(formatPowerValue(-Infinity)).toBe('--');
    expect(formatPowerValue('invalid' as any)).toBe('--');
    expect(formatPowerValue({} as any)).toBe('--');
  });

  // 8. Confirmation that raw telemetry value remains unchanged after display formatting
  it('8. Confirms raw telemetry state remains unchanged after formatting', () => {
    const rawTelemetry: DashboardTelemetryState = {
      gridPower: 0.468253,
      bessPower: -0.123456,
      solarPower: 26.654321,
    };

    const formattedGrid = formatPowerValue(rawTelemetry.gridPower);
    const formattedBess = formatPowerValue(rawTelemetry.bessPower);
    const formattedSolar = formatPowerValue(rawTelemetry.solarPower);

    expect(formattedGrid).toBe('0.47');
    expect(formattedBess).toBe('-0.12');
    expect(formattedSolar).toBe('26.65');

    // Telemetry state properties strictly retain original float precision
    expect(rawTelemetry.gridPower).toBe(0.468253);
    expect(rawTelemetry.bessPower).toBe(-0.123456);
    expect(rawTelemetry.solarPower).toBe(26.654321);
  });

  // 9. Consistent formatting across Solar PV, Grid, and BESS nodes
  it('9. Formats Solar PV, Grid, and BESS consistently with prompt examples', () => {
    const nodeSamples = [
      { node: 'Solar PV', raw: 26.65, expected: '26.65' },
      { node: 'Grid', raw: 0.468253, expected: '0.47' },
      { node: 'BESS', raw: -0.1, expected: '-0.1' },
      { node: 'BESS Discharging', raw: -0.123456, expected: '-0.12' },
      { node: 'Idle Node', raw: 0, expected: '0' },
      { node: 'Rounding Node', raw: 12.999, expected: '13' },
    ];

    for (const sample of nodeSamples) {
      const formatted = formatPowerValue(sample.raw);
      expect(formatted).toBe(sample.expected);
      const displayWithUnit = `${formatted} kW`;
      expect(displayWithUnit).toBe(`${sample.expected} kW`);
    }
  });
});

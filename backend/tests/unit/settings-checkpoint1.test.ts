import { describe, it, expect } from 'vitest';
import {
  formatPowerDisplay,
  formatEnergyDisplay,
  formatDateCustom,
  formatTimeCustom,
  formatDateTimeCustom,
  validatePreferences,
} from '../../../frontend/src/features/settings/settings.utils';
import { formatAlarmTime } from '../../../frontend/src/utils/formatTime';
import { DEFAULT_PREFERENCES } from '../../../frontend/src/features/settings/settings.types';
import type {
  PowerUnit,
  EnergyUnit,
  DateFormat,
  TimeFormat,
  UserPreferences,
} from '../../../frontend/src/features/settings/settings.types';

describe('Checkpoint 1: Production-Grade EMS Settings Implementation', () => {
  describe('A. Date/Time Formatters', () => {
    // Known deterministic UTC timestamps
    // 2026-10-15T12:00:00.000Z (Noon UTC)
    // 2026-10-15T00:00:00.000Z (Midnight UTC)
    // 2026-10-15T14:30:45.000 (Local time test date)
    const testDate = new Date(2026, 9, 15, 14, 30, 45); // Oct 15, 2026 14:30:45 local
    const midnightDate = new Date(2026, 9, 15, 0, 0, 0); // Oct 15, 2026 00:00:00 local
    const noonDate = new Date(2026, 9, 15, 12, 0, 0); // Oct 15, 2026 12:00:00 local
    const morningDate = new Date(2026, 9, 15, 8, 5, 9); // Oct 15, 2026 08:05:09 local

    describe('formatDateCustom', () => {
      it('formats DD MMM YYYY (default)', () => {
        expect(formatDateCustom(testDate, 'DD MMM YYYY')).toBe('15 Oct 2026');
        expect(formatDateCustom(testDate)).toBe('15 Oct 2026');
      });

      it('formats YYYY-MM-DD', () => {
        expect(formatDateCustom(testDate, 'YYYY-MM-DD')).toBe('2026-10-15');
      });

      it('formats MM/DD/YYYY', () => {
        expect(formatDateCustom(testDate, 'MM/DD/YYYY')).toBe('10/15/2026');
      });

      it('pads single-digit days and months properly', () => {
        const earlyDate = new Date(2026, 0, 5, 10, 0, 0); // Jan 05, 2026
        expect(formatDateCustom(earlyDate, 'DD MMM YYYY')).toBe('05 Jan 2026');
        expect(formatDateCustom(earlyDate, 'YYYY-MM-DD')).toBe('2026-01-05');
        expect(formatDateCustom(earlyDate, 'MM/DD/YYYY')).toBe('01/05/2026');
      });

      it('handles null, undefined, and invalid date inputs defensively', () => {
        expect(formatDateCustom(null)).toBe('--');
        expect(formatDateCustom(undefined)).toBe('--');
        expect(formatDateCustom('invalid-date-string')).toBe('--');
        expect(formatDateCustom(NaN)).toBe('--');
      });
    });

    describe('formatTimeCustom', () => {
      it('formats 12-hour mode with AM/PM (default)', () => {
        expect(formatTimeCustom(testDate, '12h')).toBe('02:30 PM');
        expect(formatTimeCustom(testDate)).toBe('02:30 PM');
        expect(formatTimeCustom(morningDate, '12h')).toBe('08:05 AM');
      });

      it('formats 24-hour mode without AM/PM', () => {
        expect(formatTimeCustom(testDate, '24h')).toBe('14:30');
        expect(formatTimeCustom(morningDate, '24h')).toBe('08:05');
      });

      it('handles midnight correctly in 12h and 24h modes', () => {
        expect(formatTimeCustom(midnightDate, '12h')).toBe('12:00 AM');
        expect(formatTimeCustom(midnightDate, '24h')).toBe('00:00');
      });

      it('handles noon correctly in 12h and 24h modes', () => {
        expect(formatTimeCustom(noonDate, '12h')).toBe('12:00 PM');
        expect(formatTimeCustom(noonDate, '24h')).toBe('12:00');
      });

      it('supports includeSeconds in 12h and 24h modes', () => {
        expect(formatTimeCustom(testDate, '12h', true)).toBe('02:30:45 PM');
        expect(formatTimeCustom(testDate, '24h', true)).toBe('14:30:45');
        expect(formatTimeCustom(morningDate, '12h', true)).toBe('08:05:09 AM');
        expect(formatTimeCustom(morningDate, '24h', true)).toBe('08:05:09');
      });

      it('handles null, undefined, and invalid dates defensively', () => {
        expect(formatTimeCustom(null)).toBe('--');
        expect(formatTimeCustom(undefined)).toBe('--');
        expect(formatTimeCustom('invalid')).toBe('--');
      });
    });

    describe('formatDateTimeCustom', () => {
      it('formats combined date and time with various preference combinations', () => {
        expect(formatDateTimeCustom(testDate, 'DD MMM YYYY', '12h')).toBe('15 Oct 2026, 02:30 PM');
        expect(formatDateTimeCustom(testDate, 'YYYY-MM-DD', '24h')).toBe('2026-10-15, 14:30');
        expect(formatDateTimeCustom(testDate, 'MM/DD/YYYY', '12h')).toBe('10/15/2026, 02:30 PM');
      });

      it('supports includeSeconds in combined formatting', () => {
        expect(formatDateTimeCustom(testDate, 'DD MMM YYYY', '12h', true)).toBe('15 Oct 2026, 02:30:45 PM');
        expect(formatDateTimeCustom(testDate, 'YYYY-MM-DD', '24h', true)).toBe('2026-10-15, 14:30:45');
      });

      it('handles invalid dates defensively', () => {
        expect(formatDateTimeCustom(null)).toBe('--');
        expect(formatDateTimeCustom('bad-timestamp')).toBe('--');
      });
    });

    describe('formatAlarmTime helper backward compatibility', () => {
      it('uses default DD MMM YYYY and 12h when called with only isoString', () => {
        const iso = testDate.toISOString();
        const formatted = formatAlarmTime(iso);
        expect(formatted).toContain('2026');
        expect(formatted).toMatch(/(AM|PM)/);
      });

      it('respects custom dateFormat and timeFormat when provided', () => {
        const iso = testDate.toISOString();
        const formatted = formatAlarmTime(iso, 'YYYY-MM-DD', '24h');
        expect(formatted).toContain('2026-10-15');
        expect(formatted).not.toContain('AM');
        expect(formatted).not.toContain('PM');
      });

      it('handles invalid alarm timestamps gracefully returning --', () => {
        expect(formatAlarmTime('invalid')).toBe('--');
      });
    });
  });

  describe('B. Power & Energy Presentation Conversion', () => {
    describe('formatPowerDisplay', () => {
      it('keeps base kW unchanged when target is kW', () => {
        expect(formatPowerDisplay(250, 'kW')).toEqual({ displayValue: '250', unit: 'kW' });
        expect(formatPowerDisplay(12.345, 'kW', 2)).toEqual({ displayValue: '12.35', unit: 'kW' });
      });

      it('converts kW to MW correctly by dividing by 1000', () => {
        expect(formatPowerDisplay(250, 'MW')).toEqual({ displayValue: '0.25', unit: 'MW' });
        expect(formatPowerDisplay(1000, 'MW')).toEqual({ displayValue: '1', unit: 'MW' });
        expect(formatPowerDisplay(1500, 'MW')).toEqual({ displayValue: '1.5', unit: 'MW' });
        expect(formatPowerDisplay(10, 'MW')).toEqual({ displayValue: '0.01', unit: 'MW' });
      });

      it('preserves genuine zero as genuine zero', () => {
        expect(formatPowerDisplay(0, 'kW')).toEqual({ displayValue: '0', unit: 'kW' });
        expect(formatPowerDisplay(0, 'MW')).toEqual({ displayValue: '0', unit: 'MW' });
      });

      it('handles negative power (discharge/export) correctly without negative zero', () => {
        expect(formatPowerDisplay(-250, 'kW')).toEqual({ displayValue: '-250', unit: 'kW' });
        expect(formatPowerDisplay(-250, 'MW')).toEqual({ displayValue: '-0.25', unit: 'MW' });
        expect(formatPowerDisplay(-0.0001, 'kW', 2)).toEqual({ displayValue: '0', unit: 'kW' });
      });

      it('handles null, undefined, and NaN values defensively', () => {
        expect(formatPowerDisplay(null, 'kW')).toEqual({ displayValue: '--', unit: 'kW' });
        expect(formatPowerDisplay(undefined, 'MW')).toEqual({ displayValue: '--', unit: 'MW' });
        expect(formatPowerDisplay(NaN, 'MW')).toEqual({ displayValue: '--', unit: 'MW' });
      });
    });

    describe('formatEnergyDisplay', () => {
      it('keeps base kWh unchanged when target is kWh', () => {
        expect(formatEnergyDisplay(500, 'kWh')).toEqual({ displayValue: '500', unit: 'kWh' });
        expect(formatEnergyDisplay(1250, 'kWh')).toEqual({ displayValue: '1250', unit: 'kWh' });
      });

      it('converts kWh to MWh correctly by dividing by 1000', () => {
        expect(formatEnergyDisplay(500, 'MWh')).toEqual({ displayValue: '0.5', unit: 'MWh' });
        expect(formatEnergyDisplay(1000, 'MWh')).toEqual({ displayValue: '1', unit: 'MWh' });
        expect(formatEnergyDisplay(2500, 'MWh')).toEqual({ displayValue: '2.5', unit: 'MWh' });
      });

      it('preserves genuine zero in both units', () => {
        expect(formatEnergyDisplay(0, 'kWh')).toEqual({ displayValue: '0', unit: 'kWh' });
        expect(formatEnergyDisplay(0, 'MWh')).toEqual({ displayValue: '0', unit: 'MWh' });
      });

      it('handles null and undefined values defensively', () => {
        expect(formatEnergyDisplay(null, 'kWh')).toEqual({ displayValue: '--', unit: 'kWh' });
        expect(formatEnergyDisplay(undefined, 'MWh')).toEqual({ displayValue: '--', unit: 'MWh' });
      });
    });
  });

  describe('C. Consumer Formatting & Transformation Logic', () => {
    describe('Chart X-Axis Tick Formatting', () => {
      const formatChartTick = (
        val: number,
        durationHours: number,
        timeFormat: TimeFormat = '12h',
        dateFormat: DateFormat = 'DD MMM YYYY'
      ) => {
        const d = new Date(val);
        const durationDays = durationHours / 24;
        if (durationDays > 7) {
          return formatDateCustom(d, dateFormat);
        } else if (durationDays > 2) {
          return formatDateTimeCustom(d, dateFormat, timeFormat);
        } else if (durationHours <= 26) {
          const hours = d.getHours();
          if (timeFormat === '24h') {
            return `${hours.toString().padStart(2, '0')}:00`;
          }
          const ampm = hours >= 12 ? 'PM' : 'AM';
          const hour12 = hours % 12 || 12;
          const paddedHour = hour12 < 10 ? `0${hour12}` : hour12;
          return `${paddedHour} ${ampm}`;
        }
        return formatTimeCustom(d, timeFormat);
      };

      it('formats 24h chart ticks in 12h mode as HH AM/PM', () => {
        const d14 = new Date(2026, 9, 15, 14, 0, 0).getTime();
        const d00 = new Date(2026, 9, 15, 0, 0, 0).getTime();
        expect(formatChartTick(d14, 24, '12h')).toBe('02 PM');
        expect(formatChartTick(d00, 24, '12h')).toBe('12 AM');
      });

      it('formats 24h chart ticks in 24h mode as HH:00', () => {
        const d14 = new Date(2026, 9, 15, 14, 0, 0).getTime();
        const d00 = new Date(2026, 9, 15, 0, 0, 0).getTime();
        expect(formatChartTick(d14, 24, '24h')).toBe('14:00');
        expect(formatChartTick(d00, 24, '24h')).toBe('00:00');
      });

      it('formats multi-day charts (>7 days) with selected date format', () => {
        const d = new Date(2026, 9, 15, 14, 0, 0).getTime();
        expect(formatChartTick(d, 24 * 10, '12h', 'DD MMM YYYY')).toBe('15 Oct 2026');
        expect(formatChartTick(d, 24 * 10, '12h', 'YYYY-MM-DD')).toBe('2026-10-15');
        expect(formatChartTick(d, 24 * 10, '12h', 'MM/DD/YYYY')).toBe('10/15/2026');
      });

      it('formats 3-7 day charts with combined date and time', () => {
        const d = new Date(2026, 9, 15, 14, 0, 0).getTime();
        expect(formatChartTick(d, 24 * 5, '12h', 'DD MMM YYYY')).toBe('15 Oct 2026, 02:00 PM');
        expect(formatChartTick(d, 24 * 5, '24h', 'YYYY-MM-DD')).toBe('2026-10-15, 14:00');
      });
    });

    describe('Chart Tooltip Time Label', () => {
      const getTooltipTimeLabel = (
        label: number,
        durationHours: number,
        timeFormat: TimeFormat = '12h',
        dateFormat: DateFormat = 'DD MMM YYYY'
      ) => {
        return durationHours <= 26
          ? formatTimeCustom(label, timeFormat)
          : formatDateTimeCustom(label, dateFormat, timeFormat);
      };

      it('uses formatTimeCustom for <=26h chart tooltips', () => {
        const d = new Date(2026, 9, 15, 14, 30, 0).getTime();
        expect(getTooltipTimeLabel(d, 24, '12h')).toBe('02:30 PM');
        expect(getTooltipTimeLabel(d, 24, '24h')).toBe('14:30');
      });

      it('uses formatDateTimeCustom for multi-day chart tooltips', () => {
        const d = new Date(2026, 9, 15, 14, 30, 0).getTime();
        expect(getTooltipTimeLabel(d, 72, '12h', 'DD MMM YYYY')).toBe('15 Oct 2026, 02:30 PM');
        expect(getTooltipTimeLabel(d, 72, '24h', 'YYYY-MM-DD')).toBe('2026-10-15, 14:30');
      });
    });

    describe('BESS Asset Details Unit Formatting', () => {
      it('formats Energy Capacity with user preference (kWh vs MWh)', () => {
        const baseCapacityKwh = 1000;
        const fmtKwh = formatEnergyDisplay(baseCapacityKwh, 'kWh');
        expect(`${Number(fmtKwh.displayValue).toLocaleString()} ${fmtKwh.unit}`).toBe('1,000 kWh');

        const fmtMwh = formatEnergyDisplay(baseCapacityKwh, 'MWh');
        expect(`${Number(fmtMwh.displayValue).toLocaleString()} ${fmtMwh.unit}`).toBe('1 MWh');
      });

      it('formats Power Rating with user preference (kW vs MW)', () => {
        const baseRatingKw = 250;
        const fmtKw = formatPowerDisplay(baseRatingKw, 'kW');
        expect(`${Number(fmtKw.displayValue).toLocaleString()} ${fmtKw.unit}`).toBe('250 kW');

        const fmtMw = formatPowerDisplay(baseRatingKw, 'MW');
        expect(`${Number(fmtMw.displayValue).toLocaleString()} ${fmtMw.unit}`).toBe('0.25 MW');
      });

      it('formats missing asset capacity and rating as --', () => {
        const fmtCapacity = formatEnergyDisplay(null, 'kWh');
        const displayCapacity = fmtCapacity.displayValue !== '--'
          ? `${Number(fmtCapacity.displayValue).toLocaleString()} ${fmtCapacity.unit}`
          : '--';
        expect(displayCapacity).toBe('--');

        const fmtRating = formatPowerDisplay(undefined, 'kW');
        const displayRating = fmtRating.displayValue !== '--'
          ? `${Number(fmtRating.displayValue).toLocaleString()} ${fmtRating.unit}`
          : '--';
        expect(displayRating).toBe('--');
      });

      it('formats PCS Active Power with sign and unit preference', () => {
        // Charging (+250 kW)
        const chargingKw = 250;
        const fmtChargeKw = formatPowerDisplay(chargingKw, 'kW');
        expect(`+${fmtChargeKw.displayValue} ${fmtChargeKw.unit}`).toBe('+250 kW');
        const fmtChargeMw = formatPowerDisplay(chargingKw, 'MW');
        expect(`+${fmtChargeMw.displayValue} ${fmtChargeMw.unit}`).toBe('+0.25 MW');

        // Discharging (-150 kW)
        const dischargingKw = -150;
        const fmtDischargeKw = formatPowerDisplay(dischargingKw, 'kW');
        expect(`${fmtDischargeKw.displayValue} ${fmtDischargeKw.unit}`).toBe('-150 kW');
        const fmtDischargeMw = formatPowerDisplay(dischargingKw, 'MW');
        expect(`${fmtDischargeMw.displayValue} ${fmtDischargeMw.unit}`).toBe('-0.15 MW');

        // Idle (0 kW)
        const idleKw = 0;
        const fmtIdleKw = formatPowerDisplay(idleKw, 'kW');
        expect(`${fmtIdleKw.displayValue} ${fmtIdleKw.unit}`).toBe('0 kW');
        const fmtIdleMw = formatPowerDisplay(idleKw, 'MW');
        expect(`${fmtIdleMw.displayValue} ${fmtIdleMw.unit}`).toBe('0 MW');
      });
    });

    describe('Telemetry Page Power Units', () => {
      it('formats Grid Power, BESS Power, and Cabinet Meter Power consistently', () => {
        const telemetry = {
          gridPower: 450.5,
          bessPower: -120.2,
          totalPower: 330.3,
        };

        // In kW mode
        const gridKw = formatPowerDisplay(telemetry.gridPower, 'kW');
        const bessKw = formatPowerDisplay(telemetry.bessPower, 'kW');
        const cabinetKw = formatPowerDisplay(telemetry.totalPower, 'kW');

        expect(`${gridKw.displayValue} ${gridKw.unit}`).toBe('450.5 kW');
        expect(`${bessKw.displayValue} ${bessKw.unit}`).toBe('-120.2 kW');
        expect(`${cabinetKw.displayValue} ${cabinetKw.unit}`).toBe('330.3 kW');

        // In MW mode
        const gridMw = formatPowerDisplay(telemetry.gridPower, 'MW');
        const bessMw = formatPowerDisplay(telemetry.bessPower, 'MW');
        const cabinetMw = formatPowerDisplay(telemetry.totalPower, 'MW');

        expect(`${gridMw.displayValue} ${gridMw.unit}`).toBe('0.45 MW');
        expect(`${bessMw.displayValue} ${bessMw.unit}`).toBe('-0.12 MW');
        expect(`${cabinetMw.displayValue} ${cabinetMw.unit}`).toBe('0.33 MW');
      });

      it('preserves -- for missing telemetry signals without fabricating zero', () => {
        const missingTelemetry = {
          gridPower: undefined,
          bessPower: null,
          totalPower: undefined,
        };

        const grid = formatPowerDisplay(missingTelemetry.gridPower, 'MW');
        const bess = formatPowerDisplay(missingTelemetry.bessPower, 'MW');
        const cabinet = formatPowerDisplay(missingTelemetry.totalPower, 'MW');

        expect(grid.displayValue).toBe('--');
        expect(bess.displayValue).toBe('--');
        expect(cabinet.displayValue).toBe('--');
      });
    });
  });

  describe('D. Preferences Validation and Reset Invariants', () => {
    it('returns default preferences on empty, null, or corrupted storage input', () => {
      expect(validatePreferences(null)).toEqual(DEFAULT_PREFERENCES);
      expect(validatePreferences(undefined)).toEqual(DEFAULT_PREFERENCES);
      expect(validatePreferences('random string')).toEqual(DEFAULT_PREFERENCES);
      expect(validatePreferences(12345)).toEqual(DEFAULT_PREFERENCES);
      expect(validatePreferences({})).toEqual(DEFAULT_PREFERENCES);
    });

    it('falls back to default for individual invalid fields while preserving valid fields', () => {
      const partialRaw = {
        powerUnit: 'MW',
        energyUnit: 'INVALID_UNIT',
        timeFormat: '24h',
        dateFormat: 'NON_EXISTENT_FORMAT',
        defaultReportRange: 'Last 7 Days',
      };

      const validated = validatePreferences(partialRaw);
      expect(validated.powerUnit).toBe('MW');
      expect(validated.energyUnit).toBe('kWh'); // default fallback
      expect(validated.timeFormat).toBe('24h');
      expect(validated.dateFormat).toBe('DD MMM YYYY'); // default fallback
      expect(validated.defaultReportRange).toBe('Last 7 Days');
    });

    it('preserves valid complete preferences', () => {
      const validPrefs: UserPreferences = {
        powerUnit: 'MW',
        energyUnit: 'MWh',
        timeFormat: '24h',
        dateFormat: 'YYYY-MM-DD',
        defaultReportRange: 'Last 30 Days',
        timezoneMode: 'site',
        alarmSoundEnabled: false,
        alarmSoundProfile: 'classic-double-beep',
        warningAlarmSoundProfile: 'soft-chime',
        criticalAlarmSoundProfile: 'urgent-pulse',
      };

      expect(validatePreferences(validPrefs)).toEqual(validPrefs);
    });
  });
});

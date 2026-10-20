import { describe, it, expect } from 'vitest';
import {
  formatPowerDisplay,
  formatEnergyDisplay,
  formatDateCustom,
  formatTimeCustom,
  formatDateTimeCustom,
  validatePreferences,
  isValidTimeZone,
  getBrowserTimezone,
  resolveEffectiveTimezone,
  getTimezoneLabel,
  getDateParts,
  getNextHourInTz,
} from '../../../frontend/src/features/settings/settings.utils';
import { formatAlarmTime } from '../../../frontend/src/utils/formatTime';
import { DEFAULT_PREFERENCES } from '../../../frontend/src/features/settings/settings.types';
import type {
  TimezoneMode,
  UserPreferences,
} from '../../../frontend/src/features/settings/settings.types';

describe('Checkpoint 2: Production-Grade EMS Timezone Preference Architecture & Implementation', () => {
  describe('1. Timezone Preference Validation & Defaults', () => {
    it('defaults timezoneMode to "site" in DEFAULT_PREFERENCES', () => {
      expect(DEFAULT_PREFERENCES.timezoneMode).toBe('site');
    });

    it('accepts valid timezoneMode "site" and "browser"', () => {
      const sitePrefs = validatePreferences({ timezoneMode: 'site' });
      expect(sitePrefs.timezoneMode).toBe('site');

      const browserPrefs = validatePreferences({ timezoneMode: 'browser' });
      expect(browserPrefs.timezoneMode).toBe('browser');
    });

    it('falls back to "site" when timezoneMode is missing, invalid, or malformed', () => {
      expect(validatePreferences({}).timezoneMode).toBe('site');
      expect(validatePreferences({ timezoneMode: 'invalid_mode' }).timezoneMode).toBe('site');
      expect(validatePreferences({ timezoneMode: 123 }).timezoneMode).toBe('site');
      expect(validatePreferences({ timezoneMode: null }).timezoneMode).toBe('site');
      expect(validatePreferences(null).timezoneMode).toBe('site');
      expect(validatePreferences('string').timezoneMode).toBe('site');
    });

    it('preserves all other preferences when upgrading stored preferences without timezoneMode', () => {
      const legacyStored = {
        powerUnit: 'MW',
        energyUnit: 'MWh',
        timeFormat: '24h',
        dateFormat: 'YYYY-MM-DD',
        defaultReportRange: 'Last 7 Days',
      };
      const validated = validatePreferences(legacyStored);
      expect(validated.powerUnit).toBe('MW');
      expect(validated.energyUnit).toBe('MWh');
      expect(validated.timeFormat).toBe('24h');
      expect(validated.dateFormat).toBe('YYYY-MM-DD');
      expect(validated.defaultReportRange).toBe('Last 7 Days');
      expect(validated.timezoneMode).toBe('site'); // Seamlessly upgraded
    });
  });

  describe('2. IANA Timezone Identifier Validation (isValidTimeZone)', () => {
    it('validates standard IANA timezone identifiers as true', () => {
      expect(isValidTimeZone('Asia/Kolkata')).toBe(true);
      expect(isValidTimeZone('UTC')).toBe(true);
      expect(isValidTimeZone('America/New_York')).toBe(true);
      expect(isValidTimeZone('Europe/London')).toBe(true);
      expect(isValidTimeZone('Asia/Tokyo')).toBe(true);
      expect(isValidTimeZone('Australia/Sydney')).toBe(true);
    });

    it('rejects invalid or non-string timezone identifiers defensively without throwing', () => {
      expect(isValidTimeZone('Invalid/Timezone_Name')).toBe(false);
      expect(isValidTimeZone('XYZ/123')).toBe(false);
      expect(isValidTimeZone('')).toBe(false);
      expect(isValidTimeZone(null)).toBe(false);
      expect(isValidTimeZone(undefined)).toBe(false);
      expect(isValidTimeZone(123 as any)).toBe(false);
      expect(isValidTimeZone({} as any)).toBe(false);
    });
  });

  describe('3. Effective Timezone Resolution & Defensiveness (resolveEffectiveTimezone)', () => {
    const browserTz = getBrowserTimezone();

    it('in "site" mode with a valid site timezone, returns the site timezone', () => {
      expect(resolveEffectiveTimezone('site', 'Asia/Kolkata')).toBe('Asia/Kolkata');
      expect(resolveEffectiveTimezone('site', 'America/New_York')).toBe('America/New_York');
      expect(resolveEffectiveTimezone('site', 'UTC')).toBe('UTC');
    });

    it('in "site" mode with missing, null, undefined, or invalid site timezone, defensively falls back to browser timezone', () => {
      expect(resolveEffectiveTimezone('site', null)).toBe(browserTz);
      expect(resolveEffectiveTimezone('site', undefined)).toBe(browserTz);
      expect(resolveEffectiveTimezone('site', '')).toBe(browserTz);
      expect(resolveEffectiveTimezone('site', 'NonExistent/Zone')).toBe(browserTz);
    });

    it('in "browser" mode, returns browser timezone regardless of site timezone', () => {
      expect(resolveEffectiveTimezone('browser', 'Asia/Kolkata')).toBe(browserTz);
      expect(resolveEffectiveTimezone('browser', 'America/New_York')).toBe(browserTz);
      expect(resolveEffectiveTimezone('browser', null)).toBe(browserTz);
      expect(resolveEffectiveTimezone('browser', undefined)).toBe(browserTz);
    });
  });

  describe('4. Timezone Label Helper (getTimezoneLabel)', () => {
    it('formats human-friendly timezone labels with GMT offsets', () => {
      const kolkataLabel = getTimezoneLabel('Asia/Kolkata');
      expect(kolkataLabel).toContain('Asia/Kolkata');
      expect(kolkataLabel).toMatch(/GMT\+5:?30/);

      const utcLabel = getTimezoneLabel('UTC');
      expect(utcLabel).toContain('UTC');
      expect(utcLabel).toMatch(/GMT(\+0)?/);
    });

    it('handles invalid timezones gracefully', () => {
      expect(getTimezoneLabel('Invalid/Zone')).toBe('Invalid/Zone');
    });
  });

  describe('5. Calendar and Clock Extraction (getDateParts)', () => {
    // 2026-10-15T09:30:45.000Z
    const testInstant = new Date('2026-10-15T09:30:45.000Z');

    it('extracts parts in UTC', () => {
      const parts = getDateParts(testInstant, 'UTC');
      expect(parts.year).toBe('2026');
      expect(parts.monthNum).toBe('10');
      expect(parts.monthShort).toBe('Oct');
      expect(parts.day).toBe('15');
      expect(parts.hours24).toBe(9);
      expect(parts.minutes).toBe('30');
      expect(parts.seconds).toBe('45');
    });

    it('extracts parts in Asia/Kolkata (+05:30 offset)', () => {
      // 09:30:45 UTC + 5h30m = 15:00:45 Kolkata
      const parts = getDateParts(testInstant, 'Asia/Kolkata');
      expect(parts.year).toBe('2026');
      expect(parts.monthNum).toBe('10');
      expect(parts.monthShort).toBe('Oct');
      expect(parts.day).toBe('15');
      expect(parts.hours24).toBe(15);
      expect(parts.minutes).toBe('00');
      expect(parts.seconds).toBe('45');
    });

    it('extracts parts in America/New_York (EDT, UTC-4)', () => {
      // 09:30:45 UTC - 4h = 05:30:45 NY
      const parts = getDateParts(testInstant, 'America/New_York');
      expect(parts.year).toBe('2026');
      expect(parts.monthNum).toBe('10');
      expect(parts.day).toBe('15');
      expect(parts.hours24).toBe(5);
      expect(parts.minutes).toBe('30');
      expect(parts.seconds).toBe('45');
    });

    it('extracts parts in Asia/Kathmandu (+05:45 offset)', () => {
      // 09:30:45 UTC + 5h45m = 15:15:45 Kathmandu
      const parts = getDateParts(testInstant, 'Asia/Kathmandu');
      expect(parts.hours24).toBe(15);
      expect(parts.minutes).toBe('15');
      expect(parts.seconds).toBe('45');
    });
  });

  describe('6. Day-Boundary, Midnight, Month and Year Crossings', () => {
    it('handles day boundary when UTC instant falls into the previous day in New York', () => {
      // 2026-10-15T02:00:00.000Z
      // In UTC: Oct 15, 02:00
      // In Asia/Kolkata (+5:30): Oct 15, 07:30
      // In America/New_York (-4 EDT): Oct 14, 22:00 (Previous Day!)
      const instant = new Date('2026-10-15T02:00:00.000Z');

      expect(formatDateCustom(instant, 'YYYY-MM-DD', 'UTC')).toBe('2026-10-15');
      expect(formatDateCustom(instant, 'YYYY-MM-DD', 'Asia/Kolkata')).toBe('2026-10-15');
      expect(formatDateCustom(instant, 'YYYY-MM-DD', 'America/New_York')).toBe('2026-10-14');

      expect(formatTimeCustom(instant, '24h', false, 'America/New_York')).toBe('22:00');
      expect(formatTimeCustom(instant, '12h', false, 'America/New_York')).toBe('10:00 PM');
    });

    it('handles midnight boundary (00:00:00) in target timezone', () => {
      // Midnight in Asia/Kolkata is 18:30:00 UTC previous day
      const kolkataMidnight = new Date('2026-10-14T18:30:00.000Z');

      expect(formatDateCustom(kolkataMidnight, 'DD MMM YYYY', 'Asia/Kolkata')).toBe('15 Oct 2026');
      expect(formatTimeCustom(kolkataMidnight, '24h', true, 'Asia/Kolkata')).toBe('00:00:00');
      expect(formatTimeCustom(kolkataMidnight, '12h', true, 'Asia/Kolkata')).toBe('12:00:00 AM');

      // Still Oct 14 in UTC and New York
      expect(formatDateCustom(kolkataMidnight, 'DD MMM YYYY', 'UTC')).toBe('14 Oct 2026');
      expect(formatTimeCustom(kolkataMidnight, '24h', false, 'UTC')).toBe('18:30');
      expect(formatDateCustom(kolkataMidnight, 'DD MMM YYYY', 'America/New_York')).toBe('14 Oct 2026');
      expect(formatTimeCustom(kolkataMidnight, '24h', false, 'America/New_York')).toBe('14:30');
    });

    it('handles month boundary crossing between timezones', () => {
      // 2026-10-31T20:00:00.000Z
      // In Asia/Kolkata: Nov 01, 2026 at 01:30 AM (Next Month!)
      // In America/New_York: Oct 31, 2026 at 04:00 PM (Current Month!)
      const monthCrossing = new Date('2026-10-31T20:00:00.000Z');

      expect(formatDateCustom(monthCrossing, 'YYYY-MM-DD', 'Asia/Kolkata')).toBe('2026-11-01');
      expect(formatDateCustom(monthCrossing, 'YYYY-MM-DD', 'America/New_York')).toBe('2026-10-31');
    });

    it('handles year boundary crossing between timezones', () => {
      // 2026-12-31T20:00:00.000Z
      // In Asia/Kolkata: Jan 01, 2027 at 01:30 AM (New Year!)
      // In America/New_York: Dec 31, 2026 at 03:00 PM (Current Year!)
      const yearCrossing = new Date('2026-12-31T20:00:00.000Z');

      expect(formatDateCustom(yearCrossing, 'YYYY-MM-DD', 'Asia/Kolkata')).toBe('2027-01-01');
      expect(formatDateCustom(yearCrossing, 'YYYY-MM-DD', 'America/New_York')).toBe('2026-12-31');
    });
  });

  describe('7. Daylight Saving Time (DST) Transitions', () => {
    it('accurately tracks America/New_York fall-back transition (EDT -> EST)', () => {
      // US Eastern switches from EDT (-4) to EST (-5) on 2026-11-01 at 02:00:00 local
      // 05:30:00Z -> 01:30:00 EDT (offset 4h)
      // 06:30:00Z -> 01:30:00 EST (offset 5h)
      const beforeFallBack = new Date('2026-11-01T05:30:00.000Z');
      const afterFallBack = new Date('2026-11-01T06:30:00.000Z');

      expect(formatTimeCustom(beforeFallBack, '12h', false, 'America/New_York')).toBe('01:30 AM');
      expect(formatTimeCustom(afterFallBack, '12h', false, 'America/New_York')).toBe('01:30 AM');

      // But in UTC and Kolkata, the time progresses normally by 1 hour
      expect(formatTimeCustom(beforeFallBack, '24h', false, 'UTC')).toBe('05:30');
      expect(formatTimeCustom(afterFallBack, '24h', false, 'UTC')).toBe('06:30');
      expect(formatTimeCustom(beforeFallBack, '24h', false, 'Asia/Kolkata')).toBe('11:00');
      expect(formatTimeCustom(afterFallBack, '24h', false, 'Asia/Kolkata')).toBe('12:00');
    });

    it('accurately tracks Europe/London British Summer Time transition (BST -> GMT)', () => {
      // UK switches from BST (+1) to GMT (+0) on 2026-10-25 at 02:00:00 local
      // 00:30:00Z -> 01:30:00 BST (offset +1h)
      // 01:30:00Z -> 01:30:00 GMT (offset +0h)
      const beforeTransition = new Date('2026-10-25T00:30:00.000Z');
      const afterTransition = new Date('2026-10-25T01:30:00.000Z');

      expect(formatTimeCustom(beforeTransition, '12h', false, 'Europe/London')).toBe('01:30 AM');
      expect(formatTimeCustom(afterTransition, '12h', false, 'Europe/London')).toBe('01:30 AM');
    });
  });

  describe('8. Chart X-Axis Ticks (getNextHourInTz)', () => {
    it('aligns to top-of-hour in whole-hour timezones (UTC)', () => {
      const ts = new Date('2026-10-15T09:14:22.123Z').getTime();
      const nextUtc = getNextHourInTz(ts, 'UTC');
      const parts = getDateParts(new Date(nextUtc), 'UTC');

      expect(parts.hours24).toBe(10);
      expect(parts.minutes).toBe('00');
      expect(parts.seconds).toBe('00');
      expect(nextUtc % 1000).toBe(0);
    });

    it('aligns to top-of-hour in fractional offset timezones (Asia/Kolkata +05:30)', () => {
      // Instant: 09:15:23.456Z (14:45:23 in Kolkata)
      // Next hour in Kolkata should be 15:00:00 (which is 09:30:00 UTC)
      const ts = new Date('2026-10-15T09:15:23.456Z').getTime();
      const nextKolkata = getNextHourInTz(ts, 'Asia/Kolkata');
      const parts = getDateParts(new Date(nextKolkata), 'Asia/Kolkata');

      expect(parts.hours24).toBe(15);
      expect(parts.minutes).toBe('00');
      expect(parts.seconds).toBe('00');
      expect(new Date(nextKolkata).toISOString()).toBe('2026-10-15T09:30:00.000Z');
    });

    it('returns exact instant if already on top-of-hour boundary', () => {
      const exactKolkataHour = new Date('2026-10-15T09:30:00.000Z').getTime(); // Exactly 15:00:00.000 Kolkata
      const result = getNextHourInTz(exactKolkataHour, 'Asia/Kolkata');
      expect(result).toBe(exactKolkataHour);
    });
  });

  describe('9. Formatters with Timezone Parameter', () => {
    const instant = new Date('2026-10-15T09:30:00.000Z');

    it('formatDateCustom respects timeZone override', () => {
      expect(formatDateCustom(instant, 'DD MMM YYYY', 'Asia/Kolkata')).toBe('15 Oct 2026');
      expect(formatDateCustom(instant, 'YYYY-MM-DD', 'America/New_York')).toBe('2026-10-15');
      expect(formatDateCustom(instant, 'MM/DD/YYYY', 'UTC')).toBe('10/15/2026');
    });

    it('formatTimeCustom respects timeZone override', () => {
      expect(formatTimeCustom(instant, '12h', false, 'Asia/Kolkata')).toBe('03:00 PM');
      expect(formatTimeCustom(instant, '24h', false, 'Asia/Kolkata')).toBe('15:00');
      expect(formatTimeCustom(instant, '12h', false, 'America/New_York')).toBe('05:30 AM');
      expect(formatTimeCustom(instant, '24h', false, 'America/New_York')).toBe('05:30');
    });

    it('formatDateTimeCustom formats both date and time in target timezone', () => {
      expect(formatDateTimeCustom(instant, 'DD MMM YYYY', '12h', false, 'Asia/Kolkata')).toBe(
        '15 Oct 2026, 03:00 PM'
      );
      expect(formatDateTimeCustom(instant, 'YYYY-MM-DD', '24h', false, 'America/New_York')).toBe(
        '2026-10-15, 05:30'
      );
    });

    it('formatAlarmTime helper formats in target timezone', () => {
      expect(formatAlarmTime('2026-10-15T09:30:00.000Z', 'DD MMM YYYY', '12h', 'Asia/Kolkata')).toBe(
        '15 Oct 2026, 03:00 PM'
      );
      expect(formatAlarmTime('2026-10-15T09:30:00.000Z', 'YYYY-MM-DD', '24h', 'America/New_York')).toBe(
        '2026-10-15, 05:30'
      );
    });
  });

  describe('10. Backward Compatibility & Non-Breaking Invariants', () => {
    it('when timeZone parameter is omitted, formatters format in local environment without regression', () => {
      const localDate = new Date(2026, 9, 15, 14, 30, 45);
      expect(formatDateCustom(localDate)).toBe('15 Oct 2026');
      expect(formatTimeCustom(localDate, '12h')).toBe('02:30 PM');
      expect(formatTimeCustom(localDate, '24h')).toBe('14:30');
      expect(formatDateTimeCustom(localDate, 'DD MMM YYYY', '12h')).toBe('15 Oct 2026, 02:30 PM');
    });

    it('handles null, undefined, and malformed inputs defensively without throwing', () => {
      expect(formatDateCustom(null, 'DD MMM YYYY', 'Asia/Kolkata')).toBe('--');
      expect(formatTimeCustom(undefined, '12h', false, 'Asia/Kolkata')).toBe('--');
      expect(formatDateTimeCustom('invalid-date', 'DD MMM YYYY', '12h', false, 'Asia/Kolkata')).toBe('--');
      expect(formatAlarmTime('invalid', 'DD MMM YYYY', '12h', 'Asia/Kolkata')).toBe('--');
    });

    it('power and energy display conversions remain 100% unimpacted by timezone preferences', () => {
      expect(formatPowerDisplay(250, 'kW')).toEqual({ displayValue: '250', unit: 'kW' });
      expect(formatPowerDisplay(250, 'MW')).toEqual({ displayValue: '0.25', unit: 'MW' });
      expect(formatEnergyDisplay(500, 'kWh')).toEqual({ displayValue: '500', unit: 'kWh' });
      expect(formatEnergyDisplay(500, 'MWh')).toEqual({ displayValue: '0.5', unit: 'MWh' });
    });
  });
});

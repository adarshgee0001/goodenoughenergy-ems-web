import { describe, it, expect } from 'vitest';
import { DEFAULT_PREFERENCES, type ReportDateRange } from '../../../frontend/src/features/settings/settings.types';
import { validatePreferences } from '../../../frontend/src/features/settings/settings.utils';

function formatDateISO(date: Date): string {
  return date.toISOString().split('T')[0];
}

/**
 * Calculates start and end ISO dates given a preset name and anchor date.
 * Replicates the authoritative logic in ReportsPage.tsx.
 */
function calculatePresetDates(preset: string, anchorDate: Date = new Date()): { startDate: string; endDate: string } {
  const today = new Date(anchorDate);
  if (preset === 'Today') {
    return { startDate: formatDateISO(today), endDate: formatDateISO(today) };
  } else if (preset === 'Yesterday') {
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    return { startDate: formatDateISO(yesterday), endDate: formatDateISO(yesterday) };
  } else if (preset === 'Last 7 Days') {
    const lastWeek = new Date(today);
    lastWeek.setDate(lastWeek.getDate() - 6);
    return { startDate: formatDateISO(lastWeek), endDate: formatDateISO(today) };
  } else if (preset === 'Last 30 Days') {
    const lastMonth = new Date(today);
    lastMonth.setDate(lastMonth.getDate() - 29);
    return { startDate: formatDateISO(lastMonth), endDate: formatDateISO(today) };
  }
  return { startDate: formatDateISO(today), endDate: formatDateISO(today) };
}

/**
 * Replicates buildBoundaryDates from ReportsPage.tsx.
 */
function buildBoundaryDates(dateStr: string, isEnd: boolean, tz?: string | null): Date {
  const timeStr = isEnd ? '23:59:59.999' : '00:00:00.000';
  if (!tz) return new Date(`${dateStr}T${timeStr}Z`);
  
  try {
    const [y, m, d] = dateStr.split('-');
    const localTarget = new Date(Date.UTC(Number(y), Number(m)-1, Number(d), isEnd ? 23 : 0, isEnd ? 59 : 0, isEnd ? 59 : 0, isEnd ? 999 : 0));
    
    const tzStr = localTarget.toLocaleString('en-US', { timeZone: tz });
    const utcStr = localTarget.toLocaleString('en-US', { timeZone: 'UTC' });
    const offsetMs = new Date(tzStr).getTime() - new Date(utcStr).getTime();
    
    return new Date(localTarget.getTime() - offsetMs);
  } catch (_e) {
    return new Date(`${dateStr}T${timeStr}Z`);
  }
}

describe('Report Date Presets and Timezone Boundaries', () => {
  const anchorDate = new Date('2026-10-15T12:00:00.000Z');

  describe('1. Date Presets Calculation (Finding H-1)', () => {
    it('calculates "Today" correctly as a 1-day range', () => {
      const { startDate, endDate } = calculatePresetDates('Today', anchorDate);
      expect(startDate).toBe('2026-10-15');
      expect(endDate).toBe('2026-10-15');
    });

    it('calculates "Yesterday" correctly as a 1-day range', () => {
      const { startDate, endDate } = calculatePresetDates('Yesterday', anchorDate);
      expect(startDate).toBe('2026-10-14');
      expect(endDate).toBe('2026-10-14');
    });

    it('calculates "Last 7 Days" correctly as a 7-day inclusive range', () => {
      const { startDate, endDate } = calculatePresetDates('Last 7 Days', anchorDate);
      expect(startDate).toBe('2026-10-09');
      expect(endDate).toBe('2026-10-15');

      const daysDiff = (new Date(endDate).getTime() - new Date(startDate).getTime()) / (1000 * 60 * 60 * 24) + 1;
      expect(daysDiff).toBe(7);
    });

    it('calculates "Last 30 Days" correctly as a 30-day inclusive range', () => {
      const { startDate, endDate } = calculatePresetDates('Last 30 Days', anchorDate);
      expect(startDate).toBe('2026-09-16');
      expect(endDate).toBe('2026-10-15');

      const daysDiff = (new Date(endDate).getTime() - new Date(startDate).getTime()) / (1000 * 60 * 60 * 24) + 1;
      expect(daysDiff).toBe(30);
    });
  });

  describe('2. Settings Preferences Compatibility', () => {
    it('validates all supported presets in user preferences', () => {
      const supportedPresets: ReportDateRange[] = ['Today', 'Yesterday', 'Last 7 Days', 'Last 30 Days'];
      
      supportedPresets.forEach(preset => {
        const validated = validatePreferences({ defaultReportRange: preset });
        expect(validated.defaultReportRange).toBe(preset);
      });
    });

    it('falls back to default preset "Today" for invalid preset strings', () => {
      const validated = validatePreferences({ defaultReportRange: 'Invalid Preset' });
      expect(validated.defaultReportRange).toBe('Today');
    });
  });

  describe('3. Site-Timezone Boundary Preservations', () => {
    it('preserves start and end timestamps in UTC timezone', () => {
      const start = buildBoundaryDates('2026-09-16', false, 'UTC');
      const end = buildBoundaryDates('2026-10-15', true, 'UTC');

      expect(start.toISOString()).toBe('2026-09-16T00:00:00.000Z');
      expect(end.toISOString()).toBe('2026-10-15T23:59:59.999Z');
    });

    it('shifts start and end timestamps according to Asia/Kolkata (+05:30) offset', () => {
      const start = buildBoundaryDates('2026-09-16', false, 'Asia/Kolkata');
      const end = buildBoundaryDates('2026-10-15', true, 'Asia/Kolkata');

      // 00:00:00 IST is 18:30:00 UTC previous day
      expect(start.toISOString()).toBe('2026-09-15T18:30:00.000Z');
      // 23:59:59.999 IST is 18:29:59.999 UTC
      expect(end.toISOString()).toBe('2026-10-15T18:29:59.999Z');
    });
  });
});

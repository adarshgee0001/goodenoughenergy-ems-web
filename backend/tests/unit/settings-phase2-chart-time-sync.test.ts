import { describe, it, expect } from 'vitest';
import {
  formatVoltageTrendTick,
  formatVoltageTrendTooltipTimestamp,
} from '../../../frontend/src/pages/EMSApp/components/VoltageTrendSection';
import {
  formatGridStateTrendTick,
  formatGridStateTrendTooltipTimestamp,
  interpretGridState,
  processGridTrendData,
} from '../../../frontend/src/pages/EMSApp/components/GridStateTrendSection';
import {
  resolveEffectiveTimezone,
  formatTimeCustom,
  formatDateCustom,
  formatDateTimeCustom,
} from '../../../frontend/src/features/settings/settings.utils';
import type { TimeFormat, DateFormat } from '../../../frontend/src/features/settings/settings.types';
import type { GridStateTrendPoint } from '../../../frontend/src/features/dashboard/dashboard.types';

describe('Phase 2: Synchronize Time & Date Preferences in Telemetry Trend Charts', () => {
  // Deterministic reference timestamp: 2026-10-14T08:30:00.000Z
  const REF_TIMESTAMP = '2026-10-14T08:30:00.000Z';

  // --------------------------------------------------------------------------
  // 1. Browser timezone versus configured site timezone
  // --------------------------------------------------------------------------
  describe('1. Timezone handling: Site timezone vs Browser timezone', () => {
    const siteTimezone = 'Asia/Kolkata'; // UTC+05:30 -> 14:00 (02:00 PM) on 2026-10-14
    const alternateTimezone = 'America/New_York'; // UTC-04:00 (EDT) -> 04:30 (04:30 AM) on 2026-10-14
    const utcTimezone = 'UTC'; // UTC -> 08:30 (08:30 AM) on 2026-10-14

    it('renders chart axis ticks in the configured site timezone', () => {
      const tickSite = formatVoltageTrendTick(REF_TIMESTAMP, '24h', siteTimezone);
      expect(tickSite).toBe('14:00');

      const tickNy = formatVoltageTrendTick(REF_TIMESTAMP, '24h', alternateTimezone);
      expect(tickNy).toBe('04:30');

      const tickUtc = formatVoltageTrendTick(REF_TIMESTAMP, '24h', utcTimezone);
      expect(tickUtc).toBe('08:30');
    });

    it('renders tooltip timestamps in the configured site timezone', () => {
      const tooltipSite = formatVoltageTrendTooltipTimestamp(REF_TIMESTAMP, 'DD MMM YYYY', '12h', siteTimezone);
      expect(tooltipSite).toBe('14 Oct 2026, 02:00 PM');

      const tooltipNy = formatVoltageTrendTooltipTimestamp(REF_TIMESTAMP, 'DD MMM YYYY', '12h', alternateTimezone);
      expect(tooltipNy).toBe('14 Oct 2026, 04:30 AM');
    });

    it('resolves effective timezone correctly between site mode and browser mode', () => {
      const effectiveInSiteMode = resolveEffectiveTimezone('site', siteTimezone);
      expect(effectiveInSiteMode).toBe(siteTimezone);

      // In browser mode, resolves to runtime browser timezone
      const effectiveInBrowserMode = resolveEffectiveTimezone('browser', siteTimezone);
      expect(typeof effectiveInBrowserMode).toBe('string');
      expect(effectiveInBrowserMode.length).toBeGreaterThan(0);
    });
  });

  // --------------------------------------------------------------------------
  // 2. 12-hour versus 24-hour display
  // --------------------------------------------------------------------------
  describe('2. Time format preferences: 12-hour vs 24-hour display', () => {
    it('formats morning, afternoon, noon, and midnight correctly in 12h and 24h', () => {
      // 08:30 UTC
      expect(formatVoltageTrendTick('2026-10-14T08:30:00.000Z', '12h', 'UTC')).toBe('08:30 AM');
      expect(formatVoltageTrendTick('2026-10-14T08:30:00.000Z', '24h', 'UTC')).toBe('08:30');

      // 18:45 UTC
      expect(formatVoltageTrendTick('2026-10-14T18:45:00.000Z', '12h', 'UTC')).toBe('06:45 PM');
      expect(formatVoltageTrendTick('2026-10-14T18:45:00.000Z', '24h', 'UTC')).toBe('18:45');

      // 12:00 UTC (noon)
      expect(formatVoltageTrendTick('2026-10-14T12:00:00.000Z', '12h', 'UTC')).toBe('12:00 PM');
      expect(formatVoltageTrendTick('2026-10-14T12:00:00.000Z', '24h', 'UTC')).toBe('12:00');

      // 00:00 UTC (midnight)
      expect(formatVoltageTrendTick('2026-10-14T00:00:00.000Z', '12h', 'UTC')).toBe('12:00 AM');
      expect(formatVoltageTrendTick('2026-10-14T00:00:00.000Z', '24h', 'UTC')).toBe('00:00');
    });

    it('formats Grid State trend ticks identically in 12h and 24h', () => {
      expect(formatGridStateTrendTick('2026-10-14T18:45:00.000Z', '12h', 'UTC')).toBe('06:45 PM');
      expect(formatGridStateTrendTick('2026-10-14T18:45:00.000Z', '24h', 'UTC')).toBe('18:45');
    });
  });

  // --------------------------------------------------------------------------
  // 3. Supported date formats
  // --------------------------------------------------------------------------
  describe('3. Date format preferences across supported patterns', () => {
    const tz = 'UTC';

    it('supports DD MMM YYYY format', () => {
      const result = formatVoltageTrendTooltipTimestamp(REF_TIMESTAMP, 'DD MMM YYYY', '12h', tz);
      expect(result).toBe('14 Oct 2026, 08:30 AM');
    });

    it('supports YYYY-MM-DD format', () => {
      const result = formatVoltageTrendTooltipTimestamp(REF_TIMESTAMP, 'YYYY-MM-DD', '24h', tz);
      expect(result).toBe('2026-10-14, 08:30');
    });

    it('supports MM/DD/YYYY format', () => {
      const result = formatVoltageTrendTooltipTimestamp(REF_TIMESTAMP, 'MM/DD/YYYY', '12h', tz);
      expect(result).toBe('10/14/2026, 08:30 AM');
    });
  });

  // --------------------------------------------------------------------------
  // 4. Consistent timestamp rendering between Voltage Trend and Grid State Trend
  // --------------------------------------------------------------------------
  describe('4. Inter-chart consistency between Voltage Trend and Grid State Trend', () => {
    const testCases: Array<{ ts: string; timeFormat: TimeFormat; dateFormat: DateFormat; tz: string }> = [
      { ts: '2026-10-14T08:30:00.000Z', timeFormat: '12h', dateFormat: 'DD MMM YYYY', tz: 'Asia/Kolkata' },
      { ts: '2026-10-14T08:30:00.000Z', timeFormat: '24h', dateFormat: 'YYYY-MM-DD', tz: 'Asia/Kolkata' },
      { ts: '2026-10-14T23:45:00.000Z', timeFormat: '12h', dateFormat: 'MM/DD/YYYY', tz: 'America/New_York' },
      { ts: '2026-10-14T00:15:00.000Z', timeFormat: '24h', dateFormat: 'DD MMM YYYY', tz: 'UTC' },
    ];

    it('renders exactly identical tick strings for the same timestamp and preferences', () => {
      for (const tc of testCases) {
        const vTick = formatVoltageTrendTick(tc.ts, tc.timeFormat, tc.tz);
        const gTick = formatGridStateTrendTick(tc.ts, tc.timeFormat, tc.tz);
        expect(vTick).toBe(gTick);
      }
    });

    it('renders exactly identical tooltip strings for the same timestamp and preferences', () => {
      for (const tc of testCases) {
        const vTooltip = formatVoltageTrendTooltipTimestamp(tc.ts, tc.dateFormat, tc.timeFormat, tc.tz);
        const gTooltip = formatGridStateTrendTooltipTimestamp(tc.ts, tc.dateFormat, tc.timeFormat, tc.tz);
        expect(vTooltip).toBe(gTooltip);
      }
    });
  });

  // --------------------------------------------------------------------------
  // 5. Reactive updates when saved preferences change
  // --------------------------------------------------------------------------
  describe('5. Reactive preference transition simulation', () => {
    it('updates formatted output dynamically when user changes timeFormat preference without reload', () => {
      let activeFormat: TimeFormat = '12h';
      const getTick = (ts: string) => formatVoltageTrendTick(ts, activeFormat, 'UTC');

      expect(getTick(REF_TIMESTAMP)).toBe('08:30 AM');

      // User switches preference in Settings UI
      activeFormat = '24h';
      expect(getTick(REF_TIMESTAMP)).toBe('08:30');

      // Switch back
      activeFormat = '12h';
      expect(getTick(REF_TIMESTAMP)).toBe('08:30 AM');
    });

    it('updates formatted tooltip dynamically when user changes dateFormat preference without reload', () => {
      let activeDateFormat: DateFormat = 'DD MMM YYYY';
      const getTooltip = (ts: string) =>
        formatGridStateTrendTooltipTimestamp(ts, activeDateFormat, '12h', 'UTC');

      expect(getTooltip(REF_TIMESTAMP)).toBe('14 Oct 2026, 08:30 AM');

      // User switches preference to ISO format
      activeDateFormat = 'YYYY-MM-DD';
      expect(getTooltip(REF_TIMESTAMP)).toBe('2026-10-14, 08:30 AM');
    });
  });

  // --------------------------------------------------------------------------
  // 6. Invalid or missing timestamps handled safely without crashing
  // --------------------------------------------------------------------------
  describe('6. Resilient handling of invalid and missing timestamps', () => {
    it('returns empty string for missing ticks so chart renders without error', () => {
      expect(formatVoltageTrendTick(null)).toBe('');
      expect(formatVoltageTrendTick(undefined)).toBe('');
      expect(formatVoltageTrendTick('')).toBe('');

      expect(formatGridStateTrendTick(null)).toBe('');
      expect(formatGridStateTrendTick(undefined)).toBe('');
      expect(formatGridStateTrendTick('')).toBe('');
    });

    it('returns "--" gracefully for unparseable dates in ticks', () => {
      expect(formatVoltageTrendTick('invalid-date')).toBe('--');
      expect(formatGridStateTrendTick('invalid-date')).toBe('--');
    });

    it('returns "--" gracefully for null, undefined, and unparseable dates in tooltips', () => {
      expect(formatVoltageTrendTooltipTimestamp(null)).toBe('--');
      expect(formatVoltageTrendTooltipTimestamp(undefined)).toBe('--');
      expect(formatVoltageTrendTooltipTimestamp('')).toBe('--');
      expect(formatVoltageTrendTooltipTimestamp('not-a-timestamp')).toBe('--');

      expect(formatGridStateTrendTooltipTimestamp(null)).toBe('--');
      expect(formatGridStateTrendTooltipTimestamp(undefined)).toBe('--');
      expect(formatGridStateTrendTooltipTimestamp('')).toBe('--');
      expect(formatGridStateTrendTooltipTimestamp('not-a-timestamp')).toBe('--');
    });
  });

  // --------------------------------------------------------------------------
  // 7. Existing chart data and telemetry values remain unchanged
  // --------------------------------------------------------------------------
  describe('7. Data integrity: telemetry values and timestamps unmodified', () => {
    it('preserves underlying data point objects during formatting', () => {
      const dataPoint = {
        index: 0,
        timestamp: '2026-10-14T08:30:00.000Z',
        gridVoltageUab: 230.5,
        gridVoltageUbc: 231.2,
        gridVoltageUca: 229.8,
        bessVoltageUa: 400.1,
        bessVoltageUb: 399.7,
        bessVoltageUc: 401.3,
        activeSource: 'GRID',
      };

      const tick = formatVoltageTrendTick(dataPoint.timestamp, '24h', 'UTC');
      const tooltip = formatVoltageTrendTooltipTimestamp(dataPoint.timestamp, 'DD MMM YYYY', '12h', 'UTC');

      expect(tick).toBe('08:30');
      expect(tooltip).toBe('14 Oct 2026, 08:30 AM');

      // The original dataPoint properties are strictly untouched
      expect(dataPoint.timestamp).toBe('2026-10-14T08:30:00.000Z');
      expect(dataPoint.gridVoltageUab).toBe(230.5);
      expect(dataPoint.bessVoltageUa).toBe(400.1);
      expect(dataPoint.activeSource).toBe('GRID');
    });
  });

  // --------------------------------------------------------------------------
  // 8. Existing voltage and Grid ON/OFF behavior remains unchanged
  // --------------------------------------------------------------------------
  describe('8. Business logic preservation: Grid ON/OFF interpretation', () => {
    it('preserves exact digital input mapping semantics for Grid ON state', () => {
      expect(interpretGridState(1, 0)).toEqual({
        grid: 1,
        bess: 0,
        operatingState: 'GRID',
      });
    });

    it('preserves exact digital input mapping semantics for BESS ON (Grid OFF) state', () => {
      expect(interpretGridState(0, 1)).toEqual({
        grid: 0,
        bess: 1,
        operatingState: 'BESS',
      });
    });

    it('preserves open/transit state (0, 0)', () => {
      expect(interpretGridState(0, 0)).toEqual({
        grid: 0,
        bess: 0,
        operatingState: null,
      });
    });

    it('preserves contradictory / unconfirmed state (1, 1) and missing states as null', () => {
      expect(interpretGridState(1, 1)).toEqual({
        grid: null,
        bess: null,
        operatingState: null,
      });
      expect(interpretGridState(null, null)).toEqual({
        grid: null,
        bess: null,
        operatingState: null,
      });
      expect(interpretGridState(undefined, undefined)).toEqual({
        grid: null,
        bess: null,
        operatingState: null,
      });
    });

    it('correctly processes trend dataset with duplicate timestamps', () => {
      const rawPoints: GridStateTrendPoint[] = [
        { timestamp: '2026-10-14T08:30:00.000Z', gridOnState: 1, gridOffState: 0 },
        { timestamp: '2026-10-14T08:35:00.000Z', gridOnState: 0, gridOffState: 1 },
        { timestamp: '2026-10-14T08:35:00.000Z', gridOnState: 0, gridOffState: 1 },
      ];

      const processed = processGridTrendData(rawPoints);
      expect(processed).toHaveLength(3);
      expect(processed[0].operatingState).toBe('GRID');
      expect(processed[0].grid).toBe(1);
      expect(processed[0].bess).toBe(0);
      expect(processed[0].isDuplicateTime).toBe(false);

      expect(processed[1].operatingState).toBe('BESS');
      expect(processed[1].isDuplicateTime).toBe(true);
      expect(processed[2].isDuplicateTime).toBe(true);
    });
  });
});

import { describe, it, expect } from 'vitest';
import { escapeCsvField, formatCsvRow, formatSiteTimestamp } from '../../src/utils/csv.util';

describe('csv.util unit tests', () => {
  describe('escapeCsvField', () => {
    it('handles null and undefined as empty strings', () => {
      expect(escapeCsvField(null)).toBe('');
      expect(escapeCsvField(undefined)).toBe('');
    });

    it('preserves numeric zero', () => {
      expect(escapeCsvField(0)).toBe('0');
      expect(escapeCsvField(1)).toBe('1');
    });

    it('preserves negative numbers and decimals', () => {
      expect(escapeCsvField(-19.5)).toBe('-19.5');
      expect(escapeCsvField(399.543)).toBe('399.543');
    });

    it('handles simple strings without quotes', () => {
      expect(escapeCsvField('BESS')).toBe('BESS');
      expect(escapeCsvField('Visakapatnam BESS 01')).toBe('Visakapatnam BESS 01');
    });

    it('escapes fields containing commas', () => {
      expect(escapeCsvField('hello, world')).toBe('"hello, world"');
    });

    it('escapes fields containing double quotes', () => {
      expect(escapeCsvField('He said "Hello"')).toBe('"He said ""Hello"""');
    });

    it('escapes fields containing newlines', () => {
      expect(escapeCsvField("line1\nline2")).toBe('"line1\nline2"');
      expect(escapeCsvField("line1\r\nline2")).toBe('"line1\r\nline2"');
    });

    it('preserves unicode characters', () => {
      expect(escapeCsvField('Energy in kWh / °C / ⚡')).toBe('Energy in kWh / °C / ⚡');
    });

    it('sanitizes formula injection for untrusted strings when enabled', () => {
      expect(escapeCsvField('=SUM(A1:A10)', true)).toBe("'=SUM(A1:A10)");
      expect(escapeCsvField('+1234cmd', true)).toBe("'+1234cmd");
      expect(escapeCsvField('@mention', true)).toBe("'@mention");
      // Legitimate negative numbers should not be prefixed
      expect(escapeCsvField(-50, true)).toBe('-50');
    });
  });

  describe('formatCsvRow', () => {
    it('formats a full row with CRLF line ending', () => {
      const row = ['2026-10-10 14:30:00.000', 'BESS 01', 'EMU-001', 0, 1];
      expect(formatCsvRow(row)).toBe('2026-10-10 14:30:00.000,BESS 01,EMU-001,0,1\r\n');
    });

    it('properly represents null fields as adjacent commas', () => {
      const row = ['2026-10-10 14:30:00.000', 'BESS 01', null, null];
      expect(formatCsvRow(row)).toBe('2026-10-10 14:30:00.000,BESS 01,,\r\n');
    });
  });

  describe('formatSiteTimestamp', () => {
    it('formats 11 October 2026, 10:30:00 PM in Asia/Kolkata timezone', () => {
      // 10:30:00 PM IST is 17:00:00 UTC
      const dt = new Date('2026-10-11T17:00:00.000Z');
      const formatted = formatSiteTimestamp(dt, 'Asia/Kolkata');
      expect(formatted).toBe('11 October 2026, 10:30:00 PM');
    });

    it('formats midnight correctly as 12:00:00 AM', () => {
      // 12:00:00 AM IST on 11 October is 18:30:00 UTC on 10 October
      const dt = new Date('2026-10-10T18:30:00.000Z');
      const formatted = formatSiteTimestamp(dt, 'Asia/Kolkata');
      expect(formatted).toBe('11 October 2026, 12:00:00 AM');
    });

    it('formats noon correctly as 12:00:00 PM', () => {
      // 12:00:00 PM IST on 11 October is 06:30:00 UTC on 11 October
      const dt = new Date('2026-10-11T06:30:00.000Z');
      const formatted = formatSiteTimestamp(dt, 'Asia/Kolkata');
      expect(formatted).toBe('11 October 2026, 12:00:00 PM');
    });

    it('handles year and month boundary conversions accurately', () => {
      // 2026-12-31 23:59:59 in UTC -> 2027-01-01 05:29:59 AM in IST
      const dt = new Date('2026-12-31T23:59:59.000Z');
      const formatted = formatSiteTimestamp(dt, 'Asia/Kolkata');
      expect(formatted).toBe('1 January 2027, 05:29:59 AM');
    });

    it('quotes timestamp in formatCsvRow because of the comma', () => {
      const dt = new Date('2026-10-11T17:00:00.000Z');
      const tsStr = formatSiteTimestamp(dt, 'Asia/Kolkata');
      const row = [tsStr, 'BESS 01', 'EMU-001'];
      const csvLine = formatCsvRow(row);
      // Because tsStr has a comma, RFC 4180 requires double quotes
      expect(csvLine).toBe('"11 October 2026, 10:30:00 PM",BESS 01,EMU-001\r\n');
    });
  });
});

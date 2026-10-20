import { describe, it, expect, vi } from 'vitest';
import ExcelJS from 'exceljs';
import { EventEmitter } from 'events';
import { formatReportBoundary, formatReportPeriod } from '../../src/utils/csv.util';
import { reportExportService } from '../../src/services/report-export.service';
import { prisma } from '../../src/db/prisma';

// Mock Express Response object for capturing streamed CSV and Excel output
class MockResponse extends EventEmitter {
  public headers: Record<string, string> = {};
  public chunks: Buffer[] = [];
  public ended = false;

  setHeader(name: string, value: string) {
    this.headers[name.toLowerCase()] = value;
  }

  write(chunk: any) {
    this.chunks.push(chunk instanceof Buffer ? chunk : Buffer.from(chunk));
    return true;
  }

  end(chunk?: any) {
    if (chunk) this.write(chunk);
    this.ended = true;
    this.emit('finish');
  }

  getBuffer(): Buffer {
    return Buffer.concat(this.chunks);
  }

  getContent(): string {
    return this.getBuffer().toString('utf8');
  }
}

describe('Report Period Metadata & Timezone Unit Tests', () => {
  describe('1. formatReportBoundary & formatReportPeriod unit functions', () => {
    it('formats a single day boundary in Asia/Kolkata correctly as IST', () => {
      // 14 Oct 2026 00:00 IST is 13 Oct 2026 18:30:00 UTC
      const from = new Date('2026-10-13T18:30:00.000Z');
      // 14 Oct 2026 23:59:59.999 IST is 14 Oct 2026 18:29:59.999 UTC
      const to = new Date('2026-10-14T18:29:59.999Z');

      const period = formatReportPeriod(from, to, 'Asia/Kolkata');
      expect(period).toBe('14 Oct 2026 00:00 IST \u2013 14 Oct 2026 23:59 IST');
    });

    it('formats yesterday report boundaries correctly in Asia/Kolkata', () => {
      // Yesterday: 13 Oct 2026 00:00:00 to 23:59:59.999 IST
      const from = new Date('2026-10-12T18:30:00.000Z');
      const to = new Date('2026-10-13T18:29:59.999Z');

      const period = formatReportPeriod(from, to, 'Asia/Kolkata');
      expect(period).toBe('13 Oct 2026 00:00 IST \u2013 13 Oct 2026 23:59 IST');
    });

    it('formats a multi-day custom date range accurately', () => {
      // 05 Oct 2026 00:00 IST to 12 Oct 2026 23:59 IST
      const from = new Date('2026-10-04T18:30:00.000Z');
      const to = new Date('2026-10-12T18:29:59.999Z');

      const period = formatReportPeriod(from, to, 'Asia/Kolkata');
      expect(period).toBe('05 Oct 2026 00:00 IST \u2013 12 Oct 2026 23:59 IST');
    });

    it('accurately handles a date range crossing a month boundary', () => {
      // 30 Oct 2026 00:00 IST to 02 Nov 2026 23:59 IST
      const from = new Date('2026-10-29T18:30:00.000Z');
      const to = new Date('2026-11-02T18:29:59.999Z');

      const period = formatReportPeriod(from, to, 'Asia/Kolkata');
      expect(period).toBe('30 Oct 2026 00:00 IST \u2013 02 Nov 2026 23:59 IST');
    });

    it('accurately handles a date range crossing a year boundary', () => {
      // 31 Dec 2026 00:00 IST to 02 Jan 2027 23:59 IST
      const from = new Date('2026-12-30T18:30:00.000Z');
      const to = new Date('2027-01-02T18:29:59.999Z');

      const period = formatReportPeriod(from, to, 'Asia/Kolkata');
      expect(period).toBe('31 Dec 2026 00:00 IST \u2013 02 Jan 2027 23:59 IST');
    });

    it('formats in UTC when site timezone is UTC', () => {
      const from = new Date('2026-10-14T00:00:00.000Z');
      const to = new Date('2026-10-14T23:59:59.999Z');

      const period = formatReportPeriod(from, to, 'UTC');
      expect(period).toBe('14 Oct 2026 00:00 UTC \u2013 14 Oct 2026 23:59 UTC');
    });

    it('formats in US Eastern timezone correctly when specified', () => {
      const from = new Date('2026-10-14T04:00:00.000Z'); // 00:00 EDT
      const to = new Date('2026-10-15T03:59:59.999Z'); // 23:59 EDT

      const period = formatReportPeriod(from, to, 'America/New_York');
      expect(period).toContain('14 Oct 2026 00:00 EDT');
      expect(period).toContain('14 Oct 2026 23:59 EDT');
    });

    it('safely handles missing or undefined dates without crashing', () => {
      expect(formatReportPeriod(undefined, undefined, 'Asia/Kolkata')).toBe('N/A');
      expect(formatReportPeriod(new Date(), undefined, 'Asia/Kolkata')).toBe('N/A');
      expect(formatReportPeriod(undefined, new Date(), 'Asia/Kolkata')).toBe('N/A');
    });

    it('gracefully handles invalid timezone string fallback', () => {
      const from = new Date('2026-10-14T00:00:00.000Z');
      const to = new Date('2026-10-14T23:59:59.999Z');
      const period = formatReportPeriod(from, to, 'Invalid/Timezone_XYZ');
      expect(period).toContain('2026-10-14T00:00:00.000Z');
      expect(period).toContain('2026-10-14T23:59:59.999Z');
    });
  });

  describe('2. Single-BESS CSV Export Metadata Integration', () => {
    it('includes Report Period in CSV header matching query boundaries with sparse or empty data', async () => {
      const mockRes = new MockResponse() as any;
      const from = new Date('2026-10-13T18:30:00.000Z'); // 14 Oct 00:00 IST
      const to = new Date('2026-10-14T18:29:59.999Z'); // 14 Oct 23:59 IST

      vi.spyOn(prisma.site, 'findUnique').mockResolvedValueOnce({
        id: 'site-single-sparse',
        name: 'New Hercules Site',
        businessIdentifier: 'NEW-HERCULES-SITE-001',
        timezone: 'Asia/Kolkata',
        client: { id: 'c1', name: 'New Hercules' }
      } as any);

      vi.spyOn(prisma.bESSAsset, 'findMany').mockResolvedValueOnce([
        { id: 'bess-1', name: 'BESS 01', emuId: 'EMU-001', reportIntervalMinutes: 20, siteId: 'site-single-sparse' }
      ] as any);

      // Empty telemetry rows (0 rows in database for this range)
      vi.spyOn(prisma, '$queryRawUnsafe').mockResolvedValueOnce([]);

      await reportExportService.exportDynamicReport(mockRes, 'site-single-sparse', 20, from, to);

      expect(mockRes.ended).toBe(true);
      const content = mockRes.getContent();
      const stripped = content.startsWith('\uFEFF') ? content.slice(1) : content;
      const lines = stripped.split('\r\n');

      // Verify exact header metadata layout
      expect(lines[0]).toBe('EMS Reports Export');
      expect(lines[1]).toBe('Client Name:,New Hercules');
      expect(lines[2]).toBe('Site Name:,New Hercules Site');
      expect(lines[3]).toBe('Site Identifier:,NEW-HERCULES-SITE-001');
      expect(lines[4]).toBe('Report Period:,14 Oct 2026 00:00 IST \u2013 14 Oct 2026 23:59 IST');
      expect(lines[5]).toBe('Export Interval:,20 minutes');
      expect(lines[6]).toBe('');
      expect(lines[7]).toBe('Total Charge Difference (kWh),');
      expect(lines[8]).toBe('Total Discharge Difference (kWh),');
      expect(lines[9]).toBe('');
      expect(lines[10]).toContain('Timestamp,BESS Name,EMU Serial No.');
    });
  });

  describe('3. Multi-BESS XLSX Export Metadata Integration', () => {
    it('includes Report Period and metadata in Multi-BESS XLSX export across both worksheets', async () => {
      const mockRes = new MockResponse() as any;
      const from = new Date('2026-10-13T18:30:00.000Z');
      const to = new Date('2026-10-14T18:29:59.999Z');

      vi.spyOn(prisma.site, 'findUnique').mockResolvedValueOnce({
        id: 'site-multi-test',
        name: 'Multi BESS Facility',
        businessIdentifier: 'FACILITY-MULTI-01',
        timezone: 'Asia/Kolkata',
        client: { id: 'c2', name: 'Global Energy Ltd' }
      } as any);

      vi.spyOn(prisma.bESSAsset, 'findMany').mockResolvedValueOnce([
        { id: 'bess-a', name: 'BESS A', emuId: 'EMU-A', siteId: 'site-multi-test' },
        { id: 'bess-b', name: 'BESS B', emuId: 'EMU-B', siteId: 'site-multi-test' }
      ] as any);

      vi.spyOn(prisma, '$queryRawUnsafe')
        .mockResolvedValueOnce([]) // boundaryQuery
        .mockResolvedValueOnce([]); // dataQuery

      await reportExportService.exportMultiBessExcel(mockRes, 'site-multi-test', 15, from, to);

      expect(mockRes.ended).toBe(true);
      expect(mockRes.headers['content-type']).toBe('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');

      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(mockRes.getBuffer());

      const sheetNames = workbook.worksheets.map((w: any) => w.name);
      expect(sheetNames).toEqual(['Site Summary', 'BESS A', 'BESS B']);
      expect(workbook.getWorksheet('Per-BESS Details')).toBeUndefined();

      const sSummary = workbook.getWorksheet('Site Summary')!;
      expect(sSummary.getRow(1).getCell(1).value).toBe('EMS Site Summary');
      expect(sSummary.getRow(2).getCell(1).value).toBe('Client Name:');
      expect(sSummary.getRow(2).getCell(2).value).toBe('Global Energy Ltd');
      expect(sSummary.getRow(3).getCell(2).value).toBe('Multi BESS Facility');
      expect(sSummary.getRow(4).getCell(2).value).toBe('FACILITY-MULTI-01');
      expect(sSummary.getRow(5).getCell(1).value).toBe('Report Period:');
      expect(sSummary.getRow(5).getCell(2).value).toBe('14 Oct 2026 00:00 IST \u2013 14 Oct 2026 23:59 IST');
      expect(sSummary.getRow(6).getCell(2).value).toBe('15 minutes');

      const sDetails = workbook.getWorksheet('BESS A')!;
      expect(sDetails.getRow(1).getCell(1).value).toBe('EMS Reports Export (Multi-BESS)');
      expect(sDetails.getRow(2).getCell(2).value).toBe('Global Energy Ltd');
      expect(sDetails.getRow(3).getCell(2).value).toBe('Multi BESS Facility');
      expect(sDetails.getRow(4).getCell(2).value).toBe('FACILITY-MULTI-01');
      expect(sDetails.getRow(5).getCell(1).value).toBe('Report Period:');
      expect(sDetails.getRow(5).getCell(2).value).toBe('14 Oct 2026 00:00 IST \u2013 14 Oct 2026 23:59 IST');
      expect(sDetails.getRow(6).getCell(2).value).toBe('15 minutes');
    });
  });
});

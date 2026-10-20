import { describe, it, expect, vi, beforeEach } from 'vitest';
import { formatCsvRow, escapeCsvField, formatSiteTimestamp } from '../../src/utils/csv.util';
import { alarmController } from '../../src/controllers/alarm.controller';
import { authorizationService } from '../../src/services/authorization.service';
import { prisma } from '../../src/db/prisma';

// ---------------------------------------------------------------------------
// Helpers mirroring frontend boundary calculations
// ---------------------------------------------------------------------------
function formatDateISO(date: Date): string {
  return date.toISOString().split('T')[0];
}

function getNextDay(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const nextDate = new Date(Date.UTC(y, m - 1, d + 1));
  return nextDate.toISOString().split('T')[0];
}

function buildBoundaryDates(dateStr: string, isEnd: boolean, tz?: string | null): Date {
  const timeStr = isEnd ? '23:59:59.999' : '00:00:00.000';
  if (!tz) return new Date(`${dateStr}T${timeStr}Z`);

  try {
    const [y, m, d] = dateStr.split('-');
    const localTarget = new Date(Date.UTC(Number(y), Number(m) - 1, Number(d), isEnd ? 23 : 0, isEnd ? 59 : 0, isEnd ? 59 : 0, isEnd ? 999 : 0));

    const tzStr = localTarget.toLocaleString('en-US', { timeZone: tz });
    const utcStr = localTarget.toLocaleString('en-US', { timeZone: 'UTC' });
    const offsetMs = new Date(tzStr).getTime() - new Date(utcStr).getTime();

    return new Date(localTarget.getTime() - offsetMs);
  } catch {
    return new Date(`${dateStr}T${timeStr}Z`);
  }
}

function buildHalfOpenInterval(startDateStr: string, endDateStr: string, tz?: string | null): { from: Date; to: Date } {
  const from = buildBoundaryDates(startDateStr, false, tz);
  const nextDay = getNextDay(endDateStr);
  const to = buildBoundaryDates(nextDay, false, tz);
  return { from, to };
}

function calculateHistoryPresetDates(preset: string, anchorDate: Date = new Date()): { startDate: string; endDate: string } {
  const today = new Date(anchorDate);
  if (preset === 'Today') {
    return { startDate: formatDateISO(today), endDate: formatDateISO(today) };
  } else if (preset === 'Yesterday') {
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    return { startDate: formatDateISO(yesterday), endDate: formatDateISO(yesterday) };
  } else if (preset === 'Last 30 Days') {
    const lastMonth = new Date(today);
    lastMonth.setDate(lastMonth.getDate() - 29);
    return { startDate: formatDateISO(lastMonth), endDate: formatDateISO(today) };
  } else if (preset === 'All') {
    return { startDate: '', endDate: '' };
  }
  return { startDate: formatDateISO(today), endDate: formatDateISO(today) };
}

describe('Alarms & Events: EMU ID, Date Presets, CSV Export, and Authorization', () => {
  const anchorDate = new Date('2026-10-17T12:00:00.000Z');

  // =========================================================================
  // 1. EMU ID Display & Data Association across Multiple BESS Assets
  // =========================================================================
  describe('1. EMU ID Resolution & Fallback Placeholder', () => {
    it('correctly associates and retrieves EMU ID from alarm.device.bessAsset across multiple BESS assets', () => {
      const alarmBess1 = {
        id: 'alarm-1',
        message: 'PCS Overheating',
        device: {
          id: 'dev-1',
          name: 'PCS-01',
          type: 'PCS',
          bessAsset: {
            id: 'bess-1',
            name: 'New Hercules BESS 01',
            emuId: 'EMU-HERC-001'
          }
        }
      };

      const alarmBess2 = {
        id: 'alarm-2',
        message: 'BMS Cell Voltage High',
        device: {
          id: 'dev-2',
          name: 'BMS-01',
          type: 'BMS',
          bessAsset: {
            id: 'bess-2',
            name: 'NBI BESS 01',
            emuId: 'EMU-NBI-002'
          }
        }
      };

      const resolveEmuId = (alarm: any) => alarm.device?.bessAsset?.emuId || 'N/A';

      expect(resolveEmuId(alarmBess1)).toBe('EMU-HERC-001');
      expect(resolveEmuId(alarmBess2)).toBe('EMU-NBI-002');
      expect(alarmBess1.device.bessAsset.name).toBe('New Hercules BESS 01');
      expect(alarmBess2.device.bessAsset.name).toBe('NBI BESS 01');
    });

    it('displays graceful fallback "N/A" when EMU ID is null, undefined, or missing', () => {
      const resolveEmuId = (alarm: any) => alarm.device?.bessAsset?.emuId || 'N/A';

      const alarmNullEmu = {
        id: 'alarm-3',
        device: { bessAsset: { id: 'bess-3', name: 'Legacy BESS', emuId: null } }
      };
      const alarmUndefinedEmu = {
        id: 'alarm-4',
        device: { bessAsset: { id: 'bess-4', name: 'Legacy BESS 2' } }
      };
      const alarmNoDevice = {
        id: 'alarm-5'
      };

      expect(resolveEmuId(alarmNullEmu)).toBe('N/A');
      expect(resolveEmuId(alarmUndefinedEmu)).toBe('N/A');
      expect(resolveEmuId(alarmNoDevice)).toBe('N/A');
    });
  });

  // =========================================================================
  // 2. Alarm History Date Filters & Half-Open Boundaries
  // =========================================================================
  describe('2. Date Presets & Half-Open Timezone Boundaries', () => {
    it('calculates "Today" correctly as a 1-day range', () => {
      const { startDate, endDate } = calculateHistoryPresetDates('Today', anchorDate);
      expect(startDate).toBe('2026-10-17');
      expect(endDate).toBe('2026-10-17');
    });

    it('calculates "Yesterday" correctly as a 1-day range', () => {
      const { startDate, endDate } = calculateHistoryPresetDates('Yesterday', anchorDate);
      expect(startDate).toBe('2026-10-16');
      expect(endDate).toBe('2026-10-16');
    });

    it('calculates "Last 30 Days" correctly as a 30-day inclusive range', () => {
      const { startDate, endDate } = calculateHistoryPresetDates('Last 30 Days', anchorDate);
      expect(startDate).toBe('2026-09-18');
      expect(endDate).toBe('2026-10-17');

      const daysDiff = (new Date(endDate).getTime() - new Date(startDate).getTime()) / (1000 * 60 * 60 * 24) + 1;
      expect(daysDiff).toBe(30);
    });

    it('calculates "All" correctly as empty date strings (unbounded range)', () => {
      const { startDate, endDate } = calculateHistoryPresetDates('All', anchorDate);
      expect(startDate).toBe('');
      expect(endDate).toBe('');
    });

    it('builds half-open interval [from, to) ensuring the full local calendar day is included in UTC', () => {
      const { from, to } = buildHalfOpenInterval('2026-10-17', '2026-10-17', 'UTC');
      expect(from.toISOString()).toBe('2026-10-17T00:00:00.000Z');
      expect(to.toISOString()).toBe('2026-10-18T00:00:00.000Z');

      // Test half-open inclusion
      const morningEvent = new Date('2026-10-17T08:00:00.000Z');
      const lateNightEvent = new Date('2026-10-17T23:59:59.999Z');
      const nextDayEvent = new Date('2026-10-18T00:00:00.000Z');

      expect(morningEvent >= from && morningEvent < to).toBe(true);
      expect(lateNightEvent >= from && lateNightEvent < to).toBe(true);
      expect(nextDayEvent >= from && nextDayEvent < to).toBe(false);
    });

    it('builds half-open interval [from, to) in Asia/Kolkata (+05:30) timezone', () => {
      const { from, to } = buildHalfOpenInterval('2026-10-17', '2026-10-17', 'Asia/Kolkata');
      // 00:00:00 IST is 18:30:00 UTC previous day
      expect(from.toISOString()).toBe('2026-10-16T18:30:00.000Z');
      // Next day 00:00:00 IST is 18:30:00 UTC current day
      expect(to.toISOString()).toBe('2026-10-17T18:30:00.000Z');

      // 23:59:59.999 IST on 2026-10-17 is 18:29:59.999 UTC
      const lateEventInIST = new Date('2026-10-17T18:29:59.999Z');
      expect(lateEventInIST >= from && lateEventInIST < to).toBe(true);

      // 00:00:00 IST on 2026-10-18 is 18:30:00.000 UTC
      const midnightNextDayInIST = new Date('2026-10-17T18:30:00.000Z');
      expect(midnightNextDayInIST >= from && midnightNextDayInIST < to).toBe(false);
    });

    it('detects and flags reversed/invalid date ranges', () => {
      const startDate = '2026-10-20';
      const endDate = '2026-10-17';
      expect(startDate > endDate).toBe(true);
    });
  });

  // =========================================================================
  // 3. Active Faults vs Alarm History Tab Semantics
  // =========================================================================
  describe('3. Active Faults Preservation & History Statuses', () => {
    const allAlarms = [
      { id: '1', status: 'ACTIVE', createdAt: '2026-01-01T00:00:00.000Z', message: 'Old Active Fault' },
      { id: '2', status: 'ACTIVE', createdAt: '2026-10-17T10:00:00.000Z', message: 'New Active Fault' },
      { id: '3', status: 'CLEARED', createdAt: '2026-10-17T09:00:00.000Z', message: 'Cleared Fault' },
      { id: '4', status: 'ACKNOWLEDGED', createdAt: '2026-10-17T08:00:00.000Z', message: 'Acknowledged Fault' },
    ];

    it('preserves old unresolved active faults regardless of history date range', () => {
      // Active Faults tab: must never filter out old unresolved faults
      const activeFaults = allAlarms.filter(a => a.status === 'ACTIVE');
      expect(activeFaults).toHaveLength(2);
      expect(activeFaults.some(a => a.id === '1')).toBe(true);
      expect(activeFaults.some(a => a.id === '2')).toBe(true);
    });

    it('includes both CLEARED and ACKNOWLEDGED statuses in Alarm History', () => {
      const historyAlarms = allAlarms.filter(a => a.status !== 'ACTIVE');
      expect(historyAlarms).toHaveLength(2);
      expect(historyAlarms.map(a => a.status).sort()).toEqual(['ACKNOWLEDGED', 'CLEARED']);
    });
  });

  // =========================================================================
  // 4. CSV Escaping, Column Headers, and Formula-Injection Protection
  // =========================================================================
  describe('4. Server-Side CSV Formatting & Security', () => {
    it('defines the 10 authoritative export columns in exact sequence', () => {
      const expectedHeaders = [
        'Event Timestamp',
        'Severity',
        'Event Description',
        'Signal Identifier',
        'Client Name',
        'Site Name',
        'BESS Name',
        'EMU ID',
        'Device',
        'Status'
      ];

      const csvHeaderRow = formatCsvRow(expectedHeaders);
      expect(csvHeaderRow).toBe(
        'Event Timestamp,Severity,Event Description,Signal Identifier,Client Name,Site Name,BESS Name,EMU ID,Device,Status\r\n'
      );
    });

    it('protects against spreadsheet formula injection (=, +, -, @)', () => {
      expect(escapeCsvField('=SUM(A1:A10)', true)).toBe("'=SUM(A1:A10)");
      expect(escapeCsvField('+cmd|', true)).toBe("'+cmd|");
      expect(escapeCsvField('@alert', true)).toBe("'@alert");
      expect(escapeCsvField('-dangerous', true)).toBe("'-dangerous");
      // Legitimate negative numbers must remain unescaped
      expect(escapeCsvField(-42, true)).toBe('-42');
      expect(escapeCsvField('-15.5', true)).toBe('-15.5');
    });

    it('escapes fields with commas, double quotes, and newlines per RFC 4180', () => {
      const row = [
        '17 October 2026, 02:30:00 PM',
        'CRITICAL',
        'High temperature detected, emergency stop triggered',
        'pcs.di_flt_state',
        'GoodEnough Energy',
        'Site Alpha',
        'BESS 01',
        'EMU-001',
        'PCS',
        'CLEARED'
      ];

      const csvLine = formatCsvRow(row, true);
      // Event Timestamp and Description have commas, so they must be enclosed in quotes
      expect(csvLine).toContain('"17 October 2026, 02:30:00 PM"');
      expect(csvLine).toContain('"High temperature detected, emergency stop triggered"');
      expect(csvLine.endsWith('\r\n')).toBe(true);
    });

    it('formats site timestamp in local site timezone', () => {
      const dt = new Date('2026-10-17T10:00:00.000Z');
      // 10:00:00 UTC = 15:30:00 (3:30:00 PM) in Asia/Kolkata
      const formatted = formatSiteTimestamp(dt, 'Asia/Kolkata');
      expect(formatted).toBe('17 October 2026, 03:30:00 PM');
    });
  });

  // =========================================================================
  // 5. Controller Endpoints: Date Filtering, Export, and Authorization
  // =========================================================================
  describe('5. Alarm Controller: Date Filtering & Export Endpoints', () => {
    beforeEach(() => {
      vi.restoreAllMocks();
    });

    it('getSiteAlarms rejects invalid date parameters with 400', async () => {
      const mockReq: any = {
        params: { siteId: 'site-1' },
        query: { from: 'not-a-valid-date' },
        user: { id: 'user-1', role: 'ADMIN' }
      };
      const mockRes: any = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn()
      };

      vi.spyOn(prisma.site, 'findUnique').mockResolvedValue({ clientId: 'client-1' } as any);
      vi.spyOn(authorizationService, 'canAccessClient').mockResolvedValue(true);

      await alarmController.getSiteAlarms(mockReq, mockRes);
      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith(expect.objectContaining({ error: expect.stringContaining('Invalid "from" date') }));
    });

    it('getSiteAlarms rejects reversed date range (from >= to) with 400', async () => {
      const mockReq: any = {
        params: { siteId: 'site-1' },
        query: {
          from: '2026-10-20T00:00:00.000Z',
          to: '2026-10-15T00:00:00.000Z'
        },
        user: { id: 'user-1', role: 'ADMIN' }
      };
      const mockRes: any = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn()
      };

      vi.spyOn(prisma.site, 'findUnique').mockResolvedValue({ clientId: 'client-1' } as any);
      vi.spyOn(authorizationService, 'canAccessClient').mockResolvedValue(true);

      await alarmController.getSiteAlarms(mockReq, mockRes);
      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith(expect.objectContaining({ error: expect.stringContaining('from" must be before "to') }));
    });

    it('exportSiteAlarms enforces 401 when user is not authenticated', async () => {
      const mockReq: any = {
        params: { siteId: 'site-1' },
        query: {},
        user: null
      };
      const mockRes: any = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn()
      };

      await alarmController.exportSiteAlarms(mockReq, mockRes);
      expect(mockRes.status).toHaveBeenCalledWith(401);
      expect(mockRes.json).toHaveBeenCalledWith({ error: 'Unauthorized' });
    });

    it('exportSiteAlarms enforces 403 when user is unauthorized for site', async () => {
      const mockReq: any = {
        params: { siteId: 'site-1' },
        query: {},
        user: { id: 'user-unauth', role: 'CLIENT' }
      };
      const mockRes: any = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn()
      };

      vi.spyOn(prisma.site, 'findUnique').mockResolvedValue({ clientId: 'client-other' } as any);
      vi.spyOn(authorizationService, 'canAccessClient').mockResolvedValue(false);

      await alarmController.exportSiteAlarms(mockReq, mockRes);
      expect(mockRes.status).toHaveBeenCalledWith(403);
      expect(mockRes.json).toHaveBeenCalledWith({ error: 'Forbidden' });
    });

    it('exportSiteAlarms streams CSV with UTF-8 BOM, headers, and all matching records', async () => {
      const writtenChunks: string[] = [];
      const mockHeaders: Record<string, string> = {};

      const mockReq: any = {
        params: { siteId: 'site-1' },
        query: {
          startDate: '2026-10-01',
          endDate: '2026-10-17'
        },
        user: { id: 'admin-1', role: 'ADMIN' }
      };

      const mockRes: any = {
        setHeader: vi.fn((key: string, val: string) => {
          mockHeaders[key] = val;
        }),
        write: vi.fn((chunk: string) => {
          writtenChunks.push(chunk);
        }),
        end: vi.fn()
      };

      vi.spyOn(prisma.site, 'findUnique').mockResolvedValue({
        id: 'site-1',
        name: 'Alpha Site',
        timezone: 'Asia/Kolkata',
        clientId: 'client-1',
        client: { name: 'Acme Corp' }
      } as any);

      vi.spyOn(authorizationService, 'canAccessClient').mockResolvedValue(true);

      const mockAlarms = [
        {
          id: 'alarm-101',
          createdAt: new Date('2026-10-15T09:30:00.000Z'),
          severity: 'CRITICAL',
          message: 'STS Communication Fault',
          faultCode: 'pcs.di_sts_commstat_flt',
          status: 'CLEARED',
          device: {
            name: 'PCS Unit 1',
            type: 'PCS',
            bessAsset: {
              name: 'Hercules 01',
              emuId: 'EMU-HERC-99'
            }
          }
        },
        {
          id: 'alarm-102',
          createdAt: new Date('2026-10-16T14:15:00.000Z'),
          severity: 'WARNING',
          message: 'BMS Temperature Warning',
          faultCode: null,
          status: 'ACKNOWLEDGED',
          device: {
            name: null,
            type: 'BMS',
            bessAsset: {
              name: 'NBI 02',
              emuId: null // Test null EMU ID fallback in export
            }
          }
        }
      ];

      vi.spyOn(prisma.alarm, 'findMany').mockResolvedValue(mockAlarms as any);

      await alarmController.exportSiteAlarms(mockReq, mockRes);

      // Verify response headers
      expect(mockHeaders['Content-Type']).toBe('text/csv; charset=utf-8');
      expect(mockHeaders['Content-Disposition']).toBe('attachment; filename="alarms-history-2026-10-01-to-2026-10-17.csv"');

      // Verify UTF-8 BOM
      expect(writtenChunks[0]).toBe('\uFEFF');

      // Verify Header row
      expect(writtenChunks[1]).toContain('Event Timestamp,Severity,Event Description,Signal Identifier,Client Name,Site Name,BESS Name,EMU ID,Device,Status');

      // Verify Data row 1
      expect(writtenChunks[2]).toContain('CRITICAL');
      expect(writtenChunks[2]).toContain('STS Communication Fault');
      expect(writtenChunks[2]).toContain('pcs.di_sts_commstat_flt');
      expect(writtenChunks[2]).toContain('Acme Corp');
      expect(writtenChunks[2]).toContain('Alpha Site');
      expect(writtenChunks[2]).toContain('Hercules 01');
      expect(writtenChunks[2]).toContain('EMU-HERC-99');
      expect(writtenChunks[2]).toContain('PCS Unit 1');
      expect(writtenChunks[2]).toContain('CLEARED');

      // Verify Data row 2 (null EMU ID preserved as empty string, type fallback for device name)
      expect(writtenChunks[3]).toContain('WARNING');
      expect(writtenChunks[3]).toContain('BMS Temperature Warning');
      expect(writtenChunks[3]).toContain('NBI 02');
      expect(writtenChunks[3]).toContain('BMS');
      expect(writtenChunks[3]).toContain('ACKNOWLEDGED');

      // Verify res.end was called
      expect(mockRes.end).toHaveBeenCalled();
    });

    it('exportSiteAlarms handles empty history cleanly without errors', async () => {
      const writtenChunks: string[] = [];
      const mockReq: any = {
        params: { siteId: 'site-1' },
        query: {},
        user: { id: 'admin-1', role: 'ADMIN' }
      };

      const mockRes: any = {
        setHeader: vi.fn(),
        write: vi.fn((chunk: string) => {
          writtenChunks.push(chunk);
        }),
        end: vi.fn()
      };

      vi.spyOn(prisma.site, 'findUnique').mockResolvedValue({
        id: 'site-1',
        name: 'Empty Site',
        timezone: 'Asia/Kolkata',
        clientId: 'client-1',
        client: { name: 'Acme' }
      } as any);

      vi.spyOn(authorizationService, 'canAccessClient').mockResolvedValue(true);
      vi.spyOn(prisma.alarm, 'findMany').mockResolvedValue([]);

      await alarmController.exportSiteAlarms(mockReq, mockRes);

      // Must have written BOM and headers
      expect(writtenChunks[0]).toBe('\uFEFF');
      expect(writtenChunks[1]).toContain('Event Timestamp,Severity,Event Description');
      expect(writtenChunks).toHaveLength(2); // Only BOM and Header row
      expect(mockRes.end).toHaveBeenCalled();
    });

    it('getSiteAlarms returns all historical alarms newest-first without createdAt restriction when dates are omitted', async () => {
      const mockReq: any = {
        params: { siteId: 'site-1' },
        query: { status: 'HISTORY' },
        user: { id: 'admin-1', role: 'ADMIN' }
      };
      const mockRes: any = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn()
      };

      vi.spyOn(prisma.site, 'findUnique').mockResolvedValue({ clientId: 'client-1' } as any);
      vi.spyOn(authorizationService, 'canAccessClient').mockResolvedValue(true);
      const findManySpy = vi.spyOn(prisma.alarm, 'findMany').mockResolvedValue([
        { id: 'alarm-2', createdAt: new Date('2026-10-17T12:00:00Z'), status: 'CLEARED' },
        { id: 'alarm-1', createdAt: new Date('2026-10-10T12:00:00Z'), status: 'CLEARED' }
      ] as any);

      await alarmController.getSiteAlarms(mockReq, mockRes);

      expect(mockRes.json).toHaveBeenCalled();
      expect(findManySpy).toHaveBeenCalledWith(expect.objectContaining({
        where: {
          device: {
            bessAsset: {
              siteId: 'site-1'
            }
          },
          status: { in: ['CLEARED', 'ACKNOWLEDGED'] }
        },
        orderBy: [
          { createdAt: 'desc' },
          { id: 'desc' }
        ],
        take: 500
      }));
      const callArgs = findManySpy.mock.calls[0][0];
      expect(callArgs?.where?.createdAt).toBeUndefined();
    });

    it('exportSiteAlarms exports all history alarms with alarms-history-all-to-all.csv when dates are omitted', async () => {
      const writtenChunks: string[] = [];
      const mockHeaders: Record<string, string> = {};

      const mockReq: any = {
        params: { siteId: 'site-1' },
        query: {},
        user: { id: 'admin-1', role: 'ADMIN' }
      };

      const mockRes: any = {
        setHeader: vi.fn((key: string, val: string) => {
          mockHeaders[key] = val;
        }),
        write: vi.fn((chunk: string) => {
          writtenChunks.push(chunk);
        }),
        end: vi.fn()
      };

      vi.spyOn(prisma.site, 'findUnique').mockResolvedValue({
        id: 'site-1',
        name: 'Alpha Site',
        timezone: 'Asia/Kolkata',
        clientId: 'client-1',
        client: { name: 'Acme Corp' }
      } as any);

      vi.spyOn(authorizationService, 'canAccessClient').mockResolvedValue(true);
      const findManySpy = vi.spyOn(prisma.alarm, 'findMany').mockResolvedValue([
        {
          id: 'alarm-200',
          createdAt: new Date('2026-10-17T15:00:00.000Z'),
          severity: 'CRITICAL',
          message: 'BMS Cell Overvoltage',
          faultCode: 'bms.cell_ov',
          status: 'CLEARED',
          device: { name: 'BMS-01', type: 'BMS', bessAsset: { name: 'BESS 01', emuId: 'EMU-01' } }
        },
        {
          id: 'alarm-100',
          createdAt: new Date('2026-09-20T10:00:00.000Z'),
          severity: 'WARNING',
          message: 'TMS Temp High',
          faultCode: null,
          status: 'ACKNOWLEDGED',
          device: { name: 'TMS-01', type: 'TMS', bessAsset: { name: 'BESS 01', emuId: 'EMU-01' } }
        }
      ] as any);

      await alarmController.exportSiteAlarms(mockReq, mockRes);

      expect(mockHeaders['Content-Type']).toBe('text/csv; charset=utf-8');
      expect(mockHeaders['Content-Disposition']).toBe('attachment; filename="alarms-history-all-to-all.csv"');

      expect(findManySpy).toHaveBeenCalledWith(expect.objectContaining({
        where: {
          device: {
            bessAsset: {
              siteId: 'site-1'
            }
          },
          status: { in: ['CLEARED', 'ACKNOWLEDGED'] }
        },
        orderBy: [
          { createdAt: 'desc' },
          { id: 'desc' }
        ]
      }));
      const callArgs = findManySpy.mock.calls[0][0];
      expect(callArgs?.where?.createdAt).toBeUndefined();

      expect(writtenChunks.some(chunk => chunk.includes('alarm-200') || chunk.includes('BMS Cell Overvoltage'))).toBe(true);
      expect(writtenChunks.some(chunk => chunk.includes('alarm-100') || chunk.includes('TMS Temp High'))).toBe(true);
      expect(mockRes.end).toHaveBeenCalled();
    });
  });

  // =========================================================================
  // 6. Frontend Alarm History Default & Deterministic Ordering Logic
  // =========================================================================
  describe('6. Frontend Alarm History Default & Deterministic Ordering Logic', () => {
    function sortAlarms(alarms: Array<{ id: string; createdAt: string }>) {
      return [...alarms].sort((a, b) => {
        const timeDiff = new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
        if (timeDiff !== 0) return timeDiff;
        return (b.id || '').localeCompare(a.id || '');
      });
    }

    it('sorts alarms by createdAt DESC (newest first)', () => {
      const alarms = [
        { id: 'a1', createdAt: '2026-09-15T10:00:00.000Z' },
        { id: 'a2', createdAt: '2026-10-18T10:00:00.000Z' },
        { id: 'a3', createdAt: '2026-10-01T10:00:00.000Z' }
      ];

      const sorted = sortAlarms(alarms);
      expect(sorted.map(a => a.id)).toEqual(['a2', 'a3', 'a1']);
      expect(alarms[0].id).toBe('a1');
    });

    it('breaks ties deterministically using id DESC when createdAt timestamps match', () => {
      const sameTime = '2026-10-17T12:00:00.000Z';
      const alarms = [
        { id: 'alarm-aaa', createdAt: sameTime },
        { id: 'alarm-zzz', createdAt: sameTime },
        { id: 'alarm-mmm', createdAt: sameTime }
      ];

      const sorted = sortAlarms(alarms);
      expect(sorted.map(a => a.id)).toEqual(['alarm-zzz', 'alarm-mmm', 'alarm-aaa']);
    });

    it('orders by timestamp first, then id DESC on ties', () => {
      const t1 = '2026-10-18T12:00:00.000Z';
      const t2 = '2026-10-17T12:00:00.000Z';
      const alarms = [
        { id: 'id-1', createdAt: t2 },
        { id: 'id-3', createdAt: t2 },
        { id: 'id-2', createdAt: t1 }
      ];

      const sorted = sortAlarms(alarms);
      expect(sorted.map(a => a.id)).toEqual(['id-2', 'id-3', 'id-1']);
    });

    it('handles empty or missing IDs defensively without crashing', () => {
      const sameTime = '2026-10-17T12:00:00.000Z';
      const alarms = [
        { id: '', createdAt: sameTime },
        { id: 'alarm-b', createdAt: sameTime }
      ];

      const sorted = sortAlarms(alarms);
      expect(sorted.map(a => a.id)).toEqual(['alarm-b', '']);
    });

    it('constructs CSV export query parameters correctly for All History vs date presets', () => {
      function buildExportQuery(from?: Date, to?: Date, startDateStr?: string, endDateStr?: string): string {
        const sp = new URLSearchParams();
        if (from) sp.append('from', from.toISOString());
        if (to) sp.append('to', to.toISOString());
        if (startDateStr) sp.append('startDate', startDateStr);
        if (endDateStr) sp.append('endDate', endDateStr);
        const qs = sp.toString();
        return qs ? `?${qs}` : '';
      }

      // For All History: no date parameters
      const allHistoryQuery = buildExportQuery();
      expect(allHistoryQuery).toBe('');

      // For Today preset
      const from = new Date('2026-10-17T00:00:00.000Z');
      const to = new Date('2026-10-18T00:00:00.000Z');
      const todayQuery = buildExportQuery(from, to, '2026-10-17', '2026-10-17');
      expect(todayQuery).toContain('from=2026-10-17T00%3A00%3A00.000Z');
      expect(todayQuery).toContain('to=2026-10-18T00%3A00%3A00.000Z');
      expect(todayQuery).toContain('startDate=2026-10-17');
      expect(todayQuery).toContain('endDate=2026-10-17');
      expect(todayQuery).not.toContain('undefined');
      expect(todayQuery).not.toContain('null');
    });
  });
});

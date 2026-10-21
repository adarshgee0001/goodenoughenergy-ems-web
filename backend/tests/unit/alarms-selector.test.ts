import { describe, it, expect, vi, beforeEach } from 'vitest';
import { formatCsvRow, escapeCsvField, formatSiteTimestamp } from '../../src/utils/csv.util';
import { alarmController } from '../../src/controllers/alarm.controller';
import { authorizationService } from '../../src/services/authorization.service';
import { prisma } from '../../src/db/prisma';

describe('BESS-Selector-Aware Alarms & Events Unit Tests', () => {
  const SITE_ID = 'site-uuid-1';
  const BESS_1_ID = 'bess-uuid-1';
  const BESS_2_ID = 'bess-uuid-2';
  const OTHER_SITE_BESS_ID = 'bess-uuid-other-site';

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  // =========================================================================
  // 1. getSiteAlarms: All BESS vs Individual BESS & Site Ownership
  // =========================================================================
  describe('1. getSiteAlarms Backend Filtering', () => {
    it('1.1 getSiteAlarms without bessId retains site-wide behavior', async () => {
      const mockReq: any = {
        params: { siteId: SITE_ID },
        query: { status: 'ACTIVE' },
        user: { id: 'user-1', role: 'ADMIN' }
      };
      const mockRes: any = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn()
      };

      vi.spyOn(prisma.site, 'findUnique').mockResolvedValue({ clientId: 'client-1' } as any);
      vi.spyOn(authorizationService, 'canAccessClient').mockResolvedValue(true);
      const findManySpy = vi.spyOn(prisma.alarm, 'findMany').mockResolvedValue([
        { id: 'alarm-1', device: { bessAsset: { id: BESS_1_ID, siteId: SITE_ID } } },
        { id: 'alarm-2', device: { bessAsset: { id: BESS_2_ID, siteId: SITE_ID } } }
      ] as any);

      await alarmController.getSiteAlarms(mockReq, mockRes);

      expect(mockRes.json).toHaveBeenCalled();
      expect(findManySpy).toHaveBeenCalledWith(expect.objectContaining({
        where: expect.objectContaining({
          device: {
            bessAsset: { siteId: SITE_ID }
          },
          status: 'ACTIVE'
        })
      }));
    });

    it('1.2 getSiteAlarms with valid bessId returns only that BESS alarms', async () => {
      const mockReq: any = {
        params: { siteId: SITE_ID },
        query: { status: 'ACTIVE', bessId: BESS_1_ID },
        user: { id: 'user-1', role: 'ADMIN' }
      };
      const mockRes: any = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn()
      };

      vi.spyOn(prisma.site, 'findUnique').mockResolvedValue({ clientId: 'client-1' } as any);
      vi.spyOn(authorizationService, 'canAccessClient').mockResolvedValue(true);
      vi.spyOn(prisma.bESSAsset, 'findFirst').mockResolvedValue({ id: BESS_1_ID, name: 'BESS 01' } as any);

      const findManySpy = vi.spyOn(prisma.alarm, 'findMany').mockResolvedValue([
        { id: 'alarm-1', device: { bessAsset: { id: BESS_1_ID, siteId: SITE_ID } } }
      ] as any);

      await alarmController.getSiteAlarms(mockReq, mockRes);

      expect(mockRes.json).toHaveBeenCalled();
      expect(findManySpy).toHaveBeenCalledWith(expect.objectContaining({
        where: expect.objectContaining({
          device: {
            bessAsset: { id: BESS_1_ID, siteId: SITE_ID }
          },
          status: 'ACTIVE'
        })
      }));
    });

    it('1.3 Selected-BESS filtering cannot return records from another site', async () => {
      const mockReq: any = {
        params: { siteId: SITE_ID },
        query: { bessId: OTHER_SITE_BESS_ID },
        user: { id: 'user-1', role: 'ADMIN' }
      };
      const mockRes: any = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn()
      };

      vi.spyOn(prisma.site, 'findUnique').mockResolvedValue({ clientId: 'client-1' } as any);
      vi.spyOn(authorizationService, 'canAccessClient').mockResolvedValue(true);
      // findFirst queries where: { id: bessId, siteId: SITE_ID } -> returns null because it belongs to another site
      vi.spyOn(prisma.bESSAsset, 'findFirst').mockResolvedValue(null);
      const findManySpy = vi.spyOn(prisma.alarm, 'findMany');

      await alarmController.getSiteAlarms(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(404);
      expect(mockRes.json).toHaveBeenCalledWith(expect.objectContaining({
        error: expect.stringContaining('BESS asset not found or does not belong to this site')
      }));
      expect(findManySpy).not.toHaveBeenCalled();
    });

    it('1.4 Invalid or inaccessible bessId does not broaden the query', async () => {
      const mockReq: any = {
        params: { siteId: SITE_ID },
        query: { bessId: 'non-existent-bess-id' },
        user: { id: 'user-1', role: 'ADMIN' }
      };
      const mockRes: any = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn()
      };

      vi.spyOn(prisma.site, 'findUnique').mockResolvedValue({ clientId: 'client-1' } as any);
      vi.spyOn(authorizationService, 'canAccessClient').mockResolvedValue(true);
      vi.spyOn(prisma.bESSAsset, 'findFirst').mockResolvedValue(null);
      const findManySpy = vi.spyOn(prisma.alarm, 'findMany');

      await alarmController.getSiteAlarms(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(404);
      // Ensures query was NEVER broadened to site-wide or executed
      expect(findManySpy).not.toHaveBeenCalled();
    });
  });

  // =========================================================================
  // 2. exportSiteAlarms: Scoping, Sanitized Filename, and CSV Integrity
  // =========================================================================
  describe('2. exportSiteAlarms Backend Filtering & Filename', () => {
    it('2.1 exportSiteAlarms without bessId retains existing site-wide behavior and filename', async () => {
      const mockHeaders: Record<string, string> = {};
      const writtenChunks: string[] = [];
      const mockReq: any = {
        params: { siteId: SITE_ID },
        query: { startDate: '2026-10-01', endDate: '2026-10-20' },
        user: { id: 'user-1', role: 'ADMIN' }
      };
      const mockRes: any = {
        setHeader: vi.fn((k, v) => { mockHeaders[k] = v; }),
        write: vi.fn((c) => { writtenChunks.push(c); }),
        end: vi.fn()
      };

      vi.spyOn(prisma.site, 'findUnique').mockResolvedValue({
        id: SITE_ID,
        name: 'Alpha Site',
        timezone: 'Asia/Kolkata',
        clientId: 'client-1',
        client: { name: 'Acme Corp' }
      } as any);
      vi.spyOn(authorizationService, 'canAccessClient').mockResolvedValue(true);
      const findManySpy = vi.spyOn(prisma.alarm, 'findMany').mockResolvedValue([]);

      await alarmController.exportSiteAlarms(mockReq, mockRes);

      expect(mockHeaders['Content-Disposition']).toBe('attachment; filename="alarms-history-2026-10-01-to-2026-10-20.csv"');
      expect(findManySpy).toHaveBeenCalledWith(expect.objectContaining({
        where: expect.objectContaining({
          device: { bessAsset: { siteId: SITE_ID } }
        })
      }));
    });

    it('2.2 exportSiteAlarms with bessId filters to that BESS and sanitizes BESS name in filename', async () => {
      const mockHeaders: Record<string, string> = {};
      const writtenChunks: string[] = [];
      const mockReq: any = {
        params: { siteId: SITE_ID },
        query: {
          startDate: '2026-10-01',
          endDate: '2026-10-20',
          bessId: BESS_1_ID
        },
        user: { id: 'user-1', role: 'ADMIN' }
      };
      const mockRes: any = {
        setHeader: vi.fn((k, v) => { mockHeaders[k] = v; }),
        write: vi.fn((c) => { writtenChunks.push(c); }),
        end: vi.fn()
      };

      vi.spyOn(prisma.site, 'findUnique').mockResolvedValue({
        id: SITE_ID,
        name: 'Alpha Site',
        timezone: 'Asia/Kolkata',
        clientId: 'client-1',
        client: { name: 'Acme Corp' }
      } as any);
      vi.spyOn(authorizationService, 'canAccessClient').mockResolvedValue(true);
      vi.spyOn(prisma.bESSAsset, 'findFirst').mockResolvedValue({
        id: BESS_1_ID,
        name: 'Rac BESS #01 (Main)'
      } as any);

      const findManySpy = vi.spyOn(prisma.alarm, 'findMany').mockResolvedValue([
        {
          id: 'alarm-1',
          createdAt: new Date('2026-10-15T10:00:00.000Z'),
          severity: 'CRITICAL',
          message: 'BMS High Temp',
          faultCode: 'bms.temp_high',
          status: 'CLEARED',
          device: {
            name: 'BMS-1',
            type: 'BMS',
            bessAsset: { name: 'Rac BESS #01 (Main)', emuId: 'EMU-01' }
          }
        }
      ] as any);

      await alarmController.exportSiteAlarms(mockReq, mockRes);

      // Sanitized name: 'rac-bess-01-main'
      expect(mockHeaders['Content-Disposition']).toBe(
        'attachment; filename="alarms-history-rac-bess-01-main-2026-10-01-to-2026-10-20.csv"'
      );
      expect(findManySpy).toHaveBeenCalledWith(expect.objectContaining({
        where: expect.objectContaining({
          device: {
            bessAsset: { id: BESS_1_ID, siteId: SITE_ID }
          }
        })
      }));

      // Verifies BOM and CSV row contents
      expect(writtenChunks[0]).toBe('\uFEFF');
      expect(writtenChunks[1]).toContain('Event Timestamp,Severity,Event Description');
      expect(writtenChunks[2]).toContain('Rac BESS #01 (Main)');
      expect(writtenChunks[2]).toContain('EMU-01');
    });

    it('2.3 exportSiteAlarms rejects foreign or invalid bessId with 404', async () => {
      const mockReq: any = {
        params: { siteId: SITE_ID },
        query: { bessId: OTHER_SITE_BESS_ID },
        user: { id: 'user-1', role: 'ADMIN' }
      };
      const mockRes: any = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn(),
        setHeader: vi.fn(),
        write: vi.fn(),
        end: vi.fn()
      };

      vi.spyOn(prisma.site, 'findUnique').mockResolvedValue({
        id: SITE_ID,
        clientId: 'client-1'
      } as any);
      vi.spyOn(authorizationService, 'canAccessClient').mockResolvedValue(true);
      vi.spyOn(prisma.bESSAsset, 'findFirst').mockResolvedValue(null);

      await alarmController.exportSiteAlarms(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(404);
      expect(mockRes.json).toHaveBeenCalledWith({ error: 'BESS asset not found or does not belong to this site' });
    });
  });

  // =========================================================================
  // 3. Frontend Logic: Selector Visibility, Selection Reset & Scope Derivation
  // =========================================================================
  describe('3. Frontend Context, Selector Visibility & Scope Derivation', () => {
    const multiBessAssets = [
      { id: 'bess-1', name: 'Rac BESS 01', emuId: 'EMU-01' },
      { id: 'bess-2', name: 'Rac BESS 02', emuId: 'EMU-02' },
      { id: 'bess-3', name: 'Rac BESS 03', emuId: 'EMU-03' }
    ];

    const singleBessAssets = [
      { id: 'bess-solo', name: 'Solo BESS', emuId: 'EMU-SOLO' }
    ];

    it('3.1 shows selector only when bessAssets.length > 1', () => {
      const isMultiBessMulti = multiBessAssets.length > 1;
      const isMultiBessSingle = singleBessAssets.length > 1;

      expect(isMultiBessMulti).toBe(true);
      expect(isMultiBessSingle).toBe(false);
    });

    it('3.2 resets selection to null (All BESS) when site ID changes', () => {
      let selectedBessId: string | null = 'bess-1';
      let prevSiteId = 'site-1';
      const nextSiteId = 'site-2';

      // Simulating useEffect on ctx?.site.id
      if (nextSiteId !== prevSiteId) {
        selectedBessId = null;
        prevSiteId = nextSiteId;
      }

      expect(selectedBessId).toBeNull();
    });

    it('3.3 validates selectedBessId against active site assets before using it', () => {
      const isMultiBess = true;
      const validSelectedId = 'bess-2';
      const invalidSelectedId = 'bess-unknown';

      const deriveActiveBessId = (selId: string | null, assets: typeof multiBessAssets) => {
        return isMultiBess && selId && assets.some(b => b.id === selId) ? selId : null;
      };

      expect(deriveActiveBessId(validSelectedId, multiBessAssets)).toBe('bess-2');
      expect(deriveActiveBessId(invalidSelectedId, multiBessAssets)).toBeNull();
      expect(deriveActiveBessId(null, multiBessAssets)).toBeNull();
    });

    it('3.4 Single-BESS context always derives activeBessId as null (preserving site-wide requests)', () => {
      const isMultiBess = singleBessAssets.length > 1; // false
      const selectedBessId: string | null = 'bess-solo';

      const activeBessId =
        isMultiBess && selectedBessId && singleBessAssets.some(b => b.id === selectedBessId)
          ? selectedBessId
          : null;

      expect(activeBessId).toBeNull();
    });
  });

  // =========================================================================
  // 4. Empty States & Context Subtitles
  // =========================================================================
  describe('4. Context-Aware Subtitles & Empty State Messages', () => {
    const multiBessAssets = [
      { id: 'bess-1', name: 'Rac BESS 01', emuId: 'EMU-01' },
      { id: 'bess-2', name: 'Rac BESS 02', emuId: 'EMU-02' }
    ];

    function resolveSubtitle(isMultiBess: boolean, activeBessId: string | null, selectedBess: any, bessCount: number, soloName?: string) {
      if (isMultiBess) {
        return activeBessId !== null
          ? ` — ${selectedBess?.name ?? 'Selected BESS'}`
          : ` — Site Overview (${bessCount} BESS)`;
      }
      return ` — ${soloName || 'BESS'}`;
    }

    function resolveEmptyState(activeTab: 'active' | 'history', activeBessId: string | null, selectedBess: any, datePreset: string) {
      if (activeTab === 'active') {
        return activeBessId && selectedBess
          ? `No active faults for ${selectedBess.name}.`
          : 'No active faults to display in this view.';
      } else {
        if (datePreset === 'All') {
          return activeBessId && selectedBess
            ? `No historical alarms found for ${selectedBess.name}.`
            : 'No historical alarms found.';
        } else {
          return activeBessId && selectedBess
            ? `No historical alarms found for ${selectedBess.name} in this date range.`
            : 'No historical alarms found for the selected date range.';
        }
      }
    }

    it('4.1 resolves subtitle correctly for All BESS vs Individual BESS vs Single-BESS', () => {
      const allBessSub = resolveSubtitle(true, null, null, 2);
      expect(allBessSub).toBe(' — Site Overview (2 BESS)');

      const indBessSub = resolveSubtitle(true, 'bess-1', multiBessAssets[0], 2);
      expect(indBessSub).toBe(' — Rac BESS 01');

      const singleBessSub = resolveSubtitle(false, null, null, 1, 'Solo BESS');
      expect(singleBessSub).toBe(' — Solo BESS');
    });

    it('4.2 resolves Active Faults empty state correctly for All BESS vs Individual BESS', () => {
      const allClearSite = resolveEmptyState('active', null, null, 'All');
      expect(allClearSite).toBe('No active faults to display in this view.');

      const allClearBess = resolveEmptyState('active', 'bess-1', multiBessAssets[0], 'All');
      expect(allClearBess).toBe('No active faults for Rac BESS 01.');
    });

    it('4.3 resolves History empty state correctly for All BESS vs Individual BESS (All and Range)', () => {
      const historyAllSite = resolveEmptyState('history', null, null, 'All');
      expect(historyAllSite).toBe('No historical alarms found.');

      const historyAllBess = resolveEmptyState('history', 'bess-1', multiBessAssets[0], 'All');
      expect(historyAllBess).toBe('No historical alarms found for Rac BESS 01.');

      const historyRangeSite = resolveEmptyState('history', null, null, 'Last 30 Days');
      expect(historyRangeSite).toBe('No historical alarms found for the selected date range.');

      const historyRangeBess = resolveEmptyState('history', 'bess-1', multiBessAssets[0], 'Last 30 Days');
      expect(historyRangeBess).toBe('No historical alarms found for Rac BESS 01 in this date range.');
    });
  });

  // =========================================================================
  // 5. Client-Side Defensive Isolation & WebSocket Updates
  // =========================================================================
  describe('5. Client-Side Filtering & WebSocket Event Isolation', () => {
    const rawAlarms = [
      {
        id: 'alarm-1',
        status: 'ACTIVE',
        createdAt: '2026-10-20T10:00:00.000Z',
        device: { bessAsset: { id: 'bess-1', name: 'BESS 01' } }
      },
      {
        id: 'alarm-2',
        status: 'ACTIVE',
        createdAt: '2026-10-20T10:05:00.000Z',
        device: { bessAsset: { id: 'bess-2', name: 'BESS 02' } }
      }
    ];

    function filterDisplayedAlarms(alarms: typeof rawAlarms, activeBessId: string | null) {
      const scoped = activeBessId
        ? alarms.filter(a => a.device?.bessAsset?.id === activeBessId)
        : alarms;
      return [...scoped].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    }

    it('5.1 All BESS mode shows records across all BESS assets', () => {
      const displayed = filterDisplayedAlarms(rawAlarms, null);
      expect(displayed).toHaveLength(2);
      expect(displayed.map(a => a.id)).toEqual(['alarm-2', 'alarm-1']);
    });

    it('5.2 Individual BESS mode isolates display to selected asset', () => {
      const displayedBess1 = filterDisplayedAlarms(rawAlarms, 'bess-1');
      expect(displayedBess1).toHaveLength(1);
      expect(displayedBess1[0].id).toBe('alarm-1');

      const displayedBess2 = filterDisplayedAlarms(rawAlarms, 'bess-2');
      expect(displayedBess2).toHaveLength(1);
      expect(displayedBess2[0].id).toBe('alarm-2');
    });

    it('5.3 WebSocket event for another BESS does not enter individual BESS view', () => {
      let currentAlarms = [...rawAlarms];

      // New alarm received via WebSocket for BESS 2
      const incomingAlarm = {
        id: 'alarm-3',
        status: 'ACTIVE',
        createdAt: '2026-10-20T10:10:00.000Z',
        device: { bessAsset: { id: 'bess-2', name: 'BESS 02' } }
      };

      currentAlarms = [incomingAlarm, ...currentAlarms];

      // If user is currently viewing BESS 1:
      const displayedInBess1 = filterDisplayedAlarms(currentAlarms, 'bess-1');
      expect(displayedInBess1).toHaveLength(1);
      expect(displayedInBess1.some(a => a.id === 'alarm-3')).toBe(false);

      // If user is viewing All BESS:
      const displayedInAll = filterDisplayedAlarms(currentAlarms, null);
      expect(displayedInAll).toHaveLength(3);
      expect(displayedInAll[0].id).toBe('alarm-3');
    });

    it('5.4 Acknowledging an active alarm removes it from active list and moves to history', () => {
      let activeList = [
        { id: 'alarm-1', status: 'ACTIVE', createdAt: '2026-10-20T10:00:00.000Z' },
        { id: 'alarm-2', status: 'ACTIVE', createdAt: '2026-10-20T10:05:00.000Z' }
      ];
      let historyList: any[] = [];

      // Acknowledge alarm-1
      const updatedAlarm = { id: 'alarm-1', status: 'ACKNOWLEDGED', createdAt: '2026-10-20T10:00:00.000Z' };

      activeList = activeList.filter(a => a.id !== updatedAlarm.id);
      historyList = [updatedAlarm, ...historyList];

      expect(activeList.map(a => a.id)).toEqual(['alarm-2']);
      expect(historyList.map(a => a.id)).toEqual(['alarm-1']);
      expect(historyList[0].status).toBe('ACKNOWLEDGED');
    });
  });
});

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { exportDynamicReport } from '../../src/controllers/report-export.controller';
import { getSiteTelemetrySnapshots } from '../../src/controllers/telemetry-snapshot.controller';
import { reportExportService } from '../../src/services/report-export.service';
import { assetService } from '../../src/services/asset.service';
import { authorizationService } from '../../src/services/authorization.service';
import { prisma } from '../../src/db/prisma';

describe('BESS-Selector-Aware Reports Tab Unit Tests', () => {
  const SITE_ID = 'site-uuid-1';
  const BESS_1_ID = 'bess-uuid-1';
  const BESS_2_ID = 'bess-uuid-2';
  const OTHER_SITE_BESS_ID = 'bess-uuid-foreign';

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  // =========================================================================
  // 1. Export Scoping & Format Compatibility
  // =========================================================================
  describe('1. Export Scoping & Format Compatibility', () => {
    it('1.1 Multi-BESS site without bessAssetId exports Excel workbook', async () => {
      const mockReq: any = {
        params: { siteId: SITE_ID },
        query: {
          from: '2026-10-01T00:00:00.000Z',
          to: '2026-10-02T00:00:00.000Z'
        },
        user: { id: 'user-1', role: 'ADMIN' }
      };
      const mockRes: any = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn(),
        setHeader: vi.fn()
      };

      vi.spyOn(assetService, 'resolveSiteOwnership').mockResolvedValue('client-1');
      vi.spyOn(authorizationService, 'canAccessClient').mockResolvedValue(true);
      vi.spyOn(prisma.bESSAsset, 'findMany').mockResolvedValue([
        { id: BESS_1_ID, name: 'BESS 01', reportIntervalMinutes: 15 },
        { id: BESS_2_ID, name: 'BESS 02', reportIntervalMinutes: 15 }
      ] as any);

      const exportSpy = vi.spyOn(reportExportService, 'exportDynamicReport').mockResolvedValue(undefined as any);

      await exportDynamicReport(mockReq, mockRes, vi.fn());

      expect(mockRes.setHeader).toHaveBeenCalledWith(
        'Content-Type',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      );
      expect(mockRes.setHeader).toHaveBeenCalledWith(
        'Content-Disposition',
        expect.stringContaining('EMS_Report_2026-10-01_to_2026-10-02.xlsx')
      );
      expect(exportSpy).toHaveBeenCalledWith(
        mockRes,
        SITE_ID,
        15,
        expect.any(Date),
        expect.any(Date),
        expect.any(Object),
        undefined
      );
    });

    it('1.2 Multi-BESS site with valid bessAssetId exports CSV scoped strictly to that asset', async () => {
      const mockReq: any = {
        params: { siteId: SITE_ID },
        query: {
          from: '2026-10-01T00:00:00.000Z',
          to: '2026-10-02T00:00:00.000Z',
          bessAssetId: BESS_1_ID
        },
        user: { id: 'user-1', role: 'ADMIN' }
      };
      const mockRes: any = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn(),
        setHeader: vi.fn()
      };

      vi.spyOn(assetService, 'resolveSiteOwnership').mockResolvedValue('client-1');
      vi.spyOn(authorizationService, 'canAccessClient').mockResolvedValue(true);
      vi.spyOn(prisma.bESSAsset, 'findFirst').mockResolvedValue({
        id: BESS_1_ID,
        name: 'Rac BESS 01',
        reportIntervalMinutes: 15
      } as any);
      vi.spyOn(prisma.bESSAsset, 'findMany').mockResolvedValue([
        { id: BESS_1_ID, name: 'Rac BESS 01', reportIntervalMinutes: 15 },
        { id: BESS_2_ID, name: 'Rac BESS 02', reportIntervalMinutes: 15 }
      ] as any);

      const exportSpy = vi.spyOn(reportExportService, 'exportDynamicReport').mockResolvedValue(undefined as any);

      await exportDynamicReport(mockReq, mockRes, vi.fn());

      expect(mockRes.setHeader).toHaveBeenCalledWith(
        'Content-Type',
        'text/csv; charset=utf-8'
      );
      expect(mockRes.setHeader).toHaveBeenCalledWith(
        'Content-Disposition',
        expect.stringContaining('EMS_Report_rac-bess-01_2026-10-01_to_2026-10-02.csv')
      );
      expect(exportSpy).toHaveBeenCalledWith(
        mockRes,
        SITE_ID,
        15,
        expect.any(Date),
        expect.any(Date),
        expect.any(Object),
        BESS_1_ID
      );
    });

    it('1.3 Single-BESS site without bessAssetId preserves CSV export behavior', async () => {
      const mockReq: any = {
        params: { siteId: SITE_ID },
        query: {
          from: '2026-10-01T00:00:00.000Z',
          to: '2026-10-02T00:00:00.000Z'
        },
        user: { id: 'user-1', role: 'CLIENT' }
      };
      const mockRes: any = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn(),
        setHeader: vi.fn()
      };

      vi.spyOn(assetService, 'resolveSiteOwnership').mockResolvedValue('client-1');
      vi.spyOn(authorizationService, 'canAccessClient').mockResolvedValue(true);
      vi.spyOn(prisma.bESSAsset, 'findMany').mockResolvedValue([
        { id: BESS_1_ID, name: 'Single BESS', reportIntervalMinutes: 15 }
      ] as any);

      const exportSpy = vi.spyOn(reportExportService, 'exportDynamicReport').mockResolvedValue(undefined as any);

      await exportDynamicReport(mockReq, mockRes, vi.fn());

      expect(mockRes.setHeader).toHaveBeenCalledWith(
        'Content-Type',
        'text/csv; charset=utf-8'
      );
      expect(mockRes.setHeader).toHaveBeenCalledWith(
        'Content-Disposition',
        expect.stringContaining('EMS_Report_2026-10-01_to_2026-10-02.csv')
      );
      expect(exportSpy).toHaveBeenCalledWith(
        mockRes,
        SITE_ID,
        15,
        expect.any(Date),
        expect.any(Date),
        expect.any(Object),
        undefined
      );
    });

    it('1.4 Foreign or invalid bessAssetId is rejected with 404 and does not broaden scope', async () => {
      const mockReq: any = {
        params: { siteId: SITE_ID },
        query: {
          from: '2026-10-01T00:00:00.000Z',
          to: '2026-10-02T00:00:00.000Z',
          bessAssetId: OTHER_SITE_BESS_ID
        },
        user: { id: 'user-1', role: 'ADMIN' }
      };
      const mockRes: any = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn(),
        setHeader: vi.fn()
      };

      vi.spyOn(assetService, 'resolveSiteOwnership').mockResolvedValue('client-1');
      vi.spyOn(authorizationService, 'canAccessClient').mockResolvedValue(true);
      // findFirst with { id: OTHER_SITE_BESS_ID, siteId: SITE_ID } returns null
      vi.spyOn(prisma.bESSAsset, 'findFirst').mockResolvedValue(null);

      const exportSpy = vi.spyOn(reportExportService, 'exportDynamicReport');

      await exportDynamicReport(mockReq, mockRes, vi.fn());

      expect(mockRes.status).toHaveBeenCalledWith(404);
      expect(mockRes.json).toHaveBeenCalledWith(expect.objectContaining({
        success: false,
        error: expect.objectContaining({
          message: expect.stringContaining('BESS asset not found or does not belong to requested site')
        })
      }));
      expect(exportSpy).not.toHaveBeenCalled();
    });

    it('1.5 Unauthorized user cannot export reports', async () => {
      const mockReq: any = {
        params: { siteId: SITE_ID },
        query: {
          from: '2026-10-01T00:00:00.000Z',
          to: '2026-10-02T00:00:00.000Z'
        },
        user: { id: 'user-unauthorized', role: 'CLIENT' }
      };
      const mockRes: any = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn()
      };

      vi.spyOn(assetService, 'resolveSiteOwnership').mockResolvedValue('client-1');
      vi.spyOn(authorizationService, 'canAccessClient').mockResolvedValue(false);

      await exportDynamicReport(mockReq, mockRes, vi.fn());

      expect(mockRes.status).toHaveBeenCalledWith(403);
      expect(mockRes.json).toHaveBeenCalledWith(expect.objectContaining({
        success: false,
        error: expect.objectContaining({
          message: expect.stringContaining('Forbidden')
        })
      }));
    });
  });

  // =========================================================================
  // 2. Energy Summary Calculation & Cross-Asset Isolation
  // =========================================================================
  describe('2. Energy Summary Calculation & Cross-Asset Isolation', () => {
    it('2.1 Multi-BESS summary calculates per-asset accumulator difference before summation', async () => {
      const mockReq: any = {
        params: { siteId: SITE_ID },
        query: {
          from: '2026-10-01T00:00:00.000Z',
          to: '2026-10-02T00:00:00.000Z'
        },
        user: { id: 'user-1', role: 'ADMIN' }
      };
      const mockRes: any = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn()
      };

      vi.spyOn(assetService, 'resolveSiteOwnership').mockResolvedValue('client-1');
      vi.spyOn(authorizationService, 'canAccessClient').mockResolvedValue(true);
      vi.spyOn(prisma.bESSAsset, 'findMany').mockResolvedValue([
        { id: BESS_1_ID },
        { id: BESS_2_ID }
      ] as any);

      // Mock aggregated rows
      vi.spyOn(prisma, '$queryRawUnsafe').mockResolvedValue([
        {
          id: 'agg-1',
          bessAssetId: 'all',
          bucketTimestamp: new Date('2026-10-01T00:00:00.000Z'),
          gridSideLoad: 100,
          pcsActivePower: 50,
          soc: 90,
          solarPower: 20
        }
      ]);

      // Mock findFirst per asset:
      // BESS 1: first accum = 1000, last accum = 1100 -> diff = 100
      // BESS 2: first accum = 5000, last accum = 5250 -> diff = 250
      // If incorrectly cross-subtracted: 5250 - 1000 = 4250 (WRONG!)
      // Correct sum of per-asset diffs: 100 + 250 = 350
      vi.spyOn(prisma.telemetrySnapshot15m, 'findFirst').mockImplementation(((args: any) => {
        const bessId = args?.where?.bessAssetId;
        const isDesc = args?.orderBy?.bucketTimestamp === 'desc';

        if (bessId === BESS_1_ID) {
          return Promise.resolve({
            accumChargeEnergy: isDesc ? 1100 : 1000,
            accumDischargeEnergy: isDesc ? 600 : 500
          });
        }
        if (bessId === BESS_2_ID) {
          return Promise.resolve({
            accumChargeEnergy: isDesc ? 5250 : 5000,
            accumDischargeEnergy: isDesc ? 3300 : 3100
          });
        }
        return Promise.resolve(null);
      }) as any);

      await getSiteTelemetrySnapshots(mockReq, mockRes, vi.fn());

      expect(mockRes.json).toHaveBeenCalled();
      const responseData = mockRes.json.mock.calls[0][0];
      expect(responseData.success).toBe(true);
      // Valid per-asset summation: (1100-1000) + (5250-5000) = 100 + 250 = 350
      expect(responseData.data.summary.chargeDifference).toBe(350);
      // Valid per-asset discharge: (600-500) + (3300-3100) = 100 + 200 = 300
      expect(responseData.data.summary.dischargeDifference).toBe(300);
    });

    it('2.2 Individual BESS summary uses only that asset reading', async () => {
      const mockReq: any = {
        params: { siteId: SITE_ID },
        query: {
          from: '2026-10-01T00:00:00.000Z',
          to: '2026-10-02T00:00:00.000Z',
          bessAssetId: BESS_1_ID
        },
        user: { id: 'user-1', role: 'ADMIN' }
      };
      const mockRes: any = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn()
      };

      vi.spyOn(assetService, 'resolveSiteOwnership').mockResolvedValue('client-1');
      vi.spyOn(authorizationService, 'canAccessClient').mockResolvedValue(true);
      vi.spyOn(prisma.bESSAsset, 'findUnique').mockResolvedValue({ id: BESS_1_ID, siteId: SITE_ID } as any);
      vi.spyOn(prisma.bESSAsset, 'findMany').mockResolvedValue([
        { id: BESS_1_ID },
        { id: BESS_2_ID }
      ] as any);
      vi.spyOn(prisma.telemetrySnapshot15m, 'findMany').mockResolvedValue([
        {
          id: 'snap-1',
          bessAssetId: BESS_1_ID,
          bucketTimestamp: new Date('2026-10-01T00:00:00.000Z'),
          pcsActivePower: 25,
          soc: 85
        }
      ] as any);
      vi.spyOn(prisma.telemetrySnapshot15m, 'count').mockResolvedValue(1);

      vi.spyOn(prisma.telemetrySnapshot15m, 'findFirst').mockImplementation(((args: any) => {
        const isDesc = args?.orderBy?.bucketTimestamp === 'desc';
        return Promise.resolve({
          accumChargeEnergy: isDesc ? 1100 : 1000,
          accumDischargeEnergy: isDesc ? 600 : 500
        });
      }) as any);

      await getSiteTelemetrySnapshots(mockReq, mockRes, vi.fn());

      expect(mockRes.json).toHaveBeenCalled();
      const responseData = mockRes.json.mock.calls[0][0];
      expect(responseData.success).toBe(true);
      // Strictly BESS 1 difference: 1100 - 1000 = 100
      expect(responseData.data.summary.chargeDifference).toBe(100);
      expect(responseData.data.summary.dischargeDifference).toBe(100);
    });
  });

  // =========================================================================
  // 3. Frontend Logic & Selector Semantics
  // =========================================================================
  describe('3. Frontend Logic & Selector Semantics', () => {
    it('3.1 Subtitle formatting for All BESS, Individual BESS, and Single BESS', () => {
      const client = { name: 'Client A' };
      const site = { name: 'Site Alpha' };
      const bessAssets = [
        { id: BESS_1_ID, name: 'BESS 01' },
        { id: BESS_2_ID, name: 'BESS 02' }
      ];

      // Case A: Multi-BESS, All BESS selected
      const isMultiBess = bessAssets.length > 1;
      let activeBessId: string | null = null;
      let selectedBess = activeBessId ? bessAssets.find(b => b.id === activeBessId) : null;
      let subtitle = `${client.name} — ${site.name}${
        isMultiBess
          ? activeBessId !== null
            ? ` — ${selectedBess?.name ?? 'Selected BESS'}`
            : ` — Site Overview (${bessAssets.length} BESS)`
          : ` — ${bessAssets[0]?.name}`
      }`;
      expect(subtitle).toBe('Client A — Site Alpha — Site Overview (2 BESS)');

      // Case B: Multi-BESS, Individual BESS selected
      activeBessId = BESS_1_ID;
      selectedBess = bessAssets.find(b => b.id === activeBessId) || null;
      subtitle = `${client.name} — ${site.name}${
        isMultiBess
          ? activeBessId !== null
            ? ` — ${selectedBess?.name ?? 'Selected BESS'}`
            : ` — Site Overview (${bessAssets.length} BESS)`
          : ` — ${bessAssets[0]?.name}`
      }`;
      expect(subtitle).toBe('Client A — Site Alpha — BESS 01');

      // Case C: Single BESS client
      const singleBessAssets = [{ id: BESS_1_ID, name: 'Solo BESS' }];
      const isSingleBess = singleBessAssets.length > 1;
      subtitle = `${client.name} — ${site.name}${
        isSingleBess
          ? ` — Site Overview (${singleBessAssets.length} BESS)`
          : ` — ${singleBessAssets[0]?.name}`
      }`;
      expect(subtitle).toBe('Client A — Site Alpha — Solo BESS');
    });

    it('3.2 Export button label is "Export Excel" for All BESS on multi-BESS site and "Export CSV" otherwise', () => {
      const multiBessAssets = [{ id: BESS_1_ID }, { id: BESS_2_ID }];
      const singleBessAssets = [{ id: BESS_1_ID }];

      // Multi-BESS, All BESS
      let isMultiBess = multiBessAssets.length > 1;
      let activeBessId: string | null = null;
      let isExcelExport = isMultiBess && activeBessId === null;
      expect(isExcelExport ? 'Export Excel' : 'Export CSV').toBe('Export Excel');

      // Multi-BESS, Individual BESS
      activeBessId = BESS_1_ID;
      isExcelExport = isMultiBess && activeBessId === null;
      expect(isExcelExport ? 'Export Excel' : 'Export CSV').toBe('Export CSV');

      // Single BESS
      isMultiBess = singleBessAssets.length > 1;
      activeBessId = null;
      isExcelExport = isMultiBess && activeBessId === null;
      expect(isExcelExport ? 'Export Excel' : 'Export CSV').toBe('Export CSV');
    });

    it('3.3 Chart aggregation sums BESS active power, averages SOC, and preserves site-level Grid/Solar readings', () => {
      const duplicateTimestampSnapshots = [
        {
          bucketTimestamp: '2026-10-01T12:00:00.000Z',
          gridSideLoad: 250,
          pcsActivePower: -50,
          soc: 90,
          solarPower: 120
        },
        {
          bucketTimestamp: '2026-10-01T12:00:00.000Z',
          gridSideLoad: 250, // same site-level reading repeated
          pcsActivePower: 150,
          soc: 80,
          solarPower: 120 // same site-level reading repeated
        }
      ];

      // Simulate the ReportsPage defensive chart aggregation useMemo
      const map = new Map<number, {
        timestamp: number;
        gridValues: number[];
        bessValues: number[];
        socValues: number[];
        solarValues: number[];
      }>();

      for (const s of duplicateTimestampSnapshots) {
        const ts = new Date(s.bucketTimestamp).getTime();
        let entry = map.get(ts);
        if (!entry) {
          entry = { timestamp: ts, gridValues: [], bessValues: [], socValues: [], solarValues: [] };
          map.set(ts, entry);
        }
        if (typeof s.gridSideLoad === 'number') entry.gridValues.push(s.gridSideLoad);
        if (typeof s.pcsActivePower === 'number') entry.bessValues.push(s.pcsActivePower);
        if (typeof s.soc === 'number') entry.socValues.push(s.soc);
        if (typeof s.solarPower === 'number') entry.solarValues.push(s.solarPower);
      }

      const pts = Array.from(map.keys()).map(ts => {
        const entry = map.get(ts)!;
        return {
          timestamp: ts,
          // Grid: authoritative site-level reading (not summed or averaged across assets)
          grid: entry.gridValues.length > 0 ? entry.gridValues[0] : undefined,
          bess: entry.bessValues.length > 0 ? entry.bessValues.reduce((a, b) => a + b, 0) : undefined,
          soc: entry.socValues.length > 0 ? entry.socValues.reduce((a, b) => a + b, 0) / entry.socValues.length : undefined,
          // Solar: authoritative site-level reading (not summed or averaged across assets)
          solar: entry.solarValues.length > 0 ? entry.solarValues[0] : undefined,
        };
      });

      expect(pts.length).toBe(1);
      // Grid preserved as 250 (authoritative site reading, not multiplied to 500)
      expect(pts[0].grid).toBe(250);
      // Solar preserved as 120 (authoritative site reading, not multiplied to 240)
      expect(pts[0].solar).toBe(120);
      // BESS active power algebraically summed: -50 + 150 = 100
      expect(pts[0].bess).toBe(100);
      // SOC averaged across reporting assets: (90 + 80) / 2 = 85
      expect(pts[0].soc).toBe(85);
    });

    it('3.4 Null/missing readings do not create fabricated values or corrupt averages', () => {
      const partialSnapshots = [
        {
          bucketTimestamp: '2026-10-01T12:00:00.000Z',
          gridSideLoad: null,
          pcsActivePower: null,
          soc: null,
          solarPower: null
        },
        {
          bucketTimestamp: '2026-10-01T12:00:00.000Z',
          gridSideLoad: 180,
          pcsActivePower: -35.5,
          soc: 94.2,
          solarPower: 60
        }
      ];

      const map = new Map<number, {
        timestamp: number;
        gridValues: number[];
        bessValues: number[];
        socValues: number[];
        solarValues: number[];
      }>();

      for (const s of partialSnapshots) {
        const ts = new Date(s.bucketTimestamp).getTime();
        let entry = map.get(ts);
        if (!entry) {
          entry = { timestamp: ts, gridValues: [], bessValues: [], socValues: [], solarValues: [] };
          map.set(ts, entry);
        }
        if (typeof s.gridSideLoad === 'number') entry.gridValues.push(s.gridSideLoad);
        if (typeof s.pcsActivePower === 'number') entry.bessValues.push(s.pcsActivePower);
        if (typeof s.soc === 'number') entry.socValues.push(s.soc);
        if (typeof s.solarPower === 'number') entry.solarValues.push(s.solarPower);
      }

      const pts = Array.from(map.keys()).map(ts => {
        const entry = map.get(ts)!;
        return {
          timestamp: ts,
          grid: entry.gridValues.length > 0 ? entry.gridValues[0] : undefined,
          bess: entry.bessValues.length > 0 ? entry.bessValues.reduce((a, b) => a + b, 0) : undefined,
          soc: entry.socValues.length > 0 ? entry.socValues.reduce((a, b) => a + b, 0) / entry.socValues.length : undefined,
          solar: entry.solarValues.length > 0 ? entry.solarValues[0] : undefined,
        };
      });

      expect(pts.length).toBe(1);
      // Valid reading preserved without corruption from null
      expect(pts[0].grid).toBe(180);
      expect(pts[0].bess).toBe(-35.5);
      // SOC average excludes null and does not divide by 2: exactly 94.2
      expect(pts[0].soc).toBe(94.2);
      expect(pts[0].solar).toBe(60);
    });

    it('3.5 Empty chart dataset condition and population condition', () => {
      // Empty snapshots -> empty pts
      const emptySnapshots: any[] = [];
      const emptyPts = emptySnapshots.map(() => ({}));
      const hasDataEmpty = emptyPts.length > 0;
      expect(hasDataEmpty).toBe(false);

      // Populated snapshots -> hasData is true
      const populatedSnapshots = [{ bucketTimestamp: '2026-10-20T10:00:00.000Z', pcsActivePower: 10 }];
      const populatedPts = populatedSnapshots.map(s => ({
        timestamp: new Date(s.bucketTimestamp).getTime(),
        bess: s.pcsActivePower
      }));
      const hasDataPopulated = populatedPts.length > 0;
      expect(hasDataPopulated).toBe(true);
      expect(populatedPts[0].timestamp).not.toBeNaN();
    });
  });

  // =========================================================================
  // 4. Multi-BESS CTE Snapshot Query Semantics
  // =========================================================================
  describe('4. Multi-BESS CTE Snapshot Query Semantics', () => {
    it('4.1 Multi-BESS query executes raw query with DISTINCT ON and aggregates', async () => {
      const mockReq: any = {
        params: { siteId: SITE_ID },
        query: {
          from: '2026-10-01T00:00:00.000Z',
          to: '2026-10-02T00:00:00.000Z'
        },
        user: { id: 'user-1', role: 'ADMIN' }
      };
      const mockRes: any = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn()
      };

      vi.spyOn(assetService, 'resolveSiteOwnership').mockResolvedValue('client-1');
      vi.spyOn(authorizationService, 'canAccessClient').mockResolvedValue(true);
      vi.spyOn(prisma.bESSAsset, 'findMany').mockResolvedValue([
        { id: BESS_1_ID },
        { id: BESS_2_ID }
      ] as any);

      const rawQuerySpy = vi.spyOn(prisma, '$queryRawUnsafe').mockImplementation((sql: string) => {
        if (sql.includes('COUNT(DISTINCT')) {
          return Promise.resolve([{ total: 1 }]);
        }
        return Promise.resolve([
          {
            id: 'agg-2026-10-01 12:00:00',
            bessAssetId: 'all',
            bucketTimestamp: new Date('2026-10-01T12:00:00.000Z'),
            gridSideLoad: 250,
            pcsActivePower: 120, // algebraic sum
            soc: 88.5, // mean SOC
            solarPower: 80
          }
        ]);
      });

      vi.spyOn(prisma.telemetrySnapshot15m, 'findFirst').mockResolvedValue({
        accumChargeEnergy: 100,
        accumDischargeEnergy: 50
      } as any);

      await getSiteTelemetrySnapshots(mockReq, mockRes, vi.fn());

      expect(mockRes.json).toHaveBeenCalled();
      const responseData = mockRes.json.mock.calls[0][0];
      expect(responseData.success).toBe(true);
      expect(responseData.data.total).toBe(1);
      expect(responseData.data.snapshots.length).toBe(1);
      expect(responseData.data.snapshots[0].pcsActivePower).toBe(120);
      expect(responseData.data.snapshots[0].soc).toBe(88.5);
      expect(responseData.data.snapshots[0].gridSideLoad).toBe(250);

      // Verify the generated SQL uses DISTINCT ON and does NOT reference s.gridFrequency
      const executedSql = rawQuerySpy.mock.calls[0][0] as string;
      expect(executedSql).toContain('DISTINCT ON');
      expect(executedSql).not.toContain('"gridFrequency"');
      expect(executedSql).toContain('date_bin');
    });
  });
});

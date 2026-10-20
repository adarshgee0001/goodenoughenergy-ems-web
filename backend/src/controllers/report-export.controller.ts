import { Request, Response, NextFunction } from 'express';
import { prisma } from '../db/prisma';
import { assetService } from '../services/asset.service';
import { authorizationService } from '../services/authorization.service';
import { reportExportService } from '../services/report-export.service';

export const exportDynamicReport = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const siteId = req.params.siteId as string;
    const { from, to, intervalMinutes, powerUnit, energyUnit } = req.query;
    const bessParam = (req.query.bessAssetId || req.query.bessId) as string | undefined;

    if (!siteId) {
      res.status(400).json({ success: false, error: { message: 'siteId is required' } });
      return;
    }

    // 1. Authorization: resolve site ownership and verify access
    const clientId = await assetService.resolveSiteOwnership(siteId);
    if (!clientId) {
      res.status(404).json({ success: false, error: { message: 'Site not found' } });
      return;
    }

    const isAuthorized = await authorizationService.canAccessClient(req.user!.id, req.user!.role, clientId);
    if (!isAuthorized) {
      res.status(403).json({ success: false, error: { message: 'Forbidden: Access to site denied' } });
      return;
    }

    // 2. Validate optional bessAssetId
    let targetBessAsset: { id: string; name: string; reportIntervalMinutes?: number | null } | null = null;
    if (bessParam && typeof bessParam === 'string' && bessParam.trim()) {
      const bess = await prisma.bESSAsset.findFirst({
        where: {
          id: bessParam.trim(),
          siteId: siteId
        },
        select: { id: true, name: true, reportIntervalMinutes: true }
      });

      if (!bess) {
        res.status(404).json({ success: false, error: { message: 'BESS asset not found or does not belong to requested site' } });
        return;
      }
      targetBessAsset = bess;
    }

    // 3. Authoritative reporting interval and BESS count from DB (client query param cannot override)
    const bessAssets = await prisma.bESSAsset.findMany({
      where: { siteId },
      select: { id: true, reportIntervalMinutes: true },
      orderBy: { name: 'asc' }
    });
    const parsedInterval = targetBessAsset?.reportIntervalMinutes || bessAssets[0]?.reportIntervalMinutes || 15;

    let parsedFrom: Date | undefined;
    let parsedTo: Date | undefined;

    if (!from || !to) {
      res.status(400).json({ success: false, error: { message: 'Both from and to are required' } });
      return;
    }

    parsedFrom = new Date(from as string);
    if (isNaN(parsedFrom.getTime())) {
      res.status(400).json({ success: false, error: { message: 'Invalid from format' } });
      return;
    }

    parsedTo = new Date(to as string);
    if (isNaN(parsedTo.getTime())) {
      res.status(400).json({ success: false, error: { message: 'Invalid to format' } });
      return;
    }
    
    if (parsedFrom >= parsedTo) {
      res.status(400).json({ success: false, error: { message: 'from must be before to' } });
      return;
    }

    const msDiff = parsedTo.getTime() - parsedFrom.getTime();
    if (msDiff > 31 * 24 * 60 * 60 * 1000) {
      res.status(400).json({ success: false, error: { message: 'Date range cannot exceed 31 days' } });
      return;
    }

    const isMultiBESS = !targetBessAsset && bessAssets.length > 1;
    const validatedPowerUnit: 'kW' | 'MW' = powerUnit === 'MW' ? 'MW' : 'kW';
    const validatedEnergyUnit: 'kWh' | 'MWh' = energyUnit === 'MWh' ? 'MWh' : 'kWh';

    const safeFrom = parsedFrom ? parsedFrom.toISOString().split('T')[0] : 'Start';
    const safeTo = parsedTo ? parsedTo.toISOString().split('T')[0] : 'End';
    const ext = isMultiBESS ? 'xlsx' : 'csv';

    let filename: string;
    if (targetBessAsset) {
      const sanitizedBess = targetBessAsset.name.toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '');
      filename = `EMS_Report_${sanitizedBess}_${safeFrom}_to_${safeTo}.csv`;
    } else {
      filename = `EMS_Report_${safeFrom}_to_${safeTo}.${ext}`;
    }

    const contentType = isMultiBESS
      ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      : 'text/csv; charset=utf-8';

    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');

    // Stream report to response
    await reportExportService.exportDynamicReport(
      res,
      siteId,
      parsedInterval,
      parsedFrom,
      parsedTo,
      { powerUnit: validatedPowerUnit, energyUnit: validatedEnergyUnit },
      targetBessAsset?.id
    );

  } catch (error) {
    next(error);
  }
};

export const exportVoltageTrend = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const bessAssetId = req.params.assetId as string;
    const { from, to, includeUnknown } = req.query;

    if (!bessAssetId) {
      res.status(400).json({ success: false, error: { message: 'assetId is required' } });
      return;
    }

    const clientId = await assetService.resolveBessOwnership(bessAssetId);
    if (!clientId) {
      res.status(404).json({ success: false, error: { message: 'BESS Asset not found' } });
      return;
    }

    const isAuthorized = await authorizationService.canAccessClient(req.user!.id, req.user!.role, clientId);
    if (!isAuthorized) {
      res.status(403).json({ success: false, error: { message: 'Forbidden: Access denied' } });
      return;
    }

    let parsedFrom: Date | undefined;
    let parsedTo: Date | undefined;

    if (!from || !to) {
      res.status(400).json({ success: false, error: { message: 'Both from and to are required' } });
      return;
    }

    parsedFrom = new Date(from as string);
    if (isNaN(parsedFrom.getTime())) {
      res.status(400).json({ success: false, error: { message: 'Invalid from format' } });
      return;
    }

    parsedTo = new Date(to as string);
    if (isNaN(parsedTo.getTime())) {
      res.status(400).json({ success: false, error: { message: 'Invalid to format' } });
      return;
    }
    
    if (parsedFrom >= parsedTo) {
      res.status(400).json({ success: false, error: { message: 'from must be before to' } });
      return;
    }

    const msDiff2 = parsedTo.getTime() - parsedFrom.getTime();
    if (msDiff2 > 31 * 24 * 60 * 60 * 1000) {
      res.status(400).json({ success: false, error: { message: 'Date range cannot exceed 31 days' } });
      return;
    }

    const safeFrom = parsedFrom ? parsedFrom.toISOString().split('T')[0] : 'Start';
    const safeTo = parsedTo ? parsedTo.toISOString().split('T')[0] : 'End';
    const filename = `Voltage_Trend_${bessAssetId}_${safeFrom}_to_${safeTo}.csv`;

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');

    const shouldIncludeUnknown = includeUnknown === 'true';

    await reportExportService.exportVoltageTrend(res, bessAssetId, parsedFrom, parsedTo, shouldIncludeUnknown);

  } catch (error) {
    next(error);
  }
};

export const exportGridStateTrend = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const bessAssetId = req.params.assetId as string;
    const { from, to } = req.query;

    if (!bessAssetId) {
      res.status(400).json({ success: false, error: { message: 'assetId is required' } });
      return;
    }

    const clientId = await assetService.resolveBessOwnership(bessAssetId);
    if (!clientId) {
      res.status(404).json({ success: false, error: { message: 'BESS Asset not found' } });
      return;
    }

    const isAuthorized = await authorizationService.canAccessClient(req.user!.id, req.user!.role, clientId);
    if (!isAuthorized) {
      res.status(403).json({ success: false, error: { message: 'Forbidden: Access denied' } });
      return;
    }

    let parsedFrom: Date | undefined;
    let parsedTo: Date | undefined;

    if (!from || !to) {
      res.status(400).json({ success: false, error: { message: 'Both from and to are required' } });
      return;
    }

    parsedFrom = new Date(from as string);
    if (isNaN(parsedFrom.getTime())) {
      res.status(400).json({ success: false, error: { message: 'Invalid from format' } });
      return;
    }

    parsedTo = new Date(to as string);
    if (isNaN(parsedTo.getTime())) {
      res.status(400).json({ success: false, error: { message: 'Invalid to format' } });
      return;
    }
    
    if (parsedFrom >= parsedTo) {
      res.status(400).json({ success: false, error: { message: 'from must be before to' } });
      return;
    }

    const msDiff3 = parsedTo.getTime() - parsedFrom.getTime();
    if (msDiff3 > 31 * 24 * 60 * 60 * 1000) {
      res.status(400).json({ success: false, error: { message: 'Date range cannot exceed 31 days' } });
      return;
    }

    const safeFrom = parsedFrom ? parsedFrom.toISOString().split('T')[0] : 'Start';
    const safeTo = parsedTo ? parsedTo.toISOString().split('T')[0] : 'End';
    const filename = `Grid_State_Trend_${bessAssetId}_${safeFrom}_to_${safeTo}.csv`;

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');

    await reportExportService.exportGridStateTrend(bessAssetId, parsedFrom, parsedTo, res);

  } catch (error) {
    next(error);
  }
};

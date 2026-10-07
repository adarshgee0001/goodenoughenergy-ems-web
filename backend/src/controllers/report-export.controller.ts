import { Request, Response, NextFunction } from 'express';
import { assetService } from '../services/asset.service';
import { authorizationService } from '../services/authorization.service';
import { reportExportService } from '../services/report-export.service';

export const exportDynamicReport = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const siteId = req.params.siteId as string;
    const { from, to, intervalMinutes } = req.query;

    if (!siteId) {
      res.status(400).json({ success: false, error: { message: 'siteId is required' } });
      return;
    }

    if (!intervalMinutes) {
      res.status(400).json({ success: false, error: { message: 'intervalMinutes is required' } });
      return;
    }

    const parsedInterval = parseInt(intervalMinutes as string, 10);
    if (isNaN(parsedInterval) || parsedInterval < 1 || parsedInterval > 20) {
      res.status(400).json({ success: false, error: { message: 'intervalMinutes must be an integer between 1 and 20' } });
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

    // Prepare headers for Excel download
    const safeFrom = parsedFrom ? parsedFrom.toISOString().split('T')[0] : 'Start';
    const safeTo = parsedTo ? parsedTo.toISOString().split('T')[0] : 'End';
    const filename = `EMS_Report_${safeFrom}_to_${safeTo}.xlsx`;

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');

    // Stream Excel to response
    await reportExportService.generateExcelExport(res, siteId, parsedInterval, parsedFrom, parsedTo);

  } catch (error) {
    next(error);
  }
};

export const exportVoltageTrend = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
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

    const msDiff2 = parsedTo.getTime() - parsedFrom.getTime();
    if (msDiff2 > 31 * 24 * 60 * 60 * 1000) {
      res.status(400).json({ success: false, error: { message: 'Date range cannot exceed 31 days' } });
      return;
    }

    const safeFrom = parsedFrom ? parsedFrom.toISOString().split('T')[0] : 'Start';
    const safeTo = parsedTo ? parsedTo.toISOString().split('T')[0] : 'End';
    const filename = `Voltage_Trend_${bessAssetId}_${safeFrom}_to_${safeTo}.xlsx`;

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');

    await reportExportService.exportVoltageTrend(res, bessAssetId, parsedFrom, parsedTo);

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
    const filename = `Grid_State_Trend_${bessAssetId}_${safeFrom}_to_${safeTo}.xlsx`;

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');

    await reportExportService.exportGridStateTrend(bessAssetId, parsedFrom, parsedTo, res);

  } catch (error) {
    next(error);
  }
};

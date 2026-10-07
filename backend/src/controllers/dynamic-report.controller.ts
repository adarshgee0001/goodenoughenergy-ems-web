import { Request, Response, NextFunction } from 'express';
import { assetService } from '../services/asset.service';
import { authorizationService } from '../services/authorization.service';
import { prisma } from '../db/prisma';
import { dynamicReportService } from '../services/dynamic-report.service';

export const getDynamicReport = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const siteId = req.params.siteId as string;
    const { from, to, bessAssetId, limit, offset, intervalMinutes } = req.query;

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

    // 2. Validate BESS ownership if requested
    if (bessAssetId) {
      const bess = await prisma.bESSAsset.findUnique({ where: { id: bessAssetId as string } });
      if (!bess || bess.siteId !== siteId) {
        res.status(403).json({ success: false, error: { message: 'Forbidden: BESS asset does not belong to requested site' } });
        return;
      }
    }

    let parsedFrom: Date | undefined;
    let parsedTo: Date | undefined;

    if (from || to) {
      if (from) {
        parsedFrom = new Date(from as string);
        if (isNaN(parsedFrom.getTime())) {
          res.status(400).json({ success: false, error: { message: 'Invalid from format' } });
          return;
        }
      }
      if (to) {
        parsedTo = new Date(to as string);
        if (isNaN(parsedTo.getTime())) {
          res.status(400).json({ success: false, error: { message: 'Invalid to format' } });
          return;
        }
      }
      
      if (parsedFrom && parsedTo && parsedFrom >= parsedTo) {
        res.status(400).json({ success: false, error: { message: 'from must be before to' } });
        return;
      }
    }

    // 4. Pagination
    let take = 1000;
    if (limit) {
      const parsedLimit = parseInt(limit as string, 10);
      if (isNaN(parsedLimit) || parsedLimit <= 0) {
        res.status(400).json({ success: false, error: { message: 'Invalid limit' } });
        return;
      }
      take = Math.min(parsedLimit, 5000);
    }
    
    let skip = 0;
    if (offset) {
      const parsedOffset = parseInt(offset as string, 10);
      if (isNaN(parsedOffset) || parsedOffset < 0) {
        res.status(400).json({ success: false, error: { message: 'Invalid offset' } });
        return;
      }
      skip = parsedOffset;
    }

    // 5. Query
    const reportData = await dynamicReportService.getDynamicReport(
      siteId,
      parsedInterval,
      parsedFrom,
      parsedTo,
      bessAssetId as string | undefined,
      take,
      skip
    );

    // 6. Return response
    res.status(200).json({
      success: true,
      data: {
        siteId,
        total: reportData.total,
        limit: take,
        offset: skip,
        snapshots: reportData.snapshots,
        summary: reportData.summary
      }
    });

  } catch (error) {
    next(error);
  }
};

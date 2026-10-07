import { Request, Response, NextFunction } from 'express';
import { assetService } from '../services/asset.service';
import { authorizationService } from '../services/authorization.service';

import { prisma } from '../db/prisma';
import { telemetryService } from '../services/telemetry.service';

export const getSiteTelemetry = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const siteId = req.params.siteId as string;
    const { startDate, endDate } = req.query;

    if (!siteId) {
      res.status(400).json({ success: false, error: { message: 'siteId is required' } });
      return;
    }

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

    const whereClause: any = {
      device: {
        bessAsset: {
          siteId
        }
      }
    };

    if (!startDate || !endDate) {
      res.status(400).json({ success: false, error: { message: 'Both startDate and endDate are required' } });
      return;
    }

    whereClause.timestamp = {};
    
    const parsedStart = new Date(startDate as string);
    if (isNaN(parsedStart.getTime())) {
      res.status(400).json({ success: false, error: { message: 'Invalid startDate format' } });
      return;
    }
    whereClause.timestamp.gte = parsedStart;

    const parsedEnd = new Date(endDate as string);
    if (isNaN(parsedEnd.getTime())) {
      res.status(400).json({ success: false, error: { message: 'Invalid endDate format' } });
      return;
    }
    whereClause.timestamp.lte = parsedEnd;
    
    if (parsedStart > parsedEnd) {
      res.status(400).json({ success: false, error: { message: 'startDate cannot be after endDate' } });
      return;
    }

    const msDiff = parsedEnd.getTime() - parsedStart.getTime();
    if (msDiff > 31 * 24 * 60 * 60 * 1000) {
      res.status(400).json({ success: false, error: { message: 'Date range cannot exceed 31 days' } });
      return;
    }

    const telemetry = await prisma.telemetryHistory.findMany({
      where: whereClause,
      orderBy: {
        timestamp: 'asc'
      }
    });

    res.status(200).json({
      success: true,
      data: telemetry
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/sites/:siteId/telemetry/latest
 *
 * Returns the single most-recent TelemetryHistory row per Device for the
 * given site. Authorization rules are identical to getSiteTelemetry.
 *
 * The implementation queries each device in parallel (one findFirst per device)
 * rather than fetching all historical rows and filtering in Node — this keeps
 * the query efficient as the history table grows.
 */
export const getSiteLatestTelemetry = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const siteId = req.params.siteId as string;

    if (!siteId) {
      res.status(400).json({ success: false, error: { message: 'siteId is required' } });
      return;
    }

    // Authorization: resolve site ownership and verify access
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

    const data = await telemetryService.getSiteLatestTelemetry(siteId);

    res.status(200).json({ success: true, data });
  } catch (error) {
    next(error);
  }
};


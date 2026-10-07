import { Request, Response, NextFunction } from 'express';
import { assetService } from '../services/asset.service';
import { authorizationService } from '../services/authorization.service';
import { prisma } from '../db/prisma';

export const getSiteTelemetrySnapshots = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const siteId = req.params.siteId as string;
    const { from, to, bessAssetId, limit, offset } = req.query;

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

    // 2. Validate BESS ownership if requested
    if (bessAssetId) {
      const bess = await prisma.bESSAsset.findUnique({ where: { id: bessAssetId as string } });
      if (!bess || bess.siteId !== siteId) {
        res.status(403).json({ success: false, error: { message: 'Forbidden: BESS asset does not belong to requested site' } });
        return;
      }
    }

    // 3. Build query
    const whereClause: any = {};
    if (bessAssetId) {
      whereClause.bessAssetId = bessAssetId;
    } else {
      whereClause.bessAsset = { siteId };
    }

    if (!from || !to) {
      res.status(400).json({ success: false, error: { message: 'Both from and to are required' } });
      return;
    }

    whereClause.bucketTimestamp = {};
    
    const parsedFrom = new Date(from as string);
    if (isNaN(parsedFrom.getTime())) {
      res.status(400).json({ success: false, error: { message: 'Invalid from format' } });
      return;
    }
    whereClause.bucketTimestamp.gte = parsedFrom;

    const parsedTo = new Date(to as string);
    if (isNaN(parsedTo.getTime())) {
      res.status(400).json({ success: false, error: { message: 'Invalid to format' } });
      return;
    }
    whereClause.bucketTimestamp.lt = parsedTo;
    
    if (parsedFrom >= parsedTo) {
      res.status(400).json({ success: false, error: { message: 'from must be before to' } });
      return;
    }

    const msDiff = parsedTo.getTime() - parsedFrom.getTime();
    if (msDiff > 31 * 24 * 60 * 60 * 1000) {
      res.status(400).json({ success: false, error: { message: 'Date range cannot exceed 31 days' } });
      return;
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
    const snapshots = await prisma.telemetrySnapshot15m.findMany({
      where: whereClause,
      orderBy: { bucketTimestamp: 'asc' },
      take,
      skip
    });

    const total = await prisma.telemetrySnapshot15m.count({ where: whereClause });

    // Summary Calculation
    let summary = null;
    if (from || to) {
      const firstSnapshot = await prisma.telemetrySnapshot15m.findFirst({
        where: whereClause,
        orderBy: { bucketTimestamp: 'asc' },
      });

      const lastSnapshot = await prisma.telemetrySnapshot15m.findFirst({
        where: whereClause,
        orderBy: { bucketTimestamp: 'desc' },
      });

      const chargeDifference =
        firstSnapshot?.accumChargeEnergy != null && lastSnapshot?.accumChargeEnergy != null
          ? lastSnapshot.accumChargeEnergy - firstSnapshot.accumChargeEnergy
          : null;

      const dischargeDifference =
        firstSnapshot?.accumDischargeEnergy != null && lastSnapshot?.accumDischargeEnergy != null
          ? lastSnapshot.accumDischargeEnergy - firstSnapshot.accumDischargeEnergy
          : null;

      summary = {
        chargeDifference,
        dischargeDifference,
      };
    }

    // 6. Return response
    res.status(200).json({
      success: true,
      data: {
        siteId,
        total,
        limit: take,
        offset: skip,
        snapshots,
        summary
      }
    });

  } catch (error) {
    next(error);
  }
};

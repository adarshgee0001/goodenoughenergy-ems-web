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
    const siteBesses = await prisma.bESSAsset.findMany({
      where: { siteId },
      select: { id: true }
    });
    const isMultiBess = !bessAssetId && siteBesses.length > 1;

    let snapshots: any[];
    let total: number;

    if (isMultiBess) {
      const aggRows: any[] = await prisma.$queryRawUnsafe(`
        WITH DistinctSnapshots AS (
          SELECT DISTINCT ON (s."bessAssetId", s."bucketTimestamp")
            s."bessAssetId",
            s."bucketTimestamp",
            s."pcsActivePower",
            s."soc",
            s."gridSideLoad",
            s."solarPower",
            s."totalPower",
            s."dcVoltage",
            s."ambientTemp",
            s."bmsCurrent",
            s."powerFactor",
            s."bessFrequency",
            s."bessPowerFactor",
            s."todayChargeEnergy",
            s."todayDischargeEnergy",
            s."accumChargeEnergy",
            s."accumDischargeEnergy",
            s."createdAt"
          FROM "TelemetrySnapshot15m" s
          JOIN "BESSAsset" b ON s."bessAssetId" = b."id"
          WHERE b."siteId" = '${siteId}'
            AND s."bucketTimestamp" >= '${parsedFrom.toISOString()}'::timestamp
            AND s."bucketTimestamp" < '${parsedTo.toISOString()}'::timestamp
          ORDER BY s."bessAssetId", s."bucketTimestamp", s."createdAt" DESC
        )
        SELECT
          'agg-' || date_bin('15 minutes'::interval, "bucketTimestamp", '2000-01-01 00:00:00Z') AS "id",
          'all' AS "bessAssetId",
          date_bin('15 minutes'::interval, "bucketTimestamp", '2000-01-01 00:00:00Z') AS "bucketTimestamp",
          (array_agg("gridSideLoad" ORDER BY "createdAt" DESC) FILTER (WHERE "gridSideLoad" IS NOT NULL))[1] AS "gridSideLoad",
          CASE WHEN COUNT("pcsActivePower") > 0 THEN SUM("pcsActivePower") ELSE NULL END AS "pcsActivePower",
          CASE WHEN COUNT("soc") > 0 THEN AVG("soc") ELSE NULL END AS "soc",
          (array_agg("solarPower" ORDER BY "createdAt" DESC) FILTER (WHERE "solarPower" IS NOT NULL))[1] AS "solarPower",
          AVG("powerFactor") AS "powerFactor",
          AVG("bessFrequency") AS "bessFrequency",
          AVG("bessPowerFactor") AS "bessPowerFactor",
          SUM("totalPower") AS "totalPower",
          AVG("dcVoltage") AS "dcVoltage",
          MAX("ambientTemp") AS "ambientTemp",
          SUM("bmsCurrent") AS "bmsCurrent",
          SUM("todayChargeEnergy") AS "todayChargeEnergy",
          SUM("todayDischargeEnergy") AS "todayDischargeEnergy",
          SUM("accumChargeEnergy") AS "accumChargeEnergy",
          SUM("accumDischargeEnergy") AS "accumDischargeEnergy"
        FROM DistinctSnapshots
        GROUP BY date_bin('15 minutes'::interval, "bucketTimestamp", '2000-01-01 00:00:00Z')
        ORDER BY "bucketTimestamp" ASC
        LIMIT ${take} OFFSET ${skip}
      `);

      snapshots = aggRows;

      const countRes: any = await prisma.$queryRawUnsafe(`
        SELECT CAST(COUNT(DISTINCT date_bin('15 minutes'::interval, s."bucketTimestamp", '2000-01-01 00:00:00Z')) AS INTEGER) as total
        FROM "TelemetrySnapshot15m" s
        JOIN "BESSAsset" b ON s."bessAssetId" = b."id"
        WHERE b."siteId" = '${siteId}'
          AND s."bucketTimestamp" >= '${parsedFrom.toISOString()}'::timestamp
          AND s."bucketTimestamp" < '${parsedTo.toISOString()}'::timestamp
      `);
      total = countRes[0]?.total || 0;
    } else {
      snapshots = await prisma.telemetrySnapshot15m.findMany({
        where: whereClause,
        orderBy: { bucketTimestamp: 'asc' },
        take,
        skip
      });
      total = await prisma.telemetrySnapshot15m.count({ where: whereClause });
    }

    // Summary Calculation
    let summary = null;
    if (from || to) {
      if (bessAssetId || siteBesses.length <= 1) {
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
      } else {
        // Multi-BESS site overview: calculate differences per BESS, then sum valid differences
        let totalChargeDiff = 0;
        let totalDischargeDiff = 0;
        let hasValidCharge = false;
        let hasValidDischarge = false;

        for (const bess of siteBesses) {
          const first = await prisma.telemetrySnapshot15m.findFirst({
            where: {
              bessAssetId: bess.id,
              bucketTimestamp: whereClause.bucketTimestamp
            },
            orderBy: { bucketTimestamp: 'asc' }
          });
          const last = await prisma.telemetrySnapshot15m.findFirst({
            where: {
              bessAssetId: bess.id,
              bucketTimestamp: whereClause.bucketTimestamp
            },
            orderBy: { bucketTimestamp: 'desc' }
          });

          if (first?.accumChargeEnergy != null && last?.accumChargeEnergy != null) {
            totalChargeDiff += (last.accumChargeEnergy - first.accumChargeEnergy);
            hasValidCharge = true;
          }
          if (first?.accumDischargeEnergy != null && last?.accumDischargeEnergy != null) {
            totalDischargeDiff += (last.accumDischargeEnergy - first.accumDischargeEnergy);
            hasValidDischarge = true;
          }
        }

        summary = {
          chargeDifference: hasValidCharge ? totalChargeDiff : null,
          dischargeDifference: hasValidDischarge ? totalDischargeDiff : null
        };
      }
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

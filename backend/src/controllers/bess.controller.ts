import { Request, Response } from 'express';
import { assetService } from '../services/asset.service';
import { authorizationService } from '../services/authorization.service';
import { mqttService } from '../services/mqtt.service';
import { resolveVoltageTrend, VoltageTrendProcessor } from '../utils/voltage-trend.util';

import { prisma as globalPrisma } from '../db/prisma';

export let prisma = globalPrisma as any;
export const setMockPrisma = (mock: any) => { prisma = mock; assetService.resolveSiteOwnership = mock.siteResolver || assetService.resolveSiteOwnership; assetService.resolveBessOwnership = mock.bessResolver || assetService.resolveBessOwnership; };

const safeError = (res: Response, message: string, code = 400): void => { res.status(code).json({ success: false, message }); };

export const getSiteBess = async (req: Request, res: Response): Promise<void> => {
  try {
    const siteId = req.params.siteId as string;
    
    const clientId = await assetService.resolveSiteOwnership(siteId);
    if (!clientId) return safeError(res, 'Site not found', 404);

    const isAuthorized = await authorizationService.canAccessClient(req.user!.id, req.user!.role, clientId);
    if (!isAuthorized) return safeError(res, 'Forbidden: Access to site denied', 403);

    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limitParam = parseInt(req.query.limit as string) || 10;
    const limit = Math.max(1, Math.min(limitParam, 100)); // Cap at 100
    const skip = (page - 1) * limit;

    const searchParam = (req.query.search as string || '').trim();
    
    let searchCondition: any = {};
    if (searchParam) {
      searchCondition = {
        OR: [
          { name: { contains: searchParam, mode: 'insensitive' } },
          { assetIdentifier: { contains: searchParam, mode: 'insensitive' } }
        ]
      };
    }

    const whereCondition = {
      AND: [
        { siteId },
        ...(searchParam ? [searchCondition] : [])
      ]
    };

    const [assets, total] = await Promise.all([
      prisma.bESSAsset.findMany({ 
        where: whereCondition,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' }
      }),
      prisma.bESSAsset.count({
        where: whereCondition
      })
    ]);

    const totalPages = total > 0 ? Math.ceil(total / limit) : 0;

    res.status(200).json({ 
      success: true, 
      assets,
      pagination: { page, limit, total, totalPages }
    });
  } catch (error) {
    safeError(res, 'Internal server error', 500);
  }
};

export const getBess = async (req: Request, res: Response): Promise<void> => {
  try {
    const assetId = req.params.assetId as string;
    
    const clientId = await assetService.resolveBessOwnership(assetId);
    if (!clientId) return safeError(res, 'BESS Asset not found', 404);

    const isAuthorized = await authorizationService.canAccessClient(req.user!.id, req.user!.role, clientId);
    if (!isAuthorized) return safeError(res, 'Forbidden: Access to BESS asset denied', 403);

    const asset = await prisma.bESSAsset.findUnique({ where: { id: assetId } });
    res.status(200).json({ success: true, asset });
  } catch (error) {
    safeError(res, 'Internal server error', 500);
  }
};

export const createBess = async (req: Request, res: Response): Promise<void> => {
  try {
    const siteId = req.params.siteId as string;
    
    const clientId = await assetService.resolveSiteOwnership(siteId);
    if (!clientId) return safeError(res, 'Site not found', 404);

    const isAuthorized = await authorizationService.canAccessClient(req.user!.id, req.user!.role, clientId);
    if (!isAuthorized) return safeError(res, 'Forbidden: Access to site denied', 403);

    const { name, assetIdentifier, emuId, model, energyCapacity, powerRating, mqttTopic, reportIntervalMinutes } = req.body;
    if (!name || typeof name !== 'string' || name.trim() === '') return safeError(res, 'Valid BESS name is required', 400);
    if (!assetIdentifier || typeof assetIdentifier !== 'string' || assetIdentifier.trim() === '') return safeError(res, 'Valid assetIdentifier is required', 400);

    const parsedEnergy = energyCapacity !== undefined && energyCapacity !== null ? Number(energyCapacity) : null;
    const parsedPower = powerRating !== undefined && powerRating !== null ? Number(powerRating) : null;
    
    if (parsedEnergy !== null && (isNaN(parsedEnergy) || parsedEnergy < 0)) return safeError(res, 'Energy Capacity must be a non-negative number', 400);
    if (parsedPower !== null && (isNaN(parsedPower) || parsedPower < 0)) return safeError(res, 'Power Rating must be a non-negative number', 400);

    if (!mqttTopic || typeof mqttTopic !== 'string' || mqttTopic.trim() === '') return safeError(res, 'Valid MQTT Topic is required', 400);
    const parsedMqttTopic = mqttTopic.trim();

    let parsedReportInterval: number | undefined;
    if (reportIntervalMinutes !== undefined) {
      if (req.user?.role !== 'ADMIN') {
        return safeError(res, 'Forbidden: Admin access required to set reporting interval', 403);
      }
      const val = Number(reportIntervalMinutes);
      if (!Number.isInteger(val) || val < 1 || val > 20) {
        return safeError(res, 'reportIntervalMinutes must be an integer between 1 and 20', 400);
      }
      parsedReportInterval = val;
    }

    let commonInterval = parsedReportInterval;
    if (commonInterval === undefined) {
      const existingBess = await prisma.bESSAsset.findFirst({
        where: { siteId },
        select: { reportIntervalMinutes: true }
      });
      commonInterval = existingBess?.reportIntervalMinutes || 15;
    }

    const asset = await prisma.$transaction(async (tx: any) => {
      if (parsedReportInterval !== undefined) {
        await tx.bESSAsset.updateMany({
          where: { siteId },
          data: { reportIntervalMinutes: parsedReportInterval }
        });
      }

      return await tx.bESSAsset.create({
        data: {
          name: name.trim(),
          assetIdentifier: assetIdentifier.trim(),
          siteId,
          emuId: emuId && typeof emuId === 'string' && emuId.trim() !== '' ? emuId.trim() : null,
          model: model && typeof model === 'string' ? model.trim() : null,
          energyCapacity: parsedEnergy,
          powerRating: parsedPower,
          mqttTopic: parsedMqttTopic,
          reportIntervalMinutes: commonInterval
        }
      });
    });

    if (asset.mqttTopic) {
      mqttService.subscribeToTopic(asset.mqttTopic);
    }

    res.status(201).json({ success: true, asset });
  } catch (error: any) {
    if (error.code === 'P2002') {
      if (error.meta && String(error.meta.target).includes('mqttTopic')) {
        return safeError(res, 'MQTT topic is already assigned to another BESS.', 409);
      }
      if (error.meta && String(error.meta.target).includes('emuId')) {
        return safeError(res, 'EMU ID is already claimed by another BESS asset', 409);
      }
      return safeError(res, 'BESS assetIdentifier must be unique', 409);
    }
    safeError(res, 'Internal server error', 500);
  }
};

export const updateBess = async (req: Request, res: Response): Promise<void> => {
  try {
    const assetId = req.params.assetId as string;
    
    const clientId = await assetService.resolveBessOwnership(assetId);
    if (!clientId) return safeError(res, 'BESS Asset not found', 404);

    const isAuthorized = await authorizationService.canAccessClient(req.user!.id, req.user!.role, clientId);
    if (!isAuthorized) return safeError(res, 'Forbidden: Access to BESS asset denied', 403);

    // Non-admin users (CLIENT, DISTRIBUTOR) are not authorized to modify BESS assets.
    // Explicitly reject commissioning parameters and any BESS modifications by non-admins.
    if (req.user?.role !== 'ADMIN') {
      const restrictedFields = ['assetIdentifier', 'emuId', 'model', 'energyCapacity', 'powerRating', 'mqttTopic', 'reportIntervalMinutes', 'siteId'];
      const hasRestrictedField = restrictedFields.some(field => req.body[field] !== undefined);
      if (hasRestrictedField) {
        return safeError(res, 'Forbidden: Admin access required to modify BESS commissioning parameters', 403);
      }
      return safeError(res, 'Forbidden: Admin access required to update BESS assets', 403);
    }

    const { name, assetIdentifier, emuId, siteId: bodySiteId, model, energyCapacity, powerRating, mqttTopic, reportIntervalMinutes } = req.body;
    
    const existingAsset = await prisma.bESSAsset.findUnique({where: {id: assetId}});
    if (bodySiteId && bodySiteId !== existingAsset.siteId) {
      return safeError(res, 'Parent reassignment is not supported in Phase 10', 400);
    }

    const dataToUpdate: any = {
      ...(name && name.trim() !== '' ? { name: name.trim() } : {}),
      ...(assetIdentifier && assetIdentifier.trim() !== '' ? { assetIdentifier: assetIdentifier.trim() } : {})
    };

    if (reportIntervalMinutes !== undefined) {
      if (req.user?.role !== 'ADMIN') {
        return safeError(res, 'Forbidden: Admin access required to change reporting interval', 403);
      }
      const parsedInterval = Number(reportIntervalMinutes);
      if (!Number.isInteger(parsedInterval) || parsedInterval < 1 || parsedInterval > 20) {
        return safeError(res, 'reportIntervalMinutes must be an integer between 1 and 20', 400);
      }
      dataToUpdate.reportIntervalMinutes = parsedInterval;
    }

    if (emuId !== undefined) {
      dataToUpdate.emuId = emuId && typeof emuId === 'string' && emuId.trim() !== '' ? emuId.trim() : null;
    }

    if (model !== undefined) {
      dataToUpdate.model = model && typeof model === 'string' && model.trim() !== '' ? model.trim() : null;
    }

    if (energyCapacity !== undefined) {
      if (energyCapacity === null || energyCapacity === '') {
        dataToUpdate.energyCapacity = null;
      } else {
        const parsedEnergy = Number(energyCapacity);
        if (isNaN(parsedEnergy) || parsedEnergy < 0) return safeError(res, 'Energy Capacity must be a non-negative number', 400);
        dataToUpdate.energyCapacity = parsedEnergy;
      }
    }

    if (powerRating !== undefined) {
      if (powerRating === null || powerRating === '') {
        dataToUpdate.powerRating = null;
      } else {
        const parsedPower = Number(powerRating);
        if (isNaN(parsedPower) || parsedPower < 0) return safeError(res, 'Power Rating must be a non-negative number', 400);
        dataToUpdate.powerRating = parsedPower;
      }
    }

    if (mqttTopic !== undefined) {
      if (!mqttTopic || typeof mqttTopic !== 'string' || mqttTopic.trim() === '') return safeError(res, 'Valid MQTT Topic is required', 400);
      dataToUpdate.mqttTopic = mqttTopic.trim();
    }

    const asset = await prisma.$transaction(async (tx: any) => {
      if (dataToUpdate.reportIntervalMinutes !== undefined) {
        await tx.bESSAsset.updateMany({
          where: { siteId: existingAsset.siteId },
          data: { reportIntervalMinutes: dataToUpdate.reportIntervalMinutes }
        });
      }
      return await tx.bESSAsset.update({
        where: { id: assetId },
        data: dataToUpdate
      });
    });

    if (existingAsset && existingAsset.mqttTopic !== asset.mqttTopic) {
      if (existingAsset.mqttTopic) {
        mqttService.unsubscribeFromTopic(existingAsset.mqttTopic);
      }
      if (asset.mqttTopic) {
        mqttService.subscribeToTopic(asset.mqttTopic);
      }
    }

    res.status(200).json({ success: true, asset });
  } catch (error: any) {
    if (error.code === 'P2002') {
      if (error.meta && String(error.meta.target).includes('mqttTopic')) {
        return safeError(res, 'MQTT topic is already assigned to another BESS.', 409);
      }
      if (error.meta && String(error.meta.target).includes('emuId')) {
        return safeError(res, 'EMU ID is already claimed by another BESS asset', 409);
      }
      return safeError(res, 'BESS assetIdentifier must be unique', 409);
    }
    safeError(res, 'Internal server error', 500);
  }
};

export const deleteBess = async (req: Request, res: Response): Promise<void> => {
  try {
    const assetId = req.params.assetId as string;
    
    const clientId = await assetService.resolveBessOwnership(assetId);
    if (!clientId) return safeError(res, 'BESS Asset not found', 404);

    const isAuthorized = await authorizationService.canAccessClient(req.user!.id, req.user!.role, clientId);
    if (!isAuthorized) return safeError(res, 'Forbidden: Access to BESS asset denied', 403);

    if (req.user?.role !== 'ADMIN') {
      return safeError(res, 'Forbidden: Admin access required to delete BESS assets', 403);
    }

    await prisma.bESSAsset.delete({ where: { id: assetId } });
    res.status(200).json({ success: true, message: 'BESS Asset deleted' });
  } catch (error: any) {
    if (error.code === 'P2003') return safeError(res, 'Cannot delete BESS asset with existing dependent devices', 400);
    safeError(res, 'Internal server error', 500);
  }
};

export const getBessVoltageTrend = async (req: Request, res: Response): Promise<void> => {
  try {
    const assetId = req.params.assetId as string;
    const { startDate, endDate } = req.query;

    const clientId = await assetService.resolveBessOwnership(assetId);
    if (!clientId) return safeError(res, 'BESS Asset not found', 404);

    const isAuthorized = await authorizationService.canAccessClient(req.user!.id, req.user!.role, clientId);
    if (!isAuthorized) return safeError(res, 'Forbidden: Access to BESS asset denied', 403);

    const whereClause: any = {
      device: {
        bessAssetId: assetId,
        componentId: 'pcs'
      }
    };

    if (!startDate || !endDate) {
      return safeError(res, 'Both startDate and endDate are required', 400);
    }

    whereClause.timestamp = {};
    
    const parsedStart = new Date(startDate as string);
    if (isNaN(parsedStart.getTime())) {
      return safeError(res, 'Invalid startDate format', 400);
    }
    whereClause.timestamp.gte = parsedStart;

    const parsedEnd = new Date(endDate as string);
    if (isNaN(parsedEnd.getTime())) {
      return safeError(res, 'Invalid endDate format', 400);
    }
    whereClause.timestamp.lte = parsedEnd;

    if (parsedStart > parsedEnd) {
      return safeError(res, 'startDate cannot be after endDate', 400);
    }

    const msDiff = parsedEnd.getTime() - parsedStart.getTime();
    if (msDiff > 31 * 24 * 60 * 60 * 1000) {
      return safeError(res, 'Date range cannot exceed 31 days', 400);
    }

    const telemetry = await prisma.telemetryHistory.findMany({
      where: whereClause,
      orderBy: [
        { timestamp: 'asc' },
        { gridOnState: { sort: 'desc', nulls: 'last' } }
      ],
      select: {
        timestamp: true,
        gridVoltageUab: true,
        gridVoltageUbc: true,
        gridVoltageUca: true,
        bessVoltageUa: true,
        bessVoltageUb: true,
        bessVoltageUc: true,
        gridOnState: true,
        gridOffState: true
      }
    });

    const processor = new VoltageTrendProcessor();

    const lastKnownState = await prisma.telemetryHistory.findFirst({
      where: {
        device: { bessAssetId: assetId, componentId: 'pcs' },
        timestamp: { lt: parsedStart },
        OR: [
          { gridOnState: { not: null } },
          { gridOffState: { not: null } }
        ]
      },
      orderBy: { timestamp: 'desc' },
      select: { timestamp: true, gridOnState: true, gridOffState: true }
    });

    if (lastKnownState) {
      processor.setInitialState(
        lastKnownState.gridOnState,
        lastKnownState.gridOffState,
        lastKnownState.timestamp instanceof Date ? lastKnownState.timestamp.getTime() : new Date(lastKnownState.timestamp).getTime()
      );
    }

    const mappedTelemetry = telemetry.map((row: any) => {
      const { activeSource, gridUab, gridUbc, gridUca, bessUa, bessUb, bessUc } = processor.processRow(row);

      return {
        timestamp: row.timestamp,
        activeSource,
        gridVoltageUab: gridUab,
        gridVoltageUbc: gridUbc,
        gridVoltageUca: gridUca,
        bessVoltageUa: bessUa,
        bessVoltageUb: bessUb,
        bessVoltageUc: bessUc,
        rawGridVoltageUab: row.gridVoltageUab,
        rawGridVoltageUbc: row.gridVoltageUbc,
        rawGridVoltageUca: row.gridVoltageUca,
        rawBessVoltageUa: row.bessVoltageUa,
        rawBessVoltageUb: row.bessVoltageUb,
        rawBessVoltageUc: row.bessVoltageUc,
      };
    });

    res.status(200).json({ success: true, data: mappedTelemetry });
  } catch (error) {
    safeError(res, 'Internal server error', 500);
  }
};

export const getBessGridStateTrend = async (req: Request, res: Response): Promise<void> => {
  try {
    const assetId = req.params.assetId as string;
    const { startDate, endDate } = req.query;

    const clientId = await assetService.resolveBessOwnership(assetId);
    if (!clientId) return safeError(res, 'BESS Asset not found', 404);

    const isAuthorized = await authorizationService.canAccessClient(req.user!.id, req.user!.role, clientId);
    if (!isAuthorized) return safeError(res, 'Forbidden: Access to BESS asset denied', 403);

    const whereClause: any = {
      device: {
        bessAssetId: assetId,
        componentId: 'pcs'
      }
    };

    if (!startDate || !endDate) {
      return safeError(res, 'Both startDate and endDate are required', 400);
    }

    whereClause.timestamp = {};
    
    const parsedStart = new Date(startDate as string);
    if (isNaN(parsedStart.getTime())) {
      return safeError(res, 'Invalid startDate format', 400);
    }
    whereClause.timestamp.gte = parsedStart;

    const parsedEnd = new Date(endDate as string);
    if (isNaN(parsedEnd.getTime())) {
      return safeError(res, 'Invalid endDate format', 400);
    }
    whereClause.timestamp.lte = parsedEnd;

    if (parsedStart > parsedEnd) {
      return safeError(res, 'startDate cannot be after endDate', 400);
    }

    const msDiff = parsedEnd.getTime() - parsedStart.getTime();
    if (msDiff > 31 * 24 * 60 * 60 * 1000) {
      return safeError(res, 'Date range cannot exceed 31 days', 400);
    }

    const telemetry = await prisma.telemetryHistory.findMany({
      where: whereClause,
      orderBy: {
        timestamp: 'asc'
      },
      select: {
        timestamp: true,
        gridOnState: true,
        gridOffState: true
      }
    });

    res.status(200).json({ success: true, data: telemetry });
  } catch (error) {
    safeError(res, 'Internal server error', 500);
  }
};

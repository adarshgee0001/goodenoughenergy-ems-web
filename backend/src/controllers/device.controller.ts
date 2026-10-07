import { Request, Response } from 'express';
import { DeviceType } from '@prisma/client';
import { assetService } from '../services/asset.service';
import { authorizationService } from '../services/authorization.service';

import { prisma as globalPrisma } from '../db/prisma';

export let prisma = globalPrisma as any;
export const setMockPrisma = (mock: any) => { prisma = mock; assetService.resolveBessOwnership = mock.bessResolver || assetService.resolveBessOwnership; assetService.resolveDeviceOwnership = mock.deviceResolver || assetService.resolveDeviceOwnership; };

const safeError = (res: Response, message: string, code = 400): void => { res.status(code).json({ success: false, message }); };

export const getBessDevices = async (req: Request, res: Response): Promise<void> => {
  try {
    const assetId = req.params.assetId as string;
    
    const clientId = await assetService.resolveBessOwnership(assetId);
    if (!clientId) return safeError(res, 'BESS Asset not found', 404);

    const isAuthorized = await authorizationService.canAccessClient(req.user!.id, req.user!.role, clientId);
    if (!isAuthorized) return safeError(res, 'Forbidden: Access to BESS asset denied', 403);

    const devices = await prisma.device.findMany({ where: { bessAssetId: assetId } });
    res.status(200).json({ success: true, devices });
  } catch (error) {
    safeError(res, 'Internal server error', 500);
  }
};

export const getDevice = async (req: Request, res: Response): Promise<void> => {
  try {
    const deviceId = req.params.deviceId as string;
    
    const clientId = await assetService.resolveDeviceOwnership(deviceId);
    if (!clientId) return safeError(res, 'Device not found', 404);

    const isAuthorized = await authorizationService.canAccessClient(req.user!.id, req.user!.role, clientId);
    if (!isAuthorized) return safeError(res, 'Forbidden: Access to device denied', 403);

    const device = await prisma.device.findUnique({ where: { id: deviceId } });
    res.status(200).json({ success: true, device });
  } catch (error) {
    safeError(res, 'Internal server error', 500);
  }
};

export const createDevice = async (req: Request, res: Response): Promise<void> => {
  try {
    const assetId = req.params.assetId as string;
    
    const clientId = await assetService.resolveBessOwnership(assetId);
    if (!clientId) return safeError(res, 'BESS Asset not found', 404);

    const isAuthorized = await authorizationService.canAccessClient(req.user!.id, req.user!.role, clientId);
    if (!isAuthorized) return safeError(res, 'Forbidden: Access to BESS asset denied', 403);

    const { type, name, hardwareId, componentId } = req.body;
    if (!type || !Object.values(DeviceType).includes(type)) return safeError(res, 'Valid DeviceType is required', 400);

    const trimmedComponentId = componentId?.trim();

    if (!trimmedComponentId) return safeError(res, 'componentId is required and cannot be empty', 400);

    const device = await prisma.device.create({
      data: {
        type, 
        ...(name && name.trim() !== '' ? { name: name.trim() } : {}),
        ...(hardwareId && hardwareId.trim() !== '' ? { hardwareId: hardwareId.trim() } : {}),
        componentId: trimmedComponentId,
        bessAssetId: assetId 
      }
    });
    res.status(201).json({ success: true, device });
  } catch (error: any) {
    if (error.code === 'P2002') {
      if (error.meta?.target?.includes('hardwareId')) {
        return safeError(res, 'Device hardwareId must be unique', 409);
      }
      return safeError(res, 'Device mapping (bessAssetId + componentId) must be unique', 409);
    }
    safeError(res, 'Internal server error', 500);
  }
};

export const updateDevice = async (req: Request, res: Response): Promise<void> => {
  try {
    const deviceId = req.params.deviceId as string;
    
    const clientId = await assetService.resolveDeviceOwnership(deviceId);
    if (!clientId) return safeError(res, 'Device not found', 404);

    const isAuthorized = await authorizationService.canAccessClient(req.user!.id, req.user!.role, clientId);
    if (!isAuthorized) return safeError(res, 'Forbidden: Access to device denied', 403);

    const { type, name, hardwareId, componentId, bessAssetId: bodyBessAssetId } = req.body;
    
    if (bodyBessAssetId && bodyBessAssetId !== (await prisma.device.findUnique({where: {id: deviceId}})).bessAssetId) {
      return safeError(res, 'Parent reassignment is not supported in Phase 10', 400);
    }

    if (type && !Object.values(DeviceType).includes(type)) return safeError(res, 'Valid DeviceType is required', 400);

    const trimmedComponentId = componentId !== undefined ? componentId?.trim() : undefined;

    if (trimmedComponentId === '') return safeError(res, 'componentId cannot be empty', 400);

    const device = await prisma.device.update({
      where: { id: deviceId },
      data: {
        ...(type ? { type } : {}),
        ...(name !== undefined ? { name: name?.trim() || null } : {}),
        ...(hardwareId !== undefined ? { hardwareId: hardwareId?.trim() || null } : {}),
        ...(trimmedComponentId !== undefined ? { componentId: trimmedComponentId } : {})
      }
    });
    res.status(200).json({ success: true, device });
  } catch (error: any) {
    if (error.code === 'P2002') {
      if (error.meta?.target?.includes('hardwareId')) {
        return safeError(res, 'Device hardwareId must be unique', 409);
      }
      return safeError(res, 'Device mapping (bessAssetId + componentId) must be unique', 409);
    }
    safeError(res, 'Internal server error', 500);
  }
};

export const deleteDevice = async (req: Request, res: Response): Promise<void> => {
  try {
    const deviceId = req.params.deviceId as string;
    
    const clientId = await assetService.resolveDeviceOwnership(deviceId);
    if (!clientId) return safeError(res, 'Device not found', 404);

    const isAuthorized = await authorizationService.canAccessClient(req.user!.id, req.user!.role, clientId);
    if (!isAuthorized) return safeError(res, 'Forbidden: Access to device denied', 403);

    await prisma.device.delete({ where: { id: deviceId } });
    res.status(200).json({ success: true, message: 'Device deleted' });
  } catch (error: any) {
    safeError(res, 'Internal server error', 500);
  }
};

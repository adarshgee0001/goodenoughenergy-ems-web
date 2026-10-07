import { Request, Response } from 'express';
import { assetService } from '../services/asset.service';
import { authorizationService } from '../services/authorization.service';

import { prisma as globalPrisma } from '../db/prisma';

export let prisma = globalPrisma as any;
export const setMockPrisma = (mock: any) => { prisma = mock; assetService.resolveSiteOwnership = mock.siteResolver || assetService.resolveSiteOwnership; };

const safeError = (res: Response, message: string, code = 400): void => { res.status(code).json({ success: false, message }); };

export const getClientSites = async (req: Request, res: Response): Promise<void> => {
  try {
    const clientId = req.params.clientId as string;
    
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
          { businessIdentifier: { contains: searchParam, mode: 'insensitive' } }
        ]
      };
    }

    const whereCondition = {
      AND: [
        { clientId },
        ...(searchParam ? [searchCondition] : [])
      ]
    };

    const [sites, total] = await Promise.all([
      prisma.site.findMany({ 
        where: whereCondition,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' }
      }),
      prisma.site.count({
        where: whereCondition
      })
    ]);

    const totalPages = total > 0 ? Math.ceil(total / limit) : 0;
    
    res.status(200).json({ 
      success: true, 
      sites,
      pagination: { page, limit, total, totalPages }
    });
  } catch (error) {
    safeError(res, 'Internal server error', 500);
  }
};

export const getSite = async (req: Request, res: Response): Promise<void> => {
  try {
    const siteId = req.params.siteId as string;
    
    // Server-side ownership resolution
    const clientId = await assetService.resolveSiteOwnership(siteId);
    if (!clientId) return safeError(res, 'Site not found', 404);

    // Verify access
    const isAuthorized = await authorizationService.canAccessClient(req.user!.id, req.user!.role, clientId);
    if (!isAuthorized) return safeError(res, 'Forbidden: Access to site denied', 403);

    const site = await prisma.site.findUnique({ where: { id: siteId } });
    res.status(200).json({ success: true, site });
  } catch (error) {
    safeError(res, 'Internal server error', 500);
  }
};

export const createSite = async (req: Request, res: Response): Promise<void> => {
  try {
    const clientId = req.params.clientId as string;
    
    // Verify client actually exists
    const clientExists = await prisma.client.findUnique({ where: { id: clientId } });
    if (!clientExists) return safeError(res, 'Client not found', 404);

    const { name, businessIdentifier, timezone } = req.body;
    if (!name || typeof name !== 'string' || name.trim() === '') {
      return safeError(res, 'Valid site name is required', 400);
    }
    if (!businessIdentifier || typeof businessIdentifier !== 'string' || businessIdentifier.trim() === '') {
      return safeError(res, 'Valid businessIdentifier is required', 400);
    }

    const site = await prisma.site.create({
      data: { name: name.trim(), businessIdentifier: businessIdentifier.trim(), timezone, clientId }
    });
    res.status(201).json({ success: true, site });
  } catch (error: any) {
    if (error.code === 'P2002') return safeError(res, 'Site business identifier must be unique for this client', 409);
    safeError(res, 'Internal server error', 500);
  }
};

export const updateSite = async (req: Request, res: Response): Promise<void> => {
  try {
    const siteId = req.params.siteId as string;
    
    // Server-side ownership resolution
    const clientId = await assetService.resolveSiteOwnership(siteId);
    if (!clientId) return safeError(res, 'Site not found', 404);

    const isAuthorized = await authorizationService.canAccessClient(req.user!.id, req.user!.role, clientId);
    if (!isAuthorized) return safeError(res, 'Forbidden: Access to site denied', 403);

    const { name, businessIdentifier, timezone, clientId: bodyClientId } = req.body;
    
    // Block re-parenting
    if (bodyClientId && bodyClientId !== clientId) {
      return safeError(res, 'Parent reassignment is not supported in Phase 10', 400);
    }

    const site = await prisma.site.update({
      where: { id: siteId },
      data: {
        ...(name && name.trim() !== '' ? { name: name.trim() } : {}),
        ...(businessIdentifier && businessIdentifier.trim() !== '' ? { businessIdentifier: businessIdentifier.trim() } : {}),
        ...(timezone !== undefined ? { timezone } : {})
      }
    });
    res.status(200).json({ success: true, site });
  } catch (error: any) {
    if (error.code === 'P2002') return safeError(res, 'Site business identifier must be unique for this client', 409);
    safeError(res, 'Internal server error', 500);
  }
};

export const deleteSite = async (req: Request, res: Response): Promise<void> => {
  try {
    const siteId = req.params.siteId as string;
    
    const clientId = await assetService.resolveSiteOwnership(siteId);
    if (!clientId) return safeError(res, 'Site not found', 404);

    const isAuthorized = await authorizationService.canAccessClient(req.user!.id, req.user!.role, clientId);
    if (!isAuthorized) return safeError(res, 'Forbidden: Access to site denied', 403);

    await prisma.site.delete({ where: { id: siteId } });
    res.status(200).json({ success: true, message: 'Site deleted' });
  } catch (error: any) {
    if (error.code === 'P2003') return safeError(res, 'Cannot delete site with existing dependent assets', 400);
    safeError(res, 'Internal server error', 500);
  }
};

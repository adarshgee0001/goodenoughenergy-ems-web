import { Request, Response } from 'express';
import { authorizationService } from '../services/authorization.service';

import { prisma as globalPrisma } from '../db/prisma';

export let prisma = globalPrisma as any;
export const setMockPrisma = (mock: any) => { prisma = mock; };

const safeError = (res: Response, message: string, code = 400) => {
  res.status(code).json({ success: false, message });
};

export const getClients = async (req: Request, res: Response): Promise<void> => {
  try {
    const role = req.user!.role;
    
    // Pagination parameters
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limitParam = parseInt(req.query.limit as string) || 10;
    const limit = Math.max(1, Math.min(limitParam, 100)); // Cap at 100
    const skip = (page - 1) * limit;

    // Search parameter
    const searchParam = (req.query.search as string || '').trim();
    
    // Base search condition
    let searchCondition: any = {};
    if (searchParam) {
      searchCondition = {
        OR: [
          { name: { contains: searchParam, mode: 'insensitive' } },
          { businessIdentifier: { contains: searchParam, mode: 'insensitive' } }
        ]
      };
    }

    if (role === 'ADMIN') {
      const [clients, total] = await Promise.all([
        prisma.client.findMany({
          where: searchCondition,
          skip,
          take: limit,
          orderBy: { createdAt: 'desc' }
        }),
        prisma.client.count({
          where: searchCondition
        })
      ]);
      const totalPages = total > 0 ? Math.ceil(total / limit) : 0;
      res.status(200).json({ 
        success: true, 
        clients,
        pagination: { page, limit, total, totalPages }
      });
    } else if (role === 'CLIENT' || role === 'DISTRIBUTOR') {
      const accesses = await prisma.userClientAccess.findMany({
        where: { userId: req.user!.id }
      });
      const assignedClientIds = accesses.map((a: any) => a.clientId);
      
      const whereCondition = {
        AND: [
          { id: { in: assignedClientIds } },
          ...(searchParam ? [searchCondition] : [])
        ]
      };

      const [clients, total] = await Promise.all([
        prisma.client.findMany({
          where: whereCondition,
          skip,
          take: limit,
          orderBy: { createdAt: 'desc' }
        }),
        prisma.client.count({
          where: whereCondition
        })
      ]);
      const totalPages = total > 0 ? Math.ceil(total / limit) : 0;
      res.status(200).json({ 
        success: true, 
        clients,
        pagination: { page, limit, total, totalPages }
      });
    } else {
      safeError(res, 'Forbidden', 403);
    }
  } catch (error) {
    safeError(res, 'Internal server error', 500);
  }
};

export const getClient = async (req: Request, res: Response): Promise<void> => {
  try {
    console.log('getClient called with params:', req.params);
    const { clientId } = req.params;
    const client = await prisma.client.findUnique({ where: { id: clientId } });
    if (!client) return safeError(res, 'Client not found', 404);
    res.status(200).json({ success: true, client });
  } catch (error) {
    safeError(res, 'Internal server error', 500);
  }
};

export const createClient = async (req: Request, res: Response): Promise<void> => {
  try {
    if (req.user!.role !== 'ADMIN') return safeError(res, 'Forbidden', 403);
    
    const { name, businessIdentifier } = req.body;
    if (!name || typeof name !== 'string' || name.trim() === '') {
      return safeError(res, 'Valid client name is required', 400);
    }

    const client = await prisma.client.create({
      data: { name: name.trim(), businessIdentifier }
    });
    res.status(201).json({ success: true, client });
  } catch (error: any) {
    if (error.code === 'P2002') return safeError(res, 'Client identifier must be unique', 409);
    safeError(res, 'Internal server error', 500);
  }
};

export const updateClient = async (req: Request, res: Response): Promise<void> => {
  try {
    if (req.user!.role !== 'ADMIN') return safeError(res, 'Forbidden', 403);

    const { clientId } = req.params;
    const { name, businessIdentifier } = req.body;
    
    const client = await prisma.client.update({
      where: { id: clientId },
      data: { 
        ...(name && name.trim() !== '' ? { name: name.trim() } : {}),
        ...(businessIdentifier !== undefined ? { businessIdentifier } : {})
      }
    });
    res.status(200).json({ success: true, client });
  } catch (error: any) {
    if (error.code === 'P2025') return safeError(res, 'Client not found', 404);
    if (error.code === 'P2002') return safeError(res, 'Client identifier must be unique', 409);
    safeError(res, 'Internal server error', 500);
  }
};

export const deleteClient = async (req: Request, res: Response): Promise<void> => {
  try {
    if (req.user!.role !== 'ADMIN') return safeError(res, 'Forbidden', 403);

    const { clientId } = req.params;
    await prisma.client.delete({ where: { id: clientId } });
    res.status(200).json({ success: true, message: 'Client deleted' });
  } catch (error: any) {
    if (error.code === 'P2025') return safeError(res, 'Client not found', 404);
    // P2003: known FK constraint (older Prisma behavior)
    if (error.code === 'P2003') return safeError(res, 'Client cannot be deleted because it has associated sites or other records. Remove them first.', 409);
    // Prisma 6.x raises PrismaClientUnknownRequestError for onDelete: Restrict violations
    // The underlying PostgreSQL error code is 23001 (restrict) or 23503 (FK violation)
    if (
      error.constructor?.name === 'PrismaClientUnknownRequestError' ||
      (typeof error.message === 'string' && (error.message.includes('23001') || error.message.includes('23503') || error.message.includes('RESTRICT') || error.message.includes('violates')))
    ) {
      return safeError(res, 'Client cannot be deleted because it has associated sites or other records. Remove them first.', 409);
    }
    safeError(res, 'Internal server error', 500);
  }
};

import { Request, Response } from 'express';
import { authService } from '../services/auth.service';
import { emailService } from '../services/email.service';
import crypto from 'crypto';

import { prisma as globalPrisma } from '../db/prisma';

export let prisma = globalPrisma as any;
export const setMockPrisma = (mock: any) => { prisma = mock; };

const safeError = (res: Response, message: string, code = 400): void => {
  res.status(code).json({ success: false, message });
};

/**
 * Generate a cryptographically secure random password.
 */
function generateTemporaryPassword(length = 12): string {
  return crypto.randomBytes(length).toString('base64').slice(0, length);
}

export const getClientUsers = async (req: Request, res: Response): Promise<void> => {
  try {
    const clientId = req.params.clientId;

    const client = await prisma.client.findUnique({ where: { id: clientId } });
    if (!client) {
      return safeError(res, 'Client not found', 404);
    }

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
          { email: { contains: searchParam, mode: 'insensitive' } }
        ]
      };
    }

    const whereCondition = {
      AND: [
        { clientAccess: { some: { clientId } } },
        ...(searchParam ? [searchCondition] : [])
      ]
    };

    const [users, total] = await Promise.all([
      prisma.user.findMany({
        where: whereCondition,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
          forcePasswordChange: true,
          createdAt: true,
          updatedAt: true
        }
      }),
      prisma.user.count({
        where: whereCondition
      })
    ]);

    const totalPages = total > 0 ? Math.ceil(total / limit) : 0;

    res.status(200).json({ 
      success: true, 
      users,
      pagination: { page, limit, total, totalPages }
    });
  } catch (error) {
    console.error('[User Controller - getClientUsers] Error:', error);
    safeError(res, 'Internal server error', 500);
  }
};

export const createClientUser = async (req: Request, res: Response): Promise<void> => {
  try {
    const clientId = req.params.clientId;
    const { name, email } = req.body;

    if (!name || !email) {
      return safeError(res, 'Name and email are required', 400);
    }

    const client = await prisma.client.findUnique({ where: { id: clientId } });
    if (!client) {
      return safeError(res, 'Client not found', 404);
    }

    const existingUser = await prisma.user.findUnique({ where: { email } });
    if (existingUser) {
      return safeError(res, 'A user with this email already exists', 409);
    }

    const temporaryPassword = generateTemporaryPassword();
    const passwordHash = await authService.hashPassword(temporaryPassword);

    const newUser = await prisma.$transaction(async (tx: any) => {
      const user = await tx.user.create({
        data: {
          name,
          email,
          passwordHash,
          role: 'CLIENT',
          forcePasswordChange: true
        }
      });

      await tx.userClientAccess.create({
        data: {
          userId: user.id,
          clientId: clientId,
          assignedBy: req.user?.id
        }
      });

      return user;
    });

    // Attempt invitation email AFTER transaction succeeds.
    // Email failure does NOT roll back the created user.
    const invitation = await emailService.sendInvitation({
      toEmail: newUser.email,
      toName: newUser.name,
      temporaryPassword,
    });

    res.status(201).json({
      success: true,
      user: {
        id: newUser.id,
        name: newUser.name,
        email: newUser.email,
        role: newUser.role,
        forcePasswordChange: newUser.forcePasswordChange,
        createdAt: newUser.createdAt,
        updatedAt: newUser.updatedAt
      },
      temporaryPassword, // Returned exactly ONCE
      invitation: {
        sent: invitation.sent,
        ...(invitation.message ? { message: invitation.message } : {})
      }
    });
  } catch (error) {
    console.error('[User Controller - createClientUser] Error:', error);
    safeError(res, 'Internal server error', 500);
  }
};

export const resetUserPassword = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.params.userId;

    const userToReset = await prisma.user.findUnique({ where: { id: userId } });
    if (!userToReset) {
      return safeError(res, 'User not found', 404);
    }

    if (userToReset.role !== 'CLIENT') {
      return safeError(res, 'Only CLIENT user passwords can be reset via this endpoint', 403);
    }

    const temporaryPassword = generateTemporaryPassword();
    const passwordHash = await authService.hashPassword(temporaryPassword);

    await prisma.user.update({
      where: { id: userId },
      data: {
        passwordHash,
        forcePasswordChange: true
      }
    });

    res.status(200).json({
      success: true,
      message: 'Password reset successfully',
      temporaryPassword // Returned exactly ONCE
    });
  } catch (error) {
    console.error('[User Controller - resetUserPassword] Error:', error);
    safeError(res, 'Internal server error', 500);
  }
};

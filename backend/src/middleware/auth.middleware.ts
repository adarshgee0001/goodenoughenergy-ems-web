import { Request, Response, NextFunction } from 'express';
import { authService, JwtPayload } from '../services/auth.service';

import { prisma as globalPrisma } from '../db/prisma';

export let prisma = globalPrisma as any;
export const setMockPrisma = (mock: any) => { prisma = mock; };

// Augment the Express Request interface to include the safe user object
declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string;
        email: string;
        name: string;
        role: string;
      };
      authExp?: number;
    }
  }
}

/**
 * Middleware to authenticate a user using a JWT token in the Authorization header.
 */
export const authenticateUser = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    let token = req.cookies?.auth_token;

    if (!token) {
      res.status(401).json({ success: false, message: 'Authentication required' });
      return;
    }
    
    let decoded: JwtPayload;
    try {
      decoded = authService.verifyToken(token);
    } catch (err) {
      res.status(401).json({ success: false, message: 'Invalid or expired token' });
      return;
    }

    if (decoded.exp && (decoded.exp * 1000) <= Date.now()) {
      res.status(401).json({ success: false, message: 'Invalid or expired token' });
      return;
    }

    // Fetch the safe user profile from PostgreSQL
    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
      },
    });

    if (!user) {
      res.status(401).json({ success: false, message: 'Authentication required' });
      return;
    }

    // Attach user to request context
    req.user = user;
    req.authExp = decoded.exp ? decoded.exp * 1000 : undefined;
    next();
  } catch (error) {
    console.error('[Auth Middleware] Error:', error);
    res.status(401).json({ success: false, message: 'Authentication required' });
  }
};

/**
 * Middleware to enforce ADMIN role requirement.
 * Must be used after authenticateUser.
 */
export const requireAdmin = (req: Request, res: Response, next: NextFunction): void => {
  if (!req.user || req.user.role !== 'ADMIN') {
    res.status(403).json({ success: false, message: 'Forbidden: Admin access required' });
    return;
  }
  next();
};


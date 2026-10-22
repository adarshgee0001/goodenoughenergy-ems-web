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
      token?: string;
    }
  }
}

/**
 * Middleware to authenticate a user using a JWT token in the Authorization header or cookie.
 */
export const authenticateUser = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    // Collect token candidates: prioritize Authorization header, fallback to cookie
    const candidates: string[] = [];

    if (req.headers.authorization) {
      const authHeader = req.headers.authorization;
      const hToken = authHeader.startsWith('Bearer ') ? authHeader.substring(7).trim() : authHeader.trim();
      if (hToken) candidates.push(hToken);
    }

    if (req.cookies?.auth_token) {
      const cToken = req.cookies.auth_token.trim();
      if (cToken) candidates.push(cToken);
    }

    if (candidates.length === 0) {
      res.status(401).json({ success: false, message: 'Authentication required' });
      return;
    }

    let decoded: JwtPayload | null = null;
    let validToken: string | undefined;

    for (const cand of candidates) {
      try {
        const d = authService.verifyToken(cand);
        if (!d.exp || (d.exp * 1000) > Date.now()) {
          decoded = d;
          validToken = cand;
          break;
        }
      } catch {
        // Try next candidate
      }
    }

    if (!decoded || !validToken) {
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
    req.token = validToken;
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


import { Request, Response, NextFunction } from 'express';
import { authorizationService } from '../services/authorization.service';

/**
 * Middleware factory to enforce that the authenticated user has access 
 * to the Client ID specified in the request parameters.
 */
export const requireClientAccess = (clientIdParamName: string) => {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    if (!req.user) {
      res.status(401).json({ success: false, message: 'Authentication required' });
      return;
    }

    const targetClientId = req.params[clientIdParamName] as string;

    const isAuthorized = await authorizationService.canAccessClient(
      req.user.id,
      req.user.role,
      targetClientId
    );

    if (!isAuthorized) {
      res.status(403).json({ success: false, message: 'Forbidden: Access to client denied' });
      return;
    }

    next();
  };
};

import { Router } from 'express';
import { getClientUsers, createClientUser, resetUserPassword } from '../controllers/user.controller';
import { authenticateUser, requireAdmin } from '../middleware/auth.middleware';

const router = Router();

// All user management endpoints require authentication and ADMIN role
router.use(authenticateUser);
router.use(requireAdmin);

// We mount the client-specific routes under /clients in index.ts or here.
// The routes specification asked for:
// GET /api/clients/:clientId/users
// POST /api/clients/:clientId/users
// POST /api/users/:userId/reset-password

// To achieve this cleanly if mounted at /api:
// But usually we mount it differently. 
// We will export a router and let index.ts mount it on /api directly.

export const clientUsersRouter = Router({ mergeParams: true });
clientUsersRouter.use(authenticateUser);
clientUsersRouter.use(requireAdmin);
clientUsersRouter.get('/', getClientUsers);
clientUsersRouter.post('/', createClientUser);

export const usersBaseRouter = Router();
usersBaseRouter.use(authenticateUser);
usersBaseRouter.use(requireAdmin);
usersBaseRouter.post('/:userId/reset-password', resetUserPassword);

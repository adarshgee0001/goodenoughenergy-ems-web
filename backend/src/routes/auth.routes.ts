import { Router } from 'express';
import { login, getMe, changePassword, logout } from '../controllers/auth.controller';
import { authenticateUser } from '../middleware/auth.middleware';

const router = Router();

router.post('/login', login);
router.get('/me', authenticateUser, getMe);
router.post('/change-password', authenticateUser, changePassword);
router.post('/logout', logout);

export default router;

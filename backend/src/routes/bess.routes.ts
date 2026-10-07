import { Router } from 'express';
import { getBess, updateBess, deleteBess, getBessVoltageTrend, getBessGridStateTrend } from '../controllers/bess.controller';
import { getBessDevices, createDevice } from '../controllers/device.controller';
import { authenticateUser } from '../middleware/auth.middleware';

const router = Router();

router.use(authenticateUser);

router.get('/:assetId', getBess);
router.patch('/:assetId', updateBess);
router.delete('/:assetId', deleteBess);

import { requireAdmin } from '../middleware/auth.middleware';

// Nested routes
router.get('/:assetId/devices', getBessDevices);
router.post('/:assetId/devices', createDevice);
router.get('/:assetId/voltage-trend', requireAdmin, getBessVoltageTrend);
router.get('/:assetId/grid-state-trend', requireAdmin, getBessGridStateTrend);

export default router;

import { Router } from 'express';
import { getDevice, updateDevice, deleteDevice } from '../controllers/device.controller';
import { authenticateUser } from '../middleware/auth.middleware';

const router = Router();

router.use(authenticateUser);

router.get('/:deviceId', getDevice);
router.patch('/:deviceId', updateDevice);
router.delete('/:deviceId', deleteDevice);

export default router;

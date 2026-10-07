import { Router } from 'express';
import { getSite, updateSite, deleteSite } from '../controllers/site.controller';
import { getSiteBess, createBess } from '../controllers/bess.controller';
import { authenticateUser } from '../middleware/auth.middleware';

const router = Router();

router.use(authenticateUser);

router.get('/:siteId', getSite);
router.patch('/:siteId', updateSite);
router.delete('/:siteId', deleteSite);

// Nested routes
router.get('/:siteId/bess', getSiteBess);
router.post('/:siteId/bess', createBess);

export default router;

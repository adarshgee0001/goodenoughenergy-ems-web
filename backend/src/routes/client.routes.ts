import { Router } from 'express';
import { getClients, getClient, createClient, updateClient, deleteClient } from '../controllers/client.controller';
import { getClientSites, createSite } from '../controllers/site.controller';
import { authenticateUser } from '../middleware/auth.middleware';
import { requireClientAccess } from '../middleware/clientAccess.middleware';

const router = Router();

router.use(authenticateUser);

router.get('/', getClients);
router.post('/', createClient);
router.get('/:clientId', requireClientAccess('clientId'), getClient);
router.patch('/:clientId', requireClientAccess('clientId'), updateClient);
router.delete('/:clientId', requireClientAccess('clientId'), deleteClient);

// Nested routes
router.get('/:clientId/sites', requireClientAccess('clientId'), getClientSites);
router.post('/:clientId/sites', requireClientAccess('clientId'), createSite);

export default router;

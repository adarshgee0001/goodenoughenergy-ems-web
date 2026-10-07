import { Router } from 'express';
import { getSiteTelemetrySnapshots } from '../controllers/telemetry-snapshot.controller';
import { getDynamicReport } from '../controllers/dynamic-report.controller';
import { authenticateUser } from '../middleware/auth.middleware';

const router = Router();

// GET /api/sites/:siteId/telemetry/dynamic-report
router.get(
  '/sites/:siteId/telemetry/dynamic-report',
  authenticateUser,
  getDynamicReport
);

// GET /api/sites/:siteId/telemetry/snapshots
router.get(
  '/sites/:siteId/telemetry/snapshots',
  authenticateUser,
  getSiteTelemetrySnapshots
);

export default router;

import { Router } from 'express';
import { getSiteTelemetry, getSiteLatestTelemetry } from '../controllers/telemetry.controller';
import { authenticateUser } from '../middleware/auth.middleware';

const router = Router();

// GET /api/sites/:siteId/telemetry/latest — must be declared BEFORE the bare telemetry route
// so that Express does not interpret 'latest' as a siteId path parameter.
router.get(
  '/sites/:siteId/telemetry/latest',
  authenticateUser,
  getSiteLatestTelemetry
);

// GET /api/sites/:siteId/telemetry — historical, with optional ?startDate&endDate
router.get(
  '/sites/:siteId/telemetry',
  authenticateUser,
  getSiteTelemetry
);

export default router;

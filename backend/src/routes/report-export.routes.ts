import { Router } from 'express';
import { exportDynamicReport, exportVoltageTrend, exportGridStateTrend } from '../controllers/report-export.controller';
import { authenticateUser } from '../middleware/auth.middleware';

const router = Router();

import { requireAdmin } from '../middleware/auth.middleware';

// GET /api/sites/:siteId/telemetry/export
router.get(
  '/sites/:siteId/telemetry/export',
  authenticateUser,
  exportDynamicReport
);

// GET /api/bess/:assetId/voltage-trend/export
router.get(
  '/bess/:assetId/voltage-trend/export',
  authenticateUser,
  requireAdmin,
  exportVoltageTrend
);

// GET /api/bess/:assetId/grid-state-trend/export
router.get(
  '/bess/:assetId/grid-state-trend/export',
  authenticateUser,
  requireAdmin,
  exportGridStateTrend
);

export default router;

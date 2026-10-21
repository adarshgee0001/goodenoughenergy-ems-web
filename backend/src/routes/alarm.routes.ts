import { Router } from 'express';
import { alarmController } from '../controllers/alarm.controller';
import { authenticateUser } from '../middleware/auth.middleware';

const router = Router();

// Export alarm history as CSV
router.get('/sites/:siteId/alarms/export', authenticateUser, alarmController.exportSiteAlarms);

// Get alarms for a site
router.get('/sites/:siteId/alarms', authenticateUser, alarmController.getSiteAlarms);

// Acknowledge an alarm
router.post('/alarms/:id/acknowledge', authenticateUser, alarmController.acknowledgeAlarm);

export const alarmRoutes = router;

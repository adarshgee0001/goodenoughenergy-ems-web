import { Router } from 'express';
import { getHealthStatus } from '../controllers/health.controller';
import authRoutes from './auth.routes';
import clientRoutes from './client.routes';
import siteRoutes from './site.routes';
import bessRoutes from './bess.routes';
import deviceRoutes from './device.routes';
import telemetryRoutes from './telemetry.routes';
import telemetrySnapshotRoutes from './telemetry-snapshot.routes';
import reportExportRoutes from './report-export.routes';
import { alarmRoutes } from './alarm.routes';
import { clientUsersRouter, usersBaseRouter } from './user.routes';

const router = Router();

// Health check route
router.get('/health', getHealthStatus);

// Auth routes
router.use('/auth', authRoutes);

// User & Client routes
router.use('/clients/:clientId/users', clientUsersRouter);
router.use('/clients', clientRoutes);
router.use('/users', usersBaseRouter);

// Asset Routes
router.use('/sites', siteRoutes);
router.use('/bess', bessRoutes);
router.use('/devices', deviceRoutes);
router.use('/', alarmRoutes);
router.use('/', telemetryRoutes);
router.use('/', telemetrySnapshotRoutes);
router.use('/', reportExportRoutes);

export default router;

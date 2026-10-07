import { Request, Response } from 'express';
import { authorizationService } from '../services/authorization.service';
import { webSocketService } from '../services/websocket.service';

import { prisma } from '../db/prisma';

export const alarmController = {
  getSiteAlarms: async (req: Request, res: Response) => {
    try {
      const siteId = req.params.siteId as string;
      const user = (req as any).user;

      if (!user) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      // Authorize access to the site
      const site = await prisma.site.findUnique({
        where: { id: siteId },
        select: { clientId: true }
      });

      if (!site) {
        return res.status(404).json({ error: 'Site not found' });
      }

      const hasAccess = await authorizationService.canAccessClient(user.id || user.userId, user.role, site.clientId);
      if (!hasAccess) {
        return res.status(403).json({ error: 'Forbidden' });
      }

      // Process limit query parameter
      let limit = parseInt(req.query.limit as string);
      if (isNaN(limit) || limit <= 0) {
        limit = 500;
      }
      limit = Math.min(limit, 1000);

      // Fetch all alarms for the site (bounded)
      const alarms = await prisma.alarm.findMany({
        where: {
          device: {
            bessAsset: {
              siteId: siteId
            }
          }
        },
        include: {
          device: {
            include: {
              bessAsset: true
            }
          }
        },
        orderBy: [
          { createdAt: 'desc' },
          { id: 'desc' }
        ],
        take: limit
      });

      res.json(alarms);
    } catch (error) {
      console.error('[AlarmController] Error fetching site alarms:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  },

  acknowledgeAlarm: async (req: Request, res: Response) => {
    try {
      const id = req.params.id as string;
      const user = (req as any).user;

      if (!user) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      // First fetch the raw alarm to verify it exists
      const alarmBase = await prisma.alarm.findUnique({
        where: { id: id }
      });

      if (!alarmBase) {
        return res.status(404).json({ error: 'Alarm not found' });
      }

      // Fetch the alarm with includes
      const alarm = await prisma.alarm.findUnique({
        where: { id: id },
        include: {
          device: {
            include: {
              bessAsset: true
            }
          }
        }
      });

      if (!alarm || !alarm.device) {
        return res.status(404).json({ error: 'Alarm or device not found' });
      }

      // Authorize access
      const siteId = alarm.device.bessAsset.siteId;
      const site = await prisma.site.findUnique({
        where: { id: siteId },
        select: { clientId: true }
      });

      if (!site) {
        return res.status(404).json({ error: 'Site not found' });
      }

      const hasAccess = await authorizationService.canAccessClient(user.id || user.userId, user.role, site.clientId);
      if (!hasAccess) {
        return res.status(403).json({ error: 'Forbidden' });
      }

      // Check lifecycle rules
      if (alarm.status !== 'ACTIVE') {
        return res.status(400).json({ error: 'Only ACTIVE alarms can be acknowledged' });
      }

      const updatedAlarm = await prisma.alarm.update({
        where: { id: id },
        data: {
          status: 'ACKNOWLEDGED',
          acknowledgedAt: new Date(),
          acknowledgedByUserId: user.id || user.userId
        },
        include: {
          device: {
            include: {
              bessAsset: true
            }
          }
        }
      });

      // Broadcast WS event
      webSocketService.broadcastAlarm(siteId, {
        type: 'alarm',
        siteId: siteId,
        alarm: updatedAlarm
      });

      res.json(updatedAlarm);
    } catch (error) {
      console.error('[AlarmController] Error acknowledging alarm:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }
};

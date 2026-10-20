import { Request, Response } from 'express';
import { authorizationService } from '../services/authorization.service';
import { webSocketService } from '../services/websocket.service';
import { prisma } from '../db/prisma';
import { formatCsvRow, formatSiteTimestamp } from '../utils/csv.util';

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

      // Parse query parameters
      const { from, to, status, bessId } = req.query;

      // Validate bessId if provided: must belong to the active site
      let targetBessAsset: { id: string; name: string } | null = null;
      if (bessId && typeof bessId === 'string' && bessId.trim()) {
        const bess = await prisma.bESSAsset.findFirst({
          where: {
            id: bessId.trim(),
            siteId: siteId
          },
          select: { id: true, name: true }
        });

        if (!bess) {
          return res.status(404).json({ error: 'BESS asset not found or does not belong to this site' });
        }
        targetBessAsset = bess;
      }

      // Process limit query parameter
      let limit = parseInt(req.query.limit as string);
      if (isNaN(limit) || limit <= 0) {
        limit = 500;
      }
      limit = Math.min(limit, 1000);

      const where: any = {
        device: {
          bessAsset: targetBessAsset
            ? { id: targetBessAsset.id, siteId: siteId }
            : { siteId: siteId }
        }
      };

      // Filter by status if provided
      if (status) {
        if (status === 'ACTIVE') {
          where.status = 'ACTIVE';
        } else if (status === 'HISTORY') {
          where.status = { in: ['CLEARED', 'ACKNOWLEDGED'] };
        } else if (status === 'CLEARED' || status === 'ACKNOWLEDGED') {
          where.status = status;
        }
      }

      // Date filtering with validation
      if (from || to) {
        let fromDate: Date | undefined;
        let toDate: Date | undefined;

        if (from) {
          fromDate = new Date(from as string);
          if (isNaN(fromDate.getTime())) {
            return res.status(400).json({ error: 'Invalid "from" date parameter' });
          }
        }

        if (to) {
          toDate = new Date(to as string);
          if (isNaN(toDate.getTime())) {
            return res.status(400).json({ error: 'Invalid "to" date parameter' });
          }
        }

        if (fromDate && toDate && fromDate >= toDate) {
          return res.status(400).json({ error: 'Invalid date range: "from" must be before "to"' });
        }

        where.createdAt = {};
        if (fromDate) where.createdAt.gte = fromDate;
        if (toDate) where.createdAt.lt = toDate;
      }

      // Fetch alarms for the site (bounded)
      const alarms = await prisma.alarm.findMany({
        where,
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

  exportSiteAlarms: async (req: Request, res: Response) => {
    try {
      const siteId = req.params.siteId as string;
      const user = (req as any).user;

      if (!user) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      // Authorize access to the site
      const site = await prisma.site.findUnique({
        where: { id: siteId },
        include: { client: true }
      });

      if (!site) {
        return res.status(404).json({ error: 'Site not found' });
      }

      const hasAccess = await authorizationService.canAccessClient(user.id || user.userId, user.role, site.clientId);
      if (!hasAccess) {
        return res.status(403).json({ error: 'Forbidden' });
      }

      const siteTimezone = site.timezone || 'Asia/Kolkata';

      // Parse and validate query parameters
      const { from, to, startDate, endDate, bessId } = req.query;
      let fromDate: Date | undefined;
      let toDate: Date | undefined;

      // Validate bessId if provided: must belong to the active site
      let targetBessAsset: { id: string; name: string } | null = null;
      if (bessId && typeof bessId === 'string' && bessId.trim()) {
        const bess = await prisma.bESSAsset.findFirst({
          where: {
            id: bessId.trim(),
            siteId: siteId
          },
          select: { id: true, name: true }
        });

        if (!bess) {
          return res.status(404).json({ error: 'BESS asset not found or does not belong to this site' });
        }
        targetBessAsset = bess;
      }

      if (from) {
        fromDate = new Date(from as string);
        if (isNaN(fromDate.getTime())) {
          return res.status(400).json({ error: 'Invalid "from" date parameter' });
        }
      }

      if (to) {
        toDate = new Date(to as string);
        if (isNaN(toDate.getTime())) {
          return res.status(400).json({ error: 'Invalid "to" date parameter' });
        }
      }

      if (fromDate && toDate && fromDate >= toDate) {
        return res.status(400).json({ error: 'Invalid date range: "from" must be before "to"' });
      }

      const where: any = {
        device: {
          bessAsset: targetBessAsset
            ? { id: targetBessAsset.id, siteId: siteId }
            : { siteId: siteId }
        },
        status: { in: ['CLEARED', 'ACKNOWLEDGED'] }
      };

      if (fromDate || toDate) {
        where.createdAt = {};
        if (fromDate) where.createdAt.gte = fromDate;
        if (toDate) where.createdAt.lt = toDate;
      }

      // Predictable filename: alarms-history-[bessName-]YYYY-MM-DD-to-YYYY-MM-DD.csv
      const startStr = (startDate as string) || (fromDate ? fromDate.toISOString().split('T')[0] : 'all');
      const endStr = (endDate as string) || (toDate ? toDate.toISOString().split('T')[0] : 'all');
      const sanitizedBess = targetBessAsset
        ? targetBessAsset.name.toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '')
        : null;
      const filename = sanitizedBess
        ? `alarms-history-${sanitizedBess}-${startStr}-to-${endStr}.csv`
        : `alarms-history-${startStr}-to-${endStr}.csv`;

      // Set response headers
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

      // Write UTF-8 BOM for Microsoft Excel compatibility
      res.write('\uFEFF');

      // Column headers
      const headers = [
        'Event Timestamp',
        'Severity',
        'Event Description',
        'Signal Identifier',
        'Client Name',
        'Site Name',
        'BESS Name',
        'EMU ID',
        'Device',
        'Status'
      ];
      res.write(formatCsvRow(headers));

      // Fetch all matching records without pagination limit
      const alarms = await prisma.alarm.findMany({
        where,
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
        ]
      });

      for (const alarm of alarms) {
        const row = [
          formatSiteTimestamp(alarm.createdAt, siteTimezone),
          alarm.severity,
          alarm.message,
          alarm.faultCode || '',
          site.client?.name || '',
          site.name || '',
          alarm.device?.bessAsset?.name || '',
          alarm.device?.bessAsset?.emuId || '',
          alarm.device?.name || alarm.device?.type || '',
          alarm.status
        ];
        res.write(formatCsvRow(row, true));
      }

      res.end();
    } catch (error) {
      console.error('[AlarmController] Error exporting site alarms:', error);
      if (!res.headersSent) {
        res.status(500).json({ error: 'Internal server error' });
      } else {
        res.end();
      }
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

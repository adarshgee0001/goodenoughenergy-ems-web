import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import ExcelJS from 'exceljs';
import app from '../../src/app';
import { prisma } from '../../src/db/prisma';
import http from 'http';
import { authService } from '../../src/services/auth.service';

function generateToken(user: any) {
  return authService.generateToken({ userId: user.id, role: user.role });
}

describe('Report Interval Safeguards Integration Tests', () => {
  let server: http.Server;
  let baseUrl: string;
  let adminToken: string;
  let clientToken: string;
  let client: any;
  let clientUser: any;
  let adminUser: any;
  let site: any;
  let bess1: any;
  let bess2: any;

  beforeAll(async () => {
    server = http.createServer(app);
    await new Promise<void>((resolve) => server.listen(0, () => resolve()));
    const port = (server.address() as any).port;
    baseUrl = `http://localhost:${port}/api`;

    // Clean up test data if lingering
    await prisma.telemetryHistory.deleteMany();
    await prisma.device.deleteMany({ where: { bessAsset: { site: { name: 'Interval Safeguards Site' } } } });
    await prisma.bESSAsset.deleteMany({ where: { site: { name: 'Interval Safeguards Site' } } });
    await prisma.site.deleteMany({ where: { name: 'Interval Safeguards Site' } });
    await prisma.user.deleteMany({ where: { email: { in: ['interval-admin@example.com', 'interval-client@example.com'] } } });
    await prisma.client.deleteMany({ where: { name: 'Interval Safeguards Client' } });

    adminUser = await prisma.user.create({
      data: {
        email: 'interval-admin@example.com',
        name: 'Interval Admin',
        passwordHash: 'hash',
        role: 'ADMIN',
      },
    });
    adminToken = generateToken(adminUser);

    client = await prisma.client.create({
      data: { name: 'Interval Safeguards Client' },
    });

    clientUser = await prisma.user.create({
      data: {
        email: 'interval-client@example.com',
        name: 'Interval Client User',
        passwordHash: 'hash',
        role: 'CLIENT',
        clientAccess: {
          create: {
            clientId: client.id,
          },
        },
      },
    });
    clientToken = generateToken(clientUser);

    site = await prisma.site.create({
      data: {
        name: 'Interval Safeguards Site',
        clientId: client.id,
        timezone: 'Asia/Kolkata',
      },
    });

    bess1 = await prisma.bESSAsset.create({
      data: {
        name: 'BESS Safeguard 1',
        assetIdentifier: 'BESS-SG-01',
        emuId: 'EMU-SG-01',
        mqttTopic: '/test/sg01',
        siteId: site.id,
      },
    });

    bess2 = await prisma.bESSAsset.create({
      data: {
        name: 'BESS Safeguard 2',
        assetIdentifier: 'BESS-SG-02',
        emuId: 'EMU-SG-02',
        mqttTopic: '/test/sg02',
        siteId: site.id,
      },
    });
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await prisma.telemetryHistory.deleteMany();
    await prisma.device.deleteMany({ where: { bessAsset: { siteId: site.id } } });
    await prisma.bESSAsset.deleteMany({ where: { siteId: site.id } });
    await prisma.site.deleteMany({ where: { id: site.id } });
    await prisma.user.deleteMany({ where: { id: { in: [adminUser.id, clientUser.id] } } });
    await prisma.client.deleteMany({ where: { id: client.id } });
  });

  describe('1. Persistence and Default Value', () => {
    it('defaults reportIntervalMinutes to 15 when created without interval', async () => {
      const asset = await prisma.bESSAsset.findUnique({ where: { id: bess1.id } });
      expect(asset).not.toBeNull();
      expect(asset?.reportIntervalMinutes).toBe(15);
    });
  });

  describe('2. Validation of Range and Integer Constraint (1 - 20)', () => {
    it('rejects interval < 1 with 400 Bad Request', async () => {
      const res = await fetch(`${baseUrl}/bess/${bess1.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Cookie: `auth_token=${adminToken}`,
        },
        body: JSON.stringify({ reportIntervalMinutes: 0 }),
      });
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.message).toMatch(/integer between 1 and 20/i);
    });

    it('rejects interval > 20 with 400 Bad Request', async () => {
      const res = await fetch(`${baseUrl}/bess/${bess1.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Cookie: `auth_token=${adminToken}`,
        },
        body: JSON.stringify({ reportIntervalMinutes: 21 }),
      });
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.message).toMatch(/integer between 1 and 20/i);
    });

    it('rejects non-integer interval with 400 Bad Request', async () => {
      const res = await fetch(`${baseUrl}/bess/${bess1.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Cookie: `auth_token=${adminToken}`,
        },
        body: JSON.stringify({ reportIntervalMinutes: 7.5 }),
      });
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.message).toMatch(/integer between 1 and 20/i);
    });

    it('rejects non-numeric interval with 400 Bad Request', async () => {
      const res = await fetch(`${baseUrl}/bess/${bess1.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Cookie: `auth_token=${adminToken}`,
        },
        body: JSON.stringify({ reportIntervalMinutes: 'twenty' }),
      });
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.message).toMatch(/integer between 1 and 20/i);
    });

    it('accepts boundary values 1 and 20', async () => {
      // Test 1
      const res1 = await fetch(`${baseUrl}/bess/${bess1.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Cookie: `auth_token=${adminToken}`,
        },
        body: JSON.stringify({ reportIntervalMinutes: 1 }),
      });
      expect(res1.status).toBe(200);

      // Test 20
      const res20 = await fetch(`${baseUrl}/bess/${bess1.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Cookie: `auth_token=${adminToken}`,
        },
        body: JSON.stringify({ reportIntervalMinutes: 20 }),
      });
      expect(res20.status).toBe(200);
    });
  });

  describe('3. Authorization Safeguards & Backward Compatibility', () => {
    it('returns 403 Forbidden when a Client user attempts to update reportIntervalMinutes', async () => {
      const res = await fetch(`${baseUrl}/bess/${bess1.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Cookie: `auth_token=${clientToken}`,
        },
        body: JSON.stringify({ reportIntervalMinutes: 10 }),
      });
      expect(res.status).toBe(403);
      const data = await res.json();
      expect(data.message).toMatch(/Admin access required/i);
    });

    it('returns 403 Forbidden when a Client user attempts to create a BESS with reportIntervalMinutes', async () => {
      const res = await fetch(`${baseUrl}/sites/${site.id}/bess`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: `auth_token=${clientToken}`,
        },
        body: JSON.stringify({
          name: 'Unauthorized BESS',
          assetIdentifier: 'UNAUTH-BESS',
          emuId: 'EMU-UNAUTH',
          mqttTopic: '/test/unauth',
          reportIntervalMinutes: 10,
        }),
      });
      expect(res.status).toBe(403);
      const data = await res.json();
      expect(data.message).toMatch(/Admin access required/i);
    });

    it('preserves existing authorized BESS update workflows when reportIntervalMinutes is omitted', async () => {
      // Updating basic fields without interval should succeed for authorized callers
      const res = await fetch(`${baseUrl}/bess/${bess1.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Cookie: `auth_token=${adminToken}`,
        },
        body: JSON.stringify({
          name: 'BESS Safeguard 1 Renamed',
          powerRating: 250,
        }),
      });
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.asset.name).toBe('BESS Safeguard 1 Renamed');
    });
  });

  describe('4. Site-Wide Common Interval Synchronization', () => {
    it('synchronizes all existing BESS assets on the same site when one asset interval is updated', async () => {
      // Update bess1 to 7 min
      const res = await fetch(`${baseUrl}/bess/${bess1.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Cookie: `auth_token=${adminToken}`,
        },
        body: JSON.stringify({ reportIntervalMinutes: 7 }),
      });
      expect(res.status).toBe(200);

      // Verify in database that BOTH bess1 and bess2 have reportIntervalMinutes === 7
      const updatedBess1 = await prisma.bESSAsset.findUnique({ where: { id: bess1.id } });
      const updatedBess2 = await prisma.bESSAsset.findUnique({ where: { id: bess2.id } });
      expect(updatedBess1?.reportIntervalMinutes).toBe(7);
      expect(updatedBess2?.reportIntervalMinutes).toBe(7);
    });

    it('inherits the site common interval when creating a new BESS without interval parameter', async () => {
      // The site is currently at 7 min
      const res = await fetch(`${baseUrl}/sites/${site.id}/bess`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: `auth_token=${adminToken}`,
        },
        body: JSON.stringify({
          name: 'BESS Safeguard 3 Inherited',
          assetIdentifier: 'BESS-SG-03',
          emuId: 'EMU-SG-03',
          mqttTopic: '/test/sg03',
        }),
      });
      expect(res.status).toBe(201);
      const data = await res.json();
      expect(data.asset.reportIntervalMinutes).toBe(7);

      // Verify in DB
      const dbAsset = await prisma.bESSAsset.findUnique({ where: { id: data.asset.id } });
      expect(dbAsset?.reportIntervalMinutes).toBe(7);

      // Clean up asset 3
      await prisma.bESSAsset.delete({ where: { id: data.asset.id } });
    });

    it('synchronizes all site assets when creating a new BESS with an explicit interval', async () => {
      const res = await fetch(`${baseUrl}/sites/${site.id}/bess`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: `auth_token=${adminToken}`,
        },
        body: JSON.stringify({
          name: 'BESS Safeguard 4 Explicit',
          assetIdentifier: 'BESS-SG-04',
          emuId: 'EMU-SG-04',
          mqttTopic: '/test/sg04',
          reportIntervalMinutes: 12,
        }),
      });
      expect(res.status).toBe(201);
      const data = await res.json();
      expect(data.asset.reportIntervalMinutes).toBe(12);

      // All sibling assets must now be synchronized to 12
      const allAssets = await prisma.bESSAsset.findMany({ where: { siteId: site.id } });
      expect(allAssets.length).toBe(3);
      for (const asset of allAssets) {
        expect(asset.reportIntervalMinutes).toBe(12);
      }

      // Clean up asset 4
      await prisma.bESSAsset.delete({ where: { id: data.asset.id } });
    });
  });

  describe('5. Authoritative Backend Configuration for Historical Table and Exports', () => {
    beforeAll(async () => {
      // Set site interval to 10 min
      await prisma.bESSAsset.updateMany({
        where: { siteId: site.id },
        data: { reportIntervalMinutes: 10 },
      });

      // Create devices and telemetry data at 5-minute intervals
      const dev1 = await prisma.device.create({
        data: {
          componentId: 'pcs-sg-1',
          name: 'PCS SG 1',
          type: 'PCS',
          bessAssetId: bess1.id,
        },
      });

      // Insert timestamps: 10:00, 10:05, 10:10, 10:15
      const baseTime = new Date('2026-09-01T10:00:00.000Z');
      for (let i = 0; i < 4; i++) {
        const time = new Date(baseTime.getTime() + i * 5 * 60 * 1000);
        await prisma.telemetryHistory.create({
          data: {
            deviceId: dev1.id,
            timestamp: time,
            gridSideLoad: 100 + i * 10,
            rawPayload: {},
          },
        });
      }
    });

    it('dynamic-report ignores client-supplied intervalMinutes and enforces the database-configured 10 min', async () => {
      // Client tries to request 5 min intervals
      const res = await fetch(
        `${baseUrl}/sites/${site.id}/telemetry/dynamic-report?intervalMinutes=5&from=2026-09-01T09:59:00.000Z&to=2026-09-01T10:20:00.000Z`,
        {
          headers: { Cookie: `auth_token=${clientToken}` },
        }
      );
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      // With 10-minute buckets: [10:00, 10:10] -> exactly 2 bucket snapshots, NOT 4 (which would be 5-min buckets)
      expect(data.data.intervalMinutes).toBe(10);
      expect(data.data.snapshots.length).toBe(2);
      expect(new Date(data.data.snapshots[0].bucketTimestamp).toISOString()).toBe('2026-09-01T10:10:00.000Z');
      expect(new Date(data.data.snapshots[1].bucketTimestamp).toISOString()).toBe('2026-09-01T10:00:00.000Z');
    });

    it('export ignores client-supplied intervalMinutes and enforces the database-configured 10 min', async () => {
      // Client requests export with intervalMinutes=1
      const res = await fetch(
        `${baseUrl}/sites/${site.id}/telemetry/export?intervalMinutes=1&from=2026-09-01T09:59:00.000Z&to=2026-09-01T10:20:00.000Z`,
        {
          headers: { Cookie: `auth_token=${clientToken}` },
        }
      );
      expect(res.status).toBe(200);
      expect(res.headers.get('content-type')).toBe('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      expect(res.headers.get('content-disposition')).toContain('.xlsx');

      const buffer = await res.arrayBuffer();
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(Buffer.from(buffer));

      expect(workbook.getWorksheet('Per-BESS Details')).toBeUndefined();
      const perBessSheet = workbook.getWorksheet('BESS Safeguard 1 Renamed');
      expect(perBessSheet).toBeDefined();

      // Count occurrences of 'BESS Safeguard 1' in BESS Safeguard 1 data rows (Column 2 is BESS Name)
      let bessRecordsCount = 0;
      perBessSheet?.eachRow((row, rowNumber) => {
        if (rowNumber > 12 && String(row.getCell(2).value || '').includes('BESS Safeguard 1')) {
          bessRecordsCount++;
        }
      });
      // 10-minute buckets over 4 telemetry points at 5-min intervals produce exactly 2 data rows
      expect(bessRecordsCount).toBe(2);
    });
  });
});

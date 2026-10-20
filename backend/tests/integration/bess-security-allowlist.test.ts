import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import app from '../../src/app';
import { prisma } from '../../src/db/prisma';
import http from 'http';
import { authService } from '../../src/services/auth.service';

function generateToken(user: any) {
  return authService.generateToken({ userId: user.id, role: user.role });
}

describe('BESS Security Allowlist Integration Tests', () => {
  let server: http.Server;
  let baseUrl: string;
  let adminToken: string;
  let clientToken: string;
  let unassignedClientToken: string;
  let client: any;
  let otherClient: any;
  let clientUser: any;
  let unassignedUser: any;
  let adminUser: any;
  let site: any;
  let bess: any;

  beforeAll(async () => {
    server = http.createServer(app);
    await new Promise<void>((resolve) => server.listen(0, () => resolve()));
    const port = (server.address() as any).port;
    baseUrl = `http://localhost:${port}/api`;

    // Clean up test data if lingering
    await prisma.bESSAsset.deleteMany({ where: { assetIdentifier: { in: ['SEC-BESS-01', 'SEC-BESS-ADMIN'] } } });
    await prisma.site.deleteMany({ where: { name: 'BESS Security Test Site' } });
    await prisma.user.deleteMany({ where: { email: { in: ['sec-admin@example.com', 'sec-client@example.com', 'sec-unassigned@example.com'] } } });
    await prisma.client.deleteMany({ where: { name: { in: ['BESS Security Test Client', 'BESS Security Other Client'] } } });

    adminUser = await prisma.user.create({
      data: {
        email: 'sec-admin@example.com',
        name: 'Sec Admin',
        passwordHash: 'hash',
        role: 'ADMIN',
      },
    });
    adminToken = generateToken(adminUser);

    client = await prisma.client.create({
      data: { name: 'BESS Security Test Client' },
    });

    otherClient = await prisma.client.create({
      data: { name: 'BESS Security Other Client' },
    });

    clientUser = await prisma.user.create({
      data: {
        email: 'sec-client@example.com',
        name: 'Sec Client User',
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

    unassignedUser = await prisma.user.create({
      data: {
        email: 'sec-unassigned@example.com',
        name: 'Sec Unassigned User',
        passwordHash: 'hash',
        role: 'CLIENT',
        clientAccess: {
          create: {
            clientId: otherClient.id,
          },
        },
      },
    });
    unassignedClientToken = generateToken(unassignedUser);

    site = await prisma.site.create({
      data: {
        name: 'BESS Security Test Site',
        clientId: client.id,
        timezone: 'Asia/Kolkata',
      },
    });

    bess = await prisma.bESSAsset.create({
      data: {
        name: 'Security Test BESS',
        assetIdentifier: 'SEC-BESS-01',
        emuId: 'EMU-SEC-01',
        model: 'GEE-LFP-500',
        energyCapacity: 500,
        powerRating: 250,
        mqttTopic: '/ems/sec-test-bess',
        reportIntervalMinutes: 15,
        siteId: site.id,
      },
    });
  });

  afterAll(async () => {
    await prisma.bESSAsset.deleteMany({ where: { assetIdentifier: { in: ['SEC-BESS-01', 'SEC-BESS-ADMIN'] } } });
    await prisma.site.deleteMany({ where: { name: 'BESS Security Test Site' } });
    await prisma.user.deleteMany({ where: { email: { in: ['sec-admin@example.com', 'sec-client@example.com', 'sec-unassigned@example.com'] } } });
    await prisma.client.deleteMany({ where: { name: { in: ['BESS Security Test Client', 'BESS Security Other Client'] } } });

    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  describe('1. Non-Admin (CLIENT) Attempts to Update Restricted Commissioning Fields', () => {
    it('rejects client attempt to update mqttTopic with 403 Forbidden', async () => {
      const res = await fetch(`${baseUrl}/bess/${bess.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Cookie: `auth_token=${clientToken}`,
        },
        body: JSON.stringify({ mqttTopic: '/hacked/topic' }),
      });
      expect(res.status).toBe(403);
      const data = await res.json();
      expect(data.message).toMatch(/Admin access required to modify BESS commissioning parameters/i);

      // Verify DB unchanged
      const current = await prisma.bESSAsset.findUnique({ where: { id: bess.id } });
      expect(current?.mqttTopic).toBe('/ems/sec-test-bess');
    });

    it('rejects client attempt to update emuId with 403 Forbidden', async () => {
      const res = await fetch(`${baseUrl}/bess/${bess.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Cookie: `auth_token=${clientToken}`,
        },
        body: JSON.stringify({ emuId: 'EMU-MALICIOUS' }),
      });
      expect(res.status).toBe(403);
      const data = await res.json();
      expect(data.message).toMatch(/Admin access required to modify BESS commissioning parameters/i);

      const current = await prisma.bESSAsset.findUnique({ where: { id: bess.id } });
      expect(current?.emuId).toBe('EMU-SEC-01');
    });

    it('rejects client attempt to update assetIdentifier with 403 Forbidden', async () => {
      const res = await fetch(`${baseUrl}/bess/${bess.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Cookie: `auth_token=${clientToken}`,
        },
        body: JSON.stringify({ assetIdentifier: 'HIJACKED-ID' }),
      });
      expect(res.status).toBe(403);
      const data = await res.json();
      expect(data.message).toMatch(/Admin access required to modify BESS commissioning parameters/i);
    });

    it('rejects client attempt to update model with 403 Forbidden', async () => {
      const res = await fetch(`${baseUrl}/bess/${bess.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Cookie: `auth_token=${clientToken}`,
        },
        body: JSON.stringify({ model: 'FAKE-MODEL' }),
      });
      expect(res.status).toBe(403);
      const data = await res.json();
      expect(data.message).toMatch(/Admin access required to modify BESS commissioning parameters/i);
    });

    it('rejects client attempt to update powerRating with 403 Forbidden', async () => {
      const res = await fetch(`${baseUrl}/bess/${bess.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Cookie: `auth_token=${clientToken}`,
        },
        body: JSON.stringify({ powerRating: 9999 }),
      });
      expect(res.status).toBe(403);
      const data = await res.json();
      expect(data.message).toMatch(/Admin access required to modify BESS commissioning parameters/i);
    });

    it('rejects client attempt to update energyCapacity with 403 Forbidden', async () => {
      const res = await fetch(`${baseUrl}/bess/${bess.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Cookie: `auth_token=${clientToken}`,
        },
        body: JSON.stringify({ energyCapacity: 9999 }),
      });
      expect(res.status).toBe(403);
      const data = await res.json();
      expect(data.message).toMatch(/Admin access required to modify BESS commissioning parameters/i);
    });

    it('rejects client attempt to update reportIntervalMinutes with 403 Forbidden', async () => {
      const res = await fetch(`${baseUrl}/bess/${bess.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Cookie: `auth_token=${clientToken}`,
        },
        body: JSON.stringify({ reportIntervalMinutes: 5 }),
      });
      expect(res.status).toBe(403);
      const data = await res.json();
      expect(data.message).toMatch(/Admin access required to modify BESS commissioning parameters/i);
    });

    it('rejects client attempt to re-parent siteId with 403 Forbidden', async () => {
      const res = await fetch(`${baseUrl}/bess/${bess.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Cookie: `auth_token=${clientToken}`,
        },
        body: JSON.stringify({ siteId: 'other-site-id' }),
      });
      expect(res.status).toBe(403);
      const data = await res.json();
      expect(data.message).toMatch(/Admin access required to modify BESS commissioning parameters/i);
    });
  });

  describe('2. Client Mixed Requests and Name-Only Requests', () => {
    it('rejects client mixed request (name + restricted field) with 403 Forbidden', async () => {
      const res = await fetch(`${baseUrl}/bess/${bess.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Cookie: `auth_token=${clientToken}`,
        },
        body: JSON.stringify({
          name: 'Client Attempted Rename',
          mqttTopic: '/malicious/topic',
        }),
      });
      expect(res.status).toBe(403);
      const data = await res.json();
      expect(data.message).toMatch(/Admin access required to modify BESS commissioning parameters/i);

      // Verify name was NOT updated
      const current = await prisma.bESSAsset.findUnique({ where: { id: bess.id } });
      expect(current?.name).toBe('Security Test BESS');
      expect(current?.mqttTopic).toBe('/ems/sec-test-bess');
    });

    it('rejects client name-only update with 403 Forbidden under current policy', async () => {
      const res = await fetch(`${baseUrl}/bess/${bess.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Cookie: `auth_token=${clientToken}`,
        },
        body: JSON.stringify({ name: 'Unauthorized Name' }),
      });
      expect(res.status).toBe(403);
      const data = await res.json();
      expect(data.message).toMatch(/Admin access required to update BESS assets/i);
    });
  });

  describe('3. Authorized Admin Workflows and Existing Checks', () => {
    it('allows Admin to update name and powerRating', async () => {
      const res = await fetch(`${baseUrl}/bess/${bess.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Cookie: `auth_token=${adminToken}`,
        },
        body: JSON.stringify({
          name: 'Security Test BESS (Admin Renamed)',
          powerRating: 300,
        }),
      });
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.asset.name).toBe('Security Test BESS (Admin Renamed)');
      expect(data.asset.powerRating).toBe(300);
    });

    it('rejects unauthenticated requests with 401 Authentication required', async () => {
      const res = await fetch(`${baseUrl}/bess/${bess.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ name: 'No Token' }),
      });
      expect(res.status).toBe(401);
    });

    it('rejects client users from different organization with 403 Access to BESS asset denied', async () => {
      const res = await fetch(`${baseUrl}/bess/${bess.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Cookie: `auth_token=${unassignedClientToken}`,
        },
        body: JSON.stringify({ name: 'Cross-Tenant Attempt' }),
      });
      expect(res.status).toBe(403);
      const data = await res.json();
      expect(data.message).toMatch(/Access to BESS asset denied/i);
    });

    it('returns 404 for non-existent BESS ID', async () => {
      const res = await fetch(`${baseUrl}/bess/non-existent-uuid`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Cookie: `auth_token=${adminToken}`,
        },
        body: JSON.stringify({ name: 'Ghost' }),
      });
      expect(res.status).toBe(404);
    });

    it('rejects non-admin attempt to delete BESS asset with 403 Forbidden', async () => {
      const res = await fetch(`${baseUrl}/bess/${bess.id}`, {
        method: 'DELETE',
        headers: {
          Cookie: `auth_token=${clientToken}`,
        },
      });
      expect(res.status).toBe(403);
      const data = await res.json();
      expect(data.message).toMatch(/Admin access required to delete BESS assets/i);
    });
  });
});

import { PrismaClient } from '@prisma/client';
import app from './src/app';
import http from 'http';
import { authService } from './src/services/auth.service';

const prisma = new PrismaClient();

const runTests = async () => {
  console.log('Starting Telemetry API Tests...');
  let exitCode = 0;

  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, () => resolve()));
  const port = (server.address() as any).port;
  const baseUrl = `http://localhost:${port}/api`;

  let deviceId = '';
  let siteId = '';
  let adminToken = '';
  let clientToken = '';
  let otherToken = '';
  let adminUser: any;
  let clientUser: any;
  let otherUser: any;
  let clientRecord: any;
  let siteRecord: any;
  let bessRecord: any;

  try {
    // 1. Setup Test Data
    adminUser = await prisma.user.create({
      data: { name: 'Admin', email: 'admin.telemetry@example.com', passwordHash: 'hash', role: 'ADMIN' }
    });
    
    clientUser = await prisma.user.create({
      data: { name: 'Client User', email: 'client.telemetry@example.com', passwordHash: 'hash', role: 'CLIENT' }
    });
    
    otherUser = await prisma.user.create({
      data: { name: 'Other User', email: 'other.telemetry@example.com', passwordHash: 'hash', role: 'CLIENT' }
    });

    clientRecord = await prisma.client.create({ data: { name: 'TelemetryClient' } });
    
    await prisma.userClientAccess.create({
      data: { userId: clientUser.id, clientId: clientRecord.id }
    });

    siteRecord = await prisma.site.create({ data: { name: 'TelemetrySite', clientId: clientRecord.id } });
    bessRecord = await prisma.bESSAsset.create({ data: { name: 'TelemetryBESS', assetIdentifier: 'TBESS1', siteId: siteRecord.id } });
    
    const device = await prisma.device.create({
      data: { type: 'BMS', name: 'TelemetryDevice', emuId: '111', componentId: 'test', bessAssetId: bessRecord.id }
    });
    deviceId = device.id;
    siteId = siteRecord.id;

    const t1 = new Date('2026-09-01T10:00:00Z');
    const t2 = new Date('2026-09-01T11:00:00Z');

    await prisma.telemetryHistory.create({
      data: { deviceId: device.id, timestamp: t1, gridSideLoad: 100, rawPayload: { a: 1 } }
    });
    await prisma.telemetryHistory.create({
      data: { deviceId: device.id, timestamp: t2, gridSideLoad: 200, rawPayload: { a: 2 } }
    });

    adminToken = authService.generateToken({ userId: adminUser.id, role: adminUser.role });
    clientToken = authService.generateToken({ userId: clientUser.id, role: clientUser.role });
    otherToken = authService.generateToken({ userId: otherUser.id, role: otherUser.role });

    // 2. Tests
    let res = await fetch(`${baseUrl}/sites/${siteId}/telemetry`, {
      headers: { 'Authorization': `Bearer ${clientToken}` }
    });
    let body = await res.json();
    if (res.status === 200 && body.data.length === 2 && body.data[0].gridSideLoad === 100) {
      console.log('✅ PASS: Authorized client fetches telemetry');
    } else {
      console.error('❌ FAIL: Authorized client fetches telemetry', body);
      exitCode = 1;
    }

    res = await fetch(`${baseUrl}/sites/${siteId}/telemetry`, {
      headers: { 'Authorization': `Bearer ${otherToken}` }
    });
    if (res.status === 403) {
      console.log('✅ PASS: Unauthorized client receives 403');
    } else {
      console.error('❌ FAIL: Unauthorized client receives 403', res.status);
      exitCode = 1;
    }

    res = await fetch(`${baseUrl}/sites/${siteId}/telemetry?startDate=2026-09-01T10:30:00Z`, {
      headers: { 'Authorization': `Bearer ${adminToken}` }
    });
    body = await res.json();
    if (res.status === 200 && body.data.length === 1 && body.data[0].gridSideLoad === 200) {
      console.log('✅ PASS: Admin fetches telemetry with startDate filter');
    } else {
      console.error('❌ FAIL: Admin fetches telemetry with startDate filter', body);
      exitCode = 1;
    }

    res = await fetch(`${baseUrl}/sites/${siteId}/telemetry?startDate=invalid`, {
      headers: { 'Authorization': `Bearer ${adminToken}` }
    });
    if (res.status === 400) {
      console.log('✅ PASS: Invalid date format returns 400');
    } else {
      console.error('❌ FAIL: Invalid date format returns 400', res.status);
      exitCode = 1;
    }

    // Latest Telemetry Tests
    res = await fetch(`${baseUrl}/sites/${siteId}/telemetry/latest`, {
      headers: { 'Authorization': `Bearer ${clientToken}` }
    });
    body = await res.json();
    // Since there is only one device, we expect exactly 1 row returned, and it should be the latest one (t2, gridSideLoad 200)
    if (res.status === 200 && body.data.length === 1 && body.data[0].gridSideLoad === 200) {
      console.log('✅ PASS: Authorized client fetches latest telemetry successfully');
    } else {
      console.error('❌ FAIL: Authorized client fetches latest telemetry', body);
      exitCode = 1;
    }

    res = await fetch(`${baseUrl}/sites/${siteId}/telemetry/latest`, {
      headers: { 'Authorization': `Bearer ${otherToken}` }
    });
    if (res.status === 403) {
      console.log('✅ PASS: Unauthorized client receives 403 for latest telemetry');
    } else {
      console.error('❌ FAIL: Unauthorized client receives 403 for latest telemetry', res.status);
      exitCode = 1;
    }

  } catch (e) {
    console.error('❌ FAIL: Exception during tests', e);
    exitCode = 1;
  } finally {
    // Cleanup
    if (deviceId) await prisma.telemetryHistory.deleteMany({ where: { deviceId } });
    if (deviceId) await prisma.device.delete({ where: { id: deviceId } });
    if (bessRecord) await prisma.bESSAsset.delete({ where: { id: bessRecord.id } });
    if (siteRecord) await prisma.site.delete({ where: { id: siteRecord.id } });
    if (clientRecord) await prisma.userClientAccess.deleteMany({ where: { clientId: clientRecord.id } });
    if (clientRecord) await prisma.client.delete({ where: { id: clientRecord.id } });
    if (adminUser) await prisma.user.deleteMany({ where: { email: { in: [adminUser.email, clientUser.email, otherUser.email] } } });
    
    server.close();
  }

  process.exit(exitCode);
};

runTests();

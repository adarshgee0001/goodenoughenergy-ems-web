import { setMockPrisma as setMockPrismaClient } from './src/controllers/client.controller';
import { setMockPrisma as setMockPrismaSite } from './src/controllers/site.controller';
import { setMockPrisma as setMockPrismaBess } from './src/controllers/bess.controller';
import { setMockPrisma as setMockPrismaDevice } from './src/controllers/device.controller';
import { setMockPrisma as setMockPrismaAuthz } from './src/services/authorization.service';
import { setMockPrisma as setMockPrismaAuth } from './src/middleware/auth.middleware';
import app from './src/app';
import http from 'http';
import { authService } from './src/services/auth.service';

const runTests = async () => {
  console.log('Starting Phase 10 Asset Tests...');
  let passed = 0;
  let failed = 0;

  const assert = (condition: boolean, testName: string) => {
    if (condition) {
      console.log(`✅ PASS: ${testName}`);
      passed++;
    } else {
      console.error(`❌ FAIL: ${testName}`);
      failed++;
    }
  };

  // Mock Data
  const mockClients = [{ id: 'client-A' }, { id: 'client-B' }];
  const mockSites = [{ id: 'site-A', clientId: 'client-A' }, { id: 'site-B', clientId: 'client-B' }];
  const mockBess = [{ id: 'bess-A', siteId: 'site-A' }, { id: 'bess-B', siteId: 'site-B' }];
  const mockDevices = [{ id: 'device-A', bessAssetId: 'bess-A' }, { id: 'device-B', bessAssetId: 'bess-B' }];

  const mockPrisma = {
    client: {
      findUnique: async (args: any) => mockClients.find(c => c.id === args.where.id),
      findMany: async () => mockClients,
      create: async (args: any) => ({ id: 'new-client', ...args.data })
    },
    site: {
      findUnique: async (args: any) => mockSites.find(s => s.id === args.where.id),
      create: async (args: any) => ({ id: 'new-site', ...args.data }),
      update: async (args: any) => ({ ...mockSites.find(s => s.id === args.where.id), ...args.data })
    },
    bESSAsset: {
      findUnique: async (args: any) => mockBess.find(b => b.id === args.where.id),
      create: async (args: any) => ({ id: 'new-bess', ...args.data }),
      update: async (args: any) => ({ ...mockBess.find(b => b.id === args.where.id), ...args.data })
    },
    device: {
      findUnique: async (args: any) => mockDevices.find(d => d.id === args.where.id),
      create: async (args: any) => ({ id: 'new-device', ...args.data }),
      update: async (args: any) => ({ ...mockDevices.find(d => d.id === args.where.id), ...args.data })
    },
    userClientAccess: {
      findFirst: async (args: any) => {
        const { userId, clientId } = args.where;
        if (userId === 'user-A' && clientId === 'client-A') return { id: 'mock' };
        if (userId === 'dist-A' && clientId === 'client-A') return { id: 'mock' };
        return null;
      },
      findMany: async (args: any) => {
        if (args.where.userId === 'user-A') return [{ client: mockClients[0] }];
        return [];
      }
    },
    user: {
      findUnique: async (args: any) => {
        if (args.where.id === 'user-A') return { id: 'user-A', role: 'CLIENT' };
        if (args.where.id === 'admin') return { id: 'admin', role: 'ADMIN' };
        if (args.where.id === 'dist-A') return { id: 'dist-A', role: 'DISTRIBUTOR' };
        return null;
      }
    }
  };

  const resolvers = {
    siteResolver: async (id: string) => mockSites.find(s => s.id === id)?.clientId,
    bessResolver: async (id: string) => {
      const b = mockBess.find(x => x.id === id);
      return b ? mockSites.find(s => s.id === b.siteId)?.clientId : null;
    },
    deviceResolver: async (id: string) => {
      const d = mockDevices.find(x => x.id === id);
      if (!d) return null;
      const b = mockBess.find(x => x.id === d.bessAssetId);
      return b ? mockSites.find(s => s.id === b.siteId)?.clientId : null;
    }
  };

  // Inject mocks
  setMockPrismaClient(mockPrisma);
  setMockPrismaSite({ ...mockPrisma, ...resolvers });
  setMockPrismaBess({ ...mockPrisma, ...resolvers });
  setMockPrismaDevice({ ...mockPrisma, ...resolvers });
  setMockPrismaAuthz(mockPrisma);
  setMockPrismaAuth(mockPrisma);

  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, () => resolve()));
  const port = (server.address() as any).port;
  const baseUrl = `http://localhost:${port}/api`;

  const getHeaders = (userId: string, role: string) => ({
    'Authorization': `Bearer ${authService.generateToken({ userId, role })}`,
    'Content-Type': 'application/json'
  });

  try {
    const adminHeaders = getHeaders('admin', 'ADMIN');
    const userAHeaders = getHeaders('user-A', 'CLIENT');
    const distAHeaders = getHeaders('dist-A', 'DISTRIBUTOR');

    // --- CLIENT Tests ---
    let res = await fetch(`${baseUrl}/clients/client-A`, { headers: adminHeaders });
    assert(res.status === 200, 'ADMIN -> Client A -> ALLOW');

    res = await fetch(`${baseUrl}/clients/client-A`, { headers: userAHeaders });
    assert(res.status === 200, 'CLIENT assigned -> Client A -> ALLOW');

    res = await fetch(`${baseUrl}/clients/client-B`, { headers: userAHeaders });
    assert(res.status === 403, 'CLIENT unassigned -> Client B -> DENY');

    res = await fetch(`${baseUrl}/clients/client-A`, { headers: distAHeaders });
    assert(res.status === 200, 'DISTRIBUTOR assigned -> Client A -> ALLOW');

    res = await fetch(`${baseUrl}/clients/client-B`, { headers: distAHeaders });
    assert(res.status === 403, 'DISTRIBUTOR unassigned -> Client B -> DENY');

    res = await fetch(`${baseUrl}/clients`, { method: 'POST', headers: userAHeaders, body: JSON.stringify({ name: 'Test' }) });
    assert(res.status === 403, 'CLIENT cannot create client -> DENY');

    // --- DEEP ISOLATION Tests ---
    // User A trying to access A's assets
    res = await fetch(`${baseUrl}/sites/site-A`, { headers: userAHeaders });
    assert(res.status === 200, 'Client A User -> Site A -> ALLOW');

    res = await fetch(`${baseUrl}/bess/bess-A`, { headers: userAHeaders });
    assert(res.status === 200, 'Client A User -> BESS A -> ALLOW');

    res = await fetch(`${baseUrl}/devices/device-A`, { headers: userAHeaders });
    assert(res.status === 200, 'Client A User -> Device A -> ALLOW');

    // User A trying to access B's assets
    res = await fetch(`${baseUrl}/sites/site-B`, { headers: userAHeaders });
    assert(res.status === 403, 'Client A User -> Site B -> DENY');

    res = await fetch(`${baseUrl}/bess/bess-B`, { headers: userAHeaders });
    assert(res.status === 403, 'Client A User -> BESS B -> DENY');

    res = await fetch(`${baseUrl}/devices/device-B`, { headers: userAHeaders });
    assert(res.status === 403, 'Client A User -> Device B -> DENY');

    // Missing assets -> 404
    res = await fetch(`${baseUrl}/sites/site-X`, { headers: userAHeaders });
    assert(res.status === 404, 'Missing Site -> 404');
    
    res = await fetch(`${baseUrl}/bess/bess-X`, { headers: userAHeaders });
    assert(res.status === 404, 'Missing BESS -> 404');

    res = await fetch(`${baseUrl}/devices/device-X`, { headers: userAHeaders });
    assert(res.status === 404, 'Missing Device -> 404');

    // Validation (Create Client with empty name)
    res = await fetch(`${baseUrl}/clients`, { method: 'POST', headers: adminHeaders, body: JSON.stringify({ name: '   ' }) });
    assert(res.status === 400, 'Validation: Empty client name -> 400');

    // Validation (Create Device without DeviceType)
    res = await fetch(`${baseUrl}/bess/bess-A/devices`, { method: 'POST', headers: userAHeaders, body: JSON.stringify({ hardwareId: 'abc' }) });
    assert(res.status === 400, 'Validation: Missing DeviceType -> 400');

    // Validation (Re-parenting Device)
    res = await fetch(`${baseUrl}/devices/device-A`, { method: 'PATCH', headers: userAHeaders, body: JSON.stringify({ bessAssetId: 'bess-B' }) });
    assert(res.status === 400, 'Validation: Attempted Device re-parenting -> 400');

    // --- DEVICE MAPPING TESTS (Phase 14B.2) ---
    // 1. Create Device with valid mapping
    res = await fetch(`${baseUrl}/bess/bess-A/devices`, { 
      method: 'POST', headers: adminHeaders, 
      body: JSON.stringify({ type: 'PCS', emuId: '2412131092', componentId: 'pcs', hardwareId: 'hw-1' }) 
    });
    assert(res.status === 201, 'Device Mapping: Create valid device -> 201');

    // 2. Duplicate mapping
    // Mock prisma create to throw P2002 for composite key
    mockPrisma.device.create = async (args: any) => {
      if (args.data.emuId === '2412131092' && args.data.componentId === 'pcs') {
        const error = new Error() as any;
        error.code = 'P2002';
        error.meta = { target: ['emuId', 'componentId'] };
        throw error;
      }
      if (args.data.hardwareId === 'hw-1') {
        const error = new Error() as any;
        error.code = 'P2002';
        error.meta = { target: ['hardwareId'] };
        throw error;
      }
      return { id: 'new-device', ...args.data };
    };

    res = await fetch(`${baseUrl}/bess/bess-A/devices`, { 
      method: 'POST', headers: adminHeaders, 
      body: JSON.stringify({ type: 'PCS', emuId: '2412131092', componentId: 'pcs' }) 
    });
    assert(res.status === 409, 'Device Mapping: Duplicate composite mapping -> 409');

    // 3. Duplicate hardwareId
    res = await fetch(`${baseUrl}/bess/bess-A/devices`, { 
      method: 'POST', headers: adminHeaders, 
      body: JSON.stringify({ type: 'PCS', emuId: '123', componentId: 'pcs', hardwareId: 'hw-1' }) 
    });
    assert(res.status === 409, 'Device Mapping: Duplicate hardwareId -> 409');

    // 4. Missing emuId
    res = await fetch(`${baseUrl}/bess/bess-A/devices`, { 
      method: 'POST', headers: adminHeaders, 
      body: JSON.stringify({ type: 'PCS', componentId: 'pcs' }) 
    });
    assert(res.status === 400, 'Device Mapping: Missing emuId -> 400');

    // 5. Missing componentId
    res = await fetch(`${baseUrl}/bess/bess-A/devices`, { 
      method: 'POST', headers: adminHeaders, 
      body: JSON.stringify({ type: 'PCS', emuId: '123' }) 
    });
    assert(res.status === 400, 'Device Mapping: Missing componentId -> 400');

    // 6. Whitespace mapping values
    res = await fetch(`${baseUrl}/bess/bess-A/devices`, { 
      method: 'POST', headers: adminHeaders, 
      body: JSON.stringify({ type: 'PCS', emuId: '   ', componentId: 'pcs' }) 
    });
    assert(res.status === 400, 'Device Mapping: Whitespace emuId -> 400');

    // 7. PATCH Tests
    mockPrisma.device.update = async (args: any) => {
      if (args.data.emuId === 'duplicate' && args.data.componentId === 'duplicate') {
        const error = new Error() as any;
        error.code = 'P2002';
        error.meta = { target: ['emuId', 'componentId'] };
        throw error;
      }
      return { ...mockDevices.find(d => d.id === args.where.id), ...args.data };
    };

    // Update emuId and componentId
    res = await fetch(`${baseUrl}/devices/device-A`, { 
      method: 'PATCH', headers: adminHeaders, 
      body: JSON.stringify({ emuId: 'new-emu', componentId: 'new-comp' }) 
    });
    assert(res.status === 200, 'Device Mapping: Update valid mapping -> 200');

    // Empty emuId in PATCH
    res = await fetch(`${baseUrl}/devices/device-A`, { 
      method: 'PATCH', headers: adminHeaders, 
      body: JSON.stringify({ emuId: '   ' }) 
    });
    assert(res.status === 400, 'Device Mapping: Update empty emuId -> 400');

    // Duplicate mapping in PATCH
    res = await fetch(`${baseUrl}/devices/device-A`, { 
      method: 'PATCH', headers: adminHeaders, 
      body: JSON.stringify({ emuId: 'duplicate', componentId: 'duplicate' }) 
    });
    assert(res.status === 409, 'Device Mapping: Update duplicate mapping -> 409');

  } finally {
    server.close();
    console.log(`\nTests complete: ${passed} passed, ${failed} failed.`);
    process.exit(failed > 0 ? 1 : 0);
  }
};

runTests().catch(console.error);

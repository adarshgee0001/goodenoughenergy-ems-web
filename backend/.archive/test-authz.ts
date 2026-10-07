import { authorizationService, setMockPrisma } from './src/services/authorization.service';
import { requireRole } from './src/middleware/role.middleware';
import { requireClientAccess } from './src/middleware/clientAccess.middleware';
import { Request, Response, NextFunction } from 'express';

const runTests = async () => {
  console.log('Starting Phase 9B Authorization Tests...');

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

  // Mock Prisma for authorization.service.ts
  const mockPrisma = {
    userClientAccess: {
      findFirst: async (args: any) => {
        // Force error to test fail-closed
        if (args.where.clientId === 'error-client') throw new Error('DB Error');

        const { userId, clientId } = args.where;
        
        // Mock assignments
        if (userId === 'client-a-user' && clientId === 'client-a') return { id: 'mock-1' };
        if (userId === 'multi-client-user' && (clientId === 'client-a' || clientId === 'client-b')) return { id: 'mock-2' };
        if (userId === 'distributor-assigned' && clientId === 'client-a') return { id: 'mock-3' };

        return null;
      }
    }
  };
  setMockPrisma(mockPrisma);

  try {
    // Test 1 — ADMIN global access
    assert(await authorizationService.canAccessClient('admin-id', 'ADMIN', 'client-a') === true, 'ADMIN global access');

    // Test 2 — CLIENT assigned Client A
    assert(await authorizationService.canAccessClient('client-a-user', 'CLIENT', 'client-a') === true, 'CLIENT assigned Client A');

    // Test 3 — CLIENT unassigned Client B
    assert(await authorizationService.canAccessClient('client-a-user', 'CLIENT', 'client-b') === false, 'CLIENT unassigned Client B');

    // Test 4 — CLIENT assigned to multiple Clients
    assert(await authorizationService.canAccessClient('multi-client-user', 'CLIENT', 'client-a') === true, 'CLIENT multi-client A');
    assert(await authorizationService.canAccessClient('multi-client-user', 'CLIENT', 'client-b') === true, 'CLIENT multi-client B');
    assert(await authorizationService.canAccessClient('multi-client-user', 'CLIENT', 'client-c') === false, 'CLIENT multi-client C (unassigned)');

    // Test 5 — DISTRIBUTOR without explicit access
    assert(await authorizationService.canAccessClient('distributor-unassigned', 'DISTRIBUTOR', 'client-a') === false, 'DISTRIBUTOR without explicit access');

    // Test 6 — DISTRIBUTOR with explicit access
    assert(await authorizationService.canAccessClient('distributor-assigned', 'DISTRIBUTOR', 'client-a') === true, 'DISTRIBUTOR with explicit access');

    // Test 7 — Missing Client ID
    assert(await authorizationService.canAccessClient('client-a-user', 'CLIENT', '') === false, 'Missing Client ID (empty string)');
    assert(await authorizationService.canAccessClient('client-a-user', 'CLIENT', '   ') === false, 'Missing Client ID (whitespace string)');
    assert(await authorizationService.canAccessClient('client-a-user', 'CLIENT', undefined as any) === false, 'Missing Client ID (undefined)');

    // Test 8 — Unknown role
    assert(await authorizationService.canAccessClient('some-user', 'UNKNOWN_ROLE', 'client-a') === false, 'Unknown role');

    // Test 9 — Authorization database failure
    assert(await authorizationService.canAccessClient('client-a-user', 'CLIENT', 'error-client') === false, 'Authorization database failure (fails closed)');

    // ---------------------------------------------------------
    // MIDDLEWARE TESTS
    // ---------------------------------------------------------
    
    // Mock req/res framework
    const executeMiddleware = async (mw: any, reqMock: any) => {
      let statusCode: number | null = null;
      let nextCalled = false;

      const resMock = {
        status: (code: number) => { statusCode = code; return { json: () => {} }; }
      };
      
      const nextMock = () => { nextCalled = true; };

      await mw(reqMock as Request, resMock as Response, nextMock as NextFunction);
      return { statusCode, nextCalled };
    };

    // Role Middleware: Missing user -> 401
    let mwResult = await executeMiddleware(requireRole('ADMIN'), {});
    assert(mwResult.statusCode === 401 && !mwResult.nextCalled, 'requireRole: Missing req.user -> 401');

    // Role Middleware: Authenticated user + insufficient role -> 403
    mwResult = await executeMiddleware(requireRole('ADMIN'), { user: { role: 'CLIENT' } });
    assert(mwResult.statusCode === 403 && !mwResult.nextCalled, 'requireRole: Authenticated user + insufficient role -> 403');

    // Role Middleware: Authenticated user + sufficient role -> next()
    mwResult = await executeMiddleware(requireRole('ADMIN', 'CLIENT'), { user: { role: 'CLIENT' } });
    assert(mwResult.statusCode === null && mwResult.nextCalled, 'requireRole: Authenticated user + sufficient role -> allow');

    // ClientAccess Middleware: Missing user -> 401
    mwResult = await executeMiddleware(requireClientAccess('clientId'), { params: { clientId: 'client-a' } });
    assert(mwResult.statusCode === 401 && !mwResult.nextCalled, 'requireClientAccess: Missing req.user -> 401');

    // ClientAccess Middleware: Authenticated user + no client access -> 403
    mwResult = await executeMiddleware(requireClientAccess('clientId'), { 
      params: { clientId: 'client-b' }, 
      user: { id: 'client-a-user', role: 'CLIENT' } 
    });
    assert(mwResult.statusCode === 403 && !mwResult.nextCalled, 'requireClientAccess: Authenticated user + no Client access -> 403');

    // ClientAccess Middleware: Authenticated ADMIN -> allowed
    mwResult = await executeMiddleware(requireClientAccess('clientId'), { 
      params: { clientId: 'client-b' }, 
      user: { id: 'admin-id', role: 'ADMIN' } 
    });
    assert(mwResult.statusCode === null && mwResult.nextCalled, 'requireClientAccess: Authenticated ADMIN -> allowed');

  } catch (error) {
    console.error('Test Execution Error:', error);
  } finally {
    console.log(`\nTests complete: ${passed} passed, ${failed} failed.`);
    process.exit(failed > 0 ? 1 : 0);
  }
};

runTests().catch(console.error);

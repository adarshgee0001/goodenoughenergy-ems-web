import bcrypt from 'bcryptjs';
import app from '../../src/app';
import http from 'http';
import { authService } from '../../src/services/auth.service';
import { setMockPrisma as setMockPrismaController } from '../../src/controllers/auth.controller';
import { setMockPrisma as setMockPrismaMiddleware } from '../../src/middleware/auth.middleware';

import { describe, test } from 'vitest';

describe('test-auth.ts', () => {
  test('Runs all checks', async () => {
  console.log('Starting auth tests...');
  
  const plainPassword = 'testpassword123';
  const hashedPassword = await bcrypt.hash(plainPassword, 10);
  
  const testUser = {
    id: '123e4567-e89b-12d3-a456-426614174000',
    email: 'test@example.com',
    passwordHash: hashedPassword,
    name: 'Test User',
    role: 'CLIENT',
    createdAt: new Date(),
    updatedAt: new Date()
  };

  const mockPrisma = {
    user: {
      findUnique: async (args: any) => {
        if (args.where.email === testUser.email) return testUser;
        if (args.where.id === testUser.id) return testUser;
        return null;
      }
    }
  };

  setMockPrismaController(mockPrisma);
  setMockPrismaMiddleware(mockPrisma);

  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, () => resolve()));
  const port = (server.address() as any).port;
  const baseUrl = `http://localhost:${port}/api/auth`;

  

  const assert = (condition: boolean, testName: string, detail?: string) => {
    if (!condition) {
      throw new Error(`FAIL: ${testName}${detail ? ' - ' + detail : ''}`);
    }
  };

  try {
    let res = await fetch(`${baseUrl}/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'test@example.com', password: 'testpassword123' })
    });
    let data = await res.json();
    const setCookieHeader = res.headers.get('set-cookie') || '';
    assert(res.status === 200 && data.success === true && !!data.token, 'valid login returns token');
    assert(setCookieHeader.includes('auth_token='), 'valid login sets auth_token cookie');
    assert(setCookieHeader.includes('HttpOnly'), 'auth_token cookie is HttpOnly');
    
    // Extract token from cookie string or response payload for subsequent tests
    const cookieMatch = setCookieHeader.match(/auth_token=([^;]+)/);
    const validToken = data.token || (cookieMatch ? cookieMatch[1] : '');

    res = await fetch(`${baseUrl}/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'test@example.com', password: 'wrongpassword' })
    });
    data = await res.json();
    assert(res.status === 401 && data.success === false, 'wrong password');

    res = await fetch(`${baseUrl}/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'unknown@example.com', password: 'testpassword123' })
    });
    data = await res.json();
    assert(res.status === 401 && data.success === false, 'unknown email');

    res = await fetch(`${baseUrl}/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'test@example.com' })
    });
    data = await res.json();
    assert(res.status === 400 && data.success === false, 'missing fields');

    res = await fetch(`${baseUrl}/me`, {
      method: 'GET',
      headers: { 'Cookie': `auth_token=${validToken}` }
    });
    data = await res.json();
    assert(res.status === 200 && data.success === true && data.user.email === 'test@example.com', 'valid cookie on /me');

    // Test Authorization Bearer header
    res = await fetch(`${baseUrl}/me`, {
      method: 'GET',
      headers: { 'Authorization': `Bearer ${validToken}` }
    });
    data = await res.json();
    assert(res.status === 200 && data.success === true && data.user.email === 'test@example.com' && !!data.token, 'valid Authorization Bearer header on /me');

    res = await fetch(`${baseUrl}/me`, {
      method: 'GET'
    });
    data = await res.json();
    assert(res.status === 401 && data.success === false, 'missing JWT');

    res = await fetch(`${baseUrl}/me`, {
      method: 'GET',
      headers: { 'Cookie': `auth_token=invalid_token_xyz` }
    });
    data = await res.json();
    assert(res.status === 401 && data.success === false, 'invalid JWT cookie');

    res = await fetch(`${baseUrl}/me`, {
      method: 'GET',
      headers: { 'Authorization': 'Bearer invalid_token_xyz' }
    });
    data = await res.json();
    assert(res.status === 401 && data.success === false, 'invalid Authorization header');

  } finally {
    server.close();
    
    
  }
  });
});

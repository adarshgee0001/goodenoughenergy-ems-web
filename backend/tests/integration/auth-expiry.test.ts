import { describe, test, expect } from 'vitest';
import bcrypt from 'bcryptjs';
import http from 'http';
import jwt from 'jsonwebtoken';
import app from '../../src/app';
import { authService } from '../../src/services/auth.service';
import { setMockPrisma as setMockPrismaController } from '../../src/controllers/auth.controller';
import { setMockPrisma as setMockPrismaMiddleware } from '../../src/middleware/auth.middleware';

describe('24-Hour Auth Expiry and Session Lifecycle Integration Tests', () => {
  test('Enforces absolute session expiry and authoritative expiresAt', async () => {
    const plainPassword = 'securePassword123';
    const hashedPassword = await bcrypt.hash(plainPassword, 10);

    const testUser = {
      id: 'usr-12345-expiry-test',
      email: 'session-expiry@example.com',
      passwordHash: hashedPassword,
      name: 'Expiry Test User',
      role: 'CLIENT',
      forcePasswordChange: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const mockPrisma = {
      user: {
        findUnique: async (args: any) => {
          if (args.where.email === testUser.email || args.where.id === testUser.id) {
            return testUser;
          }
          return null;
        },
      },
    };

    setMockPrismaController(mockPrisma);
    setMockPrismaMiddleware(mockPrisma);

    const server = http.createServer(app);
    await new Promise<void>((resolve) => server.listen(0, () => resolve()));
    const port = (server.address() as any).port;
    const baseUrl = `http://localhost:${port}/api/auth`;

    try {
      // 1. Newly issued JWT has the expected absolute expiry (~24 hours)
      const loginRes = await fetch(`${baseUrl}/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: testUser.email, password: plainPassword }),
      });
      const loginData = await loginRes.json();
      const setCookieHeader = loginRes.headers.get('set-cookie') || '';

      expect(loginRes.status).toBe(200);
      expect(loginData.success).toBe(true);
      expect(loginData.user.email).toBe(testUser.email);
      expect(typeof loginData.expiresAt).toBe('number');

      // Verify expiration is ~24 hours into future
      const now = Date.now();
      const expectedDeadlineMin = now + (23.9 * 60 * 60 * 1000);
      const expectedDeadlineMax = now + (24.1 * 60 * 60 * 1000);
      expect(loginData.expiresAt).toBeGreaterThan(expectedDeadlineMin);
      expect(loginData.expiresAt).toBeLessThan(expectedDeadlineMax);

      // Verify cookie settings
      expect(setCookieHeader).toContain('auth_token=');
      expect(setCookieHeader).toContain('HttpOnly');
      expect(setCookieHeader).toContain('Max-Age=86400'); // 24 hours in seconds

      const cookieMatch = setCookieHeader.match(/auth_token=([^;]+)/);
      const validToken = cookieMatch ? cookieMatch[1] : '';
      const initialExpiresAt = loginData.expiresAt;

      // 2. Valid token accepted on /me and returns the authoritative expiresAt
      const meRes1 = await fetch(`${baseUrl}/me`, {
        method: 'GET',
        headers: { Cookie: `auth_token=${validToken}` },
      });
      const meData1 = await meRes1.json();
      expect(meRes1.status).toBe(200);
      expect(meData1.success).toBe(true);
      expect(meData1.user.id).toBe(testUser.id);
      expect(meData1.expiresAt).toBe(initialExpiresAt);

      // 3. Repeated requests do NOT extend or slide the deadline
      await new Promise((r) => setTimeout(r, 50));
      const meRes2 = await fetch(`${baseUrl}/me`, {
        method: 'GET',
        headers: { Cookie: `auth_token=${validToken}` },
      });
      const meData2 = await meRes2.json();
      expect(meRes2.status).toBe(200);
      expect(meData2.expiresAt).toBe(initialExpiresAt);

      // 4. Expired JWT is rejected with HTTP 401
      const expiredPayload = {
        userId: testUser.id,
        role: testUser.role,
        iat: Math.floor(Date.now() / 1000) - 7200, // 2 hours ago
        exp: Math.floor(Date.now() / 1000) - 3600, // 1 hour ago
      };
      const secret = process.env.JWT_SECRET || 'fallback_secret_do_not_use';
      const expiredToken = jwt.sign(expiredPayload, secret);

      const expiredRes = await fetch(`${baseUrl}/me`, {
        method: 'GET',
        headers: { Cookie: `auth_token=${expiredToken}` },
      });
      expect(expiredRes.status).toBe(401);
      const expiredData = await expiredRes.json();
      expect(expiredData.success).toBe(false);

      // 5. Missing token is rejected with HTTP 401
      const missingRes = await fetch(`${baseUrl}/me`, { method: 'GET' });
      expect(missingRes.status).toBe(401);

      // 6. Logout clears the cookie
      const logoutRes = await fetch(`${baseUrl}/logout`, { method: 'POST' });
      const logoutCookie = logoutRes.headers.get('set-cookie') || '';
      expect(logoutRes.status).toBe(200);
      expect(logoutCookie).toContain('auth_token=;'); // Cleared cookie

      // 7. Subsequent login establishes a fresh deadline
      const secondLoginRes = await fetch(`${baseUrl}/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: testUser.email, password: plainPassword }),
      });
      const secondLoginData = await secondLoginRes.json();
      expect(secondLoginRes.status).toBe(200);
      expect(secondLoginData.expiresAt).toBeGreaterThanOrEqual(initialExpiresAt);
    } finally {
      server.close();
    }
  });
});

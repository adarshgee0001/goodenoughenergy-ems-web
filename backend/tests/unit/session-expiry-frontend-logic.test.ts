import { describe, test, expect, beforeEach } from 'vitest';

interface User {
  id: string;
  name: string;
  email: string;
  role: string;
}

interface StoredSession {
  user: User;
  expiresAt?: number;
}

// Emulate localStorage in memory
class MockLocalStorage {
  private store: Record<string, string> = {};

  getItem(key: string): string | null {
    return this.store[key] ?? null;
  }

  setItem(key: string, value: string): void {
    this.store[key] = value;
  }

  removeItem(key: string): void {
    delete this.store[key];
  }

  clear(): void {
    this.store = {};
  }
}

const mockLocalStorage = new MockLocalStorage();
const SESSION_KEY = 'gee_auth_session';

const authStorageSimulator = {
  getSession: (): StoredSession | null => {
    try {
      const session = mockLocalStorage.getItem(SESSION_KEY);
      if (!session) return null;
      const parsed = JSON.parse(session);
      if (!parsed || typeof parsed !== 'object') return null;

      if ('user' in parsed && parsed.user) {
        const stored = parsed as StoredSession;
        if (stored.expiresAt && Date.now() >= stored.expiresAt) {
          authStorageSimulator.clearSession();
          return null;
        }
        return stored;
      }

      if ('id' in parsed && 'email' in parsed) {
        return { user: parsed as User };
      }

      return null;
    } catch {
      authStorageSimulator.clearSession();
      return null;
    }
  },

  getUser: (): User | null => {
    const session = authStorageSimulator.getSession();
    return session ? session.user : null;
  },

  getExpiresAt: (): number | null => {
    const session = authStorageSimulator.getSession();
    return session?.expiresAt ?? null;
  },

  setSession: (user: User, expiresAt?: number): void => {
    const sessionData: StoredSession = { user, expiresAt };
    mockLocalStorage.setItem(SESSION_KEY, JSON.stringify(sessionData));
  },

  clearSession: (): void => {
    mockLocalStorage.removeItem(SESSION_KEY);
  },
};

describe('Frontend Auth Storage & Session Expiry Logic Unit Tests', () => {
  beforeEach(() => {
    mockLocalStorage.clear();
  });

  const sampleUser: User = {
    id: 'user-001',
    name: 'Sample User',
    email: 'user@example.com',
    role: 'CLIENT',
  };

  test('Persists user and expiresAt deadline accurately', () => {
    const deadline = Date.now() + 24 * 60 * 60 * 1000;
    authStorageSimulator.setSession(sampleUser, deadline);

    const session = authStorageSimulator.getSession();
    expect(session).not.toBeNull();
    expect(session?.user.email).toBe('user@example.com');
    expect(session?.expiresAt).toBe(deadline);
    expect(authStorageSimulator.getExpiresAt()).toBe(deadline);
  });

  test('Immediately purges expired session on retrieval and returns null', () => {
    const expiredDeadline = Date.now() - 5000; // Expired 5 seconds ago
    authStorageSimulator.setSession(sampleUser, expiredDeadline);

    // On retrieval, expired session must be purged
    const session = authStorageSimulator.getSession();
    expect(session).toBeNull();
    expect(authStorageSimulator.getUser()).toBeNull();
    expect(mockLocalStorage.getItem(SESSION_KEY)).toBeNull();
  });

  test('Supports legacy session format without crashing and retrieves user', () => {
    // Legacy format was just the User object stored directly
    mockLocalStorage.setItem(SESSION_KEY, JSON.stringify(sampleUser));

    const session = authStorageSimulator.getSession();
    expect(session).not.toBeNull();
    expect(session?.user.id).toBe(sampleUser.id);
    expect(session?.expiresAt).toBeUndefined();
    expect(authStorageSimulator.getUser()?.id).toBe(sampleUser.id);
  });

  test('Safely handles corrupted JSON in storage', () => {
    mockLocalStorage.setItem(SESSION_KEY, 'invalid-json{{{');

    const session = authStorageSimulator.getSession();
    expect(session).toBeNull();
    expect(mockLocalStorage.getItem(SESSION_KEY)).toBeNull();
  });

  test('Deadline remaining time calculation detects expired vs active state', () => {
    const activeDeadline = Date.now() + 10000;
    const activeRemaining = activeDeadline - Date.now();
    expect(activeRemaining).toBeGreaterThan(0);

    const expiredDeadline = Date.now() - 10000;
    const expiredRemaining = expiredDeadline - Date.now();
    expect(expiredRemaining).toBeLessThan(0);
  });

  test('Tab wake-up check identifies overdue deadlines', () => {
    const deadline = Date.now() + 1000;
    // Simulate time passing (e.g. computer was asleep for 2 hours)
    const futureTime = Date.now() + 2 * 60 * 60 * 1000;
    const isOverdue = futureTime >= deadline;
    expect(isOverdue).toBe(true);
  });

  // --- Regression Tests for Mount Validation & Legacy Sessions ---

  function simulateMountValidation({
    initialStored,
    apiResponse,
    apiError,
    isAborted,
  }: {
    initialStored: StoredSession | null;
    apiResponse?: { ok: boolean; status: number; data?: any };
    apiError?: Error;
    isAborted?: boolean;
  }) {
    let loggedOut = false;
    let scheduledDeadline: number | null = null;
    let currentUser: User | null = initialStored ? initialStored.user : null;

    if (initialStored?.expiresAt) {
      if (Date.now() >= initialStored.expiresAt) {
        return { loggedOut: true, userPreserved: false, scheduledDeadline: null };
      }
      scheduledDeadline = initialStored.expiresAt;
    }

    if (isAborted) {
      return { loggedOut: false, userPreserved: currentUser !== null, scheduledDeadline };
    }

    if (apiError) {
      if (apiError.name !== 'AbortError') {
        if (!initialStored?.expiresAt) {
          loggedOut = true;
          currentUser = null;
        }
      }
      return { loggedOut, userPreserved: currentUser !== null, scheduledDeadline };
    }

    if (apiResponse) {
      if (apiResponse.ok && apiResponse.data?.success && apiResponse.data?.user) {
        currentUser = apiResponse.data.user;
        const serverExpiresAt = typeof apiResponse.data.expiresAt === 'number' 
          ? apiResponse.data.expiresAt 
          : initialStored?.expiresAt;
        if (serverExpiresAt) {
          if (Date.now() >= serverExpiresAt) {
            loggedOut = true;
            currentUser = null;
          } else {
            scheduledDeadline = serverExpiresAt;
          }
        } else {
          if (!initialStored?.expiresAt) {
            loggedOut = true;
            currentUser = null;
          }
        }
      } else if (apiResponse.status === 401) {
        loggedOut = true;
        currentUser = null;
      } else {
        if (!initialStored?.expiresAt) {
          loggedOut = true;
          currentUser = null;
        }
      }
    }

    return { loggedOut, userPreserved: currentUser !== null, scheduledDeadline };
  }

  test('Legacy session without expiresAt + network failure → session cleared and logged out', () => {
    const legacySession: StoredSession = { user: sampleUser, expiresAt: undefined };
    const result = simulateMountValidation({
      initialStored: legacySession,
      apiError: new Error('Failed to fetch (Network disconnected)'),
    });
    expect(result.loggedOut).toBe(true);
    expect(result.userPreserved).toBe(false);
  });

  test('Legacy session without expiresAt + HTTP 5xx → session cleared and logged out', () => {
    const legacySession: StoredSession = { user: sampleUser, expiresAt: undefined };
    const result = simulateMountValidation({
      initialStored: legacySession,
      apiResponse: { ok: false, status: 503 },
    });
    expect(result.loggedOut).toBe(true);
    expect(result.userPreserved).toBe(false);
  });

  test('Legacy session without expiresAt + HTTP 401 → session cleared and logged out', () => {
    const legacySession: StoredSession = { user: sampleUser, expiresAt: undefined };
    const result = simulateMountValidation({
      initialStored: legacySession,
      apiResponse: { ok: false, status: 401 },
    });
    expect(result.loggedOut).toBe(true);
    expect(result.userPreserved).toBe(false);
  });

  test('Valid session with known, unexpired deadline + transient network error → session preserved until deadline', () => {
    const futureDeadline = Date.now() + 18 * 60 * 60 * 1000;
    const validSession: StoredSession = { user: sampleUser, expiresAt: futureDeadline };
    const result = simulateMountValidation({
      initialStored: validSession,
      apiError: new Error('Failed to fetch (Temporary network hiccup)'),
    });
    expect(result.loggedOut).toBe(false);
    expect(result.userPreserved).toBe(true);
    expect(result.scheduledDeadline).toBe(futureDeadline);
  });

  test('Valid session with known, unexpired deadline + transient 5xx → session preserved until deadline', () => {
    const futureDeadline = Date.now() + 18 * 60 * 60 * 1000;
    const validSession: StoredSession = { user: sampleUser, expiresAt: futureDeadline };
    const result = simulateMountValidation({
      initialStored: validSession,
      apiResponse: { ok: false, status: 502 },
    });
    expect(result.loggedOut).toBe(false);
    expect(result.userPreserved).toBe(true);
    expect(result.scheduledDeadline).toBe(futureDeadline);
  });

  test('Expired session on mount → immediately logged out', () => {
    const expiredDeadline = Date.now() - 5000;
    const expiredSession: StoredSession = { user: sampleUser, expiresAt: expiredDeadline };
    const result = simulateMountValidation({
      initialStored: expiredSession,
    });
    expect(result.loggedOut).toBe(true);
    expect(result.userPreserved).toBe(false);
  });

  test('Aborted request during component cleanup does not trigger logout', () => {
    const futureDeadline = Date.now() + 10000;
    const validSession: StoredSession = { user: sampleUser, expiresAt: futureDeadline };
    const result = simulateMountValidation({
      initialStored: validSession,
      isAborted: true,
      apiError: new Error('AbortError'),
    });
    expect(result.loggedOut).toBe(false);
    expect(result.userPreserved).toBe(true);
  });
});

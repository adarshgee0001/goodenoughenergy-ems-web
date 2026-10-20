import type { User } from './auth.types';

const SESSION_KEY = 'gee_auth_session';

export interface StoredSession {
  user: User;
  expiresAt?: number;
}

export const authStorage = {
  getSession: (): StoredSession | null => {
    try {
      const session = localStorage.getItem(SESSION_KEY);
      if (!session) return null;
      const parsed = JSON.parse(session);
      if (!parsed || typeof parsed !== 'object') return null;

      // Handle StoredSession format { user, expiresAt }
      if ('user' in parsed && parsed.user) {
        const stored = parsed as StoredSession;
        if (stored.expiresAt && Date.now() >= stored.expiresAt) {
          authStorage.clearSession();
          return null;
        }
        return stored;
      }

      // Handle legacy format where parsed is directly the User object
      if ('id' in parsed && 'email' in parsed) {
        return { user: parsed as User };
      }

      return null;
    } catch (e) {
      console.error('Failed to parse auth session:', e);
      authStorage.clearSession();
      return null;
    }
  },

  getUser: (): User | null => {
    const session = authStorage.getSession();
    return session ? session.user : null;
  },

  getExpiresAt: (): number | null => {
    const session = authStorage.getSession();
    return session?.expiresAt ?? null;
  },
  
  setSession: (user: User, expiresAt?: number): void => {
    try {
      const sessionData: StoredSession = { user, expiresAt };
      localStorage.setItem(SESSION_KEY, JSON.stringify(sessionData));
    } catch (e) {
      console.error('Failed to save auth session:', e);
    }
  },
  
  clearSession: (): void => {
    localStorage.removeItem(SESSION_KEY);
  }
};

import type { User } from './auth.types';

const SESSION_KEY = 'gee_auth_session';
const TOKEN_KEY = 'auth_token';
const LEGACY_TOKEN_KEY = 'token';

export interface StoredSession {
  user: User;
  token?: string;
  expiresAt?: number;
}

export const authStorage = {
  getSession: (): StoredSession | null => {
    try {
      const session = localStorage.getItem(SESSION_KEY);
      if (!session) return null;
      const parsed = JSON.parse(session);
      if (!parsed || typeof parsed !== 'object') return null;

      // Handle StoredSession format { user, token, expiresAt }
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

  getToken: (): string | null => {
    try {
      const directToken = localStorage.getItem(TOKEN_KEY) || localStorage.getItem(LEGACY_TOKEN_KEY);
      if (directToken) return directToken;
      const session = authStorage.getSession();
      return session?.token ?? null;
    } catch {
      return null;
    }
  },

  setToken: (token: string): void => {
    try {
      localStorage.setItem(TOKEN_KEY, token);
      localStorage.setItem(LEGACY_TOKEN_KEY, token);
      const session = authStorage.getSession();
      if (session) {
        session.token = token;
        localStorage.setItem(SESSION_KEY, JSON.stringify(session));
      }
    } catch (e) {
      console.error('Failed to save token:', e);
    }
  },

  getExpiresAt: (): number | null => {
    const session = authStorage.getSession();
    return session?.expiresAt ?? null;
  },
  
  setSession: (user: User, expiresAt?: number, token?: string): void => {
    try {
      const currentToken = token || authStorage.getToken() || undefined;
      const sessionData: StoredSession = { user, token: currentToken, expiresAt };
      localStorage.setItem(SESSION_KEY, JSON.stringify(sessionData));
      if (currentToken) {
        localStorage.setItem(TOKEN_KEY, currentToken);
        localStorage.setItem(LEGACY_TOKEN_KEY, currentToken);
      }
    } catch (e) {
      console.error('Failed to save auth session:', e);
    }
  },
  
  clearSession: (): void => {
    try {
      localStorage.removeItem(SESSION_KEY);
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(LEGACY_TOKEN_KEY);
    } catch (e) {
      console.error('Failed to clear auth session:', e);
    }
  }
};


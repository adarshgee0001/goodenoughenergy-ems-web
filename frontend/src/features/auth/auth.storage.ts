import type { User } from './auth.types';

const SESSION_KEY = 'gee_auth_session';

export const authStorage = {
  getSession: (): User | null => {
    try {
      const session = localStorage.getItem(SESSION_KEY);
      if (!session) return null;
      return JSON.parse(session) as User;
    } catch (e) {
      console.error('Failed to parse auth session:', e);
      authStorage.clearSession();
      return null;
    }
  },
  
  setSession: (user: User): void => {
    try {
      localStorage.setItem(SESSION_KEY, JSON.stringify(user));
    } catch (e) {
      console.error('Failed to save auth session:', e);
    }
  },
  
  clearSession: (): void => {
    localStorage.removeItem(SESSION_KEY);
  }
};

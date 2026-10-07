import { createContext, useState, useEffect, useCallback, useRef } from 'react';
import type { ReactNode } from 'react';
import type { User, LoginCredentials } from '../features/auth/auth.types';
import { authStorage } from '../features/auth/auth.storage';
import { authService } from '../features/auth/auth.service';

interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  role: User['role'] | null;
  login: (credentials: LoginCredentials) => Promise<void>;
  logout: () => Promise<void>;
  updateUser: (updates: Partial<User>) => void;
}

import { API_BASE } from '../utils/apiClient';

export const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  // Initialize state directly from storage to avoid set-state-in-effect
  const [user, setUser] = useState<User | null>(() => authStorage.getSession());
  const initialAuthRef = useRef<AbortController | null>(null);

  const login = async (credentials: LoginCredentials) => {
    if (initialAuthRef.current) {
      initialAuthRef.current.abort();
      initialAuthRef.current = null;
    }
    const authenticatedUser = await authService.login(credentials);
    setUser(authenticatedUser);
    authStorage.setSession(authenticatedUser);
  };

  const logout = useCallback(async () => {
    setUser(null);
    authStorage.clearSession();
    await authService.logout();
  }, []);

  // Effect 1: Register the auth:expired event listener.
  // logout is stable (useCallback with []), so this runs once on mount.
  useEffect(() => {
    const handleAuthExpired = () => {
      logout();
    };
    window.addEventListener('auth:expired', handleAuthExpired);
    return () => window.removeEventListener('auth:expired', handleAuthExpired);
  }, [logout]);

  // Effect 2: Validate the existing session with the backend once on mount.
  // No dependency on `user` — this must not re-run when setUser is called below.
  useEffect(() => {
    const controller = new AbortController();
    initialAuthRef.current = controller;

    // Use native fetch to prevent a 401 here from triggering the global auth:expired listener
    fetch(`${API_BASE}/api/auth/me`, { 
      credentials: 'include',
      signal: controller.signal 
    }).then((res: Response) => {
      if (res.ok) {
        res.json().then((data: any) => {
          if (data.success && data.user) {
            setUser(data.user);
            authStorage.setSession(data.user);
          }
        }).catch(() => {});
      } else if (res.status === 401) {
        // Session is invalid — clear local state so ProtectedRoute redirects
        if (!controller.signal.aborted) {
          setUser(null);
          authStorage.clearSession();
        }
      }
    }).catch((err: any) => {
      if (err.name !== 'AbortError') {
        console.error('Failed to validate session', err);
      }
    });
    
    return () => {
      controller.abort();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const updateUser = (updates: Partial<User>) => {
    if (user) {
      const updatedUser = { ...user, ...updates };
      setUser(updatedUser);
      authStorage.setSession(updatedUser);
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        isAuthenticated: !!user,
        role: user?.role || null,
        login,
        logout,
        updateUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

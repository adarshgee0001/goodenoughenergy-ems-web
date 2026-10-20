import { createContext, useState, useEffect, useCallback, useRef } from 'react';
import type { ReactNode } from 'react';
import type { User, LoginCredentials } from '../features/auth/auth.types';
import { authStorage } from '../features/auth/auth.storage';
import { authService } from '../features/auth/auth.service';

interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  role: User['role'] | null;
  expiresAt: number | null;
  login: (credentials: LoginCredentials) => Promise<void>;
  logout: () => Promise<void>;
  updateUser: (updates: Partial<User>) => void;
}

import { API_BASE } from '../utils/apiClient';

export const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  // Initialize state directly from storage to avoid set-state-in-effect
  const [user, setUser] = useState<User | null>(() => authStorage.getUser());
  const [expiresAt, setExpiresAt] = useState<number | null>(() => authStorage.getExpiresAt());

  const initialAuthRef = useRef<AbortController | null>(null);
  const expiryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isLoggingOutRef = useRef<boolean>(false);
  const currentDeadlineRef = useRef<number | null>(null);

  const clearScheduledExpiry = useCallback(() => {
    if (expiryTimerRef.current) {
      clearTimeout(expiryTimerRef.current);
      expiryTimerRef.current = null;
    }
    currentDeadlineRef.current = null;
  }, []);

  const logout = useCallback(async () => {
    if (isLoggingOutRef.current) return;
    isLoggingOutRef.current = true;

    clearScheduledExpiry();
    setUser(null);
    setExpiresAt(null);
    authStorage.clearSession();

    try {
      await authService.logout();
    } catch {
      // Ignore network errors on logout, local state clears anyway
    } finally {
      isLoggingOutRef.current = false;
    }
  }, [clearScheduledExpiry]);

  const scheduleSessionExpiry = useCallback((deadline: number) => {
    clearScheduledExpiry();

    const remainingMs = deadline - Date.now();
    currentDeadlineRef.current = deadline;

    if (remainingMs <= 0) {
      logout();
      return;
    }

    expiryTimerRef.current = setTimeout(() => {
      if (currentDeadlineRef.current === deadline) {
        logout();
      }
    }, remainingMs);
  }, [clearScheduledExpiry, logout]);

  const login = async (credentials: LoginCredentials) => {
    if (initialAuthRef.current) {
      initialAuthRef.current.abort();
      initialAuthRef.current = null;
    }
    const { user: authenticatedUser, expiresAt: tokenExpiresAt } = await authService.login(credentials);
    setUser(authenticatedUser);
    const deadline = tokenExpiresAt ?? null;
    setExpiresAt(deadline);
    authStorage.setSession(authenticatedUser, tokenExpiresAt);
    if (tokenExpiresAt) {
      scheduleSessionExpiry(tokenExpiresAt);
    }
  };

  // Effect 1: Register the auth:expired event listener.
  // logout is stable (useCallback with []), so this runs once on mount.
  useEffect(() => {
    const handleAuthExpired = () => {
      logout();
    };
    window.addEventListener('auth:expired', handleAuthExpired);
    return () => window.removeEventListener('auth:expired', handleAuthExpired);
  }, [logout]);

  // Effect 2: Browser sleep and timer throttling handling
  // When computer sleeps or tab is throttled, timers may be delayed.
  // Check the absolute deadline immediately on visibility change or focus.
  useEffect(() => {
    const checkExpiry = () => {
      if (currentDeadlineRef.current && Date.now() >= currentDeadlineRef.current) {
        logout();
      }
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        checkExpiry();
      }
    };

    window.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('focus', checkExpiry);

    return () => {
      window.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('focus', checkExpiry);
    };
  }, [logout]);

  // Effect 3: Multi-tab logout synchronization via storage event
  useEffect(() => {
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === 'gee_auth_session') {
        if (!e.newValue) {
          logout();
        } else {
          try {
            const parsed = JSON.parse(e.newValue);
            if (parsed && typeof parsed === 'object') {
              const newExpiresAt = parsed.expiresAt;
              if (newExpiresAt && Date.now() >= newExpiresAt) {
                logout();
              } else if (newExpiresAt && newExpiresAt !== currentDeadlineRef.current) {
                setUser(parsed.user || null);
                setExpiresAt(newExpiresAt);
                scheduleSessionExpiry(newExpiresAt);
              }
            }
          } catch {
            // Ignore parse errors
          }
        }
      }
    };

    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, [logout, scheduleSessionExpiry]);

  // Effect 4: Validate existing session with backend once on mount
  useEffect(() => {
    const initialStored = authStorage.getSession();
    if (initialStored?.expiresAt) {
      if (Date.now() >= initialStored.expiresAt) {
        logout();
        return;
      }
      scheduleSessionExpiry(initialStored.expiresAt);
    }

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
            const serverExpiresAt = typeof data.expiresAt === 'number' ? data.expiresAt : initialStored?.expiresAt;
            setExpiresAt(serverExpiresAt ?? null);
            authStorage.setSession(data.user, serverExpiresAt);
            if (serverExpiresAt) {
              if (Date.now() >= serverExpiresAt) {
                logout();
              } else {
                scheduleSessionExpiry(serverExpiresAt);
              }
            } else {
              // Legacy/unverified session where backend returned no expiration deadline
              if (!controller.signal.aborted) {
                logout();
              }
            }
          } else {
            // Malformed payload for unverified session
            if (!controller.signal.aborted && !initialStored?.expiresAt) {
              logout();
            }
          }
        }).catch(() => {
          if (!controller.signal.aborted && !initialStored?.expiresAt) {
            logout();
          }
        });
      } else if (res.status === 401) {
        // Session is invalid on backend — clear local state so ProtectedRoute redirects
        if (!controller.signal.aborted) {
          logout();
        }
      } else {
        // Non-OK response other than 401 (e.g. 500, 502, 503)
        // If the session has no trustworthy deadline (legacy), do not keep it authenticated indefinitely
        if (!controller.signal.aborted && !initialStored?.expiresAt) {
          logout();
        }
      }
    }).catch((err: any) => {
      if (err.name !== 'AbortError') {
        console.error('Failed to validate session', err);
        // If session has no trustworthy deadline (legacy) and backend validation failed due to network/server error,
        // log out so the UI does not treat an unverified session as indefinitely authenticated.
        // Sessions with a known, unexpired deadline (initialStored?.expiresAt) are safely preserved.
        if (!controller.signal.aborted && !initialStored?.expiresAt) {
          logout();
        }
      }
    });
    
    return () => {
      controller.abort();
      clearScheduledExpiry();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const updateUser = (updates: Partial<User>) => {
    if (user) {
      const updatedUser = { ...user, ...updates };
      setUser(updatedUser);
      authStorage.setSession(updatedUser, expiresAt ?? undefined);
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        isAuthenticated: !!user,
        role: user?.role || null,
        expiresAt,
        login,
        logout,
        updateUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

import type { User, LoginCredentials } from './auth.types';

// Backend API base URL — falls back to localhost:5000 for development
import { API_BASE } from '../../utils/apiClient';

export interface LoginResponse {
  user: User;
  expiresAt?: number;
}

export const authService = {
  login: async (credentials: LoginCredentials): Promise<LoginResponse> => {
    const { email, password } = credentials;

    let response: Response;
    try {
      response = await fetch(`${API_BASE}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ email, password }),
      });
    } catch {
      throw new Error('Unable to reach the server. Please check your connection.');
    }

    let data: any;
    try {
      data = await response.json();
    } catch {
      throw new Error('Unexpected server response. Please try again.');
    }

    if (!response.ok) {
      // Use the backend message when present; fall back to a generic error
      const message = data?.message || 'Invalid credentials';
      throw new Error(message);
    }

    if (!data.success || !data.user) {
      throw new Error('Unexpected server response. Please try again.');
    }

    // Return the safe user profile and backend-authoritative expiresAt timestamp
    const user: User = {
      id: data.user.id,
      name: data.user.name,
      email: data.user.email,
      role: data.user.role,
      forcePasswordChange: data.user.forcePasswordChange,
    };

    return {
      user,
      expiresAt: typeof data.expiresAt === 'number' ? data.expiresAt : undefined,
    };
  },

  logout: async (): Promise<void> => {
    try {
      await fetch(`${API_BASE}/api/auth/logout`, {
        method: 'POST',
        credentials: 'include',
      });
    } catch {
      // Ignore network errors on logout, local state will clear anyway
    }
  },
};

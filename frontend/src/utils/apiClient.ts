import { authStorage } from '../features/auth/auth.storage';

export const getApiBase = (): string => {
  const envUrl = import.meta.env.VITE_API_URL;
  if (typeof window !== 'undefined') {
    // If accessed via 10.10.10.245
    if (window.location.hostname === '10.10.10.245') {
      return 'http://10.10.10.245:5000';
    }
    // If accessed via localhost / loopback
    if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
      return envUrl && !envUrl.includes('storedge') ? envUrl : 'http://localhost:5000';
    }
    // If accessed via production domain
    if (window.location.hostname.includes('goodenough.energy')) {
      return 'http://storedge.goodenough.energy';
    }
  }
  return envUrl || 'http://10.10.10.245:5000';
};

export const API_BASE = getApiBase();

export async function authenticatedFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const token = authStorage.getToken();
  const headers = new Headers(init?.headers);

  if (token && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  const response = await fetch(input, {
    ...init,
    headers,
    credentials: 'include',
  });
  if (response.status === 401) {
    window.dispatchEvent(new Event('auth:expired'));
  }
  return response;
}

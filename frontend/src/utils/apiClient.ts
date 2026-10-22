import { authStorage } from '../features/auth/auth.storage';

export const getApiBase = (): string => {
  const envUrl = import.meta.env.VITE_API_URL;
  const baseUrl = envUrl || 'http://storedge.goodenough.energy';
  return baseUrl.replace(/\/+$/, '');
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

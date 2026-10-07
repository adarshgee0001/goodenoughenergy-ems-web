export const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:5000';

export async function authenticatedFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const response = await fetch(input, {
    ...init,
    credentials: 'include',
  });
  if (response.status === 401) {
    window.dispatchEvent(new Event('auth:expired'));
  }
  return response;
}

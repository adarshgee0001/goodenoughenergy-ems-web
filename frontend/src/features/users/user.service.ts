import { authenticatedFetch, API_BASE } from '../../utils/apiClient';
import type { ClientUser, ClientUserCreatePayload, ClientUserCreateResponse, ClientUserResetResponse } from './user.types';


export const userService = {
  getClientUsers: async (clientId: string, page: number = 1, limit: number = 10, search: string = ''): Promise<{ users: ClientUser[], pagination: any }> => {

    let url = `${API_BASE}/api/clients/${clientId}/users?page=${page}&limit=${limit}`;
    if (search) {
      url += `&search=${encodeURIComponent(search)}`;
    }

    const response = await authenticatedFetch(url, {
      method: 'GET',
      headers: { 
        'Content-Type': 'application/json'
      },
    });

    if (!response.ok) {
      if (response.status === 401 || response.status === 403) {
        throw new Error('Unauthorized access');
      }
      const errData = await response.json().catch(() => ({}));
      throw new Error(errData.message || 'Failed to fetch client users');
    }

    const data = await response.json();
    
    if (!data.success) {
      throw new Error(data.message || 'Failed to fetch client users');
    }

    return {
      users: data.users || [],
      pagination: data.pagination
    };
  },

  createClientUser: async (clientId: string, payload: ClientUserCreatePayload): Promise<ClientUserCreateResponse> => {

    const response = await authenticatedFetch(`${API_BASE}/api/clients/${clientId}/users`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        name: payload.name.trim(),
        email: payload.email.trim()
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      if (response.status === 401 || response.status === 403) {
        throw new Error('Unauthorized access');
      }
      throw new Error(data.message || 'Failed to create user');
    }
    
    if (!data.success) {
      throw new Error(data.message || 'Failed to create user');
    }

    return {
      user: data.user,
      temporaryPassword: data.temporaryPassword,
      invitation: data.invitation
    };
  },

  resetUserPassword: async (userId: string): Promise<ClientUserResetResponse> => {

    const response = await authenticatedFetch(`${API_BASE}/api/users/${userId}/reset-password`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json'
      }
    });

    const data = await response.json();

    if (!response.ok) {
      if (response.status === 401 || response.status === 403) {
        throw new Error('Unauthorized access');
      }
      throw new Error(data.message || 'Failed to reset password');
    }
    
    if (!data.success) {
      throw new Error(data.message || 'Failed to reset password');
    }

    return {
      message: data.message,
      temporaryPassword: data.temporaryPassword
    };
  }
};

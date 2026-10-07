import { authenticatedFetch, API_BASE } from '../../utils/apiClient';
import type { Client, PaginatedClients } from './client.types';


export const clientService = {
  getClients: async (page: number = 1, limit: number = 10, search: string = ''): Promise<PaginatedClients> => {

    let url = `${API_BASE}/api/clients?page=${page}&limit=${limit}`;
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
      throw new Error('Failed to fetch clients');
    }

    const data = await response.json();
    
    if (!data.success) {
      throw new Error(data.message || 'Failed to fetch clients');
    }

    // Backend returns either { success: true, clients: [...] } (for non-admins)
    // or { success: true, clients: [...], pagination: {...} } (for admins)
    return {
      clients: data.clients,
      pagination: data.pagination
    };
  },

  getClient: async (id: string): Promise<Client> => {

    const response = await authenticatedFetch(`${API_BASE}/api/clients/${id}`, {
      method: 'GET',
      headers: { 
        'Content-Type': 'application/json'
      },
    });

    if (!response.ok) {
      if (response.status === 401 || response.status === 403) {
        throw new Error('Unauthorized access');
      }
      throw new Error('Failed to fetch client');
    }

    const data = await response.json();
    
    if (!data.success) {
      throw new Error(data.message || 'Failed to fetch client');
    }

    return data.client;
  },


  createClient: async (name: string, businessIdentifier?: string): Promise<Client> => {

    const payload: { name: string; businessIdentifier?: string } = { name: name.trim() };
    if (businessIdentifier && businessIdentifier.trim()) {
      payload.businessIdentifier = businessIdentifier.trim();
    }

    const response = await authenticatedFetch(`${API_BASE}/api/clients`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload),
    });

    const data = await response.json();

    if (!response.ok) {
      if (response.status === 401 || response.status === 403) {
        throw new Error('Unauthorized access');
      }
      throw new Error(data.message || 'Failed to create client');
    }
    
    if (!data.success) {
      throw new Error(data.message || 'Failed to create client');
    }

    return data.client;
  },

  updateClient: async (id: string, name: string, businessIdentifier?: string): Promise<Client> => {

    const payload: { name?: string; businessIdentifier?: string } = {};
    if (name && name.trim()) payload.name = name.trim();
    if (businessIdentifier !== undefined) payload.businessIdentifier = businessIdentifier.trim();

    const response = await authenticatedFetch(`${API_BASE}/api/clients/${id}`, {
      method: 'PATCH',
      headers: { 
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload),
    });

    const data = await response.json();

    if (!response.ok) {
      if (response.status === 401 || response.status === 403) {
        throw new Error('Unauthorized access');
      }
      throw new Error(data.message || 'Failed to update client');
    }
    
    if (!data.success) {
      throw new Error(data.message || 'Failed to update client');
    }

    return data.client;
  },

  deleteClient: async (id: string): Promise<void> => {

    const response = await authenticatedFetch(`${API_BASE}/api/clients/${id}`, {
      method: 'DELETE',
      headers: { 
        'Content-Type': 'application/json'
      }
    });

    const data = await response.json();

    if (!response.ok) {
      if (response.status === 401 || response.status === 403) {
        throw new Error('Unauthorized access');
      }
      // P2003 constraint error is returned as 400 with a specific message by the backend
      throw new Error(data.message || 'Failed to delete client');
    }
    
    if (!data.success) {
      throw new Error(data.message || 'Failed to delete client');
    }
  },
};

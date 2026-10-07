import { authenticatedFetch, API_BASE } from '../../utils/apiClient';
import type { Site } from './site.types';


export const siteService = {
  getClientSites: async (clientId: string, page: number = 1, limit: number = 10, search: string = ''): Promise<{ sites: Site[], pagination: any }> => {

    let url = `${API_BASE}/api/clients/${clientId}/sites?page=${page}&limit=${limit}`;
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
      throw new Error(errData.message || 'Failed to fetch sites');
    }

    const data = await response.json();
    return {
      sites: data.sites || [],
      pagination: data.pagination
    };
  },

  getSite: async (siteId: string): Promise<Site> => {

    const response = await authenticatedFetch(`${API_BASE}/api/sites/${siteId}`, {
      method: 'GET',
      headers: { 
        'Content-Type': 'application/json'
      },
    });

    if (!response.ok) {
      if (response.status === 401 || response.status === 403) {
        throw new Error('Unauthorized access');
      }
      throw new Error('Failed to fetch site');
    }

    const data = await response.json();
    
    if (!data.success) {
      throw new Error(data.message || 'Failed to fetch site');
    }

    return data.site;
  },


  createSite: async (clientId: string, name: string, businessIdentifier: string, timezone?: string): Promise<Site> => {

    const payload: any = { 
      name: name.trim(), 
      businessIdentifier: businessIdentifier.trim() 
    };
    if (timezone) {
      payload.timezone = timezone.trim();
    }

    const response = await authenticatedFetch(`${API_BASE}/api/clients/${clientId}/sites`, {
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
      throw new Error(data.message || 'Failed to create site');
    }
    
    if (!data.success) {
      throw new Error(data.message || 'Failed to create site');
    }

    return data.site;
  },

  updateSite: async (siteId: string, name: string, businessIdentifier: string, timezone?: string): Promise<Site> => {

    const payload: any = { 
      name: name.trim(), 
      businessIdentifier: businessIdentifier.trim(),
      timezone: timezone?.trim() || null
    };

    const response = await authenticatedFetch(`${API_BASE}/api/sites/${siteId}`, {
      method: 'PATCH',
      headers: { 
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload),
    });

    const data = await response.json();
    if (!response.ok || !data.success) {
      throw new Error(data.message || 'Failed to update site');
    }

    return data.site;
  },

  deleteSite: async (siteId: string): Promise<void> => {

    const response = await authenticatedFetch(`${API_BASE}/api/sites/${siteId}`, {
      method: 'DELETE',
      headers: { 
        'Content-Type': 'application/json'
      },
    });

    const data = await response.json();
    if (!response.ok || !data.success) {
      throw new Error(data.message || 'Failed to delete site');
    }
  },
};

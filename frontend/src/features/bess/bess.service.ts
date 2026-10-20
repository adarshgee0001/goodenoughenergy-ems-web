import { authenticatedFetch, API_BASE } from '../../utils/apiClient';
import type { BessAsset } from './bess.types';


export const bessService = {
  getSiteBess: async (siteId: string, page: number = 1, limit: number = 10, search: string = ''): Promise<{ assets: BessAsset[], pagination: any }> => {

    let url = `${API_BASE}/api/sites/${siteId}/bess?page=${page}&limit=${limit}`;
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
      throw new Error(errData.message || 'Failed to fetch BESS assets');
    }

    const data = await response.json();
    
    if (!data.success) {
      throw new Error(data.message || 'Failed to fetch BESS assets');
    }

    return {
      assets: data.assets || [],
      pagination: data.pagination
    };
  },

  getBess: async (assetId: string): Promise<BessAsset> => {

    const response = await authenticatedFetch(`${API_BASE}/api/bess/${assetId}`, {
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
      throw new Error(errData.message || 'Failed to fetch BESS asset');
    }

    const data = await response.json();
    
    if (!data.success) {
      throw new Error(data.message || 'Failed to fetch BESS asset');
    }

    return data.asset;
  },

  createBess: async (siteId: string, name: string, assetIdentifier: string, emuId?: string | null, model?: string, energyCapacity?: number | string, powerRating?: number | string, mqttTopic?: string | null, reportIntervalMinutes?: number): Promise<BessAsset> => {

    const payload: any = { 
      name: name.trim(), 
      assetIdentifier: assetIdentifier.trim() 
    };

    if (emuId !== undefined) payload.emuId = emuId;
    if (model !== undefined) payload.model = model;
    if (energyCapacity !== undefined && energyCapacity !== '') payload.energyCapacity = energyCapacity;
    if (powerRating !== undefined && powerRating !== '') payload.powerRating = powerRating;
    if (mqttTopic !== undefined) payload.mqttTopic = mqttTopic;
    if (reportIntervalMinutes !== undefined) payload.reportIntervalMinutes = reportIntervalMinutes;

    const response = await authenticatedFetch(`${API_BASE}/api/sites/${siteId}/bess`, {
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
      throw new Error(data.message || 'Failed to create BESS asset');
    }
    
    if (!data.success) {
      throw new Error(data.message || 'Failed to create BESS asset');
    }

    return data.asset;
  },

  updateBess: async (assetId: string, name: string, assetIdentifier: string, emuId?: string | null, model?: string, energyCapacity?: number | string, powerRating?: number | string, mqttTopic?: string | null, reportIntervalMinutes?: number): Promise<BessAsset> => {

    const payload: any = { 
      name: name.trim(), 
      assetIdentifier: assetIdentifier.trim() 
    };

    if (emuId !== undefined) payload.emuId = emuId;
    if (model !== undefined) payload.model = model;
    if (energyCapacity !== undefined) payload.energyCapacity = energyCapacity === '' ? null : energyCapacity;
    if (powerRating !== undefined) payload.powerRating = powerRating === '' ? null : powerRating;
    if (mqttTopic !== undefined) payload.mqttTopic = mqttTopic;
    if (reportIntervalMinutes !== undefined) payload.reportIntervalMinutes = reportIntervalMinutes;

    const response = await authenticatedFetch(`${API_BASE}/api/bess/${assetId}`, {
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
      throw new Error(data.message || 'Failed to update BESS asset');
    }
    
    if (!data.success) {
      throw new Error(data.message || 'Failed to update BESS asset');
    }

    return data.asset;
  },

  deleteBess: async (assetId: string): Promise<void> => {

    const response = await authenticatedFetch(`${API_BASE}/api/bess/${assetId}`, {
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
      throw new Error(data.message || 'Failed to delete BESS asset');
    }
    
    if (!data.success) {
      throw new Error(data.message || 'Failed to delete BESS asset');
    }
  },
};

import { authenticatedFetch, API_BASE } from '../../utils/apiClient';
import type { Device, CreateDevicePayload, UpdateDevicePayload } from './device.types';


async function handleResponse<T>(response: Response): Promise<T> {
  const data = await response.json();
  if (!response.ok) {
    if (response.status === 401 || response.status === 403) {
      throw new Error('Unauthorized access');
    }
    throw new Error(data.message || 'An unexpected error occurred');
  }
  if (!data.success) {
    throw new Error(data.message || 'An unexpected error occurred');
  }
  return data;
}

export const deviceService = {
  getBessDevices: async (assetId: string): Promise<Device[]> => {
    const response = await authenticatedFetch(`${API_BASE}/api/bess/${assetId}/devices`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
    });
    const data = await handleResponse<{ success: true; devices: Device[] }>(response);
    return data.devices;
  },

  createDevice: async (assetId: string, payload: CreateDevicePayload): Promise<Device> => {
    const body = {
      type: payload.type,
      componentId: payload.componentId.trim(),
      ...(payload.name && payload.name.trim() !== '' ? { name: payload.name.trim() } : {}),
      ...(payload.hardwareId && payload.hardwareId.trim() !== '' ? { hardwareId: payload.hardwareId.trim() } : {}),
    };
    const response = await authenticatedFetch(`${API_BASE}/api/bess/${assetId}/devices`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await handleResponse<{ success: true; device: Device }>(response);
    return data.device;
  },

  updateDevice: async (deviceId: string, payload: UpdateDevicePayload): Promise<Device> => {
    const body: Record<string, unknown> = {};
    if (payload.type !== undefined) body.type = payload.type;
    if (payload.name !== undefined) body.name = payload.name?.trim() || null;
    if (payload.hardwareId !== undefined) body.hardwareId = payload.hardwareId?.trim() || null;
    if (payload.componentId !== undefined) body.componentId = payload.componentId.trim();
    const response = await authenticatedFetch(`${API_BASE}/api/devices/${deviceId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await handleResponse<{ success: true; device: Device }>(response);
    return data.device;
  },

  deleteDevice: async (deviceId: string): Promise<void> => {
    const response = await authenticatedFetch(`${API_BASE}/api/devices/${deviceId}`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
    });
    await handleResponse<{ success: true }>(response);
  },
};

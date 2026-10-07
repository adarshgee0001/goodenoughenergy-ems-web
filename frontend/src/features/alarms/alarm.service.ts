import { authenticatedFetch, API_BASE } from '../../utils/apiClient';

export interface AlarmDevice {
  id: string;
  name: string | null;
  type: string;
  bessAsset?: {
    id: string;
    name: string;
    siteId: string;
  };
}

export interface RealAlarm {
  id: string;
  severity: 'INFO' | 'WARNING' | 'CRITICAL' | 'FATAL';
  message: string;
  status: 'ACTIVE' | 'ACKNOWLEDGED' | 'CLEARED';
  createdAt: string;
  acknowledgedAt: string | null;
  clearedAt: string | null;
  deviceId: string;
  faultCode: string | null;
  device?: AlarmDevice;
}


async function apiFetch<T>(path: string, method: string = 'GET'): Promise<T> {
  const response = await authenticatedFetch(`${API_BASE}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
    },
  });
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data?.error?.message || data?.message || data?.error || `Request failed: ${response.status}`);
  }
  return data;
}

export const alarmService = {
  getSiteAlarms: async (siteId: string): Promise<RealAlarm[]> => {
    return apiFetch<RealAlarm[]>(`/api/sites/${siteId}/alarms`, 'GET');
  },

  acknowledgeAlarm: async (alarmId: string): Promise<RealAlarm> => {
    return apiFetch<RealAlarm>(`/api/alarms/${alarmId}/acknowledge`, 'POST');
  }
};

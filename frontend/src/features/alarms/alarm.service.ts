import { authenticatedFetch, API_BASE } from '../../utils/apiClient';

export interface AlarmDevice {
  id: string;
  name: string | null;
  type: string;
  bessAsset?: {
    id: string;
    name: string;
    siteId: string;
    emuId?: string | null;
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

export interface AlarmQueryParams {
  from?: string;
  to?: string;
  status?: string;
  limit?: number;
  bessId?: string;
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
  getSiteAlarms: async (siteId: string, params?: AlarmQueryParams): Promise<RealAlarm[]> => {
    let query = '';
    if (params) {
      const sp = new URLSearchParams();
      if (params.from) sp.append('from', params.from);
      if (params.to) sp.append('to', params.to);
      if (params.status) sp.append('status', params.status);
      if (params.limit !== undefined) sp.append('limit', String(params.limit));
      if (params.bessId) sp.append('bessId', params.bessId);
      const qs = sp.toString();
      if (qs) query = `?${qs}`;
    }
    return apiFetch<RealAlarm[]>(`/api/sites/${siteId}/alarms${query}`, 'GET');
  },

  acknowledgeAlarm: async (alarmId: string): Promise<RealAlarm> => {
    return apiFetch<RealAlarm>(`/api/alarms/${alarmId}/acknowledge`, 'POST');
  },

  exportAlarmsCsv: async (
    siteId: string,
    from?: Date,
    to?: Date,
    startDateStr?: string,
    endDateStr?: string,
    bessId?: string
  ): Promise<{ blob: Blob; filename: string }> => {
    const sp = new URLSearchParams();
    if (from) sp.append('from', from.toISOString());
    if (to) sp.append('to', to.toISOString());
    if (startDateStr) sp.append('startDate', startDateStr);
    if (endDateStr) sp.append('endDate', endDateStr);
    if (bessId) sp.append('bessId', bessId);

    const qs = sp.toString();
    const query = qs ? `?${qs}` : '';
    const response = await authenticatedFetch(`${API_BASE}/api/sites/${siteId}/alarms/export${query}`, {
      method: 'GET'
    });

    if (!response.ok) {
      let errorMsg = `Export failed: ${response.status}`;
      try {
        const data = await response.json();
        if (data?.error?.message) errorMsg = data.error.message;
        else if (data?.message) errorMsg = data.message;
        else if (data?.error) errorMsg = data.error;
      } catch (_e) {}
      throw new Error(errorMsg);
    }

    const contentDisposition = response.headers.get('content-disposition') || '';
    let defaultFilename = bessId ? 'alarms-history-bess-all-to-all.csv' : 'alarms-history-all-to-all.csv';
    if (startDateStr && endDateStr) {
      defaultFilename = bessId
        ? `alarms-history-bess-${startDateStr}-to-${endDateStr}.csv`
        : `alarms-history-${startDateStr}-to-${endDateStr}.csv`;
    }
    let filename = defaultFilename;
    const match = contentDisposition.match(/filename="?([^"]+)"?/);
    if (match && match[1]) {
      filename = match[1];
    }

    const blob = await response.blob();
    return { blob, filename };
  }
};

import { authenticatedFetch, API_BASE } from '../../utils/apiClient';
/**
 * Phase 14C.3 — Dashboard API Service
 *
 * Thin async fetch layer for the Client Dashboard.
 * No state management. No mock fallbacks.
 * All authorization is enforced by the backend — this service only passes the JWT.
 */

import type {
  DashboardContext,
  DashboardClient,
  DashboardSite,
  DashboardBessAsset,
  DashboardDevice,
  LatestTelemetryRow,
  HistoricalTelemetryRow,
  TelemetrySnapshotRow,
} from './dashboard.types';


async function apiFetch<T>(path: string): Promise<T> {
  const response = await authenticatedFetch(`${API_BASE}${path}`, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
    },
  });
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data?.error?.message || data?.message || `Request failed: ${response.status}`);
  }
  if (data.success === false) {
    throw new Error(data.message || 'Request failed');
  }
  return data;
}

// ---------------------------------------------------------------------------
// Context resolution
// ---------------------------------------------------------------------------

/**
 * Resolves the full dashboard context for a CLIENT user:
 *   GET /api/clients → first client → sites[0] → bess[0] → devices
 */
async function resolveClientContext(): Promise<DashboardContext> {
  const clientsData = await apiFetch<{ clients: DashboardClient[] }>('/api/clients');
  const clients = clientsData.clients;

  if (!clients || clients.length === 0) {
    throw new ClientAccessError('No client access available.');
  }

  const client = clients[0];
  return resolveContextForClient(client);
}

/**
 * Resolves the full dashboard context for an ADMIN in preview mode:
 *   GET /api/clients/:previewClientId → sites[0] → bess[0] → devices
 */
async function resolvePreviewContext(previewClientId: string): Promise<DashboardContext> {
  const clientData = await apiFetch<{ client: DashboardClient }>(`/api/clients/${previewClientId}`);
  const client = clientData.client;
  return resolveContextForClient(client);
}

async function resolveContextForClient(client: DashboardClient): Promise<DashboardContext> {
  const sitesData = await apiFetch<{ sites: DashboardSite[] }>(`/api/clients/${client.id}/sites`);
  const sites = sitesData.sites;

  if (!sites || sites.length === 0) {
    throw new NoSiteError('No site is configured for this client.');
  }

  const site = sites[0]; // Phase 14C.3: use first site; site selector deferred to future phase

  const bessData = await apiFetch<{ assets: DashboardBessAsset[] }>(`/api/sites/${site.id}/bess`);
  const bessAssets = bessData.assets;

  if (!bessAssets || bessAssets.length === 0) {
    throw new NoBessError('No BESS asset is configured for this site.');
  }

  // Phase 14C.3 / Phase 4 (Multi-BESS): Fetch devices for ALL BESS assets in the site
  const devicesPromises = bessAssets.map(bess => 
    apiFetch<{ devices: DashboardDevice[] }>(`/api/bess/${bess.id}/devices`)
  );
  
  const devicesResponses = await Promise.all(devicesPromises);
  const devices = devicesResponses.flatMap(res => res.devices || []);

  // Empty device list is allowed — dashboard will show an empty state
  return { client, site, bessAssets, devices };
}

// ---------------------------------------------------------------------------
// Telemetry
// ---------------------------------------------------------------------------

/**
 * Returns the latest TelemetryHistory row per device for the given site.
 * GET /api/sites/:siteId/telemetry/latest
 */
async function getLatestTelemetry(siteId: string): Promise<LatestTelemetryRow[]> {
  const data = await apiFetch<{ data: LatestTelemetryRow[] }>(`/api/sites/${siteId}/telemetry/latest`);
  return data.data;
}

/**
 * Returns historical telemetry for the given site and time window.
 * GET /api/sites/:siteId/telemetry?startDate=&endDate=
 */
async function getHistoricalTelemetry(
  siteId: string,
  startDate: Date,
  endDate: Date
): Promise<HistoricalTelemetryRow[]> {
  const start = startDate.toISOString();
  const end = endDate.toISOString();
  const data = await apiFetch<{ data: HistoricalTelemetryRow[] }>(
    `/api/sites/${siteId}/telemetry?startDate=${encodeURIComponent(start)}&endDate=${encodeURIComponent(end)}`
  );
  return data.data;
}

/**
 * Returns 15-minute telemetry snapshots for the given site and time window.
 * GET /api/sites/:siteId/telemetry/snapshots?from=&to=
 */
async function getTelemetrySnapshots(
  siteId: string,
  from: Date,
  to: Date,
  bessAssetId?: string,
  limit?: number,
  offset?: number
): Promise<{ snapshots: TelemetrySnapshotRow[]; total: number; summary?: { chargeDifference: number | null; dischargeDifference: number | null; } }> {
  let url = `/api/sites/${siteId}/telemetry/snapshots?from=${encodeURIComponent(from.toISOString())}&to=${encodeURIComponent(to.toISOString())}`;
  if (bessAssetId) url += `&bessAssetId=${encodeURIComponent(bessAssetId)}`;
  if (limit) url += `&limit=${limit}`;
  if (offset) url += `&offset=${offset}`;

  const data = await apiFetch<{ data: { snapshots: TelemetrySnapshotRow[]; total: number; summary?: { chargeDifference: number | null; dischargeDifference: number | null; } } }>(url);
  return data.data;
}

/**
 * Returns dynamic telemetry report for the given site and time window.
 * GET /api/sites/:siteId/telemetry/dynamic-report
 */
async function getDynamicReport(
  siteId: string,
  from: Date,
  to: Date,
  intervalMinutes: number,
  bessAssetId?: string,
  limit?: number,
  offset?: number
): Promise<{ snapshots: TelemetrySnapshotRow[]; total: number; summary?: { chargeDifference: number | null; dischargeDifference: number | null; } }> {
  let url = `/api/sites/${siteId}/telemetry/dynamic-report?from=${encodeURIComponent(from.toISOString())}&to=${encodeURIComponent(to.toISOString())}&intervalMinutes=${intervalMinutes}`;
  if (bessAssetId) url += `&bessAssetId=${encodeURIComponent(bessAssetId)}`;
  if (limit) url += `&limit=${limit}`;
  if (offset) url += `&offset=${offset}`;

  const data = await apiFetch<{ data: { snapshots: TelemetrySnapshotRow[]; total: number; summary?: { chargeDifference: number | null; dischargeDifference: number | null; } } }>(url);
  return data.data;
}

/**
 * Downloads the dynamic telemetry report as an Excel blob.
 * GET /api/sites/:siteId/telemetry/export
 */
async function exportDynamicReport(
  siteId: string,
  from: Date,
  to: Date,
  intervalMinutes: number
): Promise<Blob> {
  let url = `/api/sites/${siteId}/telemetry/export?from=${encodeURIComponent(from.toISOString())}&to=${encodeURIComponent(to.toISOString())}&intervalMinutes=${intervalMinutes}`;

  const response = await authenticatedFetch(`${API_BASE}${url}`, {
    method: 'GET',
  });
  
  if (!response.ok) {
    let errorMsg = `Export failed: ${response.status}`;
    try {
      const data = await response.json();
      if (data?.error?.message) errorMsg = data.error.message;
      else if (data?.message) errorMsg = data.message;
    } catch(e) {}
    throw new Error(errorMsg);
  }
  
  return await response.blob();
}

// ---------------------------------------------------------------------------
// Typed error classes — lets DashboardPage distinguish empty-state vs error
// ---------------------------------------------------------------------------

export class ClientAccessError extends Error {
  constructor(message: string) { super(message); this.name = 'ClientAccessError'; }
}

export class NoSiteError extends Error {
  constructor(message: string) { super(message); this.name = 'NoSiteError'; }
}

export class NoBessError extends Error {
  constructor(message: string) { super(message); this.name = 'NoBessError'; }
}

// ---------------------------------------------------------------------------
// Individual Resource Fetchers for Phase 14C.5
// ---------------------------------------------------------------------------

async function getClients(): Promise<DashboardClient[]> {
  const data = await apiFetch<{ clients: DashboardClient[] }>('/api/clients');
  return data.clients || [];
}

async function getClient(clientId: string): Promise<DashboardClient> {
  const data = await apiFetch<{ client: DashboardClient }>(`/api/clients/${clientId}`);
  return data.client;
}

async function getSites(clientId: string): Promise<DashboardSite[]> {
  const data = await apiFetch<{ sites: DashboardSite[] }>(`/api/clients/${clientId}/sites`);
  return data.sites || [];
}

async function getSite(siteId: string): Promise<DashboardSite> {
  // Try to find the site via dashboardService's existing clients->sites, or use a specific endpoint if exists.
  // Actually, we can fetch the site directly from a hypothetical /api/sites/:siteId endpoint
  // Or we can just let components use context.
  const data = await apiFetch<{ site: DashboardSite }>(`/api/sites/${siteId}`);
  return data.site;
}

async function getBessAssets(siteId: string): Promise<DashboardBessAsset[]> {
  const data = await apiFetch<{ assets: DashboardBessAsset[] }>(`/api/sites/${siteId}/bess`);
  return data.assets || [];
}

async function getBessAsset(assetId: string): Promise<DashboardBessAsset> {
  const data = await apiFetch<{ asset: DashboardBessAsset }>(`/api/bess/${assetId}`);
  return data.asset;
}

async function getDevices(assetId: string): Promise<DashboardDevice[]> {
  const data = await apiFetch<{ devices: DashboardDevice[] }>(`/api/bess/${assetId}/devices`);
  return data.devices || [];
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

async function getBessVoltageTrend(assetId: string, startDate?: Date, endDate?: Date): Promise<import('./dashboard.types').VoltageTrendPoint[]> {
  const params = new URLSearchParams();
  if (startDate) params.append('startDate', startDate.toISOString());
  if (endDate) params.append('endDate', endDate.toISOString());
  
  const queryStr = params.toString();
  const url = `/api/bess/${assetId}/voltage-trend${queryStr ? '?' + queryStr : ''}`;
  
  const data = await apiFetch<{ data: import('./dashboard.types').VoltageTrendPoint[] }>(url);
  return data.data || [];
}

async function getBessGridStateTrend(assetId: string, startDate?: Date, endDate?: Date): Promise<import('./dashboard.types').GridStateTrendPoint[]> {
  const params = new URLSearchParams();
  if (startDate) params.append('startDate', startDate.toISOString());
  if (endDate) params.append('endDate', endDate.toISOString());
  
  const queryStr = params.toString();
  const url = `/api/bess/${assetId}/grid-state-trend${queryStr ? '?' + queryStr : ''}`;
  
  const data = await apiFetch<{ data: import('./dashboard.types').GridStateTrendPoint[] }>(url);
  return data.data || [];
}

export const dashboardService = {
  resolveClientContext,
  resolvePreviewContext,
  getLatestTelemetry,
  getHistoricalTelemetry,
  getTelemetrySnapshots,
  getDynamicReport,
  exportDynamicReport,
  getClients,
  getClient,
  getSites,
  getSite,
  getBessAssets,
  getBessAsset,
  getDevices,
  getBessVoltageTrend,
  getBessGridStateTrend,
};

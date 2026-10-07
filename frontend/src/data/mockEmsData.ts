export interface Site {
  id: string;
  name: string;
  location: string;
  status: 'Online' | 'Offline' | 'Warning';
  assetCount: number;
}

export interface Device {
  id: string;
  type: 'BMS' | 'PCS' | 'Meter' | 'Sensor';
  name: string;
  status: 'Online' | 'Offline' | 'Fault';
}

export interface BESSAsset {
  id: string;
  siteId: string;
  name: string;
  mqttTopic?: string | null;
  model: 'StorEDGE 0.25' | 'StorEDGE 5.0';
  energyCapacity: number; // in kWh
  powerRating: number; // in kW
  status: 'Charging' | 'Discharging' | 'Idle' | 'Offline';
  devices: Device[];
}

export const sites: Site[] = [
  { id: 'site-1', name: 'Alpha Industrial Park', location: 'Austin, TX', status: 'Online', assetCount: 2 },
  { id: 'site-2', name: 'Beta Manufacturing Facility', location: 'Dallas, TX', status: 'Warning', assetCount: 1 },
  { id: 'site-3', name: 'Gamma Distribution Center', location: 'Houston, TX', status: 'Offline', assetCount: 1 },
];

export const bessAssets: BESSAsset[] = [
  {
    id: 'bess-1',
    siteId: 'site-1',
    name: 'Alpha BESS 01',
    model: 'StorEDGE 5.0',
    energyCapacity: 5000,
    powerRating: 2500,
    status: 'Charging',
    devices: [
      { id: 'dev-1-1', type: 'BMS', name: 'BMS Controller', status: 'Online' },
      { id: 'dev-1-2', type: 'PCS', name: 'PCS Inverter', status: 'Online' },
      { id: 'dev-1-3', type: 'Meter', name: 'Main Meter', status: 'Online' },
      { id: 'dev-1-4', type: 'Sensor', name: 'Temp Sensor Array', status: 'Online' },
    ],
  },
  {
    id: 'bess-2',
    siteId: 'site-1',
    name: 'Alpha BESS 02',
    model: 'StorEDGE 5.0',
    energyCapacity: 5000,
    powerRating: 2500,
    status: 'Idle',
    devices: [
      { id: 'dev-2-1', type: 'BMS', name: 'BMS Controller', status: 'Online' },
      { id: 'dev-2-2', type: 'PCS', name: 'PCS Inverter', status: 'Online' },
      { id: 'dev-2-3', type: 'Meter', name: 'Main Meter', status: 'Online' },
      { id: 'dev-2-4', type: 'Sensor', name: 'Temp Sensor Array', status: 'Online' },
    ],
  },
  {
    id: 'bess-3',
    siteId: 'site-2',
    name: 'Beta BESS 01',
    model: 'StorEDGE 0.25',
    energyCapacity: 250,
    powerRating: 125,
    status: 'Discharging',
    devices: [
      { id: 'dev-3-1', type: 'BMS', name: 'BMS Controller', status: 'Warning' as any },
      { id: 'dev-3-2', type: 'PCS', name: 'PCS Inverter', status: 'Online' },
      { id: 'dev-3-3', type: 'Meter', name: 'Main Meter', status: 'Online' },
      { id: 'dev-3-4', type: 'Sensor', name: 'Temp Sensor Array', status: 'Online' },
    ],
  },
  {
    id: 'bess-4',
    siteId: 'site-3',
    name: 'Gamma BESS 01',
    model: 'StorEDGE 5.0',
    energyCapacity: 5000,
    powerRating: 2500,
    status: 'Offline',
    devices: [
      { id: 'dev-4-1', type: 'BMS', name: 'BMS Controller', status: 'Offline' },
      { id: 'dev-4-2', type: 'PCS', name: 'PCS Inverter', status: 'Offline' },
      { id: 'dev-4-3', type: 'Meter', name: 'Main Meter', status: 'Offline' },
      { id: 'dev-4-4', type: 'Sensor', name: 'Temp Sensor Array', status: 'Offline' },
    ],
  },
];

export const getSites = (): Site[] => sites;
export const getSiteById = (id: string): Site | undefined => sites.find(s => s.id === id);
export const getBESSAssets = (): BESSAsset[] => bessAssets;
export const getBESSAssetById = (id: string): BESSAsset | undefined => bessAssets.find(a => a.id === id);
export const getAssetsBySiteId = (siteId: string): BESSAsset[] => bessAssets.filter(a => a.siteId === siteId);

export interface BessAsset {
  id: string;
  name: string;
  assetIdentifier: string;
  emuId?: string | null;
  mqttTopic?: string | null;
  model?: string;
  energyCapacity?: number;
  powerRating?: number;
  reportIntervalMinutes?: number;
  createdAt: string;
  updatedAt: string;
  siteId: string;
}

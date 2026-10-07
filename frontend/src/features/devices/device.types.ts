export type DeviceType = 'BMS' | 'PCS' | 'EMU' | 'TMS' | 'METER' | 'IO' | 'PV_INVERTER';

export interface Device {
  id: string;
  type: DeviceType;
  name: string | null;
  hardwareId: string | null;
  componentId: string | null;
  bessAssetId: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateDevicePayload {
  type: DeviceType;
  name?: string;
  componentId: string;
  hardwareId?: string;
}

export interface UpdateDevicePayload {
  type?: DeviceType;
  name?: string | null;
  componentId?: string;
  hardwareId?: string | null;
}

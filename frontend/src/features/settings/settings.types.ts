/**
 * User-scoped preferences and display unit types.
 *
 * All conversions are presentation-layer only. Raw telemetry, database
 * records, and API contracts remain strictly in base SI units (kW, kWh, V, A, Hz, °C).
 */

export type PowerUnit = 'kW' | 'MW';
export type EnergyUnit = 'kWh' | 'MWh';
export type TimeFormat = '12h' | '24h';
export type DateFormat = 'DD MMM YYYY' | 'YYYY-MM-DD' | 'MM/DD/YYYY';
export type ReportDateRange = 'Today' | 'Yesterday' | 'Last 7 Days' | 'Last 30 Days';
export type TimezoneMode = 'site' | 'browser';
export type AlarmSoundProfileId =
  | 'classic-double-beep'
  | 'soft-chime'
  | 'urgent-pulse'
  | 'high-low-alert';

export interface UserPreferences {
  powerUnit: PowerUnit;
  energyUnit: EnergyUnit;
  timeFormat: TimeFormat;
  dateFormat: DateFormat;
  defaultReportRange: ReportDateRange;
  timezoneMode: TimezoneMode;
  alarmSoundEnabled: boolean;
  alarmSoundProfile: AlarmSoundProfileId;
  warningAlarmSoundProfile: AlarmSoundProfileId;
  criticalAlarmSoundProfile: AlarmSoundProfileId;
}

export const DEFAULT_PREFERENCES: UserPreferences = {
  powerUnit: 'kW',
  energyUnit: 'kWh',
  timeFormat: '12h',
  dateFormat: 'DD MMM YYYY',
  defaultReportRange: 'Today',
  timezoneMode: 'site',
  alarmSoundEnabled: true,
  alarmSoundProfile: 'classic-double-beep',
  warningAlarmSoundProfile: 'soft-chime',
  criticalAlarmSoundProfile: 'urgent-pulse',
};

export interface UserSettingsContextValue {
  preferences: UserPreferences;
  updatePreferences: (updates: Partial<UserPreferences>) => void;
  resetPreferences: () => void;
  activeClientId: string | null;
  setActiveClientId: (id: string | null | undefined) => void;
  activeSiteTimezone: string | null;
  setActiveSiteTimezone: (tz: string | null | undefined) => void;
  resolvedTimezone: string;
  formatPower: (valueKw: number | undefined | null, maxDecimals?: number) => { displayValue: string; unit: string };
  formatEnergy: (valueKwh: number | undefined | null, maxDecimals?: number) => { displayValue: string; unit: string };
  formatDate: (dateInput: string | number | Date | undefined | null, timeZone?: string) => string;
  formatTime: (dateInput: string | number | Date | undefined | null, includeSeconds?: boolean, timeZone?: string) => string;
  formatDateTime: (dateInput: string | number | Date | undefined | null, includeSeconds?: boolean, timeZone?: string) => string;
  playTestChime: (profileId?: AlarmSoundProfileId) => Promise<boolean> | boolean;
}

// ---------------------------------------------------------------------------
// Product-aware BESS details for Live Format Preview
// ---------------------------------------------------------------------------

export type BessPreviewSource = 'configured' | 'illustrative';

export interface BessPreviewFormattedValue {
  displayValue: string;
  unit: string;
  isApparentPower?: boolean;
}

export interface BessPreviewResult {
  source: BessPreviewSource;
  assetName: string;
  modelName: string;
  contextTitle: string;
  contextBadge: string;
  contextDescription?: string;
  powerRating: BessPreviewFormattedValue;
  energyCapacity: BessPreviewFormattedValue;
  isApparentPower: boolean;
}

export interface BessProductCatalogPreset {
  id: 'storedge-025' | 'storedge-50';
  name: string;
  model: string;
  publishedEnergyCapacityKwh: number;
  publishedPowerRatingValue: number;
  publishedPowerRatingUnit: 'kVA' | 'MVA';
}

export const STOREDGE_CATALOG_PRESETS: Record<'storedge-025' | 'storedge-50', BessProductCatalogPreset> = {
  'storedge-025': {
    id: 'storedge-025',
    name: 'StorEDGE 0.25',
    model: 'StorEDGE 0.25',
    publishedEnergyCapacityKwh: 250,
    publishedPowerRatingValue: 125,
    publishedPowerRatingUnit: 'kVA',
  },
  'storedge-50': {
    id: 'storedge-50',
    name: 'StorEDGE 5.0',
    model: 'StorEDGE 5.0',
    publishedEnergyCapacityKwh: 5000,
    publishedPowerRatingValue: 2.5,
    publishedPowerRatingUnit: 'MVA',
  },
};




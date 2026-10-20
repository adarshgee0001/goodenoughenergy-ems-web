import type {
  UserPreferences,
  PowerUnit,
  EnergyUnit,
  TimeFormat,
  DateFormat,
  ReportDateRange,
  TimezoneMode,
  AlarmSoundProfileId,
  BessPreviewResult,
} from './settings.types';
import { DEFAULT_PREFERENCES, STOREDGE_CATALOG_PRESETS } from './settings.types';
import { VALID_SOUND_PROFILES } from './alarmAudio.utils';

const VALID_POWER_UNITS: PowerUnit[] = ['kW', 'MW'];
const VALID_ENERGY_UNITS: EnergyUnit[] = ['kWh', 'MWh'];
const VALID_TIME_FORMATS: TimeFormat[] = ['12h', '24h'];
const VALID_DATE_FORMATS: DateFormat[] = ['DD MMM YYYY', 'YYYY-MM-DD', 'MM/DD/YYYY'];
const VALID_REPORT_RANGES: ReportDateRange[] = ['Today', 'Yesterday', 'Last 7 Days', 'Last 30 Days'];
const VALID_TIMEZONE_MODES: TimezoneMode[] = ['site', 'browser'];

/**
 * Validates unknown data retrieved from localStorage, falling back to defaults for any invalid field.
 */
export function validatePreferences(raw: unknown): UserPreferences {
  if (!raw || typeof raw !== 'object') {
    return { ...DEFAULT_PREFERENCES };
  }

  const data = raw as Record<string, unknown>;

  const powerUnit: PowerUnit =
    typeof data.powerUnit === 'string' && VALID_POWER_UNITS.includes(data.powerUnit as PowerUnit)
      ? (data.powerUnit as PowerUnit)
      : DEFAULT_PREFERENCES.powerUnit;

  const energyUnit: EnergyUnit =
    typeof data.energyUnit === 'string' && VALID_ENERGY_UNITS.includes(data.energyUnit as EnergyUnit)
      ? (data.energyUnit as EnergyUnit)
      : DEFAULT_PREFERENCES.energyUnit;

  const timeFormat: TimeFormat =
    typeof data.timeFormat === 'string' && VALID_TIME_FORMATS.includes(data.timeFormat as TimeFormat)
      ? (data.timeFormat as TimeFormat)
      : DEFAULT_PREFERENCES.timeFormat;

  const dateFormat: DateFormat =
    typeof data.dateFormat === 'string' && VALID_DATE_FORMATS.includes(data.dateFormat as DateFormat)
      ? (data.dateFormat as DateFormat)
      : DEFAULT_PREFERENCES.dateFormat;

  const defaultReportRange: ReportDateRange =
    typeof data.defaultReportRange === 'string' && VALID_REPORT_RANGES.includes(data.defaultReportRange as ReportDateRange)
      ? (data.defaultReportRange as ReportDateRange)
      : DEFAULT_PREFERENCES.defaultReportRange;

  const timezoneMode: TimezoneMode =
    typeof data.timezoneMode === 'string' && VALID_TIMEZONE_MODES.includes(data.timezoneMode as TimezoneMode)
      ? (data.timezoneMode as TimezoneMode)
      : DEFAULT_PREFERENCES.timezoneMode;

  const alarmSoundEnabled: boolean =
    typeof data.alarmSoundEnabled === 'boolean'
      ? data.alarmSoundEnabled
      : DEFAULT_PREFERENCES.alarmSoundEnabled;

  const alarmSoundProfile: AlarmSoundProfileId =
    typeof data.alarmSoundProfile === 'string' &&
    VALID_SOUND_PROFILES.includes(data.alarmSoundProfile as AlarmSoundProfileId)
      ? (data.alarmSoundProfile as AlarmSoundProfileId)
      : DEFAULT_PREFERENCES.alarmSoundProfile;

  const warningAlarmSoundProfile: AlarmSoundProfileId =
    typeof data.warningAlarmSoundProfile === 'string' &&
    VALID_SOUND_PROFILES.includes(data.warningAlarmSoundProfile as AlarmSoundProfileId)
      ? (data.warningAlarmSoundProfile as AlarmSoundProfileId)
      : DEFAULT_PREFERENCES.warningAlarmSoundProfile;

  const criticalAlarmSoundProfile: AlarmSoundProfileId =
    typeof data.criticalAlarmSoundProfile === 'string' &&
    VALID_SOUND_PROFILES.includes(data.criticalAlarmSoundProfile as AlarmSoundProfileId)
      ? (data.criticalAlarmSoundProfile as AlarmSoundProfileId)
      : typeof data.alarmSoundProfile === 'string' &&
        VALID_SOUND_PROFILES.includes(data.alarmSoundProfile as AlarmSoundProfileId)
      ? (data.alarmSoundProfile as AlarmSoundProfileId)
      : DEFAULT_PREFERENCES.criticalAlarmSoundProfile;

  return {
    powerUnit,
    energyUnit,
    timeFormat,
    dateFormat,
    defaultReportRange,
    timezoneMode,
    alarmSoundEnabled,
    alarmSoundProfile,
    warningAlarmSoundProfile,
    criticalAlarmSoundProfile,
  };
}

/**
 * Presentation-layer power conversion.
 * Stored values are always in kW.
 */
export function formatPowerDisplay(
  valueKw: number | undefined | null,
  targetUnit: PowerUnit = 'kW',
  maxDecimals = 2
): { displayValue: string; unit: string } {
  if (valueKw === undefined || valueKw === null || typeof valueKw !== 'number' || isNaN(valueKw)) {
    return { displayValue: '--', unit: targetUnit };
  }

  if (targetUnit === 'MW') {
    const mw = valueKw / 1000;
    const rounded = Number(mw.toFixed(maxDecimals));
    const normalized = Object.is(rounded, -0) ? 0 : rounded;
    return { displayValue: normalized.toString(), unit: 'MW' };
  }

  // Base unit: kW
  const rounded = Number(valueKw.toFixed(maxDecimals));
  const normalized = Object.is(rounded, -0) ? 0 : rounded;
  return { displayValue: normalized.toString(), unit: 'kW' };
}

/**
 * Presentation-layer energy conversion.
 * Stored values are always in kWh.
 */
export function formatEnergyDisplay(
  valueKwh: number | undefined | null,
  targetUnit: EnergyUnit = 'kWh',
  maxDecimals = 2
): { displayValue: string; unit: string } {
  if (valueKwh === undefined || valueKwh === null || typeof valueKwh !== 'number' || isNaN(valueKwh)) {
    return { displayValue: '--', unit: targetUnit };
  }

  if (targetUnit === 'MWh') {
    const mwh = valueKwh / 1000;
    const rounded = Number(mwh.toFixed(maxDecimals));
    const normalized = Object.is(rounded, -0) ? 0 : rounded;
    return { displayValue: normalized.toString(), unit: 'MWh' };
  }

  // Base unit: kWh
  const rounded = Number(valueKwh.toFixed(maxDecimals));
  const normalized = Object.is(rounded, -0) ? 0 : rounded;
  return { displayValue: normalized.toString(), unit: 'kWh' };
}

export interface DateParts {
  year: string;
  monthIndex: number;
  monthShort: string;
  monthNum: string;
  day: string;
  hours24: number;
  minutes: string;
  seconds: string;
}

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/**
 * Validates whether an IANA timezone string is supported by the runtime Intl implementation.
 */
export function isValidTimeZone(tz: string | null | undefined): boolean {
  if (!tz || typeof tz !== 'string') return false;
  try {
    Intl.DateTimeFormat(undefined, { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/**
 * Returns the resolved runtime/browser IANA timezone string.
 */
export function getBrowserTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}

/**
 * Resolves the effective IANA timezone string based on the user's mode preference and site context.
 * In 'site' mode, if site timezone is missing or invalid, falls back defensively to browser timezone.
 */
export function resolveEffectiveTimezone(
  mode: TimezoneMode = 'site',
  siteTimezone?: string | null
): string {
  if (mode === 'site' && isValidTimeZone(siteTimezone)) {
    return siteTimezone!;
  }
  return getBrowserTimezone();
}

/**
 * Returns a human-friendly timezone label with GMT offset (e.g. "Asia/Kolkata (GMT+5:30)").
 */
export function getTimezoneLabel(tz: string): string {
  if (!isValidTimeZone(tz)) return tz || 'UTC';
  try {
    const parts = new Intl.DateTimeFormat('en-US', { timeZone: tz, timeZoneName: 'shortOffset' }).formatToParts(new Date());
    const offset = parts.find((p) => p.type === 'timeZoneName')?.value;
    return offset ? `${tz} (${offset})` : tz;
  } catch {
    return tz;
  }
}

function parseDateInput(input: string | number | Date | undefined | null): Date | null {
  if (input === undefined || input === null || input === '') return null;
  const d = new Date(input);
  return isNaN(d.getTime()) ? null : d;
}

/**
 * Extracts calendar and clock parts from a Date in a specific IANA timezone (or default/browser if omitted).
 */
export function getDateParts(d: Date, timeZone?: string): DateParts {
  const options: Intl.DateTimeFormatOptions = {
    hourCycle: 'h23',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
    second: 'numeric',
  };

  if (timeZone && isValidTimeZone(timeZone)) {
    options.timeZone = timeZone;
  }

  const parts = new Intl.DateTimeFormat('en-US', options).formatToParts(d);
  const partMap: Record<string, string> = {};
  for (const p of parts) {
    if (p.type !== 'literal') {
      partMap[p.type] = p.value;
    }
  }

  const mNum = parseInt(partMap.month, 10);
  const monthIndex = isNaN(mNum) ? 0 : mNum - 1;
  const monthShort = MONTH_NAMES[monthIndex] || '';
  const monthNum = (monthIndex + 1).toString().padStart(2, '0');
  const day = (parseInt(partMap.day, 10) || 1).toString().padStart(2, '0');
  const year = partMap.year || '1970';
  const rawHour = parseInt(partMap.hour, 10);
  const hours24 = isNaN(rawHour) ? 0 : rawHour % 24;
  const minutes = (parseInt(partMap.minute, 10) || 0).toString().padStart(2, '0');
  const seconds = (parseInt(partMap.second, 10) || 0).toString().padStart(2, '0');

  return {
    year,
    monthIndex,
    monthShort,
    monthNum,
    day,
    hours24,
    minutes,
    seconds,
  };
}

/**
 * Calculates the next top-of-the-hour instant (in ms) >= ts in the target timezone.
 * Eliminates fractional-hour offset drift (e.g. +05:30) on chart X-axis tick intervals.
 */
export function getNextHourInTz(ts: number, timeZone?: string): number {
  const parts = getDateParts(new Date(ts), timeZone);
  const minutes = parseInt(parts.minutes, 10);
  const seconds = parseInt(parts.seconds, 10);
  const ms = ts % 1000;
  const msIntoHour = (minutes * 60 + seconds) * 1000 + (ms >= 0 ? ms : (1000 + ms));
  if (msIntoHour === 0) return ts;
  return ts + (3600000 - msIntoHour);
}

export function formatDateCustom(
  dateInput: string | number | Date | undefined | null,
  format: DateFormat = 'DD MMM YYYY',
  timeZone?: string
): string {
  const d = parseDateInput(dateInput);
  if (!d) return '--';

  const parts = getDateParts(d, timeZone);

  switch (format) {
    case 'YYYY-MM-DD':
      return `${parts.year}-${parts.monthNum}-${parts.day}`;
    case 'MM/DD/YYYY':
      return `${parts.monthNum}/${parts.day}/${parts.year}`;
    case 'DD MMM YYYY':
    default:
      return `${parts.day} ${parts.monthShort} ${parts.year}`;
  }
}

export function formatTimeCustom(
  dateInput: string | number | Date | undefined | null,
  format: TimeFormat = '12h',
  includeSeconds = false,
  timeZone?: string
): string {
  const d = parseDateInput(dateInput);
  if (!d) return '--';

  const parts = getDateParts(d, timeZone);

  if (format === '24h') {
    return includeSeconds
      ? `${parts.hours24.toString().padStart(2, '0')}:${parts.minutes}:${parts.seconds}`
      : `${parts.hours24.toString().padStart(2, '0')}:${parts.minutes}`;
  }

  // 12h format
  const ampm = parts.hours24 >= 12 ? 'PM' : 'AM';
  const hours12 = parts.hours24 % 12 || 12;
  const secPart = includeSeconds ? `:${parts.seconds}` : '';
  return `${hours12.toString().padStart(2, '0')}:${parts.minutes}${secPart} ${ampm}`;
}

export function formatDateTimeCustom(
  dateInput: string | number | Date | undefined | null,
  dateFormat: DateFormat = 'DD MMM YYYY',
  timeFormat: TimeFormat = '12h',
  includeSeconds = false,
  timeZone?: string
): string {
  const d = parseDateInput(dateInput);
  if (!d) return '--';

  const dateStr = formatDateCustom(d, dateFormat, timeZone);
  const timeStr = formatTimeCustom(d, timeFormat, includeSeconds, timeZone);
  return `${dateStr}, ${timeStr}`;
}

// ---------------------------------------------------------------------------
// Product-Aware BESS Details for Live Format Preview
// ---------------------------------------------------------------------------

export interface ResolveBessPreviewOptions {
  bessAssets?: Array<{
    id?: string;
    name?: string;
    model?: string | null;
    powerRating?: number | null;
    energyCapacity?: number | null;
  }> | null;
  powerUnit?: PowerUnit;
  energyUnit?: EnergyUnit;
  fallbackPresetId?: 'storedge-025' | 'storedge-50';
}

/**
 * Resolves contextual BESS details for the Live Format Preview in Settings.
 *
 * Business logic:
 * 1. If configured BESS assets exist for the site:
 *    - Deterministically selects the representative asset (bessAssets[0]).
 *    - Uses its individual configured powerRating (stored in kW) and energyCapacity (stored in kWh).
 *    - Does NOT aggregate or sum across multiple BESS assets.
 *    - Applies the user's selected Power & Energy unit preferences.
 * 2. If no configured BESS assets are available:
 *    - Uses a verified GoodEnough Energy product catalogue preset (StorEDGE 0.25 default, or StorEDGE 5.0).
 *    - Explicitly labels it as an illustrative catalogue reference, not actual site configuration.
 *    - StorEDGE 0.25: Published energy capacity = 250 kWh, published power rating = 125 kVA.
 *    - StorEDGE 5.0: Published energy capacity = 5,000 kWh, published power rating = 2.5 MVA.
 *    - kVA/MVA apparent power ratings are NOT forced through kW/MW formatters.
 */
export function resolveBessPreview(options: ResolveBessPreviewOptions = {}): BessPreviewResult {
  const {
    bessAssets,
    powerUnit = 'kW',
    energyUnit = 'kWh',
    fallbackPresetId = 'storedge-025',
  } = options;

  // Case 1: Site has configured BESS asset(s)
  if (bessAssets && Array.isArray(bessAssets) && bessAssets.length > 0) {
    const totalCount = bessAssets.length;
    // Selection convention: deterministic representative asset (index 0)
    const asset = bessAssets[0];
    const assetName = asset?.name?.trim() || 'Configured BESS';
    const rawModel = asset?.model?.trim();
    const modelName = rawModel && rawModel.length > 0 ? rawModel : '--';

    const isMultiBess = totalCount > 1;
    const contextTitle = isMultiBess
      ? `Representative BESS: ${assetName}`
      : `Configured BESS: ${assetName}`;
    const contextBadge = isMultiBess
      ? `Representative Asset (1 of ${totalCount})`
      : 'Configured Asset';
    const contextDescription = isMultiBess
      ? `Showing 1 of ${totalCount} BESS assets. Power and energy ratings reflect this individual asset, not site aggregate.`
      : undefined;

    // Configured assets store powerRating in kW and energyCapacity in kWh
    const powerFormatted = formatPowerDisplay(asset?.powerRating, powerUnit);
    const energyFormatted = formatEnergyDisplay(asset?.energyCapacity, energyUnit);

    return {
      source: 'configured',
      assetName,
      modelName,
      contextTitle,
      contextBadge,
      contextDescription,
      powerRating: {
        displayValue: powerFormatted.displayValue,
        unit: powerFormatted.unit,
        isApparentPower: false,
      },
      energyCapacity: {
        displayValue: energyFormatted.displayValue,
        unit: energyFormatted.unit,
        isApparentPower: false,
      },
      isApparentPower: false,
    };
  }

  // Case 2: No configured BESS available — illustrative product catalogue preset
  const presetKey = fallbackPresetId === 'storedge-50' ? 'storedge-50' : 'storedge-025';
  const preset = STOREDGE_CATALOG_PRESETS[presetKey];

  // Energy capacity is published in kWh (250 kWh or 5000 kWh), formatted with the user's unit preference
  const energyFormatted = formatEnergyDisplay(preset.publishedEnergyCapacityKwh, energyUnit);

  // Power rating is published as apparent power in kVA/MVA (125 kVA or 2.5 MVA).
  // kW and kVA are not interchangeable without electrical assumptions (power factor).
  // Therefore, display verified apparent rating directly with its correct unit.
  return {
    source: 'illustrative',
    assetName: preset.name,
    modelName: preset.model,
    contextTitle: `Illustrative product configuration — ${preset.name}`,
    contextBadge: 'Catalogue Example',
    contextDescription: 'No configured BESS found for this site. Displaying official product reference specifications.',
    powerRating: {
      displayValue: preset.publishedPowerRatingValue.toString(),
      unit: preset.publishedPowerRatingUnit,
      isApparentPower: true,
    },
    energyCapacity: {
      displayValue: energyFormatted.displayValue,
      unit: energyFormatted.unit,
      isApparentPower: false,
    },
    isApparentPower: true,
  };
}


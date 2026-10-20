import { formatDateTimeCustom } from '../features/settings/settings.utils';
import type { DateFormat, TimeFormat } from '../features/settings/settings.types';

export const formatAlarmTime = (
  isoString: string,
  dateFormat?: DateFormat,
  timeFormat?: TimeFormat,
  timeZone?: string
): string => {
  return formatDateTimeCustom(isoString, dateFormat, timeFormat, false, timeZone);
};

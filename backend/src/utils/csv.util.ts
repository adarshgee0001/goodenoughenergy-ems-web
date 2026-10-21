/**
 * Utility functions for RFC 4180 compliant CSV serialization.
 */

/**
 * Format a single value as an RFC 4180 compliant CSV field.
 * - Handles null and undefined as empty strings.
 * - Preserves numeric values (0, 1, negatives, decimals).
 * - Encloses fields in double quotes if they contain commas, double quotes, or newlines.
 * - Escapes double quotes by doubling them ("").
 * - Sanitizes untrusted text fields against spreadsheet formula injection (=, +, -, @, \t, \r).
 */
export function escapeCsvField(value: any, sanitizeFormulas = false): string {
  if (value === null || value === undefined) {
    return '';
  }

  // Handle Date objects
  if (value instanceof Date) {
    return value.toISOString();
  }

  // Handle numbers and booleans
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }

  let str = String(value);

  // Optional formula injection mitigation for text fields
  if (sanitizeFormulas && str.length > 0 && /^[=+\-@\t\r]/.test(str)) {
    // Only prefix if it's not a valid number (e.g., negative numbers like -10 should not be prefixed)
    if (isNaN(Number(str))) {
      str = `'${str}`;
    }
  }

  // Check if quoting is required: comma, double-quote, or newline
  if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    return `"${str.replace(/"/g, '""')}"`;
  }

  return str;
}

/**
 * Serialize an array of values into a single CSV row line (with CRLF \r\n).
 */
export function formatCsvRow(fields: any[], sanitizeFormulas = false): string {
  return fields.map((f) => escapeCsvField(f, sanitizeFormulas)).join(',') + '\r\n';
}

/**
 * Format timestamp in local site timezone matching the export presentation:
 * dd MMMM yyyy, hh:mm:ss a (e.g. "11 October 2026, 10:30:00 PM")
 */
export function formatSiteTimestamp(date: Date, siteTimezone: string): string {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: siteTimezone,
    day: '2-digit',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: true,
  });

  const parts = formatter.formatToParts(date);
  const partMap: Record<string, string> = {};
  for (const p of parts) partMap[p.type] = p.value;

  const day = String(parseInt(partMap.day, 10));
  const dayPeriod = (partMap.dayPeriod || '').toUpperCase();

  // dd MMMM yyyy, hh:mm:ss a (e.g. "11 October 2026, 10:30:00 PM")
  return `${day} ${partMap.month} ${partMap.year}, ${partMap.hour}:${partMap.minute}:${partMap.second} ${dayPeriod}`;
}

/**
 * Format a reporting boundary timestamp in local site timezone:
 * e.g. "14 Oct 2026 00:00 IST"
 */
export function formatReportBoundary(date: Date, siteTimezone: string = 'Asia/Kolkata'): string {
  const tz = siteTimezone || 'Asia/Kolkata';
  try {
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
      timeZoneName: 'short',
    });

    const parts = formatter.formatToParts(date);
    const partMap: Record<string, string> = {};
    for (const p of parts) partMap[p.type] = p.value;

    const tzName =
      partMap.timeZoneName === 'GMT+5:30' && tz === 'Asia/Kolkata'
        ? 'IST'
        : (partMap.timeZoneName || tz);

    return `${partMap.day} ${partMap.month} ${partMap.year} ${partMap.hour}:${partMap.minute} ${tzName}`;
  } catch {
    return date.toISOString();
  }
}

/**
 * Format the reporting period interval string for export headers:
 * e.g. "14 Oct 2026 00:00 IST – 14 Oct 2026 23:59 IST"
 */
export function formatReportPeriod(
  from: Date | undefined,
  to: Date | undefined,
  siteTimezone: string = 'Asia/Kolkata'
): string {
  if (!from || !to) return 'N/A';
  return `${formatReportBoundary(from, siteTimezone)} \u2013 ${formatReportBoundary(to, siteTimezone)}`;
}


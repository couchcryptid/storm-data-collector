/**
 * Format a CSV filename from report type and date
 *
 * Generates filename in format: YYMMDD_rpts_{type}.csv
 * Example: "260206_rpts_hail.csv" for Feb 6, 2026 hail reports
 *
 * @param type - Weather type: 'hail', 'wind', or 'torn'
 * @param date - Date to format (default: current date)
 * @returns Formatted CSV filename
 */
export function formatCsvFilename(
  type: string,
  date: Date = new Date()
): string {
  const yy = String(date.getFullYear()).slice(-2);
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `${yy}${mm}${dd}_rpts_${type}.csv`;
}

/**
 * Build complete CSV URL from base URL, type, and date
 *
 * Combines base URL with formatted CSV filename.
 * Example: "https://example.com/260206_rpts_hail.csv"
 *
 * @param baseUrl - Base URL (with trailing slash)
 * @param type - Weather type: 'hail', 'wind', or 'torn'
 * @param date - Date to format (default: current date)
 * @returns Complete CSV URL
 */
export function buildCsvUrl(
  baseUrl: string,
  type: string,
  date: Date = new Date()
): string {
  return `${baseUrl}${formatCsvFilename(type, date)}`;
}

/**
 * Expand an HHMM time string to a full ISO 8601 timestamp
 *
 * Combines a report date with the HHMM time from the CSV row.
 * Three-digit values are zero-padded: "930" → "0930".
 * Invalid or empty values return the date at midnight.
 *
 * @param hhmm - Time string in HHMM format (e.g. "1510")
 * @param date - Report date to combine with the time
 * @returns ISO 8601 string (e.g. "2024-04-26T15:10:00Z")
 */
export function expandHHMMToISO(hhmm: string, date: Date): string {
  const trimmed = hhmm.trim();
  if (trimmed.includes('T')) return trimmed;

  const dateStr = date.toISOString().slice(0, 10);
  if (trimmed.length < 3) return `${dateStr}T00:00:00Z`;

  const padded = trimmed.padStart(4, '0');
  const hours = padded.slice(0, 2);
  const mins = padded.slice(2, 4);

  const h = Number(hours);
  const m = Number(mins);
  if (
    Number.isNaN(h) ||
    Number.isNaN(m) ||
    h < 0 ||
    h > 23 ||
    m < 0 ||
    m > 59
  ) {
    return `${dateStr}T00:00:00Z`;
  }

  return `${dateStr}T${hours}:${mins}:00Z`;
}

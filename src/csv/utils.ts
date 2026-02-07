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

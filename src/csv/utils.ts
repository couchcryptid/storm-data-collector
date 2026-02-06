export function formatCsvFilename(
  type: string,
  date: Date = new Date()
): string {
  const yy = String(date.getFullYear()).slice(-2);
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `${yy}${mm}${dd}_${type}.csv`;
}

export function buildCsvUrl(
  baseUrl: string,
  type: string,
  date: Date = new Date()
): string {
  return `${baseUrl}${formatCsvFilename(type, date)}`;
}

import { Cron } from 'croner';

/**
 * Check if a CSV file is available at the given URL
 * @param url - The URL to check
 * @returns true if the CSV is available (status 200), false otherwise
 */
export async function checkCsvAvailability(url: string): Promise<boolean> {
  try {
    const res = await fetch(url);
    if (!res.ok) {
      console.warn(
        `[${new Date().toISOString()}] CSV missing or unavailable: ${url} (status ${res.status})`
      );
      return false;
    }
    return true;
  } catch (err) {
    console.error(
      `[${new Date().toISOString()}] Error checking CSV availability for ${url}:`,
      err
    );
    return false;
  }
}

/**
 * Schedule a one-time retry for failed CSV types after a specified delay
 * @param failedTypes - Array of CSV types that failed to process
 * @param retryCallback - Function to call for retry (receives failed types)
 * @param retryHours - Number of hours to wait before retry
 */
export function scheduleRetry(
  failedTypes: string[],
  retryCallback: (types: string[]) => Promise<void>,
  retryHours: number
): void {
  if (failedTypes.length === 0) {
    return;
  }

  if (retryHours <= 0) {
    console.warn(
      `[${new Date().toISOString()}] Invalid retry hours: ${retryHours}. Skipping retry.`
    );
    return;
  }

  const retryTime = new Date(Date.now() + retryHours * 60 * 60 * 1000);
  console.log(
    `[${new Date().toISOString()}] Scheduling retry at ${retryTime.toISOString()} for: ${failedTypes.join(', ')}`
  );

  new Cron(retryTime, async () => {
    console.log(`[${new Date().toISOString()}] Retry CSV job...`);

    try {
      await retryCallback(failedTypes);
    } catch (err) {
      console.error(
        `[${new Date().toISOString()}] Error during retry callback:`,
        err
      );
    }

    console.log(
      `[${new Date().toISOString()}] Retry job completed for: ${failedTypes.join(', ')}`
    );
  });
}

import { Cron } from 'croner';
import { csvStreamToKafka } from '../csv/csvStream.js';
import { config } from '../config.js';
import { buildCsvUrl } from '../csv/utils.js';

/**
 * Delay execution for specified milliseconds
 */
function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Calculate exponential fallback delay in milliseconds
 * @param attemptNumber - Zero-based attempt number (0 = first retry)
 * @param baseIntervalMinutes - Base interval in minutes
 */
function calculateFallbackDelay(
  attemptNumber: number,
  baseIntervalMinutes: number
): number {
  return baseIntervalMinutes * Math.pow(2, attemptNumber) * 60 * 1000;
}

/**
 * Process a single CSV type with exponential fallback on 500 errors
 * @returns true if successful, false if failed permanently
 */
async function processCsvWithFallback(
  type: string,
  date: Date,
  retryAttempts: Map<string, number>
): Promise<boolean> {
  const maxAttempts = config.cron.maxFallbackAttempts;
  const currentAttempt = retryAttempts.get(type) || 0;
  const url = buildCsvUrl(config.csvBaseUrl, type, date);

  try {
    console.log(
      `[${new Date().toISOString()}] Attempting CSV: ${url} (attempt ${
        currentAttempt + 1
      }/${maxAttempts + 1})`
    );

    await csvStreamToKafka({
      csvUrl: url,
      topic: config.topic,
      kafka: config.kafka,
      batchSize: config.batchSize,
      type,
    });

    console.log(`[${new Date().toISOString()}] Completed CSV: ${type}`);
    return true;
  } catch (err) {
    if (err instanceof Error && 'statusCode' in err) {
      const httpError = err as { statusCode: number; message: string };
      const statusCode = httpError.statusCode;

      // Retry on 500 errors with exponential backoff
      if (statusCode >= 500 && statusCode < 600) {
        if (currentAttempt < maxAttempts) {
          const delayMs = calculateFallbackDelay(
            currentAttempt,
            config.cron.fallbackIntervalMin
          );
          const delayMinutes = Math.round(delayMs / 60000);

          console.warn(
            `[${new Date().toISOString()}] Server error ${statusCode} for ${url}. ` +
              `Retrying in ${delayMinutes} minutes (attempt ${
                currentAttempt + 1
              }/${maxAttempts})...`
          );

          await delay(delayMs);
          retryAttempts.set(type, currentAttempt + 1);
          return await processCsvWithFallback(type, date, retryAttempts);
        } else {
          console.error(
            `[${new Date().toISOString()}] Max retry attempts (${maxAttempts}) reached for ${url}`
          );
          return false;
        }
      }

      // Log 404 - CSV not published yet
      if (statusCode === 404) {
        console.warn(
          `[${new Date().toISOString()}] CSV not found (404): ${url}. Skipping.`
        );
        return false;
      }

      // Log other client errors (400-499)
      if (statusCode >= 400 && statusCode < 500) {
        console.error(
          `[${new Date().toISOString()}] Client error ${statusCode} for ${url}: ${
            httpError.message
          }`
        );
        return false;
      }

      // Other HTTP errors
      console.error(
        `[${new Date().toISOString()}] HTTP error ${statusCode} for ${url}: ${
          httpError.message
        }`
      );
      return false;
    }

    // Network or other errors
    console.error(
      `[${new Date().toISOString()}] Failed to process ${url}:`,
      err instanceof Error ? err.message : err
    );
    return false;
  }
}

async function runJob() {
  console.log(`[${new Date().toISOString()}] Starting CSV job...`);

  const date = new Date();
  const retryAttempts = new Map<string, number>();
  const results: { type: string; success: boolean }[] = [];

  // Process CSVs with concurrency control
  const concurrent = config.maxConcurrentCsv;
  for (let i = 0; i < config.csvTypes.length; i += concurrent) {
    const batch = config.csvTypes.slice(i, i + concurrent);

    const batchResults = await Promise.allSettled(
      batch.map(async (type) => ({
        type,
        success: await processCsvWithFallback(type, date, retryAttempts),
      }))
    );

    batchResults.forEach((result) => {
      if (result.status === 'fulfilled') {
        results.push(result.value);
      } else {
        console.error(
          `[${new Date().toISOString()}] Unexpected error in batch processing:`,
          result.reason
        );
      }
    });
  }

  const successful = results.filter((r) => r.success).length;
  const failed = results.filter((r) => !r.success).length;

  console.log(
    `[${new Date().toISOString()}] CSV job finished. ` +
      `Successful: ${successful}, Failed: ${failed}`
  );
}

export function startScheduler() {
  // Run immediately on startup
  console.log(
    `[${new Date().toISOString()}] Running initial job immediately...`
  );
  runJob().catch((err) => {
    console.error(
      `[${new Date().toISOString()}] Initial job failed:`,
      err instanceof Error ? err.message : err
    );
  });

  // Schedule for regular execution
  new Cron(config.cron.schedule, async () => {
    await runJob();
  });

  console.log(
    `[${new Date().toISOString()}] Scheduler started with pattern: ${config.cron.schedule}`
  );
}

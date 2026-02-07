import { Cron } from 'croner';
import { csvStreamToKafka } from '../csv/csvStream.js';
import { config } from '../config.js';
import { buildCsvUrl } from '../csv/utils.js';
import logger from '../logger.js';

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
  const url = buildCsvUrl(config.reportsBaseUrl, type, date);

  try {
    logger.info(
      { url, attempt: currentAttempt + 1, maxAttempts: maxAttempts + 1 },
      'Attempting CSV'
    );

    await csvStreamToKafka({
      csvUrl: url,
      topic: config.topic,
      kafka: config.kafka,
      batchSize: config.batchSize,
      type,
    });

    logger.info({ type }, 'Completed CSV');
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

          logger.warn(
            {
              url,
              statusCode,
              delayMinutes,
              attempt: currentAttempt + 1,
              maxAttempts,
            },
            'Server error, retrying with exponential backoff'
          );

          await delay(delayMs);
          retryAttempts.set(type, currentAttempt + 1);
          return await processCsvWithFallback(type, date, retryAttempts);
        } else {
          logger.error(
            { url, maxAttempts, statusCode },
            'Max retry attempts reached'
          );
          return false;
        }
      }

      // Log 404 - CSV not published yet
      if (statusCode === 404) {
        logger.warn({ url }, 'CSV not found (404), skipping');
        return false;
      }

      // Log other client errors (400-499)
      if (statusCode >= 400 && statusCode < 500) {
        logger.error(
          { url, statusCode, message: httpError.message },
          'Client error'
        );
        return false;
      }

      // Other HTTP errors
      logger.error(
        { url, statusCode, message: httpError.message },
        'HTTP error'
      );
      return false;
    }

    // Network or other errors
    logger.error(
      { url, error: err instanceof Error ? err.message : String(err) },
      'Failed to process CSV'
    );
    return false;
  }
}

async function runJob() {
  logger.info('Starting CSV job');

  const date = new Date();
  const retryAttempts = new Map<string, number>();
  const results: { type: string; success: boolean }[] = [];

  // Process CSVs with concurrency control
  const concurrent = config.maxConcurrentCsv;
  for (let i = 0; i < config.reportTypes.length; i += concurrent) {
    const batch = config.reportTypes.slice(i, i + concurrent);

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
        logger.error(
          { error: result.reason },
          'Unexpected error in batch processing'
        );
      }
    });
  }

  const successful = results.filter((r) => r.success).length;
  const failed = results.filter((r) => !r.success).length;

  logger.info(
    { successful, failed, total: results.length },
    'CSV job finished'
  );
}

export function startScheduler() {
  // Run immediately on startup
  logger.info('Running initial job immediately');
  runJob().catch((err) => {
    logger.error(
      { error: err instanceof Error ? err.message : String(err) },
      'Initial job failed'
    );
  });

  // Schedule for regular execution
  new Cron(config.cron.schedule, async () => {
    await runJob();
  });

  logger.info({ pattern: config.cron.schedule }, 'Scheduler started');
}

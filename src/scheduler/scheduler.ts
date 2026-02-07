import { Cron } from 'croner';
import { csvStreamToKafka } from '../csv/csvStream.js';
import { config } from '../config.js';
import { buildCsvUrl } from '../csv/utils.js';
import logger from '../logger.js';
import { HTTP_STATUS_CODES, TIMING } from '../shared/constants.js';
import { getErrorMessage, isHttpError } from '../shared/errors.js';

/**
 * Delay execution for specified milliseconds
 */
function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Check if HTTP error is a server error (5xx)
 */
function isServerError(statusCode: number): boolean {
  return (
    statusCode >= HTTP_STATUS_CODES.SERVER_ERROR_MIN &&
    statusCode <= HTTP_STATUS_CODES.SERVER_ERROR_MAX
  );
}

/**
 * Check if HTTP error is a client error (4xx)
 */
function isClientError(statusCode: number): boolean {
  return (
    statusCode >= HTTP_STATUS_CODES.CLIENT_ERROR_MIN &&
    statusCode <= HTTP_STATUS_CODES.CLIENT_ERROR_MAX
  );
}

/**
 * Calculate exponential fallback delay in milliseconds
 * Formula: baseInterval * 2^attemptNumber
 * @param attemptNumber - Zero-based attempt number (0 = first retry)
 * @param baseIntervalMinutes - Base interval in minutes
 */
function calculateFallbackDelay(
  attemptNumber: number,
  baseIntervalMinutes: number
): number {
  const exponentialMultiplier = Math.pow(2, attemptNumber);
  return baseIntervalMinutes * exponentialMultiplier * TIMING.MS_PER_MINUTE;
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
    if (!isHttpError(err)) {
      // Network or non-HTTP errors
      logger.error(
        { url, error: getErrorMessage(err) },
        'Failed to process CSV'
      );
      return false;
    }

    const statusCode = err.statusCode;

    // Retry on server errors (5xx) with exponential backoff
    if (isServerError(statusCode)) {
      if (currentAttempt < maxAttempts) {
        const delayMs = calculateFallbackDelay(
          currentAttempt,
          config.cron.fallbackIntervalMin
        );
        const delayMinutes = Math.round(delayMs / TIMING.MS_PER_MINUTE);

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

    // Handle specific client errors
    if (statusCode === HTTP_STATUS_CODES.NOT_FOUND) {
      logger.warn({ url }, 'CSV not found (404), skipping');
      return false;
    }

    if (isClientError(statusCode)) {
      logger.error({ url, statusCode, message: err.message }, 'Client error');
      return false;
    }

    // Other HTTP errors
    logger.error({ url, statusCode, message: err.message }, 'HTTP error');
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

  const successful = results.filter((jobResult) => jobResult.success).length;
  const failed = results.filter((jobResult) => !jobResult.success).length;

  logger.info(
    { successful, failed, total: results.length },
    'CSV job finished'
  );
}

export function startScheduler() {
  // Run immediately on startup
  logger.info('Running initial job immediately');
  runJob().catch((err) => {
    logger.error({ error: getErrorMessage(err) }, 'Initial job failed');
  });

  // Schedule for regular execution
  new Cron(config.cron.schedule, async () => {
    await runJob();
  });

  logger.info({ pattern: config.cron.schedule }, 'Scheduler started');
}

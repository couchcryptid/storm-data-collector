import { Cron } from 'croner';
import { csvStreamToKafka } from '../csv/csvStream.js';
import { config } from '../config.js';
import { buildCsvUrl } from '../csv/utils.js';
import logger from '../logger.js';
import { HTTP_STATUS_CODES, TIMING } from '../shared/constants.js';
import { getErrorMessage, isHttpError } from '../shared/errors.js';
import { metrics } from '../metrics.js';

const RETRY_INTERVAL_MS = 5 * TIMING.MS_PER_MINUTE;
const MAX_RETRY_ATTEMPTS = 3;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isServerError(statusCode: number): boolean {
  return (
    statusCode >= HTTP_STATUS_CODES.SERVER_ERROR_MIN &&
    statusCode <= HTTP_STATUS_CODES.SERVER_ERROR_MAX
  );
}

function isClientError(statusCode: number): boolean {
  return (
    statusCode >= HTTP_STATUS_CODES.CLIENT_ERROR_MIN &&
    statusCode <= HTTP_STATUS_CODES.CLIENT_ERROR_MAX
  );
}

async function processCsv(type: string, date: Date): Promise<boolean> {
  const url = buildCsvUrl(config.reportsBaseUrl, type, date);

  for (let attempt = 1; attempt <= MAX_RETRY_ATTEMPTS + 1; attempt++) {
    const endCsvTimer = metrics.csvFetchDurationSeconds.startTimer({
      report_type: type,
    });
    try {
      logger.info(
        { url, attempt, maxAttempts: MAX_RETRY_ATTEMPTS + 1 },
        'Attempting CSV'
      );

      await csvStreamToKafka({
        csvUrl: url,
        topic: config.topic,
        kafka: config.kafka,
        type,
      });

      endCsvTimer();
      logger.info({ url, type }, 'CSV processing completed successfully');
      return true;
    } catch (err) {
      endCsvTimer();

      if (!isHttpError(err)) {
        logger.error(
          { url, error: getErrorMessage(err) },
          'Failed to process CSV'
        );
        return false;
      }

      const statusCode = err.statusCode;

      if (isServerError(statusCode) && attempt <= MAX_RETRY_ATTEMPTS) {
        metrics.retryTotal.inc({ report_type: type });
        logger.warn(
          {
            url,
            statusCode,
            delayMinutes: 5,
            attempt,
            maxAttempts: MAX_RETRY_ATTEMPTS,
          },
          'Server error, retrying'
        );
        await delay(RETRY_INTERVAL_MS);
        continue;
      }

      if (isServerError(statusCode)) {
        logger.error(
          { url, maxAttempts: MAX_RETRY_ATTEMPTS, statusCode },
          'Max retry attempts reached'
        );
        return false;
      }

      if (statusCode === HTTP_STATUS_CODES.NOT_FOUND) {
        logger.warn({ url }, 'CSV not found (404), skipping');
        return false;
      }

      if (isClientError(statusCode)) {
        logger.error({ url, statusCode, message: err.message }, 'Client error');
        return false;
      }

      logger.error({ url, statusCode, message: err.message }, 'HTTP error');
      return false;
    }
  }

  return false;
}

async function runJob() {
  const endJobTimer = metrics.jobDurationSeconds.startTimer();
  logger.info('Starting CSV job');

  const date = new Date();

  const results = await Promise.allSettled(
    config.reportTypes.map(async (type) => ({
      type,
      success: await processCsv(type, date),
    }))
  );

  let successful = 0;
  let failed = 0;

  for (const result of results) {
    if (result.status === 'fulfilled') {
      if (result.value.success) successful++;
      else failed++;
    } else {
      logger.error({ error: result.reason }, 'Unexpected error processing CSV');
      failed++;
    }
  }

  metrics.jobRunsTotal.inc({ status: failed > 0 ? 'failure' : 'success' });
  endJobTimer();

  logger.info(
    { successful, failed, total: config.reportTypes.length },
    'CSV job finished'
  );
}

export function startScheduler() {
  logger.info('Running initial job immediately');
  runJob().catch((err) => {
    logger.error({ error: getErrorMessage(err) }, 'Initial job failed');
  });

  new Cron(config.cron.schedule, async () => {
    await runJob();
  });

  logger.info({ pattern: config.cron.schedule }, 'Scheduler started');
}

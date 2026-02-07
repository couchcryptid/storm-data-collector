import { Cron } from 'croner';
import { csvStreamToKafka } from '../csv/csvStream.js';
import { config } from '../config.js';
import { buildCsvUrl } from '../csv/utils.js';
import { scheduleRetry, checkCsvAvailability } from './retry.js';

async function runJob() {
  console.log(`[${new Date().toISOString()}] Starting CSV job...`);

  const date = new Date();
  const failedTypes: string[] = [];

  // Process CSVs with concurrency control
  const concurrent = config.maxConcurrentCsv;
  for (let i = 0; i < config.csvTypes.length; i += concurrent) {
    const batch = config.csvTypes.slice(i, i + concurrent);

    await Promise.allSettled(
      batch.map(async (type) => {
        const url = buildCsvUrl(config.csvBaseUrl, type, date);
        console.log(`[${new Date().toISOString()}] Attempting CSV: ${url}`);

        // Check if CSV is available before processing
        const isAvailable = await checkCsvAvailability(url);
        if (!isAvailable) {
          failedTypes.push(type);
          return;
        }

        try {
          await csvStreamToKafka({
            csvUrl: url,
            topic: config.topic,
            kafka: config.kafka,
            batchSize: config.batchSize,
            type,
          });
          console.log(`[${new Date().toISOString()}] Completed CSV: ${type}`);
        } catch (err) {
          console.error(
            `[${new Date().toISOString()}] Failed to process ${url}:`,
            err instanceof Error ? err.message : err
          );
          failedTypes.push(type);
        }
      })
    );
  }

  // Schedule retry for failed CSVs
  if (failedTypes.length > 0) {
    scheduleRetry(
      failedTypes,
      async (types) => {
        // Retry callback - process failed types
        await Promise.allSettled(
          types.map(async (type) => {
            const url = buildCsvUrl(config.csvBaseUrl, type, date);
            console.log(
              `[${new Date().toISOString()}] Retry attempting CSV: ${url}`
            );

            const isAvailable = await checkCsvAvailability(url);
            if (!isAvailable) {
              console.warn(
                `[${new Date().toISOString()}] Retry CSV still missing: ${url}`
              );
              return;
            }

            try {
              await csvStreamToKafka({
                csvUrl: url,
                topic: config.topic,
                kafka: config.kafka,
                batchSize: config.batchSize,
                type,
              });
              console.log(
                `[${new Date().toISOString()}] Retry completed CSV: ${type}`
              );
            } catch (err) {
              console.error(
                `[${new Date().toISOString()}] Retry failed CSV: ${type}`,
                err instanceof Error ? err.message : err
              );
            }
          })
        );
      },
      config.cron.retryInterval
    );
  }

  console.log(`[${new Date().toISOString()}] Initial CSV job finished.`);
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

import { startScheduler } from './scheduler/scheduler.js';
import { startHealthServer } from './health.js';
import { config } from './config.js';
import logger from './logger.js';

const GRACEFUL_SHUTDOWN_TIMEOUT_MS = 10000;

logger.info(
  {
    reportsBaseUrl: config.reportsBaseUrl,
    reportTypes: config.reportTypes,
    kafkaTopic: config.topic,
    kafkaBrokers: config.kafka.brokers,
    cronSchedule: config.cron.schedule,
  },
  'Starting CSV Storm Data Report Cron Scheduler'
);

const healthServer = startHealthServer(3000);

startScheduler();

logger.info('Scheduler is running');

const shutdown = (signal: string) => {
  logger.info({ signal }, 'Received signal, shutting down gracefully...');

  healthServer.close(() => {
    logger.info('Health server closed');
    process.exit(0);
  });

  setTimeout(() => {
    logger.error('Forced shutdown after timeout');
    process.exit(1);
  }, GRACEFUL_SHUTDOWN_TIMEOUT_MS);
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

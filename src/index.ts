import { startScheduler } from './scheduler/scheduler.js';
import { startHealthServer } from './health.js';
import { config } from './config.js';
import logger, {
  printHeader,
  printConfig,
  printDivider,
  printStartupSuccess,
} from './logger.js';

const GRACEFUL_SHUTDOWN_TIMEOUT_MS = 10000;

printHeader('🌩️  CSV Weather Report Cron Scheduler');

printConfig('CSV Base URL', config.reportsBaseUrl);
printConfig('CSV Types', config.reportTypes.join(', '));
printConfig('Kafka Topic', config.topic);
printConfig('Kafka Client ID', config.kafka.clientId);
printConfig('Kafka Brokers', config.kafka.brokers.join(', '));

printDivider();

printConfig('Batch Size', String(config.batchSize));
printConfig('Max Concurrent', String(config.maxConcurrentCsv));
printConfig('Cron Schedule', config.cron.schedule);
printConfig(
  'Retry Strategy',
  `${config.cron.fallbackIntervalMin}min exponential backoff, ${config.cron.maxFallbackAttempts} max attempts`
);

printDivider();

printConfig('DLQ Support', config.dlq.enabled);
if (config.dlq.enabled) {
  printConfig('DLQ Topic', config.dlq.topic);
  printConfig('DLQ File Fallback', config.dlq.fileFallback.directory);
}

printDivider();

logger.info('Starting CSV Cron scheduler...');

// Start health check server (for Docker health checks)
const healthServer = startHealthServer(3000);

// Start cron scheduler
startScheduler();

printStartupSuccess('CSV Weather Report Cron Scheduler is running');

// Graceful shutdown handling
const shutdown = (signal: string) => {
  logger.info({ signal }, 'Received signal, shutting down gracefully...');

  // Close health server
  healthServer.close(() => {
    logger.info('Health server closed');
    process.exit(0);
  });

  // Force exit after timeout if graceful shutdown fails
  setTimeout(() => {
    logger.error('Forced shutdown after timeout');
    process.exit(1);
  }, GRACEFUL_SHUTDOWN_TIMEOUT_MS);
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

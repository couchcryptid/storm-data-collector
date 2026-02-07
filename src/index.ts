import { startScheduler } from './scheduler/scheduler.js';
import { startHealthServer } from './health.js';
import { config } from './config.js';

const GRACEFUL_SHUTDOWN_TIMEOUT_MS = 10000;

console.log('Starting CSV Cron job with the following configuration:');
console.log(`CSV Base URL: ${config.csvBaseUrl}`);
console.log(`CSV Types: ${config.csvTypes.join(', ')}`);
console.log(`Kafka Topic: ${config.topic}`);
console.log(`Kafka Client ID: ${config.kafka.clientId}`);
console.log(`Kafka Brokers: ${config.kafka.brokers.join(',')}`);
console.log(`Batch Size: ${config.batchSize}`);
console.log(`Max Concurrent CSV: ${config.maxConcurrentCsv}`);
console.log(`Cron Schedule: ${config.cron.schedule}`);
console.log(
  `Retry Config: ${config.cron.retryIntervalMin}min base interval, ${config.cron.maxFallbackAttempts} max attempts`
);
console.log(`DLQ: ${config.dlq.enabled ? 'Enabled' : 'Disabled'}`);
if (config.dlq.enabled) {
  console.log(`DLQ Topic: ${config.dlq.topic}`);
  console.log(`DLQ File Fallback: ${config.dlq.fileFallback.directory}`);
}

// Start health check server (for Docker health checks)
const healthServer = startHealthServer(3000);

// Start cron scheduler
startScheduler();

console.log('CSV Cron Running...');

// Graceful shutdown handling
const shutdown = (signal: string) => {
  console.log(
    `\n[${new Date().toISOString()}] Received ${signal}, shutting down gracefully...`
  );

  // Close health server
  healthServer.close(() => {
    console.log('Health server closed');
    process.exit(0);
  });

  // Force exit after timeout if graceful shutdown fails
  setTimeout(() => {
    console.error('Forced shutdown after timeout');
    process.exit(1);
  }, GRACEFUL_SHUTDOWN_TIMEOUT_MS);
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

import { startScheduler } from './scheduler/scheduler.js';
import { startHealthServer } from './health.js';
import { config } from './config.js';

console.log('Starting CSV Cron job with the following configuration:');
console.log(`CSV Base URL: ${config.csvBaseUrl}`);
console.log(`CSV Types: ${config.csvTypes.join(', ')}`);
console.log(`Kafka Topic: ${config.topic}`);
console.log(`Kafka Client ID: ${config.kafka.clientId}`);
console.log(`Kafka Brokers: ${config.kafka.brokers.join(',')}`);
console.log(`Batch Size: ${config.batchSize}`);
console.log(`Cron Schedule: ${config.cron.schedule}`);
console.log(`Cron Retry Interval (hours): ${config.cron.retryInterval}`);

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

  // Force exit after 10 seconds if graceful shutdown fails
  setTimeout(() => {
    console.error('Forced shutdown after timeout');
    process.exit(1);
  }, 10000);
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

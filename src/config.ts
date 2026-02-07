// src/config.ts
import { z } from 'zod';

// Environment variable schema
const envSchema = z.object({
  KAFKA_CLIENT_ID: z.string().default('csv-producer'),
  KAFKA_BROKERS: z.string().default('localhost:9092'),
  KAFKA_TOPIC: z.string().default('raw-weather-reports'),
  KAFKA_DLQ_TOPIC: z.string().default('raw-weather-reports-dlq'),
  CRON_SCHEDULE: z.string().default('0 0 * * *'),
  CRON_FALLBACK_INTERVAL_MIN: z.coerce.number().positive().max(120).default(30),
  CRON_MAX_FALLBACK_ATTEMPTS: z.coerce.number().positive().max(5).default(3),
  REPORTS_BASE_URL: z.url().default('https://example.com/'),
  BATCH_SIZE: z.coerce.number().positive().default(500),
  MAX_CONCURRENT_CSV: z.coerce.number().positive().max(10).default(3),
  REPORT_TYPES: z.string().default('torn,hail,wind'),
  DLQ_ENABLED: z.coerce.boolean().default(true),
  DLQ_FILE_FALLBACK_DIR: z.string().default('./data/dlq'),
  DLQ_FILE_MAX_SIZE_MB: z.coerce.number().positive().default(10),
  DLQ_INCLUDE_STACK_TRACES: z.coerce.boolean().default(true),
});

// Parse and validate environment variables
const env = envSchema.parse({
  KAFKA_CLIENT_ID: process.env.KAFKA_CLIENT_ID,
  KAFKA_BROKERS: process.env.KAFKA_BROKERS,
  KAFKA_TOPIC: process.env.KAFKA_TOPIC,
  KAFKA_DLQ_TOPIC: process.env.KAFKA_DLQ_TOPIC,
  REPORTS_BASE_URL: process.env.REPORTS_BASE_URL,
  CRON_SCHEDULE: process.env.CRON_SCHEDULE,
  CRON_FALLBACK_INTERVAL_MIN: process.env.CRON_FALLBACK_INTERVAL_MIN,
  CRON_MAX_FALLBACK_ATTEMPTS: process.env.CRON_MAX_FALLBACK_ATTEMPTS,
  BATCH_SIZE: process.env.BATCH_SIZE,
  MAX_CONCURRENT_CSV: process.env.MAX_CONCURRENT_CSV,
  REPORT_TYPES: process.env.REPORT_TYPES,
  DLQ_ENABLED: process.env.DLQ_ENABLED,
  DLQ_FILE_FALLBACK_DIR: process.env.DLQ_FILE_FALLBACK_DIR,
  DLQ_FILE_MAX_SIZE_MB: process.env.DLQ_FILE_MAX_SIZE_MB,
  DLQ_INCLUDE_STACK_TRACES: process.env.DLQ_INCLUDE_STACK_TRACES,
});

// Application configuration with validated values
export const config = {
  kafka: {
    clientId: env.KAFKA_CLIENT_ID,
    brokers: env.KAFKA_BROKERS.split(',').map((broker) => broker.trim()),
  },
  topic: env.KAFKA_TOPIC,
  reportsBaseUrl: env.REPORTS_BASE_URL,
  batchSize: env.BATCH_SIZE,
  maxConcurrentCsv: env.MAX_CONCURRENT_CSV,
  cron: {
    schedule: env.CRON_SCHEDULE,
    fallbackIntervalMin: env.CRON_FALLBACK_INTERVAL_MIN,
    maxFallbackAttempts: env.CRON_MAX_FALLBACK_ATTEMPTS,
  },
  reportTypes: env.REPORT_TYPES.split(',').map((type) => type.trim()),
  dlq: {
    enabled: env.DLQ_ENABLED,
    topic: env.KAFKA_DLQ_TOPIC,
    fileFallback: {
      directory: env.DLQ_FILE_FALLBACK_DIR,
      maxSizeMb: env.DLQ_FILE_MAX_SIZE_MB,
    },
    includeStackTraces: env.DLQ_INCLUDE_STACK_TRACES,
  },
};

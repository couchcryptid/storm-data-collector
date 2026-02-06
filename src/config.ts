// src/config.ts
import { z } from 'zod';

// Environment variable schema
const envSchema = z.object({
  KAFKA_CLIENT_ID: z.string().default('csv-producer'),
  KAFKA_BROKERS: z.string().default('localhost:9092'),
  KAFKA_TOPIC: z.string().default('raw-weather-reports'),
  CRON_SCHEDULE: z.string().default('0 0 * * *'),
  CRON_RETRY_INTERVAL: z.coerce.number().positive().default(6),
  CSV_BASE_URL: z.url().default('https://example.com/'),
  BATCH_SIZE: z.coerce.number().positive().default(500),
  MAX_CONCURRENT_CSV: z.coerce.number().positive().max(10).default(3),
  RETRY_HOURS: z.coerce.number().positive().max(48).default(6),
  CSV_TYPES: z.string().default('torn,hail,wind'),
});

// Parse and validate environment variables
const env = envSchema.parse({
  KAFKA_CLIENT_ID: process.env.KAFKA_CLIENT_ID,
  KAFKA_BROKERS: process.env.KAFKA_BROKERS,
  KAFKA_TOPIC: process.env.KAFKA_TOPIC,
  CSV_BASE_URL: process.env.CSV_BASE_URL,
  CRON_SCHEDULE: process.env.CRON_SCHEDULE,
  CRON_RETRY_INTERVAL: process.env.CRON_RETRY_INTERVAL,
  BATCH_SIZE: process.env.BATCH_SIZE,
  MAX_CONCURRENT_CSV: process.env.MAX_CONCURRENT_CSV,
  CSV_TYPES: process.env.CSV_TYPES,
});

// Application configuration with validated values
export const config = {
  kafka: {
    clientId: env.KAFKA_CLIENT_ID,
    brokers: env.KAFKA_BROKERS.split(',').map((b) => b.trim()),
  },
  topic: env.KAFKA_TOPIC,
  csvBaseUrl: env.CSV_BASE_URL,
  batchSize: env.BATCH_SIZE,
  maxConcurrentCsv: env.MAX_CONCURRENT_CSV,
  cron: {
    schedule: env.CRON_SCHEDULE,
    retryInterval: env.CRON_RETRY_INTERVAL,
  },
  csvTypes: env.CSV_TYPES.split(',').map((t) => t.trim()),
};

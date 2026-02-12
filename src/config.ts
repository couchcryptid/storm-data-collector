import { z } from 'zod';

const envSchema = z.object({
  KAFKA_CLIENT_ID: z.string().default('csv-producer'),
  KAFKA_BROKERS: z.string().default('kafka:9092'),
  KAFKA_TOPIC: z.string().default('raw-weather-reports'),
  CRON_SCHEDULE: z.string().default('0 0 * * *'),
  REPORTS_BASE_URL: z.url().default('https://example.com/'),
  REPORT_TYPES: z.string().default('torn,hail,wind'),
  LOG_LEVEL: z.string().default('info'),
});

const env = envSchema.parse({
  KAFKA_CLIENT_ID: process.env.KAFKA_CLIENT_ID,
  KAFKA_BROKERS: process.env.KAFKA_BROKERS,
  KAFKA_TOPIC: process.env.KAFKA_TOPIC,
  CRON_SCHEDULE: process.env.CRON_SCHEDULE,
  REPORTS_BASE_URL: process.env.REPORTS_BASE_URL,
  REPORT_TYPES: process.env.REPORT_TYPES,
  LOG_LEVEL: process.env.LOG_LEVEL,
});

export const config = {
  kafka: {
    clientId: env.KAFKA_CLIENT_ID,
    brokers: env.KAFKA_BROKERS.split(',').map((broker) => broker.trim()),
  },
  topic: env.KAFKA_TOPIC,
  reportsBaseUrl: env.REPORTS_BASE_URL,
  cron: {
    schedule: env.CRON_SCHEDULE,
  },
  reportTypes: env.REPORT_TYPES.split(',').map((type) => type.trim()),
  logLevel: env.LOG_LEVEL,
};

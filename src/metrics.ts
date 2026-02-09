import {
  Counter,
  Histogram,
  Registry,
  collectDefaultMetrics,
} from 'prom-client';

export const register = new Registry();

collectDefaultMetrics({ register });

const PREFIX = 'collector_';

export const metrics = {
  jobRunsTotal: new Counter({
    name: `${PREFIX}job_runs_total`,
    help: 'Total number of scheduled job runs',
    labelNames: ['status'] as const,
    registers: [register],
  }),

  rowsProcessedTotal: new Counter({
    name: `${PREFIX}rows_processed_total`,
    help: 'Total number of CSV rows processed',
    labelNames: ['report_type'] as const,
    registers: [register],
  }),

  rowsPublishedTotal: new Counter({
    name: `${PREFIX}rows_published_total`,
    help: 'Total number of rows published to Kafka',
    labelNames: ['report_type'] as const,
    registers: [register],
  }),

  jobDurationSeconds: new Histogram({
    name: `${PREFIX}job_duration_seconds`,
    help: 'Duration of scheduled job execution in seconds',
    buckets: [1, 5, 10, 30, 60, 120],
    registers: [register],
  }),

  csvFetchDurationSeconds: new Histogram({
    name: `${PREFIX}csv_fetch_duration_seconds`,
    help: 'Duration of CSV fetch and processing in seconds',
    labelNames: ['report_type'] as const,
    buckets: [0.5, 1, 2, 5, 10, 30],
    registers: [register],
  }),

  retryTotal: new Counter({
    name: `${PREFIX}retry_total`,
    help: 'Total number of retry attempts',
    labelNames: ['report_type'] as const,
    registers: [register],
  }),
} as const;

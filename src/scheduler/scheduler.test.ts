import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock logger before importing scheduler
vi.mock('../logger.js', () => ({
  default: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

// Mock dependencies before importing
vi.mock('../csv/csvStream.js', () => {
  // Define HttpError inside the mock factory
  class HttpError extends Error {
    constructor(
      message: string,
      public statusCode: number
    ) {
      super(message);
      this.name = 'HttpError';
    }
  }

  return {
    csvStreamToKafka: vi.fn(),
    HttpError,
  };
});

vi.mock('../config.js', () => ({
  config: {
    cron: {
      schedule: '0 1 * * *',
      fallbackIntervalMin: 30,
      maxFallbackAttempts: 3,
    },
    reportsBaseUrl: 'https://www.spc.noaa.gov/climo/reports/',
    reportTypes: ['torn', 'hail', 'wind'],
    topic: 'raw-weather-reports',
    kafka: { clientId: 'storm-data-collector', brokers: ['localhost:9092'] },
    batchSize: 500,
    maxConcurrentCsv: 3,
  },
}));

vi.mock('../csv/utils.js', () => ({
  buildCsvUrl: vi.fn(
    (baseUrl: string, type: string) => `${baseUrl}260206_rpts_${type}.csv`
  ),
}));

// Mock Croner
let storedCronCallback: (() => void) | null = null;

vi.mock('croner', () => {
  return {
    Cron: class MockCron {
      constructor(_pattern: string, callback: () => void) {
        storedCronCallback = callback;
      }
      stop() {}
    },
  };
});

import { startScheduler } from './scheduler.js';
import { csvStreamToKafka, HttpError } from '../csv/csvStream.js';
import logger from '../logger.js';

describe('startScheduler with exponential fallback', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('starts scheduler with correct cron pattern', async () => {
    (csvStreamToKafka as any).mockResolvedValue(undefined);

    startScheduler();
    await vi.runAllTimersAsync();

    expect(storedCronCallback).toBeDefined();

    // Check for the scheduler started log with pattern
    const infoCall = (logger.info as any).mock.calls.find(
      (call: any) =>
        call[1]?.includes?.('Scheduler started') || call[0]?.pattern
    );
    expect(infoCall).toBeDefined();
    expect(infoCall[0]).toEqual({ pattern: '0 1 * * *' });
    expect(infoCall[1]).toBe('Scheduler started');
  });

  it('processes all weather types successfully', async () => {
    (csvStreamToKafka as any).mockResolvedValue(undefined);

    startScheduler();
    await vi.runAllTimersAsync();

    expect(csvStreamToKafka).toHaveBeenCalledTimes(3);

    // Check for the CSV job finished log with counts
    const finishedCall = (logger.info as any).mock.calls.find((call: any) =>
      call[1]?.includes?.('CSV job finished')
    );
    expect(finishedCall).toBeDefined();
    expect(finishedCall[0]).toEqual({
      successful: 3,
      failed: 0,
      total: 3,
    });
    expect(finishedCall[1]).toBe('CSV job finished');
  });

  it('retries with exponential backoff on 500 error', async () => {
    let callCount = 0;
    (csvStreamToKafka as any).mockImplementation(({ type }: any) => {
      if (type === 'hail') {
        callCount++;
        if (callCount <= 2) {
          const error = new HttpError('Server Error', 500);
          throw error;
        }
      }
      return Promise.resolve();
    });

    const jobPromise = (async () => {
      startScheduler();
      await vi.runAllTimersAsync();
    })();

    // First retry after 30 minutes
    await vi.advanceTimersByTimeAsync(30 * 60 * 1000);
    // Second retry after 60 minutes
    await vi.advanceTimersByTimeAsync(60 * 60 * 1000);

    await jobPromise;

    // Initial + 2 retries = 3 calls for hail
    const hailCalls = (csvStreamToKafka as any).mock.calls.filter(
      (call: any) => call[0].type === 'hail'
    );
    expect(hailCalls.length).toBe(3);

    // Check for warning log with 500 status code
    const warnCall = (logger.warn as any).mock.calls.find(
      (call: any) => call[0]?.statusCode === 500
    );
    expect(warnCall).toBeDefined();
    expect(warnCall[0].statusCode).toBe(500);
    expect(warnCall[1]).toBe('Server error, retrying with exponential backoff');
  });

  it('stops retrying after max attempts on 500 errors', async () => {
    (csvStreamToKafka as any).mockImplementation(({ type }: any) => {
      if (type === 'hail') {
        const error = new HttpError('Server Error', 500);
        throw error;
      }
      return Promise.resolve();
    });

    const jobPromise = (async () => {
      startScheduler();
      await vi.runAllTimersAsync();
    })();

    // Advance through all retry attempts
    await vi.advanceTimersByTimeAsync(30 * 60 * 1000); // First retry
    await vi.advanceTimersByTimeAsync(60 * 60 * 1000); // Second retry
    await vi.advanceTimersByTimeAsync(120 * 60 * 1000); // Third retry

    await jobPromise;

    const hailCalls = (csvStreamToKafka as any).mock.calls.filter(
      (call: any) => call[0].type === 'hail'
    );

    // Should be 4 total: initial + 3 retries
    expect(hailCalls.length).toBe(4);

    // Check for max attempts error log
    const errorCall = (logger.error as any).mock.calls.find(
      (call: any) => call[0]?.maxAttempts === 3 && call[0]?.statusCode === 500
    );
    expect(errorCall).toBeDefined();
    expect(errorCall[1]).toBe('Max retry attempts reached');
  });

  it('does not retry on 404 error', async () => {
    (csvStreamToKafka as any).mockImplementation(({ type }: any) => {
      if (type === 'hail') {
        const error = new HttpError('Not Found', 404);
        throw error;
      }
      return Promise.resolve();
    });

    startScheduler();
    await vi.runAllTimersAsync();

    const hailCalls = (csvStreamToKafka as any).mock.calls.filter(
      (call: any) => call[0].type === 'hail'
    );

    // Only 1 attempt for 404
    expect(hailCalls.length).toBe(1);

    // Check for 404 warning log
    const warnCall = (logger.warn as any).mock.calls.find((call: any) =>
      call[1]?.includes?.('CSV not found (404)')
    );
    expect(warnCall).toBeDefined();
  });

  it('logs error on 400 client error without retry', async () => {
    (csvStreamToKafka as any).mockImplementation(({ type }: any) => {
      if (type === 'hail') {
        const error = new HttpError('Bad Request', 400);
        throw error;
      }
      return Promise.resolve();
    });

    startScheduler();
    await vi.runAllTimersAsync();

    const hailCalls = (csvStreamToKafka as any).mock.calls.filter(
      (call: any) => call[0].type === 'hail'
    );

    // Only 1 attempt for 400
    expect(hailCalls.length).toBe(1);

    // Check for 400 error log
    const errorCall = (logger.error as any).mock.calls.find(
      (call: any) =>
        call[0]?.statusCode === 400 && call[1]?.includes?.('Client error')
    );
    expect(errorCall).toBeDefined();
  });

  it('handles mixed success and failures', async () => {
    (csvStreamToKafka as any).mockImplementation(({ type }: any) => {
      if (type === 'hail') {
        const error = new HttpError('Not Found', 404);
        throw error;
      }
      if (type === 'wind') {
        const error = new HttpError('Server Error', 500);
        throw error;
      }
      return Promise.resolve();
    });

    const jobPromise = (async () => {
      startScheduler();
      await vi.runAllTimersAsync();
    })();

    // Advance timers for wind retries
    await vi.advanceTimersByTimeAsync(30 * 60 * 1000);
    await vi.advanceTimersByTimeAsync(60 * 60 * 1000);
    await vi.advanceTimersByTimeAsync(120 * 60 * 1000);

    await jobPromise;

    // Torn should succeed (1 call)
    const tornCalls = (csvStreamToKafka as any).mock.calls.filter(
      (call: any) => call[0].type === 'torn'
    );
    expect(tornCalls.length).toBe(1);

    // Hail should fail with 404 (1 call, no retry)
    const hailCalls = (csvStreamToKafka as any).mock.calls.filter(
      (call: any) => call[0].type === 'hail'
    );
    expect(hailCalls.length).toBe(1);

    // Wind should retry on 500 (4 calls: initial + 3 retries)
    const windCalls = (csvStreamToKafka as any).mock.calls.filter(
      (call: any) => call[0].type === 'wind'
    );
    expect(windCalls.length).toBe(4);

    // Verify final count logged
    const finishedCall = (logger.info as any).mock.calls.find(
      (call: any) => call[0]?.successful !== undefined
    );
    expect(finishedCall).toBeDefined();
    expect(finishedCall[0].successful).toBe(1);
    expect(finishedCall[0].failed).toBe(2);
  });

  it('respects maxConcurrentCsv limit', async () => {
    let concurrentCalls = 0;
    let maxConcurrent = 0;

    (csvStreamToKafka as any).mockImplementation(() => {
      concurrentCalls++;
      maxConcurrent = Math.max(maxConcurrent, concurrentCalls);

      return new Promise((resolve) => {
        setTimeout(() => {
          concurrentCalls--;
          resolve(undefined);
        }, 10);
      });
    });

    startScheduler();
    await vi.runAllTimersAsync();

    expect(maxConcurrent).toBeLessThanOrEqual(3);
  });

  it('logs start and finish messages with context data', async () => {
    (csvStreamToKafka as any).mockResolvedValue(undefined);

    startScheduler();
    await vi.runAllTimersAsync();

    // Check for "Starting CSV job" log
    const startCall = (logger.info as any).mock.calls.find(
      (call: any) => call[0] === 'Starting CSV job'
    );
    expect(startCall).toBeDefined();

    // Check for "CSV job finished" log with context
    const finishCall = (logger.info as any).mock.calls.find(
      (call: any) =>
        call[0]?.successful !== undefined && call[1] === 'CSV job finished'
    );
    expect(finishCall).toBeDefined();
    expect(finishCall[0]).toMatchObject({
      successful: 3,
      failed: 0,
      total: 3,
    });
  });

  it('includes attempt numbers in logs', async () => {
    let callCount = 0;
    (csvStreamToKafka as any).mockImplementation(({ type }: any) => {
      if (type === 'hail') {
        callCount++;
        if (callCount <= 2) {
          const error = new HttpError('Server Error', 500);
          throw error;
        }
      }
      return Promise.resolve();
    });

    const jobPromise = (async () => {
      startScheduler();
      await vi.runAllTimersAsync();
    })();

    await vi.advanceTimersByTimeAsync(30 * 60 * 1000);
    await vi.advanceTimersByTimeAsync(60 * 60 * 1000);

    await jobPromise;

    // Check for "Attempting CSV" log with attempt info
    const attemptCall = (logger.info as any).mock.calls.find(
      (call: any) =>
        call[0]?.attempt !== undefined && call[1] === 'Attempting CSV'
    );
    expect(attemptCall).toBeDefined();
    expect(attemptCall[0]).toHaveProperty('attempt');
    expect(attemptCall[0]).toHaveProperty('maxAttempts');
  });

  it('handles network errors without retry', async () => {
    (csvStreamToKafka as any).mockImplementation(({ type }: any) => {
      if (type === 'hail') {
        throw new Error('Network timeout');
      }
      return Promise.resolve();
    });

    startScheduler();
    await vi.runAllTimersAsync();

    const hailCalls = (csvStreamToKafka as any).mock.calls.filter(
      (call: any) => call[0].type === 'hail'
    );

    // Only 1 attempt for network errors
    expect(hailCalls.length).toBe(1);

    // Check for error log
    const errorCall = (logger.error as any).mock.calls.find((call: any) =>
      call[0]?.error?.includes?.('Network timeout')
    );
    expect(errorCall).toBeDefined();
  });
});

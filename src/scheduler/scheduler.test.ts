import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

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
      retryIntervalMin: 30,
      maxFallbackAttempts: 3,
    },
    csvBaseUrl: 'https://www.spc.noaa.gov/climo/reports/',
    csvTypes: ['torn', 'hail', 'wind'],
    topic: 'raw-weather-reports',
    kafka: { clientId: 'storm-data-collector', brokers: ['localhost:9092'] },
    batchSize: 500,
    maxConcurrentCsv: 3,
  },
}));

vi.mock('../csv/utils.js', () => ({
  buildCsvUrl: vi.fn(
    (baseUrl: string, type: string) => `${baseUrl}260206_${type}.csv`
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

const originalConsoleLog = console.log;
const originalConsoleError = console.error;
const originalConsoleWarn = console.warn;

describe('startScheduler with exponential fallback', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    console.log = vi.fn();
    console.error = vi.fn();
    console.warn = vi.fn();
  });

  afterEach(() => {
    vi.useRealTimers();
    console.log = originalConsoleLog;
    console.error = originalConsoleError;
    console.warn = originalConsoleWarn;
  });

  it('starts scheduler with correct cron pattern', async () => {
    (csvStreamToKafka as any).mockResolvedValue(undefined);

    startScheduler();
    await vi.runAllTimersAsync();

    expect(storedCronCallback).toBeDefined();
    expect(console.log).toHaveBeenCalledWith(
      expect.stringContaining('Scheduler started with pattern')
    );
    expect(console.log).toHaveBeenCalledWith(
      expect.stringContaining('0 1 * * *')
    );
  });

  it('processes all weather types successfully', async () => {
    (csvStreamToKafka as any).mockResolvedValue(undefined);

    startScheduler();
    await vi.runAllTimersAsync();

    expect(csvStreamToKafka).toHaveBeenCalledTimes(3);
    expect(console.log).toHaveBeenCalledWith(
      expect.stringContaining('CSV job finished. Successful: 3, Failed: 0')
    );
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
    expect(hailCalls.length).toBeGreaterThanOrEqual(3);

    expect(console.warn).toHaveBeenCalledWith(
      expect.stringContaining('Server error 500')
    );
    expect(console.warn).toHaveBeenCalledWith(
      expect.stringContaining('Retrying in 30 minutes')
    );
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

    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining('Max retry attempts (3) reached')
    );
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

    expect(console.warn).toHaveBeenCalledWith(
      expect.stringContaining('CSV not found (404)')
    );
    expect(console.warn).toHaveBeenCalledWith(
      expect.stringContaining('Skipping')
    );
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

    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining('Client error 400')
    );
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

  it('logs start and finish messages with timestamps and counts', async () => {
    (csvStreamToKafka as any).mockResolvedValue(undefined);

    startScheduler();
    await vi.runAllTimersAsync();

    expect(console.log).toHaveBeenCalledWith(
      expect.stringContaining('Starting CSV job...')
    );
    expect(console.log).toHaveBeenCalledWith(
      expect.stringContaining('CSV job finished. Successful: 3, Failed: 0')
    );

    // Check for ISO timestamp format
    const calls = (console.log as any).mock.calls;
    const hasTimestamp = calls.some((call: any[]) =>
      call[0].match(/\[\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z\]/)
    );
    expect(hasTimestamp).toBe(true);
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

    expect(console.log).toHaveBeenCalledWith(
      expect.stringContaining('(attempt 1/4)')
    );
    expect(console.warn).toHaveBeenCalledWith(
      expect.stringContaining('(attempt 1/3)')
    );
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

    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining('Failed to process'),
      expect.stringContaining('Network timeout')
    );
  });
});

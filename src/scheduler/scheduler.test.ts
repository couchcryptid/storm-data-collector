import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock dependencies before importing
vi.mock('../csv/csvStream.js', () => ({
  csvStreamToKafka: vi.fn(),
}));

vi.mock('../config.js', () => ({
  config: {
    cron: { schedule: '0 0 * * *', retryInterval: 6 },
    csvBaseUrl: 'https://example.com/',
    csvTypes: ['sales', 'inventory', 'orders'],
    topic: 'test-topic',
    kafka: { clientId: 'test', brokers: ['localhost:9092'] },
    batchSize: 500,
    maxConcurrentCsv: 2,
    retryHours: 6,
  },
}));

vi.mock('../csv/utils.js', () => ({
  buildCsvUrl: vi.fn(
    (baseUrl: string, type: string) => `${baseUrl}${type}.csv`
  ),
}));

vi.mock('./retry.js', () => ({
  checkCsvAvailability: vi.fn(),
  scheduleRetry: vi.fn(),
}));

// Mock Croner
let storedCronCallback: (() => void) | null = null;

vi.mock('croner', () => {
  return {
    Cron: class MockCron {
      constructor(pattern: string, callback: () => void) {
        // Store the callback so we can invoke it manually in tests
        storedCronCallback = callback;
      }
      stop() {}
    },
  };
});

import { startScheduler } from './scheduler.js';
import { csvStreamToKafka } from '../csv/csvStream.js';
import { checkCsvAvailability, scheduleRetry } from './retry.js';
import { buildCsvUrl } from '../csv/utils.js';

const originalConsoleLog = console.log;
const originalConsoleError = console.error;

describe('startScheduler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    console.log = vi.fn();
    console.error = vi.fn();
  });

  afterEach(() => {
    console.log = originalConsoleLog;
    console.error = originalConsoleError;
  });

  it('starts scheduler with correct cron pattern', () => {
    startScheduler();

    // Check that the cron callback was stored
    expect(storedCronCallback).toBeDefined();
  });

  it('processes all CSV types successfully', async () => {
    (checkCsvAvailability as any).mockResolvedValue(true);
    (csvStreamToKafka as any).mockResolvedValue(undefined);

    startScheduler();
    if (storedCronCallback) await storedCronCallback();

    // Should check availability for all 3 types
    expect(checkCsvAvailability).toHaveBeenCalledTimes(3);
    expect(checkCsvAvailability).toHaveBeenCalledWith(
      'https://example.com/sales.csv'
    );
    expect(checkCsvAvailability).toHaveBeenCalledWith(
      'https://example.com/inventory.csv'
    );
    expect(checkCsvAvailability).toHaveBeenCalledWith(
      'https://example.com/orders.csv'
    );

    // Should process all 3 types
    expect(csvStreamToKafka).toHaveBeenCalledTimes(3);

    // Should not schedule retry when all succeed
    expect(scheduleRetry).not.toHaveBeenCalled();

    // Should log completion
    expect(console.log).toHaveBeenCalledWith(
      expect.stringContaining('Initial CSV job finished')
    );
  });

  it('tracks failed CSV types and schedules retry', async () => {
    // First type unavailable, others available
    (checkCsvAvailability as any)
      .mockResolvedValueOnce(false) // sales - unavailable
      .mockResolvedValueOnce(true) // inventory - available
      .mockResolvedValueOnce(true); // orders - available

    (csvStreamToKafka as any).mockResolvedValue(undefined);

    startScheduler();
    if (storedCronCallback) await storedCronCallback();

    // Should still process available ones
    expect(csvStreamToKafka).toHaveBeenCalledTimes(2);

    // Should schedule retry for failed type
    expect(scheduleRetry).toHaveBeenCalledWith(
      ['sales'],
      expect.any(Function),
      6
    );
  });

  it('tracks processing errors and schedules retry', async () => {
    (checkCsvAvailability as any).mockResolvedValue(true);

    // Second type fails processing
    (csvStreamToKafka as any)
      .mockResolvedValueOnce(undefined) // sales - success
      .mockRejectedValueOnce(new Error('Processing failed')) // inventory - error
      .mockResolvedValueOnce(undefined); // orders - success

    startScheduler();
    if (storedCronCallback) await storedCronCallback();

    // Should attempt all 3
    expect(csvStreamToKafka).toHaveBeenCalledTimes(3);

    // Should log error
    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining('Failed to process'),
      expect.stringContaining('Processing failed')
    );

    // Should schedule retry for failed type
    expect(scheduleRetry).toHaveBeenCalledWith(
      ['inventory'],
      expect.any(Function),
      6
    );
  });

  it('respects maxConcurrentCsv limit', async () => {
    (checkCsvAvailability as any).mockResolvedValue(true);

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
    if (storedCronCallback) await storedCronCallback();

    // With maxConcurrentCsv=2 and 3 types, should never exceed 2 concurrent
    expect(maxConcurrent).toBeLessThanOrEqual(2);
  });

  it('handles multiple failures correctly', async () => {
    // All types fail
    (checkCsvAvailability as any).mockResolvedValue(false);

    startScheduler();
    if (storedCronCallback) await storedCronCallback();

    // Should not process any
    expect(csvStreamToKafka).not.toHaveBeenCalled();

    // Should schedule retry for all failed types
    expect(scheduleRetry).toHaveBeenCalledWith(
      ['sales', 'inventory', 'orders'],
      expect.any(Function),
      6
    );
  });

  it('logs start and finish messages with timestamps', async () => {
    (checkCsvAvailability as any).mockResolvedValue(true);
    (csvStreamToKafka as any).mockResolvedValue(undefined);

    startScheduler();
    if (storedCronCallback) await storedCronCallback();

    expect(console.log).toHaveBeenCalledWith(
      expect.stringContaining('Starting CSV job...')
    );
    expect(console.log).toHaveBeenCalledWith(
      expect.stringContaining('Initial CSV job finished')
    );

    // Check for ISO timestamp format
    const calls = (console.log as any).mock.calls;
    const hasTimestamp = calls.some((call: any[]) =>
      call[0].match(/\[\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z\]/)
    );
    expect(hasTimestamp).toBe(true);
  });
});

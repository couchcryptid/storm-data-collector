import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock dependencies before importing
vi.mock('../csv/csvStream.js', () => ({
  csvStreamToKafka: vi.fn(),
}));

vi.mock('../config.js', () => ({
  config: {
    cron: { schedule: '0 1 * * *', retryInterval: 3 },
    csvBaseUrl: 'https://www.spc.noaa.gov/climo/reports/',
    csvTypes: ['torn', 'hail', 'wind'],
    topic: 'raw-weather-reports',
    kafka: { clientId: 'storm-data-collector', brokers: ['localhost:9092'] },
    batchSize: 500,
    maxConcurrentCsv: 3,
    retryHours: 3,
  },
}));

vi.mock('../csv/utils.js', () => ({
  buildCsvUrl: vi.fn(
    (baseUrl: string, type: string) => `${baseUrl}260206_${type}.csv`
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
      constructor(_pattern: string, callback: () => void) {
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

const originalConsoleLog = console.log;
const originalConsoleError = console.error;

describe('startScheduler with real weather report types', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    console.log = vi.fn();
    console.error = vi.fn();
  });

  afterEach(() => {
    console.log = originalConsoleLog;
    console.error = originalConsoleError;
  });

  it('starts scheduler with correct cron pattern from environment', async () => {
    startScheduler();

    // Wait for immediate execution to complete
    await new Promise((resolve) => setTimeout(resolve, 50));

    // Check that the cron callback was stored
    expect(storedCronCallback).toBeDefined();

    // Should log scheduler started message with the configured schedule
    expect(console.log).toHaveBeenCalledWith(
      expect.stringContaining('Scheduler started with pattern')
    );
    expect(console.log).toHaveBeenCalledWith(
      expect.stringContaining('0 1 * * *')
    );
  });

  it('processes all weather report types (torn, hail, wind) successfully', async () => {
    (checkCsvAvailability as any).mockResolvedValue(true);
    (csvStreamToKafka as any).mockResolvedValue(undefined);

    startScheduler();

    // Wait for immediate execution to complete
    await new Promise((resolve) => setTimeout(resolve, 50));

    // Should check availability for all 3 types (from immediate run)
    expect(checkCsvAvailability).toHaveBeenCalledTimes(3);
    expect(checkCsvAvailability).toHaveBeenCalledWith(
      'https://www.spc.noaa.gov/climo/reports/260206_torn.csv'
    );
    expect(checkCsvAvailability).toHaveBeenCalledWith(
      'https://www.spc.noaa.gov/climo/reports/260206_hail.csv'
    );
    expect(checkCsvAvailability).toHaveBeenCalledWith(
      'https://www.spc.noaa.gov/climo/reports/260206_wind.csv'
    );

    // Should process all 3 types (from immediate run)
    expect(csvStreamToKafka).toHaveBeenCalledTimes(3);

    // Verify correct configuration was passed
    const firstCall = (csvStreamToKafka as any).mock.calls[0];
    expect(firstCall[0]).toMatchObject({
      topic: 'raw-weather-reports',
      kafka: { clientId: 'storm-data-collector', brokers: ['localhost:9092'] },
      batchSize: 500,
    });

    // Should not schedule retry when all succeed
    expect(scheduleRetry).not.toHaveBeenCalled();

    // Should log completion
    expect(console.log).toHaveBeenCalledWith(
      expect.stringContaining('Initial CSV job finished')
    );

    // Now test scheduled execution
    vi.clearAllMocks();
    if (storedCronCallback) await storedCronCallback();

    // Should process all 3 types again from scheduled run
    expect(checkCsvAvailability).toHaveBeenCalledTimes(3);
    expect(csvStreamToKafka).toHaveBeenCalledTimes(3);
  });

  it('tracks failed weather types and schedules retry with configured interval', async () => {
    // Hail report unavailable, others available
    (checkCsvAvailability as any)
      .mockResolvedValueOnce(true) // torn - available
      .mockResolvedValueOnce(false) // hail - unavailable
      .mockResolvedValueOnce(true); // wind - available

    (csvStreamToKafka as any).mockResolvedValue(undefined);

    startScheduler();

    // Wait for immediate execution to complete
    await new Promise((resolve) => setTimeout(resolve, 50));

    // Should still process available ones
    expect(csvStreamToKafka).toHaveBeenCalledTimes(2);

    // Should schedule retry for failed type with 3-hour interval
    expect(scheduleRetry).toHaveBeenCalledWith(
      ['hail'],
      expect.any(Function),
      3 // From CRON_RETRY_INTERVAL
    );
  });

  it('handles processing errors in tornado reports and schedules retry', async () => {
    (checkCsvAvailability as any).mockResolvedValue(true);

    // Tornado processing fails
    (csvStreamToKafka as any)
      .mockRejectedValueOnce(new Error('Tornado CSV processing error'))
      .mockResolvedValueOnce(undefined) // hail - success
      .mockResolvedValueOnce(undefined); // wind - success

    startScheduler();

    // Wait for immediate execution to complete
    await new Promise((resolve) => setTimeout(resolve, 50));

    // Should attempt all 3
    expect(csvStreamToKafka).toHaveBeenCalledTimes(3);

    // Should log error
    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining('Failed to process'),
      expect.stringContaining('Tornado CSV processing error')
    );

    // Should schedule retry for failed type
    expect(scheduleRetry).toHaveBeenCalledWith(
      ['torn'],
      expect.any(Function),
      3
    );
  });

  it('respects maxConcurrentCsv limit from configuration', async () => {
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

    // Wait for immediate execution to complete
    await new Promise((resolve) => setTimeout(resolve, 100));

    // With maxConcurrentCsv=3 and 3 types, should not exceed 3 concurrent
    expect(maxConcurrent).toBeLessThanOrEqual(3);
  });

  it('handles all weather types failing and schedules retry', async () => {
    // All types fail
    (checkCsvAvailability as any).mockResolvedValue(false);

    startScheduler();

    // Wait for immediate execution to complete
    await new Promise((resolve) => setTimeout(resolve, 50));

    // Should not process any
    expect(csvStreamToKafka).not.toHaveBeenCalled();

    // Should schedule retry for all failed types
    expect(scheduleRetry).toHaveBeenCalledWith(
      ['torn', 'hail', 'wind'],
      expect.any(Function),
      3
    );
  });

  it('logs start and finish messages with timestamps', async () => {
    (checkCsvAvailability as any).mockResolvedValue(true);
    (csvStreamToKafka as any).mockResolvedValue(undefined);

    startScheduler();

    // Wait for immediate execution to complete
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(console.log).toHaveBeenCalledWith(
      expect.stringContaining('Running initial job immediately')
    );
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

  it('uses real config values (localhost:9092, batch size 500, raw-weather-reports topic)', async () => {
    (checkCsvAvailability as any).mockResolvedValue(true);
    (csvStreamToKafka as any).mockResolvedValue(undefined);

    startScheduler();

    await new Promise((resolve) => setTimeout(resolve, 50));

    // Verify each call includes real config values
    const calls = (csvStreamToKafka as any).mock.calls;
    calls.forEach((call: any[]) => {
      expect(call[0]).toMatchObject({
        topic: 'raw-weather-reports',
        kafka: {
          clientId: 'storm-data-collector',
          brokers: ['localhost:9092'],
        },
        batchSize: 500,
      });
    });
  });

  it('handles partial failures with multiple report types', async () => {
    // Torn available, others fail
    (checkCsvAvailability as any)
      .mockResolvedValueOnce(true) // torn - available
      .mockResolvedValueOnce(false) // hail - unavailable
      .mockResolvedValueOnce(false); // wind - unavailable

    (csvStreamToKafka as any).mockResolvedValueOnce(undefined);

    startScheduler();

    await new Promise((resolve) => setTimeout(resolve, 50));

    // Only torn processed
    expect(csvStreamToKafka).toHaveBeenCalledTimes(1);

    // Schedule retry for hail and wind
    expect(scheduleRetry).toHaveBeenCalledWith(
      ['hail', 'wind'],
      expect.any(Function),
      3
    );
  });
});

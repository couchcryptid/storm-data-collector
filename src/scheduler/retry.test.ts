import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { checkCsvAvailability, scheduleRetry } from './retry.js';

// Mock fetch
global.fetch = vi.fn();

// Mock console methods
const originalConsoleWarn = console.warn;
const originalConsoleError = console.error;
const originalConsoleLog = console.log;

describe('checkCsvAvailability', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    console.warn = vi.fn();
    console.error = vi.fn();
  });

  afterEach(() => {
    console.warn = originalConsoleWarn;
    console.error = originalConsoleError;
  });

  it('returns true when hail report CSV is available', async () => {
    (global.fetch as any).mockResolvedValue({
      ok: true,
      status: 200,
    });

    const result = await checkCsvAvailability(
      'https://www.spc.noaa.gov/climo/reports/260206_hail.csv'
    );

    expect(result).toBe(true);
    expect(global.fetch).toHaveBeenCalledWith(
      'https://www.spc.noaa.gov/climo/reports/260206_hail.csv'
    );
    expect(console.warn).not.toHaveBeenCalled();
  });

  it('returns false when tornado report CSV is not found', async () => {
    (global.fetch as any).mockResolvedValue({
      ok: false,
      status: 404,
    });

    const result = await checkCsvAvailability(
      'https://www.spc.noaa.gov/climo/reports/260206_torn.csv'
    );

    expect(result).toBe(false);
    expect(console.warn).toHaveBeenCalledWith(
      expect.stringContaining('CSV missing or unavailable')
    );
    expect(console.warn).toHaveBeenCalledWith(
      expect.stringContaining(
        'https://www.spc.noaa.gov/climo/reports/260206_torn.csv'
      )
    );
    expect(console.warn).toHaveBeenCalledWith(
      expect.stringContaining('status 404')
    );
  });

  it('returns false and logs error when network error occurs', async () => {
    const fetchError = new Error('Network timeout');
    (global.fetch as any).mockRejectedValue(fetchError);

    const result = await checkCsvAvailability(
      'https://www.spc.noaa.gov/climo/reports/260206_wind.csv'
    );

    expect(result).toBe(false);
    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining('Error checking CSV availability'),
      fetchError
    );
  });

  it('handles server error status gracefully', async () => {
    (global.fetch as any).mockResolvedValue({
      ok: false,
      status: 500,
    });

    const result = await checkCsvAvailability(
      'https://www.spc.noaa.gov/climo/reports/260206_hail.csv'
    );

    expect(result).toBe(false);
    expect(console.warn).toHaveBeenCalledWith(
      expect.stringContaining('status 500')
    );
  });
});

describe('scheduleRetry', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    console.log = vi.fn();
    console.warn = vi.fn();
    console.error = vi.fn();
    vi.useFakeTimers();
  });

  afterEach(() => {
    console.log = originalConsoleLog;
    console.warn = originalConsoleWarn;
    console.error = originalConsoleError;
    vi.useRealTimers();
  });

  it('does nothing when no failed CSV types', () => {
    const mockCallback = vi.fn();

    scheduleRetry([], mockCallback, 6);

    expect(console.log).not.toHaveBeenCalled();
    expect(mockCallback).not.toHaveBeenCalled();
  });

  it('logs warning when retry hours is zero', () => {
    const mockCallback = vi.fn();

    scheduleRetry(['hail'], mockCallback, 0);

    expect(console.warn).toHaveBeenCalledWith(
      expect.stringContaining('Invalid retry hours: 0')
    );
    expect(mockCallback).not.toHaveBeenCalled();
  });

  it('logs warning when retry hours is negative', () => {
    const mockCallback = vi.fn();

    scheduleRetry(['wind'], mockCallback, -1);

    expect(console.warn).toHaveBeenCalledWith(
      expect.stringContaining('Invalid retry hours: -1')
    );
    expect(mockCallback).not.toHaveBeenCalled();
  });

  it('schedules retry for failed storm report types', async () => {
    const mockCallback = vi.fn().mockResolvedValue(undefined);
    const failedTypes = ['hail', 'wind'];
    const retryHours = 3; // From CRON_RETRY_INTERVAL in .env

    scheduleRetry(failedTypes, mockCallback, retryHours);

    // Check that scheduling log was called
    expect(console.log).toHaveBeenCalledWith(
      expect.stringContaining('Scheduling retry at')
    );
    expect(console.log).toHaveBeenCalledWith(
      expect.stringContaining('hail, wind')
    );

    // Advance time by 3 hours
    await vi.advanceTimersByTimeAsync(3 * 60 * 60 * 1000);

    // Check that retry callback was called
    expect(mockCallback).toHaveBeenCalledWith(failedTypes);

    // Check that retry logs were called
    expect(console.log).toHaveBeenCalledWith(
      expect.stringContaining('Retry CSV job...')
    );
  });

  it('executes callback with all failed report types', async () => {
    const mockCallback = vi.fn().mockResolvedValue(undefined);
    const failedTypes = ['torn', 'hail', 'wind'];

    scheduleRetry(failedTypes, mockCallback, 1);

    // Advance time by 1 hour
    await vi.advanceTimersByTimeAsync(1 * 60 * 60 * 1000);

    expect(mockCallback).toHaveBeenCalledTimes(1);
    expect(mockCallback).toHaveBeenCalledWith(failedTypes);
  });

  it('handles callback errors gracefully', async () => {
    const callbackError = new Error('CSV processing failed');
    const mockCallback = vi.fn().mockRejectedValue(callbackError);

    scheduleRetry(['hail'], mockCallback, 1);

    // Advance time by 1 hour
    await vi.advanceTimersByTimeAsync(1 * 60 * 60 * 1000);

    // Give the async callback time to execute
    await vi.runAllTimersAsync();

    // Callback should have been called despite error
    expect(mockCallback).toHaveBeenCalledWith(['hail']);

    // Verify error was logged
    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining('Error during retry callback'),
      callbackError
    );
  });

  it('respects environment-configured retry interval', async () => {
    const mockCallback = vi.fn().mockResolvedValue(undefined);
    const failedTypes = ['wind'];
    const retryHours = 6; // Default from config

    scheduleRetry(failedTypes, mockCallback, retryHours);

    // Should not call before 6 hours
    await vi.advanceTimersByTimeAsync(5 * 60 * 60 * 1000);
    expect(mockCallback).not.toHaveBeenCalled();

    // Should call after 6 hours
    await vi.advanceTimersByTimeAsync(1 * 60 * 60 * 1000);
    expect(mockCallback).toHaveBeenCalledTimes(1);
  });
});

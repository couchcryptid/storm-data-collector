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

  it('returns true when CSV is available', async () => {
    (global.fetch as any).mockResolvedValue({
      ok: true,
      status: 200,
    });

    const result = await checkCsvAvailability('https://example.com/test.csv');

    expect(result).toBe(true);
    expect(global.fetch).toHaveBeenCalledWith('https://example.com/test.csv');
    expect(console.warn).not.toHaveBeenCalled();
  });

  it('returns false and logs warning when CSV is not found', async () => {
    (global.fetch as any).mockResolvedValue({
      ok: false,
      status: 404,
    });

    const result = await checkCsvAvailability(
      'https://example.com/missing.csv'
    );

    expect(result).toBe(false);
    expect(console.warn).toHaveBeenCalledWith(
      expect.stringContaining('CSV missing or unavailable')
    );
    expect(console.warn).toHaveBeenCalledWith(
      expect.stringContaining('https://example.com/missing.csv')
    );
    expect(console.warn).toHaveBeenCalledWith(
      expect.stringContaining('status 404')
    );
  });

  it('returns false and logs error when fetch throws', async () => {
    const fetchError = new Error('Network error');
    (global.fetch as any).mockRejectedValue(fetchError);

    const result = await checkCsvAvailability('https://example.com/error.csv');

    expect(result).toBe(false);
    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining('Error checking CSV availability'),
      fetchError
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

  it('does nothing when failedTypes is empty', () => {
    const mockCallback = vi.fn();

    scheduleRetry([], mockCallback, 6);

    expect(console.log).not.toHaveBeenCalled();
    expect(mockCallback).not.toHaveBeenCalled();
  });

  it('logs warning when retryHours is invalid', () => {
    const mockCallback = vi.fn();

    scheduleRetry(['type1'], mockCallback, 0);

    expect(console.warn).toHaveBeenCalledWith(
      expect.stringContaining('Invalid retry hours: 0')
    );
    expect(mockCallback).not.toHaveBeenCalled();
  });

  it('logs warning when retryHours is negative', () => {
    const mockCallback = vi.fn();

    scheduleRetry(['type1'], mockCallback, -1);

    expect(console.warn).toHaveBeenCalledWith(
      expect.stringContaining('Invalid retry hours: -1')
    );
    expect(mockCallback).not.toHaveBeenCalled();
  });

  it('schedules retry with correct delay and logs messages', async () => {
    const mockCallback = vi.fn().mockResolvedValue(undefined);
    const failedTypes = ['sales', 'inventory'];
    const retryHours = 6;

    scheduleRetry(failedTypes, mockCallback, retryHours);

    // Check that scheduling log was called
    expect(console.log).toHaveBeenCalledWith(
      expect.stringContaining('Scheduling retry at')
    );
    expect(console.log).toHaveBeenCalledWith(
      expect.stringContaining('sales, inventory')
    );

    // Advance time by 6 hours
    await vi.advanceTimersByTimeAsync(6 * 60 * 60 * 1000);

    // Check that retry callback was called
    expect(mockCallback).toHaveBeenCalledWith(failedTypes);

    // Check that retry logs were called
    expect(console.log).toHaveBeenCalledWith(
      expect.stringContaining('Retry CSV job...')
    );
    expect(console.log).toHaveBeenCalledWith(
      expect.stringContaining('Retry job completed')
    );
  });

  it('executes callback with failed types', async () => {
    const mockCallback = vi.fn().mockResolvedValue(undefined);
    const failedTypes = ['type1', 'type2', 'type3'];

    scheduleRetry(failedTypes, mockCallback, 1);

    // Advance time by 1 hour
    await vi.advanceTimersByTimeAsync(1 * 60 * 60 * 1000);

    expect(mockCallback).toHaveBeenCalledTimes(1);
    expect(mockCallback).toHaveBeenCalledWith(failedTypes);
  });

  it('handles callback errors gracefully', async () => {
    const callbackError = new Error('Callback failed');
    const mockCallback = vi.fn().mockRejectedValue(callbackError);

    scheduleRetry(['type1'], mockCallback, 1);

    // Advance time by 1 hour
    await vi.advanceTimersByTimeAsync(1 * 60 * 60 * 1000);

    // Give the async callback time to execute
    await vi.runAllTimersAsync();

    // Callback should have been called despite error
    expect(mockCallback).toHaveBeenCalledWith(['type1']);

    // Verify error was logged
    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining('Error during retry callback'),
      callbackError
    );
  });
});

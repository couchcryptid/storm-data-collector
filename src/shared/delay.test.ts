import { describe, it, expect, vi, beforeEach } from 'vitest';
import { delay } from './delay.js';

describe('delay', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  it('resolves after the specified time', async () => {
    const promise = delay(1000);
    await vi.advanceTimersByTimeAsync(1000);
    await expect(promise).resolves.toBeUndefined();
  });

  it('does not resolve before the specified time', async () => {
    let resolved = false;
    delay(1000).then(() => {
      resolved = true;
    });

    await vi.advanceTimersByTimeAsync(999);
    expect(resolved).toBe(false);
  });
});

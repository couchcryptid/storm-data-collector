import { describe, it, expect, vi, beforeEach } from 'vitest';
import { publishBatch } from './publisher.js';
import type { KafkaJS } from '@confluentinc/kafka-javascript';

vi.mock('../logger.js', () => ({
  default: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock('../metrics.js', () => ({
  metrics: {
    kafkaPublishRetriesTotal: { inc: vi.fn() },
  },
}));

describe('publishBatch', () => {
  let mockProducer: { send: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    mockProducer = { send: vi.fn().mockResolvedValue(undefined) };
  });

  it('returns early for empty batch without calling producer', async () => {
    const result = await publishBatch({
      producer: mockProducer as unknown as KafkaJS.Producer,
      topic: 'test-topic',
      batch: [],
    });

    expect(result).toEqual({ successful: true, publishedCount: 0 });
    expect(mockProducer.send).not.toHaveBeenCalled();
  });

  it('publishes batch and returns success on first attempt', async () => {
    const batch: Record<string, string>[] = [
      { eventType: 'hail', Location: '5 N Dallas', Size: '1.25' },
      { eventType: 'torn', Location: '2 S Austin', FScale: 'EF2' },
    ];

    const result = await publishBatch({
      producer: mockProducer as unknown as KafkaJS.Producer,
      topic: 'test-topic',
      batch,
    });

    expect(result).toEqual({ successful: true, publishedCount: 2 });
    expect(mockProducer.send).toHaveBeenCalledOnce();

    const call = mockProducer.send.mock.calls[0]![0];
    expect(call.topic).toBe('test-topic');
    expect(call.messages).toHaveLength(2);

    // Verify torn -> tornado normalization
    const parsed = JSON.parse(call.messages[1].value);
    expect(parsed.EventType).toBe('tornado');
  });

  it('retries on failure and succeeds on second attempt', async () => {
    mockProducer.send
      .mockRejectedValueOnce(new Error('broker unavailable'))
      .mockResolvedValueOnce(undefined);

    const promise = publishBatch({
      producer: mockProducer as unknown as KafkaJS.Producer,
      topic: 'test-topic',
      batch: [{ eventType: 'hail', Location: 'test' }],
    });

    // Advance past the first retry delay (1000ms)
    await vi.advanceTimersByTimeAsync(1000);
    const result = await promise;

    expect(result).toEqual({ successful: true, publishedCount: 1 });
    expect(mockProducer.send).toHaveBeenCalledTimes(2);
  });

  it('fails after exhausting all retry attempts', async () => {
    mockProducer.send.mockRejectedValue(new Error('broker unavailable'));

    const promise = publishBatch({
      producer: mockProducer as unknown as KafkaJS.Producer,
      topic: 'test-topic',
      batch: [{ eventType: 'hail', Location: 'test' }],
    });

    // Advance past retry delays: 1000ms + 2000ms
    await vi.advanceTimersByTimeAsync(1000);
    await vi.advanceTimersByTimeAsync(2000);
    const result = await promise;

    expect(result).toEqual({ successful: false, publishedCount: 0 });
    expect(mockProducer.send).toHaveBeenCalledTimes(3);
  });

  it('uses exponential backoff between retries', async () => {
    mockProducer.send
      .mockRejectedValueOnce(new Error('fail 1'))
      .mockRejectedValueOnce(new Error('fail 2'))
      .mockResolvedValueOnce(undefined);

    const promise = publishBatch({
      producer: mockProducer as unknown as KafkaJS.Producer,
      topic: 'test-topic',
      batch: [{ eventType: 'wind', Location: 'test' }],
    });

    // After first failure: 1000ms delay
    expect(mockProducer.send).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(999);
    expect(mockProducer.send).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    // Second attempt fires
    await vi.advanceTimersByTimeAsync(0);
    expect(mockProducer.send).toHaveBeenCalledTimes(2);

    // After second failure: 2000ms delay
    await vi.advanceTimersByTimeAsync(2000);
    const result = await promise;

    expect(result).toEqual({ successful: true, publishedCount: 1 });
    expect(mockProducer.send).toHaveBeenCalledTimes(3);
  });
});

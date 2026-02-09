import { describe, it, expect, vi, beforeEach } from 'vitest';
import { publishBatch } from './publisher.js';
import type { Producer } from 'kafkajs';

vi.mock('../logger.js', () => ({
  default: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

describe('publishBatch', () => {
  let mockProducer: { send: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    vi.clearAllMocks();
    mockProducer = { send: vi.fn().mockResolvedValue(undefined) };
  });

  it('returns early for empty batch without calling producer', async () => {
    const result = await publishBatch({
      producer: mockProducer as unknown as Producer,
      topic: 'test-topic',
      batch: [],
    });

    expect(result).toEqual({ successful: true, publishedCount: 0 });
    expect(mockProducer.send).not.toHaveBeenCalled();
  });

  it('publishes batch and returns success', async () => {
    const batch = [
      { type: 'hail', Location: '5 N Dallas', Size: '1.25' },
      { type: 'torn', Location: '2 S Austin', FScale: 'EF2' },
    ];

    const result = await publishBatch({
      producer: mockProducer as unknown as Producer,
      topic: 'test-topic',
      batch,
    });

    expect(result).toEqual({ successful: true, publishedCount: 2 });
    expect(mockProducer.send).toHaveBeenCalledOnce();

    const call = mockProducer.send.mock.calls[0][0];
    expect(call.topic).toBe('test-topic');
    expect(call.messages).toHaveLength(2);

    // Verify torn -> tornado normalization
    const parsed = JSON.parse(call.messages[1].value);
    expect(parsed.Type).toBe('tornado');
  });

  it('returns failure when producer throws', async () => {
    mockProducer.send.mockRejectedValue(new Error('broker unavailable'));

    const result = await publishBatch({
      producer: mockProducer as unknown as Producer,
      topic: 'test-topic',
      batch: [{ type: 'hail', Location: 'test' }],
    });

    expect(result).toEqual({ successful: false, publishedCount: 0 });
  });
});

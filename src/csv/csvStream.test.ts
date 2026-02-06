import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Readable } from 'stream';
import { csvStreamToKafka, CsvStreamOptions } from './csvStream.js';

// --- Mock fetch ---
global.fetch = vi.fn();

// --- Mock Kafka Producer ---
const mockSend = vi.fn();
const mockConnect = vi.fn();
const mockDisconnect = vi.fn();

vi.mock('kafkajs', () => {
  class MockKafka {
    producer() {
      return {
        send: mockSend,
        connect: mockConnect,
        disconnect: mockDisconnect,
      };
    }
  }
  return {
    Kafka: MockKafka,
  };
});

describe('csvStreamToKafka', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('parses CSV and injects type correctly', async () => {
    const csvData = 'name,amount\nAlice,10\nBob,20\n';
    const type = 'sales';

    const readable = Readable.from([csvData]);
    (global.fetch as any).mockResolvedValue({
      ok: true,
      body: Readable.toWeb(readable),
    });

    const options: CsvStreamOptions = {
      csvUrl: 'https://example.com/260206_sales.csv',
      topic: 'test-topic',
      kafka: { clientId: 'test', brokers: ['localhost:9092'] },
      batchSize: 2,
      type,
    };

    await csvStreamToKafka(options);

    expect(mockConnect).toHaveBeenCalled();
    expect(mockDisconnect).toHaveBeenCalled();
    expect(mockSend).toHaveBeenCalledTimes(1);

    const messages = mockSend.mock.calls[0]?.[0]?.messages;
    expect(messages.length).toBe(2);

    const parsed = messages.map((m: any) => JSON.parse(m.value));
    expect(parsed).toEqual([
      { name: 'Alice', amount: '10', type },
      { name: 'Bob', amount: '20', type },
    ]);
  });

  it('handles empty CSV gracefully', async () => {
    const readable = Readable.from(['']);
    (global.fetch as any).mockResolvedValue({
      ok: true,
      body: Readable.toWeb(readable),
    });

    const options: CsvStreamOptions = {
      csvUrl: 'https://example.com/empty.csv',
      topic: 'test-topic',
      kafka: { clientId: 'test', brokers: ['localhost:9092'] },
      batchSize: 2,
      type: 'empty',
    };

    await csvStreamToKafka(options);

    expect(mockSend).not.toHaveBeenCalled();
    expect(mockConnect).toHaveBeenCalled();
    expect(mockDisconnect).toHaveBeenCalled();
  });

  it('throws on fetch failure', async () => {
    (global.fetch as any).mockResolvedValue({
      ok: false,
      status: 404,
      body: null,
    });

    const options: CsvStreamOptions = {
      csvUrl: 'https://example.com/missing.csv',
      topic: 'test-topic',
      kafka: { clientId: 'test', brokers: ['localhost:9092'] },
      batchSize: 2,
      type: 'missing',
    };

    await expect(csvStreamToKafka(options)).rejects.toThrow(
      'Failed to fetch CSV'
    );
  });

  it('throws when res.body is null', async () => {
    (global.fetch as any).mockResolvedValue({
      ok: true,
      body: null,
    });

    const options: CsvStreamOptions = {
      csvUrl: 'https://example.com/nobody.csv',
      topic: 'test-topic',
      kafka: { clientId: 'test', brokers: ['localhost:9092'] },
      batchSize: 2,
      type: 'nobody',
    };

    await expect(csvStreamToKafka(options)).rejects.toThrow('No response body');
  });
});

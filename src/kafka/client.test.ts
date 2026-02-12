import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockConnect = vi.fn();
const mockDisconnect = vi.fn();
const mockKafkaConstructor = vi.fn();

vi.mock('@confluentinc/kafka-javascript', () => ({
  KafkaJS: {
    Kafka: class MockKafka {
      constructor(config: unknown) {
        mockKafkaConstructor(config);
      }
      producer() {
        return {
          connect: mockConnect,
          disconnect: mockDisconnect,
          send: vi.fn(),
        };
      }
    },
  },
}));

import {
  connectProducer,
  disconnectProducer,
  isProducerConnected,
} from './client.js';

const config = { clientId: 'test-client', brokers: ['localhost:9092'] };

describe('kafka client', () => {
  beforeEach(async () => {
    // Fully drain ref count so disconnect actually fires
    for (let i = 0; i < 10; i++) await disconnectProducer();
    vi.clearAllMocks();
  });

  it('reports not connected before any connection', () => {
    expect(isProducerConnected()).toBe(false);
  });

  it('connects and marks producer as connected', async () => {
    await connectProducer(config);

    expect(mockConnect).toHaveBeenCalledOnce();
    expect(isProducerConnected()).toBe(true);
  });

  it('wraps config in kafkaJS namespace for Confluent client', async () => {
    await connectProducer(config);

    expect(mockKafkaConstructor).toHaveBeenCalledWith({
      kafkaJS: {
        clientId: 'test-client',
        brokers: ['localhost:9092'],
      },
    });
  });

  it('reuses singleton producer on repeated sequential calls', async () => {
    const first = await connectProducer(config);
    const second = await connectProducer(config);

    expect(first).toBe(second);
    expect(mockKafkaConstructor).toHaveBeenCalledOnce();
  });

  it('disconnects and marks producer as not connected', async () => {
    await connectProducer(config);
    expect(isProducerConnected()).toBe(true);

    await disconnectProducer();

    expect(mockDisconnect).toHaveBeenCalledOnce();
    expect(isProducerConnected()).toBe(false);
  });

  it('disconnect is a safe no-op when no producer exists', async () => {
    await disconnectProducer();

    expect(mockDisconnect).not.toHaveBeenCalled();
    expect(isProducerConnected()).toBe(false);
  });

  it('creates fresh producer after disconnect', async () => {
    const first = await connectProducer(config);
    await disconnectProducer();
    const second = await connectProducer(config);

    expect(first).not.toBe(second);
    expect(mockKafkaConstructor).toHaveBeenCalledTimes(2);
  });

  it('deduplicates concurrent connect calls', async () => {
    const [a, b, c] = await Promise.all([
      connectProducer(config),
      connectProducer(config),
      connectProducer(config),
    ]);

    expect(a).toBe(b);
    expect(b).toBe(c);
    expect(mockConnect).toHaveBeenCalledOnce();
  });

  it('delays disconnect until last caller releases', async () => {
    // 3 concurrent connects → refCount=3
    await Promise.all([
      connectProducer(config),
      connectProducer(config),
      connectProducer(config),
    ]);

    // First two disconnects are no-ops (refCount > 0)
    await disconnectProducer();
    expect(mockDisconnect).not.toHaveBeenCalled();
    expect(isProducerConnected()).toBe(true);

    await disconnectProducer();
    expect(mockDisconnect).not.toHaveBeenCalled();
    expect(isProducerConnected()).toBe(true);

    // Third disconnect actually disconnects (refCount=0)
    await disconnectProducer();
    expect(mockDisconnect).toHaveBeenCalledOnce();
    expect(isProducerConnected()).toBe(false);
  });
});

import { Kafka } from 'kafkajs';
import { KafkaConfig } from '../types/index.js';

let producerInstance: ReturnType<Kafka['producer']> | null = null;

/**
 * Get or create singleton Kafka producer
 *
 * Returns the same producer instance on multiple calls (singleton pattern).
 * Producer must be connected before use: `await producer.connect()`
 *
 * @param config - Kafka configuration with clientId and brokers
 * @returns Kafka producer instance
 * @example
 * const producer = getKafkaProducer(config);
 * await producer.connect();
 * await producer.send({ topic: 'my-topic', messages: [...] });
 */
export function getKafkaProducer(config: KafkaConfig) {
  if (!producerInstance) {
    const kafka = new Kafka({
      clientId: config.clientId,
      brokers: config.brokers,
    });
    producerInstance = kafka.producer();
  }
  return producerInstance;
}

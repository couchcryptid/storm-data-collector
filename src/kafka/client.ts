import { Kafka } from 'kafkajs';
import { KafkaConfig } from '../types/index.js';

let producerInstance: ReturnType<Kafka['producer']> | null = null;
let producerConnected = false;

/**
 * Get or create singleton Kafka producer
 *
 * Returns the same producer instance on multiple calls (singleton pattern).
 * Producer must be connected before use: `await producer.connect()`
 * Automatically tracks connection state via KafkaJS events.
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
    producerInstance.on(producerInstance.events.CONNECT, () => {
      producerConnected = true;
    });
    producerInstance.on(producerInstance.events.DISCONNECT, () => {
      producerConnected = false;
    });
  }
  return producerInstance;
}

/**
 * Returns true if the Kafka producer has been created and connected.
 * Used by the /readyz endpoint to verify Kafka connectivity.
 */
export function isProducerConnected(): boolean {
  return producerConnected;
}

/**
 * Disconnect the singleton Kafka producer if it exists.
 * Used during graceful shutdown to cleanly close Kafka connections.
 */
export async function disconnectProducer(): Promise<void> {
  if (producerInstance) {
    await producerInstance.disconnect();
    producerConnected = false;
    producerInstance = null;
  }
}

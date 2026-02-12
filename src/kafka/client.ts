import { KafkaJS } from '@confluentinc/kafka-javascript';
import { KafkaConfig } from '../types/index.js';

let producerInstance: KafkaJS.Producer | null = null;
let producerConnected = false;
let connectPromise: Promise<KafkaJS.Producer> | null = null;
let refCount = 0;

/**
 * Get or create singleton Kafka producer.
 *
 * @param config - Kafka configuration with clientId and brokers
 * @returns Kafka producer instance
 */
function getOrCreateProducer(config: KafkaConfig): KafkaJS.Producer {
  if (!producerInstance) {
    const kafka = new KafkaJS.Kafka({
      kafkaJS: {
        clientId: config.clientId,
        brokers: config.brokers,
      },
    });
    producerInstance = kafka.producer();
  }
  return producerInstance;
}

/**
 * Connect the singleton Kafka producer and return it for use.
 * Safe for concurrent callers — deduplicates in-flight connect() calls
 * and tracks a reference count so disconnect only fires when the last
 * caller releases. This is required because @confluentinc/kafka-javascript
 * throws "Connect has already been called elsewhere" on concurrent connects.
 *
 * @param config - Kafka configuration with clientId and brokers
 * @returns Connected Kafka producer instance
 */
export async function connectProducer(
  config: KafkaConfig
): Promise<KafkaJS.Producer> {
  refCount++;

  if (producerConnected && producerInstance) return producerInstance;
  if (connectPromise) return connectPromise;

  connectPromise = (async () => {
    const producer = getOrCreateProducer(config);
    await producer.connect();
    producerConnected = true;
    connectPromise = null;
    return producer;
  })();

  return connectPromise;
}

/**
 * Returns true if the Kafka producer has been created and connected.
 * Used by the /readyz endpoint to verify Kafka connectivity.
 */
export function isProducerConnected(): boolean {
  return producerConnected;
}

/**
 * Release one reference to the singleton Kafka producer.
 * Only disconnects when the last caller releases (refCount reaches 0).
 * Used during graceful shutdown and after each CSV stream completes.
 */
export async function disconnectProducer(): Promise<void> {
  refCount = Math.max(0, refCount - 1);
  if (refCount > 0) return;

  if (producerInstance) {
    await producerInstance.disconnect();
    producerConnected = false;
    producerInstance = null;
  }
}

import { Kafka } from 'kafkajs';
import { KafkaConfig } from '../types/index.js';

let producerInstance: ReturnType<Kafka['producer']> | null = null;

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

import { Producer } from 'kafkajs';
import logger from '../logger.js';

export interface PublishBatchOptions {
  producer: Producer;
  topic: string;
  batch: Record<string, string>[];
}

export interface PublishBatchResult {
  successful: boolean;
  publishedCount: number;
}

export async function publishBatch({
  producer,
  topic,
  batch,
}: PublishBatchOptions): Promise<PublishBatchResult> {
  if (batch.length === 0) {
    return { successful: true, publishedCount: 0 };
  }

  await producer.send({
    topic,
    messages: batch.map((record) => {
      const { type, ...rest } = record;
      const normalizedType = type === 'torn' ? 'tornado' : type;
      return { value: JSON.stringify({ ...rest, Type: normalizedType }) };
    }),
  });

  logger.info({ topic, count: batch.length }, 'Published batch to Kafka');

  return {
    successful: true,
    publishedCount: batch.length,
  };
}

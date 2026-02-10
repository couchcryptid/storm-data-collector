import { Producer } from 'kafkajs';
import logger from '../logger.js';
import { metrics } from '../metrics.js';

const MAX_PUBLISH_RETRIES = 3;
const INITIAL_RETRY_DELAY_MS = 1000;

export interface PublishBatchOptions {
  producer: Producer;
  topic: string;
  batch: Record<string, string>[];
}

export interface PublishBatchResult {
  successful: boolean;
  publishedCount: number;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function publishBatch({
  producer,
  topic,
  batch,
}: PublishBatchOptions): Promise<PublishBatchResult> {
  if (batch.length === 0) {
    return { successful: true, publishedCount: 0 };
  }

  // NOAA CSV filenames use the abbreviation "torn" for tornado reports.
  // Normalize to "tornado" for downstream consumers and capitalize field names
  // to match the collector's JSON wire format convention.
  const messages = batch.map((record) => {
    const { type, ...rest } = record;
    const normalizedType = type === 'torn' ? 'tornado' : type;
    return { value: JSON.stringify({ ...rest, Type: normalizedType }) };
  });

  for (let attempt = 1; attempt <= MAX_PUBLISH_RETRIES; attempt++) {
    try {
      await producer.send({ topic, messages });

      logger.info({ topic, count: batch.length }, 'Published batch to Kafka');
      return { successful: true, publishedCount: batch.length };
    } catch (err) {
      if (attempt === MAX_PUBLISH_RETRIES) {
        logger.error(
          { topic, count: batch.length, err, attempt },
          'Kafka publish failed after retries'
        );
        return { successful: false, publishedCount: 0 };
      }

      const delayMs = INITIAL_RETRY_DELAY_MS * Math.pow(2, attempt - 1);
      metrics.kafkaPublishRetriesTotal.inc({ topic });
      logger.warn(
        { topic, count: batch.length, err, attempt, retryInMs: delayMs },
        'Kafka publish failed, retrying'
      );
      await delay(delayMs);
    }
  }

  return { successful: false, publishedCount: 0 };
}

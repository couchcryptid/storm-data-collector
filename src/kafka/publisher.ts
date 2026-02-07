import { Producer } from 'kafkajs';
import { v4 as uuidv4 } from 'uuid';
import { createDLQMessage, publishToDLQ } from './dlqPublisher.js';
import logger from '../logger.js';

export interface PublishBatchOptions {
  producer: Producer;
  topic: string;
  batch: Record<string, string>[];
  csvUrl?: string;
  weatherType?: string;
}

export interface PublishBatchResult {
  successful: boolean;
  publishedCount: number;
  dlqCount: number;
  error?: Error;
}

/**
 * Publish a batch of records to Kafka with automatic DLQ fallback on failure
 *
 * On success, messages are published to the main topic. On failure, they are
 * automatically sent to the DLQ topic with rich error metadata for debugging.
 * If DLQ publishing also fails, messages are written to a local file fallback.
 *
 * @param options - Configuration for batch publishing
 * @param options.producer - Connected Kafka producer instance
 * @param options.topic - Main topic to publish to
 * @param options.batch - Array of records to publish
 * @param options.csvUrl - Source CSV URL (included in DLQ metadata)
 * @param options.weatherType - Weather type: 'hail', 'wind', or 'torn' (included in DLQ metadata)
 * @returns Result object with success status and message counts
 * @throws Never throws; all errors are handled with DLQ fallback
 */
export async function publishBatch({
  producer,
  topic,
  batch,
  csvUrl,
  weatherType,
}: PublishBatchOptions): Promise<PublishBatchResult> {
  if (batch.length === 0) {
    return { successful: true, publishedCount: 0, dlqCount: 0 };
  }

  const batchId = uuidv4();

  try {
    await producer.send({
      topic,
      messages: batch.map((record) => ({ value: JSON.stringify(record) })),
    });

    return {
      successful: true,
      publishedCount: batch.length,
      dlqCount: 0,
    };
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));

    logger.error(
      { error: err.message, batchSize: batch.length, topic },
      'Kafka publish failed'
    );

    // Send entire batch to DLQ (KafkaJS batches are all-or-nothing)
    const dlqMessages = batch.map((record) =>
      createDLQMessage(record, err, {
        originalTopic: topic,
        csvUrl,
        weatherType,
        batchId,
        attemptNumber: 1,
      })
    );

    const dlqCount = await publishToDLQ(producer, dlqMessages);

    return {
      successful: false,
      publishedCount: 0,
      dlqCount,
      error: err,
    };
  }
}

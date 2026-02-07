import { Producer } from 'kafkajs';
import { v4 as uuidv4 } from 'uuid';
import { createDlqMessage, publishToDlq } from './dlqPublisher.js';

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
 * Publish batch to Kafka with DLQ support
 * Returns result indicating success/failure and DLQ usage
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

    console.error(
      `[${new Date().toISOString()}] Kafka publish failed for batch of ${batch.length} messages:`,
      err.message
    );

    // Send entire batch to DLQ (KafkaJS batches are all-or-nothing)
    const dlqMessages = batch.map((record) =>
      createDlqMessage(record, err, {
        originalTopic: topic,
        csvUrl,
        weatherType,
        batchId,
        attemptNumber: 1,
      })
    );

    const dlqCount = await publishToDlq(producer, dlqMessages);

    return {
      successful: false,
      publishedCount: 0,
      dlqCount,
      error: err,
    };
  }
}

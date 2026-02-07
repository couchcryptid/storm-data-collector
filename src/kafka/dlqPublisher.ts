import { Producer } from 'kafkajs';
import { promises as fs } from 'fs';
import { join } from 'path';
import { DLQMessage, FileFallbackMessage } from '../types/index.js';
import { config } from '../config.js';
import logger from '../logger.js';
import { getErrorMessage } from '../shared/errors.js';
import { DATA_PROCESSING, FILE_FORMAT } from '../shared/constants.js';

/**
 * Publish failed messages to Dead Letter Queue topic
 *
 * Attempts to send messages to DLQ topic with metadata for debugging.
 * On DLQ publish failure, falls back to file storage to prevent message loss.
 *
 * @param producer - Connected Kafka producer instance
 * @param messages - Array of DLQ messages to publish
 * @returns Number of messages successfully published (0 if DLQ disabled or array empty)
 *
 * @example
 * const dlqCount = await publishToDLQ(producer, dlqMessages);
 * if (dlqCount === 0) {
 *   // Messages went to file fallback
 * }
 */
export async function publishToDLQ(
  producer: Producer,
  messages: DLQMessage[]
): Promise<number> {
  if (!config.dlq.enabled || messages.length === 0) {
    return 0;
  }

  try {
    logger.info(
      { count: messages.length, topic: config.dlq.topic },
      'Publishing messages to DLQ'
    );

    await producer.send({
      topic: config.dlq.topic,
      messages: messages.map((msg) => ({
        value: JSON.stringify(msg),
        key: msg.metadata.batchId || undefined,
      })),
    });

    return messages.length;
  } catch (error) {
    logger.error(
      { error: getErrorMessage(error) },
      'Failed to publish to DLQ, falling back to file'
    );

    // File fallback on DLQ publish failure
    await writeDLQToFile(messages, error);
    return 0;
  }
}

/**
 * Write DLQ messages to local file as last-resort fallback
 *
 * Called when Kafka DLQ topic publishing fails. Writes messages to JSON file
 * with timestamp in filename for recovery/reprocessing.
 * Includes file size warnings but writes anyway to avoid message loss.
 *
 * @param messages - Array of DLQ messages to write
 * @param error - The error that caused DLQ publish to fail
 * @returns Promise that resolves (never rejects); errors are logged
 *
 * @internal
 */
async function writeDLQToFile(
  messages: DLQMessage[],
  error: unknown
): Promise<void> {
  const timestamp = new Date()
    .toISOString()
    .replace(
      FILE_FORMAT.TIMESTAMP_UNSAFE_CHARS,
      FILE_FORMAT.TIMESTAMP_SAFE_CHAR
    );
  const filename = `dlq-fallback-${timestamp}.json`;
  const filepath = join(config.dlq.fileFallback.directory, filename);

  const fallbackMessage: FileFallbackMessage = {
    failedMessages: messages,
    fileMetadata: {
      timestamp: new Date().toISOString(),
      count: messages.length,
      reason: getErrorMessage(error),
    },
  };

  try {
    // Ensure directory exists
    await fs.mkdir(config.dlq.fileFallback.directory, { recursive: true });

    // Check file size limit
    const jsonContent = JSON.stringify(fallbackMessage, null, 2);
    const sizeMb =
      Buffer.byteLength(jsonContent, 'utf8') / DATA_PROCESSING.BYTES_PER_MB;

    if (sizeMb > config.dlq.fileFallback.maxSizeMb) {
      logger.warn(
        {
          sizeMb: sizeMb.toFixed(2),
          maxSizeMb: config.dlq.fileFallback.maxSizeMb,
        },
        'DLQ fallback file exceeds max size, writing anyway'
      );
    }

    await fs.writeFile(filepath, jsonContent, 'utf8');

    logger.info(
      { count: messages.length, filepath },
      'Wrote DLQ messages to fallback file'
    );
  } catch (fileError) {
    logger.error(
      {
        error: getErrorMessage(fileError),
        filepath,
      },
      'CRITICAL: Failed to write DLQ fallback file'
    );
    logger.error(
      { lostCount: messages.length, firstMessage: messages[0] },
      'Lost DLQ messages'
    );
  }
}

/**
 * Create a DLQ message with full error context and tracing metadata
 *
 * Wraps a failed CSV record with error details, timestamps, and batch information
 * for debugging and recovery. Stack traces are included if configured.
 *
 * @param originalMessage - The CSV record that failed to publish
 * @param error - The error that occurred during publishing
 * @param context - Metadata about the batch and source
 * @param context.originalTopic - Main topic that publishing failed for
 * @param context.csvUrl - Source CSV URL (optional)
 * @param context.weatherType - Weather type identifier (optional)
 * @param context.batchId - Batch identifier for correlation (optional)
 * @param context.attemptNumber - Attempt number for this batch (optional)
 * @returns DLQ message ready to publish
 */
export function createDLQMessage(
  originalMessage: Record<string, string>,
  error: Error,
  context: {
    originalTopic: string;
    csvUrl?: string;
    weatherType?: string;
    batchId?: string;
    attemptNumber?: number;
  }
): DLQMessage {
  return {
    originalMessage,
    metadata: {
      timestamp: new Date().toISOString(),
      originalTopic: context.originalTopic,
      errorType: 'kafka_publish',
      errorMessage: error.message,
      errorStack: config.dlq.includeStackTraces ? error.stack : undefined,
      attemptNumber: context.attemptNumber || 1,
      batchId: context.batchId,
      csvUrl: context.csvUrl,
      weatherType: context.weatherType,
    },
  };
}

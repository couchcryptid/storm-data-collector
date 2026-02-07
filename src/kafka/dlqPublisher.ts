import { Producer } from 'kafkajs';
import { promises as fs } from 'fs';
import { join } from 'path';
import { DlqMessage, FileFallbackMessage } from '../types/index.js';
import { config } from '../config.js';

/**
 * Publish messages to DLQ topic
 * @returns Number of messages successfully published
 */
export async function publishToDlq(
  producer: Producer,
  messages: DlqMessage[]
): Promise<number> {
  if (!config.dlq.enabled || messages.length === 0) {
    return 0;
  }

  try {
    console.log(
      `[${new Date().toISOString()}] Publishing ${messages.length} messages to DLQ: ${config.dlq.topic}`
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
    console.error(
      `[${new Date().toISOString()}] Failed to publish to DLQ, falling back to file:`,
      error instanceof Error ? error.message : error
    );

    // File fallback on DLQ publish failure
    await writeDlqToFile(messages, error);
    return 0;
  }
}

/**
 * Write DLQ messages to local file as fallback
 */
async function writeDlqToFile(
  messages: DlqMessage[],
  error: unknown
): Promise<void> {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filename = `dlq-fallback-${timestamp}.json`;
  const filepath = join(config.dlq.fileFallback.directory, filename);

  const fallbackMessage: FileFallbackMessage = {
    failedMessages: messages,
    fileMetadata: {
      timestamp: new Date().toISOString(),
      count: messages.length,
      reason: error instanceof Error ? error.message : String(error),
    },
  };

  try {
    // Ensure directory exists
    await fs.mkdir(config.dlq.fileFallback.directory, { recursive: true });

    // Check file size limit
    const jsonContent = JSON.stringify(fallbackMessage, null, 2);
    const sizeMb = Buffer.byteLength(jsonContent, 'utf8') / (1024 * 1024);

    if (sizeMb > config.dlq.fileFallback.maxSizeMb) {
      console.warn(
        `[${new Date().toISOString()}] DLQ fallback file exceeds max size (${sizeMb.toFixed(2)}MB > ${config.dlq.fileFallback.maxSizeMb}MB). Writing anyway with warning.`
      );
    }

    await fs.writeFile(filepath, jsonContent, 'utf8');

    console.log(
      `[${new Date().toISOString()}] Wrote ${messages.length} DLQ messages to fallback file: ${filepath}`
    );
  } catch (fileError) {
    console.error(
      `[${new Date().toISOString()}] CRITICAL: Failed to write DLQ fallback file:`,
      fileError instanceof Error ? fileError.message : fileError
    );
    console.error(
      `[${new Date().toISOString()}] Lost ${messages.length} messages. First message:`,
      JSON.stringify(messages[0], null, 2)
    );
  }
}

/**
 * Create DLQ message from original record and error context
 */
export function createDlqMessage(
  originalMessage: Record<string, string>,
  error: Error,
  context: {
    originalTopic: string;
    csvUrl?: string;
    weatherType?: string;
    batchId?: string;
    attemptNumber?: number;
  }
): DlqMessage {
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

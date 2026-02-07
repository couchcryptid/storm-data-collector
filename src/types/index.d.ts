/**
 * Kafka client configuration
 *
 * @property clientId - Unique client identifier for logging/monitoring
 * @property brokers - List of Kafka broker addresses (host:port format)
 */
export interface KafkaConfig {
  clientId: string;
  brokers: string[];
}

/**
 * Options for CSV to Kafka streaming pipeline
 *
 * @property csvUrl - URL of CSV file to fetch and parse
 * @property topic - Kafka topic to publish records to
 * @property kafka - Kafka client configuration
 * @property batchSize - Records per batch before publishing (default: 500)
 * @property type - Weather type identifier added to each record ('hail'|'wind'|'torn')
 */
export interface CsvToKafkaOptions {
  csvUrl: string;
  topic: string;
  kafka: KafkaConfig;
  batchSize?: number;
  type?: string;
}

export interface RetryOptions {
  failedTypes: string[];
  retryHours: number;
  retryCallback: (types: string[]) => Promise<void>;
}

/**
 * DLQ message with original record and full error context
 *
 * Sent to DLQ topic when Kafka publishing fails. Includes the original CSV record,
 * error details, and metadata for debugging and recovery.
 *
 * @property originalMessage - The CSV record that failed to publish
 * @property metadata - Error context and tracing information
 */
export interface DLQMessage {
  originalMessage: Record<string, string>;
  metadata: {
    timestamp: string;
    originalTopic: string;
    errorType: 'kafka_publish' | 'dlq_publish' | 'file_fallback';
    errorMessage: string;
    errorStack?: string;
    attemptNumber: number;
    batchId?: string;
    csvUrl?: string;
    weatherType?: string;
  };
}

export interface FileFallbackMessage {
  failedMessages: DLQMessage[];
  fileMetadata: {
    timestamp: string;
    count: number;
    reason: string;
  };
}

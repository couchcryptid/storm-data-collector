export interface KafkaConfig {
  clientId: string;
  brokers: string[];
}

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

export interface DlqMessage {
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
  failedMessages: DlqMessage[];
  fileMetadata: {
    timestamp: string;
    count: number;
    reason: string;
  };
}

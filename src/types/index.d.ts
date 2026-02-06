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

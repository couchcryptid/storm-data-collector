export interface KafkaConfig {
  clientId: string;
  brokers: string[];
}

export interface CsvToKafkaOptions {
  csvUrl: string;
  topic: string;
  kafka: KafkaConfig;
  eventType?: string;
  reportDate: Date;
}

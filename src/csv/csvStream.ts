import { Readable } from 'stream';
import csvParser from 'csv-parser';
import { CsvToKafkaOptions } from '../types/index.js';
import { getKafkaProducer } from '../kafka/client.js';
import { publishBatch } from '../kafka/publisher.js';
import logger from '../logger.js';
import { getErrorMessage } from '../shared/errors.js';
import { DATA_PROCESSING } from '../shared/constants.js';

/**
 * Custom error for HTTP-specific failures
 * Includes status code for retry logic decisions
 *
 * @example
 * throw new HttpError('CSV not found', 404);
 */
export class HttpError extends Error {
  constructor(
    message: string,
    public statusCode: number
  ) {
    super(message);
    this.name = 'HttpError';
  }
}

export type CsvStreamOptions = CsvToKafkaOptions;

export interface CsvStreamResult {
  totalRows: number;
  publishedRows: number;
  dlqRows: number;
  batchFailures: number;
}

/**
 * Publish a single CSV batch and update result statistics
 *
 * Attempts to publish batch to Kafka. If unsuccessful, updates DLQ counters.
 * Never throws; errors are captured and logged.
 *
 * @param batch - Array of CSV records to publish
 * @param result - Statistics object to update
 * @param options.producer - Kafka producer instance
 * @param options.topic - Kafka topic name
 * @param options.csvUrl - Source CSV URL for logging
 * @param options.weatherType - Weather type for metadata
 * @returns true if batch published successfully, false if sent to DLQ
 * @internal
 */
async function publishCsvBatch(
  batch: Record<string, string>[],
  result: CsvStreamResult,
  options: {
    producer: ReturnType<typeof getKafkaProducer>;
    topic: string;
    csvUrl: string;
    weatherType?: string;
  }
): Promise<boolean> {
  if (batch.length === 0) {
    return true;
  }

  try {
    const publishResult = await publishBatch({
      producer: options.producer,
      topic: options.topic,
      batch,
      csvUrl: options.csvUrl,
      weatherType: options.weatherType,
    });

    if (publishResult.successful) {
      result.publishedRows += publishResult.publishedCount;
      return true;
    } else {
      result.batchFailures++;
      result.dlqRows += batch.length;
      return false;
    }
  } catch (err) {
    // Should not happen (publishBatch catches errors), but defensive
    logger.error(
      {
        error: getErrorMessage(err),
        csvUrl: options.csvUrl,
      },
      'Unexpected error in batch publishing'
    );
    result.batchFailures++;
    return false;
  }
}

/**
 * CSV parsing and streaming to Kafka with batch publishing
 *
 * Fetches CSV from URL, parses line-by-line, batches rows, and publishes to Kafka.
 * Adds `type` field to each record. Automatically handles DLQ fallback for failed batches.
 *
 * @param csvUrl - URL of CSV file to fetch
 * @param topic - Kafka topic to publish to
 * @param kafka - Kafka client configuration
 * @param batchSize - Number of rows per batch (default: 500)
 * @param type - Weather type: 'hail', 'wind', or 'torn'
 * @returns Result with statistics: total rows, published, DLQ'd, and failures
 * @throws HttpError if fetch fails or returns non-200 status
 * @throws Error if response has no body
 */
export async function csvStreamToKafka({
  csvUrl,
  topic,
  kafka,
  batchSize = DATA_PROCESSING.DEFAULT_BATCH_SIZE,
  type,
}: CsvToKafkaOptions): Promise<CsvStreamResult> {
  const producer = getKafkaProducer(kafka);
  await producer.connect();

  const response = await fetch(csvUrl);
  if (!response.ok)
    throw new HttpError(
      `Failed to fetch CSV: ${csvUrl} (status ${response.status})`,
      response.status
    );
  if (!response.body) throw new Error(`No response body for CSV: ${csvUrl}`);

  const readable = Readable.fromWeb(
    response.body as ReadableStream<Uint8Array>
  );
  const csvRows: Record<string, string>[] = [];

  const result: CsvStreamResult = {
    totalRows: 0,
    publishedRows: 0,
    dlqRows: 0,
    batchFailures: 0,
  };

  const publishOptions = {
    producer,
    topic,
    csvUrl,
    weatherType: type,
  };

  await new Promise<void>((resolve, reject) => {
    readable
      .pipe(csvParser())
      .on('data', async (row) => {
        result.totalRows++;
        csvRows.push({ ...row, type });

        if (csvRows.length >= batchSize) {
          const batch = csvRows.splice(0, batchSize);
          await publishCsvBatch(batch, result, publishOptions);
        }
      })
      .on('end', async () => {
        // Process remaining rows
        if (csvRows.length > 0) {
          await publishCsvBatch(csvRows, result, publishOptions);
        }

        await producer.disconnect();

        logger.info({ csvUrl, ...result }, 'CSV processing complete');

        resolve();
      })
      .on('error', (err) => reject(err));
  });

  return result;
}

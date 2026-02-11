import { Readable } from 'node:stream';
import csvParser from 'csv-parser';
import { CsvToKafkaOptions } from '../types/index.js';
import { getKafkaProducer } from '../kafka/client.js';
import { publishBatch } from '../kafka/publisher.js';
import logger from '../logger.js';
import { metrics } from '../metrics.js';

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
}

export async function csvStreamToKafka({
  csvUrl,
  topic,
  kafka,
  eventType,
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

  const text = await response.text();
  const rows = await parseCsv(text, eventType);

  let publishedRows = 0;
  if (rows.length > 0) {
    const result = await publishBatch({ producer, topic, batch: rows });
    publishedRows = result.publishedCount;
  }

  await producer.disconnect();

  const reportType = eventType || 'unknown';
  metrics.rowsProcessedTotal.inc({ report_type: reportType }, rows.length);
  metrics.rowsPublishedTotal.inc({ report_type: reportType }, publishedRows);

  logger.info(
    { csvUrl, totalRows: rows.length, publishedRows },
    'CSV processing complete'
  );

  return { totalRows: rows.length, publishedRows };
}

function parseCsv(
  text: string,
  eventType?: string
): Promise<Record<string, string>[]> {
  return new Promise((resolve, reject) => {
    const rows: Record<string, string>[] = [];
    Readable.from(text)
      .pipe(csvParser())
      .on('data', (row) => rows.push({ ...row, eventType }))
      .on('end', () => resolve(rows))
      .on('error', reject);
  });
}

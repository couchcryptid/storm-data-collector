import { Readable } from 'node:stream';
import csvParser from 'csv-parser';
import { CsvToKafkaOptions } from '../types/index.js';
import { connectProducer, disconnectProducer } from '../kafka/client.js';
import { publishBatch } from '../kafka/publisher.js';
import { expandHHMMToISO } from './utils.js';
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
  reportDate,
}: CsvToKafkaOptions): Promise<CsvStreamResult> {
  const producer = await connectProducer(kafka);

  const response = await fetch(csvUrl);
  if (!response.ok)
    throw new HttpError(
      `Failed to fetch CSV: ${csvUrl} (status ${response.status})`,
      response.status
    );
  if (!response.body) throw new Error(`No response body for CSV: ${csvUrl}`);

  // NOAA SPC daily CSVs are small (~300 rows). Buffering the full response is
  // simpler than streaming and sufficient for expected file sizes. For large
  // files, pipe response.body directly through csv-parser and publish in
  // batches to avoid holding all rows in memory.
  const text = await response.text();
  const rows = await parseCsv(text, eventType, reportDate);

  let publishedRows = 0;
  if (rows.length > 0) {
    const result = await publishBatch({ producer, topic, batch: rows });
    publishedRows = result.publishedCount;
  }

  await disconnectProducer();

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
  eventType: string | undefined,
  reportDate: Date
): Promise<Record<string, string>[]> {
  return new Promise((resolve, reject) => {
    const rows: Record<string, string>[] = [];
    Readable.from(text)
      .pipe(csvParser())
      .on('data', (row) => {
        // Expand HHMM to full ISO 8601 timestamp using the report date.
        // e.g. "1510" + 2024-04-26 → "2024-04-26T15:10:00Z"
        const time = row.Time
          ? expandHHMMToISO(row.Time, reportDate)
          : row.Time;
        rows.push({ ...row, Time: time, eventType });
      })
      .on('end', () => resolve(rows))
      .on('error', reject);
  });
}

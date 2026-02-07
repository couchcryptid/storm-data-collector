import { Readable } from 'stream';
import csvParser from 'csv-parser';
import { CsvToKafkaOptions } from '../types/index.js';
import { getKafkaProducer } from '../kafka/client.js';
import { publishBatch } from '../kafka/publisher.js';

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

export async function csvStreamToKafka({
  csvUrl,
  topic,
  kafka,
  batchSize = 500,
  type,
}: CsvToKafkaOptions): Promise<CsvStreamResult> {
  const producer = getKafkaProducer(kafka);
  await producer.connect();

  const res = await fetch(csvUrl);
  if (!res.ok)
    throw new HttpError(
      `Failed to fetch CSV: ${csvUrl} (status ${res.status})`,
      res.status
    );
  if (!res.body) throw new Error(`No response body for CSV: ${csvUrl}`);

  const readable = Readable.fromWeb(res.body as ReadableStream<Uint8Array>);
  const rows: Record<string, string>[] = [];

  // Track results
  let totalRows = 0;
  let publishedRows = 0;
  let dlqRows = 0;
  let batchFailures = 0;

  await new Promise<void>((resolve, reject) => {
    readable
      .pipe(csvParser())
      .on('data', async (row) => {
        totalRows++;
        rows.push({ ...row, type });

        if (rows.length >= batchSize) {
          const batch = rows.splice(0, batchSize);

          // Publish batch with DLQ support (don't reject on failure)
          try {
            const result = await publishBatch({
              producer,
              topic,
              batch,
              csvUrl,
              weatherType: type,
            });

            if (result.successful) {
              publishedRows += result.publishedCount;
            } else {
              batchFailures++;
              dlqRows += batch.length; // Entire batch sent to DLQ
            }
          } catch (err) {
            // Should not happen (publishBatch catches errors), but defensive
            console.error(
              `[${new Date().toISOString()}] Unexpected error in publishBatch:`,
              err instanceof Error ? err.message : err
            );
            batchFailures++;
          }
        }
      })
      .on('end', async () => {
        // Process remaining rows
        if (rows.length > 0) {
          try {
            const result = await publishBatch({
              producer,
              topic,
              batch: rows,
              csvUrl,
              weatherType: type,
            });

            if (result.successful) {
              publishedRows += result.publishedCount;
            } else {
              batchFailures++;
              dlqRows += rows.length;
            }
          } catch (err) {
            console.error(
              `[${new Date().toISOString()}] Unexpected error in final batch:`,
              err instanceof Error ? err.message : err
            );
            batchFailures++;
          }
        }

        await producer.disconnect();

        console.log(
          `[${new Date().toISOString()}] CSV processing complete: ${csvUrl}. ` +
            `Total: ${totalRows}, Published: ${publishedRows}, DLQ: ${dlqRows}, Failed batches: ${batchFailures}`
        );

        resolve();
      })
      .on('error', (err) => reject(err));
  });

  return { totalRows, publishedRows, dlqRows, batchFailures };
}

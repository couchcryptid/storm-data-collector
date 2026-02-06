import { Readable } from 'stream';
import csvParser from 'csv-parser';
import { CsvToKafkaOptions } from '../types/index.js';
import { getKafkaProducer } from '../kafka/client.js';
import { publishBatch } from '../kafka/publisher.js';

export type CsvStreamOptions = CsvToKafkaOptions;

export async function csvStreamToKafka({
  csvUrl,
  topic,
  kafka,
  batchSize = 500,
  type,
}: CsvToKafkaOptions) {
  const producer = getKafkaProducer(kafka);
  await producer.connect();

  const res = await fetch(csvUrl);
  if (!res.ok)
    throw new Error(`Failed to fetch CSV: ${csvUrl} (status ${res.status})`);
  if (!res.body) throw new Error(`No response body for CSV: ${csvUrl}`);

  const readable = Readable.fromWeb(res.body as ReadableStream<Uint8Array>);
  const rows: any[] = [];

  await new Promise<void>((resolve, reject) => {
    readable
      .pipe(csvParser())
      .on('data', (row) => {
        rows.push({ ...row, type });

        if (rows.length >= batchSize) {
          const batch = rows.splice(0, batchSize);
          publishBatch(producer, topic, batch).catch((err) => reject(err));
        }
      })
      .on('end', async () => {
        if (rows.length > 0) {
          await publishBatch(producer, topic, rows);
        }
        await producer.disconnect();
        resolve();
      })
      .on('error', (err) => reject(err));
  });
}

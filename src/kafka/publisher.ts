import { Producer } from 'kafkajs';

export async function publishBatch(
  producer: Producer,
  topic: string,
  batch: any[]
) {
  if (batch.length === 0) return;
  await producer.send({
    topic,
    messages: batch.map((record) => ({ value: JSON.stringify(record) })),
  });
}

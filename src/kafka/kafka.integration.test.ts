// src/kafka/kafka.integration.test.ts
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { KafkaContainer, StartedKafkaContainer } from '@testcontainers/kafka';
import { Kafka, EachMessagePayload } from 'kafkajs';
import { csvStreamToKafka } from '../csv/csvStream.js';
import { createServer, Server } from 'http';

describe('Kafka Integration Tests', () => {
  let kafkaContainer: StartedKafkaContainer;
  let kafka: Kafka;
  let httpServer: Server;
  let httpServerUrl: string;
  const testGroupId = 'test-consumer-group';

  // Store CSV data to serve
  let testCsvContent = '';

  beforeAll(async () => {
    // Start HTTP server to serve CSV data
    httpServer = createServer((_req, res) => {
      res.writeHead(200, { 'Content-Type': 'text/csv' });
      res.end(testCsvContent);
    });

    await new Promise<void>((resolve) => {
      httpServer.listen(0, () => {
        const address = httpServer.address();
        const port =
          typeof address === 'object' && address ? address.port : 3000;
        httpServerUrl = `http://localhost:${port}`;
        console.log(
          `[Integration Test] HTTP server started at ${httpServerUrl}`
        );
        resolve();
      });
    });

    // Start Kafka container with KRaft mode (no ZooKeeper)
    console.log('[Integration Test] Starting Kafka container...');
    kafkaContainer = await new KafkaContainer('confluentinc/cp-kafka:7.5.0')
      .withKraft()
      .start();

    const host = kafkaContainer.getHost();
    const port = kafkaContainer.getMappedPort(9093);
    const brokers = `${host}:${port}`;
    console.log(`[Integration Test] Kafka started at ${brokers}`);

    // Create Kafka client
    kafka = new Kafka({
      clientId: 'integration-test-client',
      brokers: [brokers],
    });

    // Topics will be created automatically by each test with replication factor 1

    console.log('[Integration Test] Setup complete');
  }, 90000); // 90 second timeout for container startup

  // Helper function to create topics with proper replication factor
  async function createTopic(topicName: string): Promise<void> {
    const admin = kafka.admin();
    await admin.connect();
    await admin.createTopics({
      topics: [
        {
          topic: topicName,
          numPartitions: 1,
          replicationFactor: 1,
        },
      ],
    });
    await admin.disconnect();
  }

  beforeEach(async () => {
    // Consumer will be created in each test with unique topic
  });

  afterAll(async () => {
    // Cleanup - consumers are disconnected in each test
    console.log('[Integration Test] Cleaning up...');
    if (kafkaContainer) {
      await kafkaContainer.stop();
    }
    if (httpServer) {
      await new Promise<void>((resolve) => httpServer.close(() => resolve()));
    }
    console.log('[Integration Test] Cleanup complete');
  }, 30000);

  it('publishes CSV data to Kafka and can be consumed', async () => {
    // Arrange: Set CSV data to serve
    const testTopic = `test-csv-topic-${Date.now()}`;
    testCsvContent = `id,name,value,timestamp
1,test-item-1,100,2024-01-01T00:00:00Z
2,test-item-2,200,2024-01-02T00:00:00Z
3,test-item-3,300,2024-01-03T00:00:00Z`;

    // Create topic with proper replication factor
    await createTopic(testTopic);

    // Create consumer with unique topic
    const testConsumer = kafka.consumer({
      groupId: `${testGroupId}-${Date.now()}`,
    });
    await testConsumer.connect();
    await testConsumer.subscribe({ topic: testTopic, fromBeginning: true });

    // Collect consumed messages
    const consumedMessages: string[] = [];
    const messagePromise = new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(
          new Error(
            `Timeout waiting for messages. Received ${consumedMessages.length}/3`
          )
        );
      }, 15000);

      testConsumer.run({
        eachMessage: async ({ message }: EachMessagePayload) => {
          const value = message.value?.toString();
          if (value) {
            consumedMessages.push(value);
            // We expect 3 messages (3 CSV rows)
            if (consumedMessages.length === 3) {
              clearTimeout(timeout);
              resolve();
            }
          }
        },
      });
    });

    // Wait for consumer to be fully ready
    await new Promise((resolve) => setTimeout(resolve, 1000));

    // Act: Publish CSV data to Kafka
    const host = kafkaContainer.getHost();
    const port = kafkaContainer.getMappedPort(9093);
    const brokers = `${host}:${port}`;
    await csvStreamToKafka({
      csvUrl: `${httpServerUrl}/test.csv`,
      topic: testTopic,
      kafka: {
        clientId: 'integration-test-producer',
        brokers: [brokers],
      },
      batchSize: 2,
      type: 'test',
    });

    // Wait for messages to be consumed
    await messagePromise;

    // Assert: Verify messages were received
    expect(consumedMessages).toHaveLength(3);

    // Verify message content - sort by ID since Kafka doesn't guarantee order with batching
    const messages = consumedMessages
      .map((msg) => JSON.parse(msg))
      .sort((a, b) => parseInt(a.id) - parseInt(b.id));

    expect(messages[0]).toMatchObject({
      id: '1',
      name: 'test-item-1',
      value: '100',
      timestamp: '2024-01-01T00:00:00Z',
      type: 'test',
    });

    expect(messages[1]).toMatchObject({
      id: '2',
      name: 'test-item-2',
      value: '200',
      timestamp: '2024-01-02T00:00:00Z',
      type: 'test',
    });

    expect(messages[2]).toMatchObject({
      id: '3',
      name: 'test-item-3',
      value: '300',
      timestamp: '2024-01-03T00:00:00Z',
      type: 'test',
    });

    console.log(
      '[Integration Test] Successfully published and consumed 3 messages'
    );

    // Disconnect consumer after test
    await testConsumer.disconnect();
  }, 30000);

  it('handles batch publishing with configured batch size', async () => {
    // Arrange: Create larger CSV dataset
    const testTopic = `test-batch-topic-${Date.now()}`;
    const rows = Array.from({ length: 10 }, (_, i) => ({
      id: i + 1,
      name: `batch-item-${i + 1}`,
      value: (i + 1) * 100,
      timestamp: '2024-01-01T00:00:00Z',
    }));

    testCsvContent =
      'id,name,value,timestamp\n' +
      rows.map((r) => `${r.id},${r.name},${r.value},${r.timestamp}`).join('\n');

    // Create topic with proper replication factor
    await createTopic(testTopic);

    // Create consumer with unique topic
    const testConsumer = kafka.consumer({
      groupId: `${testGroupId}-${Date.now()}`,
    });
    await testConsumer.connect();
    await testConsumer.subscribe({ topic: testTopic, fromBeginning: true });

    // Collect consumed messages
    const consumedMessages: string[] = [];
    const messagePromise = new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(
          new Error(
            `Timeout waiting for batch messages. Received ${consumedMessages.length}/10`
          )
        );
      }, 20000);

      testConsumer.run({
        eachMessage: async ({ message }: EachMessagePayload) => {
          const value = message.value?.toString();
          if (value) {
            consumedMessages.push(value);
            // We expect 10 messages (10 CSV rows)
            if (consumedMessages.length === 10) {
              clearTimeout(timeout);
              resolve();
            }
          }
        },
      });
    });

    // Wait for consumer to be fully ready
    await new Promise((resolve) => setTimeout(resolve, 1000));

    // Act: Publish with batch size of 3
    const host = kafkaContainer.getHost();
    const port = kafkaContainer.getMappedPort(9093);
    const brokers = `${host}:${port}`;
    await csvStreamToKafka({
      csvUrl: `${httpServerUrl}/batch.csv`,
      topic: testTopic,
      kafka: {
        clientId: 'batch-test-producer',
        brokers: [brokers],
      },
      batchSize: 3, // Batch size of 3
      type: 'batch-test',
    });

    // Wait for all messages
    await messagePromise;

    // Assert: Verify all 10 messages received
    expect(consumedMessages).toHaveLength(10);

    // Verify messages are correctly formatted - sort by ID first
    const messages = consumedMessages
      .map((msg) => JSON.parse(msg))
      .sort((a, b) => parseInt(a.id) - parseInt(b.id));
    messages.forEach((msg, idx) => {
      expect(msg).toMatchObject({
        id: String(idx + 1),
        name: `batch-item-${idx + 1}`,
        value: String((idx + 1) * 100),
        type: 'batch-test',
      });
      expect(msg.timestamp).toBeDefined();
    });

    console.log(
      '[Integration Test] Successfully published and consumed 10 batched messages'
    );

    // Disconnect consumer after test
    await testConsumer.disconnect();
  }, 35000);

  it('publishes messages with correct type metadata', async () => {
    // Arrange
    const testTopic = `test-metadata-topic-${Date.now()}`;
    testCsvContent = `id,product,price
1,laptop,999.99
2,mouse,29.99`;

    const testType = 'products';

    // Create topic with proper replication factor
    await createTopic(testTopic);

    // Create consumer with unique topic
    const testConsumer = kafka.consumer({
      groupId: `${testGroupId}-${Date.now()}`,
    });
    await testConsumer.connect();
    await testConsumer.subscribe({ topic: testTopic, fromBeginning: true });

    // Collect consumed messages
    const consumedMessages: string[] = [];
    const messagePromise = new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(
          new Error(
            `Timeout waiting for metadata messages. Received ${consumedMessages.length}/2`
          )
        );
      }, 15000);

      testConsumer.run({
        eachMessage: async ({ message }: EachMessagePayload) => {
          const value = message.value?.toString();
          if (value) {
            consumedMessages.push(value);
            if (consumedMessages.length === 2) {
              clearTimeout(timeout);
              resolve();
            }
          }
        },
      });
    });

    // Act
    const host = kafkaContainer.getHost();
    const port = kafkaContainer.getMappedPort(9093);
    const brokers = `${host}:${port}`;
    await csvStreamToKafka({
      csvUrl: `${httpServerUrl}/products.csv`,
      topic: testTopic,
      kafka: {
        clientId: 'metadata-test-producer',
        brokers: [brokers],
      },
      batchSize: 10,
      type: testType,
    });

    // Wait for messages
    await messagePromise;

    // Assert: Verify type is included in messages
    expect(consumedMessages).toHaveLength(2);

    const messages = consumedMessages.map((msg) => JSON.parse(msg));

    messages.forEach((msg) => {
      expect(msg.type).toBe(testType);
    });

    expect(messages[0]).toMatchObject({
      id: '1',
      product: 'laptop',
      price: '999.99',
      type: testType,
    });

    expect(messages[1]).toMatchObject({
      id: '2',
      product: 'mouse',
      price: '29.99',
      type: testType,
    });

    console.log('[Integration Test] Successfully verified message metadata');

    // Disconnect consumer after test
    await testConsumer.disconnect();
  }, 30000);
});

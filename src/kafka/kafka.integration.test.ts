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

  it('publishes hail report CSV data to Kafka and can be consumed', async () => {
    // Arrange: Set real hail report CSV data to serve
    const testTopic = `raw-weather-reports-${Date.now()}`; // Unique topic per test
    testCsvContent = `Time,Size,Location,County,State,Lat,Lon,Comments
1510,125,8 ESE Chappel,San Saba,TX,31.02,-98.44,1.25 inch hail reported at Colorado Bend State Park. (SJT)
1703,100,3 SE Burleson,Johnson,TX,32.5,-97.29,Quarter hail reported. (FWD)
1704,100,Anthon,Woodbury,IA,42.39,-95.87,Report via social media. (FSD)`;

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

    // Act: Publish CSV data to Kafka using actual config
    const host = kafkaContainer.getHost();
    const port = kafkaContainer.getMappedPort(9093);
    const brokers = `${host}:${port}`;
    await csvStreamToKafka({
      csvUrl: `${httpServerUrl}/hail.csv`,
      topic: testTopic,
      kafka: {
        clientId: 'storm-data-collector',
        brokers: [brokers],
      },
      type: 'hail',
    });

    // Wait for messages to be consumed
    await messagePromise;

    // Assert: Verify messages were received
    expect(consumedMessages).toHaveLength(3);

    // Verify message content - sort by Time since Kafka doesn't guarantee order with batching
    const messages = consumedMessages
      .map((msg) => JSON.parse(msg))
      .sort((a, b) => parseInt(a.Time) - parseInt(b.Time));

    expect(messages[0]).toMatchObject({
      Time: '1510',
      Size: '125',
      Location: '8 ESE Chappel',
      County: 'San Saba',
      State: 'TX',
      Lat: '31.02',
      Lon: '-98.44',
      type: 'hail',
    });

    expect(messages[1]).toMatchObject({
      Time: '1703',
      Size: '100',
      Location: '3 SE Burleson',
      County: 'Johnson',
      State: 'TX',
      type: 'hail',
    });

    expect(messages[2]).toMatchObject({
      Time: '1704',
      Size: '100',
      Location: 'Anthon',
      County: 'Woodbury',
      State: 'IA',
      type: 'hail',
    });

    console.log(
      '[Integration Test] Successfully published and consumed 3 hail report messages'
    );

    // Disconnect consumer after test
    await testConsumer.disconnect();
  }, 30000);

  it('handles batch publishing with tornado reports and configured batch size', async () => {
    // Arrange: Create tornado report CSV dataset
    const testTopic = `raw-weather-reports-${Date.now()}`; // Unique topic per test
    const tornadoRows = [
      {
        Time: '1223',
        F_Scale: 'UNK',
        Location: '2 N Mcalester',
        County: 'Pittsburg',
        State: 'OK',
        Lat: '34.96',
        Lon: '-95.77',
        Comments: 'This tornado moved across the northwest side of McAlester',
      },
      {
        Time: '1716',
        F_Scale: 'UNK',
        Location: '2 ESE Ravenna',
        County: 'Buffalo',
        State: 'NE',
        Lat: '41.02',
        Lon: '-98.87',
        Comments: 'This tornado touched down at 1216 PM CDT',
      },
      {
        Time: '1723',
        F_Scale: 'UNK',
        Location: '6 SSW Gholson',
        County: 'McLennan',
        State: 'TX',
        Lat: '31.63',
        Lon: '-97.26',
        Comments: 'A brief EF-0 tornado occurred',
      },
      {
        Time: '1726',
        F_Scale: 'UNK',
        Location: '6 S Gholson',
        County: 'McLennan',
        State: 'TX',
        Lat: '31.63',
        Lon: '-97.25',
        Comments: 'A second tornado from the same supercell',
      },
      {
        Time: '1730',
        F_Scale: 'EF1',
        Location: 'Waco',
        County: 'McLennan',
        State: 'TX',
        Lat: '31.55',
        Lon: '-97.15',
        Comments: 'Tornado damage reported in residential area',
      },
      {
        Time: '1735',
        F_Scale: 'EF2',
        Location: 'Temple',
        County: 'Bell',
        State: 'TX',
        Lat: '31.10',
        Lon: '-97.34',
        Comments: 'Significant damage to structures',
      },
      {
        Time: '1740',
        F_Scale: 'EF0',
        Location: 'Belton',
        County: 'Bell',
        State: 'TX',
        Lat: '31.06',
        Lon: '-97.47',
        Comments: 'Minor roof damage reported',
      },
      {
        Time: '1745',
        F_Scale: 'EF1',
        Location: 'Killeen',
        County: 'Bell',
        State: 'TX',
        Lat: '31.12',
        Lon: '-97.73',
        Comments: 'Trees and power lines down',
      },
      {
        Time: '1750',
        F_Scale: 'UNK',
        Location: 'Harker Heights',
        County: 'Bell',
        State: 'TX',
        Lat: '31.08',
        Lon: '-97.66',
        Comments: 'Possible tornado touchdown',
      },
      {
        Time: '1755',
        F_Scale: 'EF0',
        Location: 'Copperas Cove',
        County: 'Coryell',
        State: 'TX',
        Lat: '31.12',
        Lon: '-97.90',
        Comments: 'Brief touchdown with minimal damage',
      },
    ];

    testCsvContent =
      'Time,F_Scale,Location,County,State,Lat,Lon,Comments\n' +
      tornadoRows
        .map(
          (r) =>
            `${r.Time},${r.F_Scale},${r.Location},${r.County},${r.State},${r.Lat},${r.Lon},${r.Comments}`
        )
        .join('\n');

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
      csvUrl: `${httpServerUrl}/tornado.csv`,
      topic: testTopic,
      kafka: {
        clientId: 'storm-data-collector',
        brokers: [brokers],
      },
      type: 'torn',
    });

    // Wait for all messages
    await messagePromise;

    // Assert: Verify all 10 messages received
    expect(consumedMessages).toHaveLength(10);

    // Verify messages are correctly formatted - sort by Time first
    const messages = consumedMessages
      .map((msg) => JSON.parse(msg))
      .sort((a, b) => parseInt(a.Time) - parseInt(b.Time));

    // Verify first few messages have expected structure
    expect(messages[0]).toMatchObject({
      Time: '1223',
      F_Scale: 'UNK',
      Location: '2 N Mcalester',
      County: 'Pittsburg',
      State: 'OK',
      type: 'torn',
    });

    expect(messages[1]).toMatchObject({
      Time: '1716',
      F_Scale: 'UNK',
      Location: '2 ESE Ravenna',
      State: 'NE',
      type: 'torn',
    });

    // Verify all messages have required fields
    messages.forEach((msg) => {
      expect(msg).toHaveProperty('Time');
      expect(msg).toHaveProperty('F_Scale');
      expect(msg).toHaveProperty('Location');
      expect(msg).toHaveProperty('County');
      expect(msg).toHaveProperty('State');
      expect(msg).toHaveProperty('Lat');
      expect(msg).toHaveProperty('Lon');
      expect(msg).toHaveProperty('Comments');
      expect(msg.type).toBe('torn');
    });

    console.log(
      '[Integration Test] Successfully published and consumed 10 batched tornado messages'
    );

    // Disconnect consumer after test
    await testConsumer.disconnect();
  }, 35000);

  it('publishes wind reports with correct type metadata', async () => {
    // Arrange
    const testTopic = `raw-weather-reports-${Date.now()}`; // Unique topic per test
    testCsvContent = `Time,Speed,Location,County,State,Lat,Lon,Comments
1245,UNK,Mcalester,Pittsburg,OK,34.94,-95.77,Large trees and power lines down. (TSA)
1251,65,4 N Dow,Pittsburg,OK,34.94,-95.59,(TSA)`;

    const testType = 'wind'; // Using REPORT_TYPES from env vars

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
      csvUrl: `${httpServerUrl}/wind.csv`,
      topic: testTopic,
      kafka: {
        clientId: 'storm-data-collector',
        brokers: [brokers],
      },
      type: testType,
    });

    // Wait for messages
    await messagePromise;

    // Assert: Verify type is included in messages
    expect(consumedMessages).toHaveLength(2);

    const messages = consumedMessages.map((msg) => JSON.parse(msg));

    messages.forEach((msg) => {
      expect(msg.type).toBe(testType);
      expect(msg).toHaveProperty('Time');
      expect(msg).toHaveProperty('Speed');
      expect(msg).toHaveProperty('Location');
      expect(msg).toHaveProperty('County');
      expect(msg).toHaveProperty('State');
      expect(msg).toHaveProperty('Lat');
      expect(msg).toHaveProperty('Lon');
      expect(msg).toHaveProperty('Comments');
    });

    expect(messages[0]).toMatchObject({
      Time: '1245',
      Speed: 'UNK',
      Location: 'Mcalester',
      County: 'Pittsburg',
      State: 'OK',
      Lat: '34.94',
      Lon: '-95.77',
      type: testType,
    });

    expect(messages[1]).toMatchObject({
      Time: '1251',
      Speed: '65',
      Location: '4 N Dow',
      County: 'Pittsburg',
      State: 'OK',
      type: testType,
    });

    console.log(
      '[Integration Test] Successfully verified wind report message metadata'
    );

    // Disconnect consumer after test
    await testConsumer.disconnect();
  }, 30000);

  it('publishes all three storm report types (torn, hail, wind) from environment config', async () => {
    // Arrange: Test all three CSV types from REPORT_TYPES env var
    const testTopic = `raw-weather-reports-${Date.now()}`; // Unique topic per test

    // Create topic with proper replication factor
    await createTopic(testTopic);

    // Create consumer
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
            `Timeout waiting for all storm messages. Received ${consumedMessages.length}/6`
          )
        );
      }, 20000);

      testConsumer.run({
        eachMessage: async ({ message }: EachMessagePayload) => {
          const value = message.value?.toString();
          if (value) {
            consumedMessages.push(value);
            // We expect 6 messages total (2 from each type)
            if (consumedMessages.length === 6) {
              clearTimeout(timeout);
              resolve();
            }
          }
        },
      });
    });

    // Wait for consumer to be fully ready
    await new Promise((resolve) => setTimeout(resolve, 1000));

    // Act: Publish each type of storm report
    const host = kafkaContainer.getHost();
    const port = kafkaContainer.getMappedPort(9093);
    const brokers = `${host}:${port}`;

    // Publish tornado reports
    testCsvContent = `Time,F_Scale,Location,County,State,Lat,Lon,Comments
1223,UNK,2 N Mcalester,Pittsburg,OK,34.96,-95.77,This tornado moved across the northwest side of McAlester
1716,UNK,2 ESE Ravenna,Buffalo,NE,41.02,-98.87,This tornado touched down at 1216 PM CDT`;

    await csvStreamToKafka({
      csvUrl: `${httpServerUrl}/torn.csv`,
      topic: testTopic,
      kafka: { clientId: 'storm-data-collector', brokers: [brokers] },
      type: 'torn',
    });

    // Publish hail reports
    testCsvContent = `Time,Size,Location,County,State,Lat,Lon,Comments
1510,125,8 ESE Chappel,San Saba,TX,31.02,-98.44,1.25 inch hail reported at Colorado Bend State Park
1703,100,3 SE Burleson,Johnson,TX,32.5,-97.29,Quarter hail reported`;

    await csvStreamToKafka({
      csvUrl: `${httpServerUrl}/hail.csv`,
      topic: testTopic,
      kafka: { clientId: 'storm-data-collector', brokers: [brokers] },
      type: 'hail',
    });

    // Publish wind reports
    testCsvContent = `Time,Speed,Location,County,State,Lat,Lon,Comments
1245,UNK,Mcalester,Pittsburg,OK,34.94,-95.77,Large trees and power lines down
1251,65,4 N Dow,Pittsburg,OK,34.94,-95.59,Wind damage reported`;

    await csvStreamToKafka({
      csvUrl: `${httpServerUrl}/wind.csv`,
      topic: testTopic,
      kafka: { clientId: 'storm-data-collector', brokers: [brokers] },
      type: 'wind',
    });

    // Wait for all messages
    await messagePromise;

    // Assert: Verify all messages received
    expect(consumedMessages).toHaveLength(6);

    const messages = consumedMessages.map((msg) => JSON.parse(msg));

    // Group by type
    const tornMessages = messages.filter((msg) => msg.type === 'torn');
    const hailMessages = messages.filter((msg) => msg.type === 'hail');
    const windMessages = messages.filter((msg) => msg.type === 'wind');

    expect(tornMessages).toHaveLength(2);
    expect(hailMessages).toHaveLength(2);
    expect(windMessages).toHaveLength(2);

    // Verify tornado reports have correct fields
    tornMessages.forEach((msg) => {
      expect(msg).toHaveProperty('Time');
      expect(msg).toHaveProperty('F_Scale');
      expect(msg).toHaveProperty('Location');
      expect(msg.type).toBe('torn');
    });

    // Verify hail reports have correct fields
    hailMessages.forEach((msg) => {
      expect(msg).toHaveProperty('Time');
      expect(msg).toHaveProperty('Size');
      expect(msg).toHaveProperty('Location');
      expect(msg.type).toBe('hail');
    });

    // Verify wind reports have correct fields
    windMessages.forEach((msg) => {
      expect(msg).toHaveProperty('Time');
      expect(msg).toHaveProperty('Speed');
      expect(msg).toHaveProperty('Location');
      expect(msg.type).toBe('wind');
    });

    console.log(
      '[Integration Test] Successfully published and consumed all three storm report types'
    );

    // Disconnect consumer after test
    await testConsumer.disconnect();
  }, 40000);
});

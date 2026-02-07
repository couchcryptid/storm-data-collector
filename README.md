# Storm Report Data Collection Service

Modern NodeJS + Typescript storm report data collector for HailTrace using Kafka streaming. Fetches wind, hail, and tornado csv reports, converts them to json format and publishes them to kafka.

## Prerequisites

- Node.js 24.x (LTS)
- npm or pnpm
- Docker (optional, for containerization)

## Installation

```bash
npm install
```

## Development

```bash
# Run in development mode with hot reload
npm run dev

# Run tests
npm test

# Run tests with coverage
npm run test:coverage

# Run tests in watch mode
npm run test:watch

# Lint code
npm run lint

# Format code
npm run format
```

## Build

```bash
npm run build
```

## Docker

```bash
# Development
docker compose up

# Build for production
docker build -t storm-data-collector .

# Build with buildx (multi-platform support)
docker buildx build -t storm-data-collector .
```

## Environment Variables

Create a `.env` file in the root directory:

```env
# Node Environment
NODE_ENV=development

# Kafka Configuration
# For Docker: Use kafka:29092 (internal network)
# For local: Use localhost:9092
KAFKA_BROKERS=kafka:29092
KAFKA_CLIENT_ID=storm-collector
KAFKA_TOPIC=raw-weather-reports

# CSV Data Source
CSV_BASE_URL=https://example.com/
BATCH_SIZE=500
MAX_CONCURRENT_CSV=3
CSV_TYPES=torn,wind,hail

# Cron Configuration
CRON_SCHEDULE="0 0 * * *"

# Retry Configuration (exponential backoff for 500 errors)
CRON_RETRY_INTERVAL_MIN=30       # Base retry interval in minutes (exponential backoff)
CRON_MAX_FALLBACK_ATTEMPTS=3     # Maximum retry attempts for 500 errors

# DLQ Configuration (Dead Letter Queue for failed messages)
KAFKA_DLQ_TOPIC=weather-data-dlq
DLQ_ENABLED=true
DLQ_FILE_FALLBACK_DIR=./data/dlq
DLQ_FILE_MAX_SIZE_MB=10
DLQ_INCLUDE_STACK_TRACES=true
```

## Architecture

### Error Handling Flow

The application implements a robust three-tier error handling system:

**1. HTTP Error Handling (Exponential Backoff)**
- **500-599 errors**: Retry with exponential backoff (30min → 60min → 120min)
- **404 errors**: Skip (CSV not published yet)
- **400-499 errors**: Log and skip (client errors)

**2. Kafka Publishing (Dead Letter Queue)**
- **Success**: Message published to main topic
- **Failure**: Message sent to DLQ topic with metadata
- **DLQ Failure**: Fallback to local JSON file
- **File Failure**: Critical log with message sample

**3. Graceful Degradation**
```
CSV Fetch → Kafka Main Topic → DLQ Topic → File Fallback → Console Log
```

### DLQ Message Structure

Messages sent to the DLQ include rich metadata for debugging:
```json
{
  "originalMessage": { /* CSV row data */ },
  "metadata": {
    "timestamp": "2026-02-06T10:30:00.000Z",
    "originalTopic": "raw-weather-reports",
    "errorType": "kafka_publish",
    "errorMessage": "Connection timeout",
    "errorStack": "...",
    "attemptNumber": 1,
    "batchId": "uuid-v4",
    "csvUrl": "https://example.com/260206_hail.csv",
    "weatherType": "hail"
  }
}
```

### Retry Strategy

Exponential backoff formula: `baseIntervalMinutes × 2^attemptNumber`

Example with `CRON_RETRY_INTERVAL_MIN=30`:
- Attempt 1: Immediate
- Attempt 2: 30 minutes later
- Attempt 3: 60 minutes later
- Attempt 4: 120 minutes later

## Project Structure

```
src/
├── csv/
│   ├── csvStream.ts      # CSV parsing and streaming with DLQ support
│   ├── utils.ts          # CSV URL building utilities
│   └── csvStream.test.ts # CSV streaming tests
├── kafka/
│   ├── client.ts         # Kafka producer singleton
│   ├── publisher.ts      # Batch publishing with DLQ support
│   ├── dlqPublisher.ts   # Dead Letter Queue publishing and file fallback
│   └── kafka.integration.test.ts
├── scheduler/
│   ├── scheduler.ts      # Job scheduling with exponential backoff
│   └── scheduler.test.ts # Scheduler tests
├── types/
│   └── index.d.ts        # TypeScript type definitions
├── config.ts             # Configuration management with Zod validation
├── health.ts             # Health check endpoint for Docker
└── index.ts              # Application entry point
```

## Tech Stack

- TypeScript
- Node.js 24 (LTS)
- KafkaJS
- csv-parser
- Croner (scheduling)
- Vitest (testing)
- ESLint + Prettier (code quality)
- Zod (configuration validation)
- UUID (batch tracking)

## License

ISC

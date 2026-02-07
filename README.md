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
CRON_RETRY_INTERVAL=6
```

## Project Structure

```
src/
├── csv/          # CSV parsing and streaming
├── kafka/        # Kafka producer configuration
├── scheduler/    # Job scheduling
├── types/        # TypeScript type definitions
├── config.ts     # Configuration management
├── health.ts     # Health check endpoint
└── index.ts      # Application entry point
```

## Tech Stack

- TypeScript
- Node.js 24 (LTS)
- KafkaJS
- csv-parser
- Croner (scheduling)
- Vitest (testing)
- ESLint + Prettier (code quality)

## License

ISC

# Storm Report Data Collection Service

Modern NodeJS + Typescript storm report data collector using Kafka streaming. Fetches wind, hail, and tornado CSV reports, converts them to JSON format, and publishes them to Kafka.

## Quick Start

### Prerequisites

- Node.js 24.x (LTS)
- npm or pnpm
- Docker (optional, for containerization)

### Installation

```bash
npm install
```

### Development

```bash
npm run dev        # Run with hot reload
npm test           # Run tests
npm run test:watch # Watch mode
npm run lint       # Lint code
npm run format     # Format code
```

### Build

```bash
npm run build
```

### Docker

```bash
docker compose up                              # Development
docker build -t storm-data-collector .         # Production
docker buildx build -t storm-data-collector .  # Multi-platform
```

## Documentation

- [[Architecture]] - Error handling, DLQ, and retry strategy
- [[Configuration]] - Environment variables and Zod validation
- [[Performance]] - Throughput estimates, memory usage, and scaling
- [[Code Quality]] - Testing, coverage, git hooks
- [[Logging]] - Pino structured logging and Chalk styling

## Project Structure

```
src/
├── csv/
│   ├── csvStream.ts      # CSV parsing and streaming
│   ├── utils.ts          # CSV URL building utilities
│   └── csvStream.test.ts # CSV streaming tests
├── kafka/
│   ├── client.ts         # Kafka producer singleton
│   ├── publisher.ts      # Batch publishing
│   └── kafka.integration.test.ts
├── scheduler/
│   ├── scheduler.ts      # Job scheduling with fixed interval retry
│   └── scheduler.test.ts # Scheduler tests
├── shared/
│   ├── constants.ts      # HTTP status codes and timing constants
│   └── errors.ts         # Error utility functions and type guards
├── types/
│   └── index.d.ts        # TypeScript type definitions
├── config.ts             # Configuration management with Zod validation
├── health.ts             # Health check endpoint for Docker
├── logger.ts             # Pino logging
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
- Pino (logging)

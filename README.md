# Storm Report Data Collection Service

Modern NodeJS + Typescript storm report data collector using Kafka streaming. Fetches wind, hail, and tornado CSV reports, converts them to JSON format, and publishes them to Kafka.

## Quick Start

```bash
npm install
npm run dev
```

## Development

```bash
npm run dev            # Run with hot reload
npm test               # Run tests
npm run test:coverage  # Coverage report
npm run lint           # Lint code
npm run format         # Format code
```

## Docker

```bash
docker compose up                              # Development
docker build -t storm-data-collector .         # Production
```

## Documentation

See the [wiki](../../wiki) for full documentation:

- [Architecture](../../wiki/Architecture) - Error handling, DLQ, and retry strategy
- [Configuration](../../wiki/Configuration) - Environment variables and Zod validation
- [Performance](../../wiki/Performance) - Throughput estimates, memory usage, and scaling
- [Code Quality](../../wiki/Code-Quality) - Testing, coverage, git hooks
- [Logging](../../wiki/Logging) - Pino structured logging

## Tech Stack

TypeScript, Node.js 24, KafkaJS, csv-parser, Croner, Vitest, Pino, Zod

## License

ISC

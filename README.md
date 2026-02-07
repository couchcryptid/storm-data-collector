# ht-weather-data-collector

Weather data collector for HailTrace using Kafka streaming.

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
docker build -t ht-weather-data-collector .

# Build with buildx (multi-platform support)
docker buildx build -t ht-weather-data-collector .
```

## Environment Variables

Create a `.env` file in the root directory:

```env
# Add your environment variables here
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

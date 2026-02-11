# Storm Data Collector

A TypeScript service that fetches NOAA storm report CSVs (hail, wind, tornado) on a cron schedule, converts them to JSON, and publishes them to Kafka. Part of the storm data pipeline.

## How It Works

The service runs a scheduled collection loop:

1. **Fetch** -- Downloads CSV storm reports from the NOAA Storm Prediction Center
2. **Parse** -- Converts CSV rows to JSON with capitalized field names
3. **Publish** -- Sends each report as a message to a Kafka topic

Supported report types: **hail**, **wind**, and **tornado**.

## Quick Start

### Prerequisites

- Node.js 24+
- Docker and Docker Compose

### Run locally with Docker Compose

```sh
cp .env.example .env
docker compose up
```

This starts Kafka and the collector service. The service begins fetching NOAA reports and publishing to the `raw-weather-reports` topic.

### Run without Docker

```sh
cp .env.example .env
npm install
npm run dev
```

Requires a running Kafka broker accessible at the address configured in `.env`.

## Configuration

All configuration is via environment variables (validated with Zod):

| Variable           | Default                | Description                                    |
| ------------------ | ---------------------- | ---------------------------------------------- |
| `KAFKA_CLIENT_ID`  | `csv-producer`         | Kafka client identifier                        |
| `KAFKA_BROKERS`    | `localhost:9092`       | Comma-separated list of Kafka broker addresses |
| `KAFKA_TOPIC`      | `raw-weather-reports`  | Topic to publish storm reports to              |
| `CRON_SCHEDULE`    | `0 0 * * *`            | Cron expression for collection schedule        |
| `REPORTS_BASE_URL` | `https://example.com/` | Base URL for NOAA storm report CSVs            |
| `REPORT_TYPES`     | `torn,hail,wind`       | Comma-separated report types to collect        |
| `LOG_LEVEL`        | `info`                 | Log level: `debug`, `info`, `warn`, `error`    |

## HTTP Endpoints

| Endpoint       | Description                                                                 |
| -------------- | --------------------------------------------------------------------------- |
| `GET /healthz` | Liveness probe -- always returns `200`                                      |
| `GET /readyz`  | Readiness probe -- returns `200` when Kafka producer is connected, `503` otherwise |
| `GET /metrics` | Prometheus metrics                                                          |

## Prometheus Metrics

| Metric                              | Type      | Labels        | Description                              |
| ----------------------------------- | --------- | ------------- | ---------------------------------------- |
| `storm_collector_job_runs_total`          | Counter   | `status`      | Total number of scheduled job runs       |
| `storm_collector_rows_processed_total`    | Counter   | `report_type` | Total CSV rows processed                 |
| `storm_collector_rows_published_total`    | Counter   | `report_type` | Total rows published to Kafka            |
| `storm_collector_job_duration_seconds`    | Histogram | --            | Duration of scheduled job execution      |
| `storm_collector_csv_fetch_duration_seconds` | Histogram | `report_type` | Duration of CSV fetch and processing  |
| `storm_collector_retry_total`             | Counter   | `report_type` | Total number of HTTP retry attempts      |
| `storm_collector_kafka_publish_retries_total` | Counter | `topic`     | Total Kafka publish retry attempts       |

## Development

```
npm run dev            # Run with hot reload
npm run build          # Compile TypeScript
npm test               # Run all tests
npm run test:unit      # Run unit tests only
npm run test:integration  # Run integration tests (Docker required)
npm run test:coverage  # Coverage report
npm run lint           # Lint code
npm run format         # Format code
```

## Project Structure

```
src/
  csv/                  CSV fetch, parse, and URL construction
  kafka/                Kafka producer client and message publishing
  scheduler/            Cron scheduling, retry logic, job orchestration
  shared/               Shared utilities
  types/                TypeScript type definitions
  config.ts             Environment-based configuration (Zod)
  health.ts             Health, readiness, and metrics HTTP server
  index.ts              Entry point
  logger.ts             Pino structured logging
  metrics.ts            Prometheus metric definitions
```

## Documentation

See the [project wiki](../../wiki) for detailed documentation:

- [Architecture](../../wiki/Architecture) -- Data source, error handling, retry strategy, and capacity
- [Configuration](../../wiki/Configuration) -- Environment variables and Zod validation
- [Deployment](../../wiki/Deployment) -- Docker Compose setup and Docker image
- [Development](../../wiki/Development) -- Testing, coverage, linting, CI, git hooks, logging, and metrics

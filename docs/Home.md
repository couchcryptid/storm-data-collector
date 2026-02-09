# Storm Data Collector

A TypeScript service that fetches NOAA storm report CSVs (hail, wind, tornado) on a cron schedule, converts them to JSON, and publishes them to Kafka. Part of the storm data pipeline.

## Pages

- [[Architecture]] -- Error handling and retry strategy
- [[Configuration]] -- Environment variables and Zod validation
- [[Deployment]] -- Docker Compose setup and production considerations
- [[Development]] -- Testing, coverage, linting, CI, and git hooks
- [[Performance]] -- Throughput estimates, memory usage, and scaling
- [[Logging]] -- Pino structured logging
- [[Metrics]] -- Prometheus metrics and `/metrics` endpoint

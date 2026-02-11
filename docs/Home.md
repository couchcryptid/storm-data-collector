# Storm Data Collector

A TypeScript service that fetches NOAA storm report CSVs (hail, wind, tornado) on a cron schedule, converts them to JSON, and publishes them to Kafka. Part of the storm data pipeline.

## Pages

- [[Architecture]] -- Data source, error handling, retry strategy, and capacity
- [[Configuration]] -- Environment variables and Zod validation
- [[Deployment]] -- Docker Compose setup and Docker image
- [[Development]] -- Testing, coverage, linting, CI, git hooks, logging, and metrics

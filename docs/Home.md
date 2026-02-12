# Storm Data Collector

A TypeScript service that fetches NOAA storm report CSVs (hail, wind, tornado) on a cron schedule, converts them to JSON, and publishes them to Kafka. Part of the storm data pipeline.

## Pipeline Position

```
NOAA CSVs --> [Collector] --> Kafka --> ETL --> Kafka --> API --> PostgreSQL + GraphQL
```

**Downstream**: The [ETL service](https://github.com/couchcryptid/storm-data-etl/wiki) consumes raw events from the `raw-weather-reports` topic, enriches them with severity classification, location parsing, and time bucketing.

For the full pipeline architecture, see the [system wiki](https://github.com/couchcryptid/storm-data-system/wiki).

## Pages

- [[Architecture]] -- Data source, error handling, retry strategy, and capacity
- [[Configuration]] -- Environment variables and Zod validation
- [[Development]] -- Testing, coverage, linting, CI, and metrics

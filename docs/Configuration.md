# Configuration

All configuration is via environment variables, validated at startup using **Zod**.

## Environment Variables

The schema is defined in `src/config.ts`:

| Variable | Default | Description |
|----------|---------|-------------|
| `KAFKA_BROKERS` | `localhost:9092` | Kafka broker addresses (comma-separated) |
| `KAFKA_CLIENT_ID` | `csv-producer` | Unique client identifier |
| `KAFKA_TOPIC` | `raw-weather-reports` | Target Kafka topic |
| `REPORTS_BASE_URL` | `https://example.com/` | NOAA CSV base URL (must be valid URL) |
| `REPORT_TYPES` | `torn,hail,wind` | CSV report types to fetch (comma-separated) |
| `CRON_SCHEDULE` | `0 0 * * *` | Cron expression for fetch schedule |
| `LOG_LEVEL` | `info` | `fatal`, `error`, `warn`, `info`, `debug` |

## Validation Errors

Invalid configuration is caught at startup:

```bash
$ REPORTS_BASE_URL="not-a-url" npm run dev

ZodError: [
  {
    "code": "invalid_format",
    "format": "url",
    "path": ["REPORTS_BASE_URL"],
    "message": "Invalid URL"
  }
]
```

## Retry Behavior

HTTP errors with status 500-599 trigger automatic retries:

- Fixed 5-minute delay between retries
- Maximum 3 retry attempts
- Total maximum time: ~15 minutes per CSV

Client errors (4xx) and network errors are not retried.

See [[Architecture]] for error handling details.

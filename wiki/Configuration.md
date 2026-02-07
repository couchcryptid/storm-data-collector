# Configuration

All configuration is managed via environment variables, validated at startup using **Zod**.

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
REPORTS_BASE_URL=https://example.com/
BATCH_SIZE=500
MAX_CONCURRENT_CSV=3
REPORT_TYPES=torn,wind,hail

# Cron Configuration
CRON_SCHEDULE="0 0 * * *"

# Retry Configuration (exponential backoff for 500 errors)
CRON_FALLBACK_INTERVAL_MIN=30       # Base fallback interval in minutes
CRON_MAX_FALLBACK_ATTEMPTS=3        # Maximum retry attempts for 500 errors

# DLQ Configuration (Dead Letter Queue for failed messages)
KAFKA_DLQ_TOPIC=raw-weather-reports-dlq
DLQ_ENABLED=true
DLQ_FILE_FALLBACK_DIR=./data/dlq
DLQ_FILE_MAX_SIZE_MB=10
DLQ_INCLUDE_STACK_TRACES=true

# Logging
LOG_LEVEL=info  # fatal, error, warn, info, debug
```

## Zod Validation Rules

The schema is defined in `src/config.ts`:

| Variable | Type | Default | Constraints |
| --- | --- | --- | --- |
| `KAFKA_BROKERS` | String | `localhost:9092` | |
| `KAFKA_CLIENT_ID` | String | `storm-data-collector` | |
| `KAFKA_TOPIC` | String | `raw-weather-reports` | |
| `REPORTS_BASE_URL` | URL | `https://example.com/` | Must be valid URL |
| `BATCH_SIZE` | Number | `500` | Positive |
| `MAX_CONCURRENT_CSV` | Number | `3` | Positive, max 10 |
| `CRON_SCHEDULE` | String | `0 0 * * *` | |
| `CRON_FALLBACK_INTERVAL_MIN` | Number | `6` | Positive, max 48 |
| `REPORT_TYPES` | String | `torn,hail,wind` | Comma-separated |

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

See [[Architecture]] for how these values affect retry and error handling behavior.

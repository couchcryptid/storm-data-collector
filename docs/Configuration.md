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
REPORT_TYPES=torn,wind,hail

# Cron Configuration
CRON_SCHEDULE="0 0 * * *"

# Logging
LOG_LEVEL=info  # fatal, error, warn, info, debug
```

## Zod Validation Rules

The schema is defined in `src/config.ts`:

| Variable           | Type   | Default                | Constraints                      |
| ------------------ | ------ | ---------------------- | -------------------------------- |
| `KAFKA_BROKERS`    | String | `localhost:9092`       | Comma-separated broker addresses |
| `KAFKA_CLIENT_ID`  | String | `csv-producer`         | Unique client identifier         |
| `KAFKA_TOPIC`      | String | `raw-weather-reports`  | Target Kafka topic               |
| `REPORTS_BASE_URL` | URL    | `https://example.com/` | Must be valid URL                |
| `REPORT_TYPES`     | String | `torn,hail,wind`       | Comma-separated types            |
| `CRON_SCHEDULE`    | String | `0 0 * * *`            | Valid cron expression            |
| `LOG_LEVEL`        | String | `info`                 | fatal, error, warn, info, debug  |

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

# Architecture

## Error Handling Flow

The application implements a robust three-tier error handling system:

### 1. HTTP Error Handling (Exponential Backoff)

- **500-599 errors**: Retry with exponential backoff (30min → 60min → 120min)
- **404 errors**: Skip (CSV not published yet)
- **400-499 errors**: Log and skip (client errors)

### 2. Kafka Publishing (Dead Letter Queue)

- **Success**: Message published to main topic
- **Failure**: Message sent to DLQ topic with metadata
- **DLQ Failure**: Fallback to local JSON file
- **File Failure**: Critical log with message sample

### 3. Graceful Degradation

```
CSV Fetch → Kafka Main Topic → DLQ Topic → File Fallback → Console Log
```

## DLQ Message Structure

Messages sent to the DLQ include rich metadata for debugging:

```json
{
  "originalMessage": { /* CSV row data */ },
  "metadata": {
    "timestamp": "2026-02-06T10:30:00.000Z",
    "originalTopic": "raw-weather-reports",
    "errorType": "kafka_publish",
    "errorMessage": "Connection timeout",
    "errorStack": "...",
    "attemptNumber": 1,
    "batchId": "uuid-v4",
    "csvUrl": "https://example.com/260206_hail.csv",
    "weatherType": "hail"
  }
}
```

## Retry Strategy

Exponential backoff formula: `baseIntervalMinutes × 2^attemptNumber`

Example with `CRON_FALLBACK_INTERVAL_MIN=30`:

| Attempt | Delay |
| --- | --- |
| 1 | Immediate |
| 2 | 30 minutes |
| 3 | 60 minutes |
| 4 | 120 minutes |

See [[Configuration]] for retry-related environment variables.

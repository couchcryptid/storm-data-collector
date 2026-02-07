# Architecture

## Error Handling Flow

The application implements a three-tier error handling system:

### 1. HTTP Error Handling (Fixed Interval Retry)

- **500-599 errors**: Retry with fixed 5-minute interval (max 3 attempts)
- **404 errors**: Skip (CSV not published yet)
- **400-499 errors**: Log and skip (client errors)

### 2. Kafka Publishing

- **Success**: Messages published to Kafka topic
- **Failure**: Logs error and stops processing

### 3. Recovery

```
CSV Fetch → HTTP Retry Loop (5min × 3 attempts) → Kafka Publish → Log Result
```

## Retry Strategy

Fixed interval retry with `5-minute delay between attempts`

Example retry flow:

| Attempt | Delay     | Total Time |
| ------- | --------- | ---------- |
| 1       | Immediate | 0s         |
| 2       | 5 minutes | 5m         |
| 3       | 5 minutes | 10m        |
| 4       | 5 minutes | 15m        |
| Max+1   | Failure   | ~15m       |

Retries only apply to 500-599 server errors. Client errors (4xx) and network errors are not retried.

See [[Configuration]] for cron scheduling configuration.

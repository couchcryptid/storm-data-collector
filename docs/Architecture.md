# Architecture

## Data Source

The collector fetches daily severe weather report CSVs from the [NOAA Storm Prediction Center](https://www.spc.noaa.gov/climo/reports/) (SPC). SPC publishes three CSV files per day, one per event type:

| NOAA Filename Suffix | Report Type | Magnitude Column | Magnitude Unit |
|----------------------|-------------|------------------|----------------|
| `_rpts_hail.csv` | hail | `Size` | Hundredths of inches (e.g. 125 = 1.25") |
| `_rpts_torn.csv` | tornado | `F_Scale` | Enhanced Fujita scale (EF0-EF5 or "UNK") |
| `_rpts_wind.csv` | wind | `Speed` | Miles per hour (or "UNK") |

All three types share common columns: `Time` (HHMM 24-hour), `Location` (NWS relative format, e.g. "8 ESE Chappel"), `County`, `State`, `Lat`, `Lon`, `Comments`.

**Key transformations performed by the collector:**

- `torn` -> `tornado`: NOAA's filename abbreviation is normalized to the full event type name
- A `Type` field is injected into each JSON record (`hail`, `wind`, or `tornado`)
- CSV column names are preserved as-is with capitalized keys (e.g. `Time`, `Size`, `Location`)
- All values remain as strings -- numeric parsing happens in the downstream ETL service

**Publishing schedule:** SPC typically publishes CSVs for the current day by early afternoon CT. The cron schedule should be configured accordingly (default: every 15 minutes). 404 responses indicate the CSV isn't published yet and are silently skipped.

For the full data flow from CSV to GraphQL, see the [system Data Flow documentation](https://github.com/couchcryptid/storm-data-system/wiki/Data-Flow).

## Error Handling Flow

The application implements a three-tier error handling system:

### 1. HTTP Error Handling (Fixed Interval Retry)

- **500-599 errors**: Retry with fixed 5-minute interval (max 3 attempts)
- **404 errors**: Skip (CSV not published yet)
- **400-499 errors**: Log and skip (client errors)

### 2. Kafka Publishing (Exponential Backoff Retry)

- **Success**: Messages published to Kafka topic
- **Transient failure**: Retry with exponential backoff (1s, 2s, 4s) up to 3 attempts
- **Permanent failure**: Logs error after all retries exhausted

### 3. Recovery

```
CSV Fetch → HTTP Retry Loop (5min × 3 attempts) → Kafka Publish Retry Loop (exp backoff × 3 attempts) → Log Result
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

## Observability

The pipeline is instrumented with Prometheus metrics at key decision points:

- **Job level**: Total runs (success/failure) and duration
- **CSV level**: Fetch + process duration per report type, rows processed, rows published
- **Retry level**: Counter incremented on each 5xx retry attempt
- **Kafka publish level**: Counter incremented on each Kafka publish retry attempt

All metrics are exposed via `GET /metrics` on the same HTTP server as the health check. See [[Metrics]] for the full metric reference.

# Metrics

The project uses **prom-client** to expose Prometheus-compatible metrics via a `/metrics` HTTP endpoint.

**Package:** `prom-client`

## Endpoint

```
GET http://localhost:3000/metrics
```

Returns metrics in Prometheus exposition format. Served by the same HTTP server as the `/health` endpoint (see [[Configuration]] for port details).

## Custom Metrics

All custom metrics use the `storm_collector_` prefix.

### Counters

| Metric | Labels | Description |
| --- | --- | --- |
| `storm_collector_job_runs_total` | `status` (`success`, `failure`) | Total number of scheduled job runs |
| `storm_collector_rows_processed_total` | `report_type` (`torn`, `hail`, `wind`) | Total CSV rows parsed |
| `storm_collector_rows_published_total` | `report_type` | Total rows published to Kafka |
| `storm_collector_retry_total` | `report_type` | Total retry attempts (5xx errors only) |

### Histograms

| Metric | Labels | Buckets (seconds) | Description |
| --- | --- | --- | --- |
| `storm_collector_job_duration_seconds` | — | 1, 5, 10, 30, 60, 120 | Duration of the full scheduled job |
| `storm_collector_csv_fetch_duration_seconds` | `report_type` | 0.5, 1, 2, 5, 10, 30 | Duration of a single CSV fetch + process cycle |

## Default Metrics

`prom-client` automatically collects Node.js runtime metrics including:

- Process CPU usage
- Event loop lag
- Heap memory usage
- Active handles / requests
- GC duration

These use the default `nodejs_` and `process_` prefixes.

## Instrumentation Points

Metrics are recorded at the following points in the pipeline:

```
Job Start
├── csvFetchDurationSeconds.startTimer()  ─── per report type
│   ├── CSV fetch + parse + publish
│   └── endTimer() on success or failure
├── rowsProcessedTotal.inc()              ─── after CSV parse
├── rowsPublishedTotal.inc()              ─── after Kafka publish
├── retryTotal.inc()                      ─── on 5xx retry
└── jobRunsTotal.inc({ status })          ─── on job completion
    jobDurationSeconds (endTimer)
```

## Scraping with Prometheus

Add a scrape target to your `prometheus.yml`:

```yaml
scrape_configs:
  - job_name: 'storm-collector'
    scrape_interval: 60s
    static_configs:
      - targets: ['localhost:3000']
```

A 60-second scrape interval is appropriate since the job only runs once daily.

## Source

Metrics are defined in `src/metrics.ts` and instrumented in:

- `src/scheduler/scheduler.ts` — job duration, job runs, retries
- `src/csv/csvStream.ts` — rows processed, rows published
- `src/health.ts` — `/metrics` endpoint

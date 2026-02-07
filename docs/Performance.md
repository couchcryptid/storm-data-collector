# Theoretical Performance

This page analyzes the theoretical throughput and resource characteristics of the Storm Data Collector under default and tuned configurations.

## Pipeline Overview

Each scheduled job runs a three-stage pipeline per report type:

```
HTTP Fetch (CSV) → Stream Parse (csv-parser) → Batch Publish (KafkaJS)
```

Report types are processed concurrently up to `MAX_CONCURRENT_CSV` (default: 3). Within each report type, rows are streamed line-by-line and published in batches of `BATCH_SIZE` (default: 500).

## Throughput Estimates

### Single Report Type

| Stage | Bottleneck | Estimated Throughput |
| --- | --- | --- |
| HTTP Fetch | Network I/O, source server | 10–100 MB/s (typical) |
| CSV Parse | CPU-bound stream transform | ~50,000–100,000 rows/s |
| Kafka Publish | Network I/O, broker acks | ~5,000–20,000 msgs/s per batch |

Kafka publishing is the primary bottleneck. Each `producer.send()` call publishes an entire batch as a single request, so the effective row throughput depends on batch size and round-trip latency to the broker.

**Per-batch latency estimate:**
- Batch of 500 rows → ~500 KB serialized JSON
- Single `producer.send()` round-trip → ~5–50ms (local broker), ~20–200ms (remote broker)
- Effective throughput: **~2,500–100,000 rows/s** depending on broker proximity

### Concurrent Processing

With the default 3 report types (`torn`, `hail`, `wind`) and `MAX_CONCURRENT_CSV=3`, all three are processed in parallel via `Promise.allSettled()`. This means:

| Config | Concurrent Streams | Theoretical Peak (rows/s) |
| --- | --- | --- |
| Default (`MAX_CONCURRENT_CSV=3`) | 3 | ~7,500–300,000 |
| Maximum (`MAX_CONCURRENT_CSV=10`) | Up to 10 | ~25,000–1,000,000 |

> **Note:** Real-world throughput will be lower due to CSV source server rate limits, Kafka broker capacity, network conditions, and Node.js event loop saturation.

### Typical SPC Storm Report Volumes

Storm Prediction Center CSV files are relatively small — a busy severe weather day might produce:

| Report Type | Typical Row Count | Extreme Day |
| --- | --- | --- |
| Hail | 50–500 | ~2,000 |
| Wind | 100–800 | ~3,000 |
| Tornado | 10–100 | ~500 |
| **Total** | **~160–1,400** | **~5,500** |

At these volumes, even the most conservative throughput estimate processes an entire day's reports in **under 1 second**. The pipeline is significantly over-provisioned for the expected data volume, which provides headroom for:

- Network latency spikes
- Kafka broker degradation
- Future data source expansion

## Memory Characteristics

### Streaming Architecture

The CSV parser operates as a Node.js stream transform, processing rows one at a time without loading the entire file into memory. Peak memory usage is bounded by:

| Component | Memory Usage |
| --- | --- |
| HTTP response stream buffer | ~16–64 KB (Node.js default highWaterMark) |
| CSV parser internal buffer | ~16 KB |
| Current batch accumulator | `BATCH_SIZE × ~1 KB/row` ≈ **500 KB** (default) |
| Kafka serialization buffer | ~500 KB per `producer.send()` |
| **Steady-state per stream** | **~1–2 MB** |

With `MAX_CONCURRENT_CSV=3`, peak application memory usage should stay under **~10–20 MB** (excluding Node.js runtime overhead of ~30–50 MB).

### DLQ Memory Impact

When batches fail and route to the DLQ, each message is wrapped with metadata (~200–500 bytes overhead per row). A full 500-row batch sent to DLQ adds ~250 KB to the serialization buffer. File fallback writes are async and bounded by `DLQ_FILE_MAX_SIZE_MB` (default: 10 MB).

## Kafka Producer Behavior

The producer uses KafkaJS defaults (no custom producer configuration):

| Setting | KafkaJS Default | Impact |
| --- | --- | --- |
| `acks` | `-1` (all replicas) | Higher durability, slightly higher latency |
| `timeout` | `30000ms` | Per-request timeout |
| `compression` | `None` | No CPU overhead, larger network payloads |
| `maxInFlightRequests` | `undefined` (no limit) | Allows pipelining |
| `idempotent` | `false` | No exactly-once semantics |

### Potential Tuning

For higher throughput scenarios, these KafkaJS producer options could be configured:

- **`compression: CompressionTypes.GZIP`** — Reduces network payload by ~60–80% for JSON data, at cost of CPU
- **`acks: 1`** — Acknowledge after leader write only, reducing latency by ~30–50%
- **`batch` settings** — KafkaJS client-side batching could aggregate multiple `send()` calls

## Batch Size Trade-offs

| Batch Size | Kafka Calls per 1,000 Rows | Latency per Batch | DLQ Blast Radius |
| --- | --- | --- | --- |
| 100 | 10 | Lower | 100 rows at risk |
| 500 (default) | 2 | Moderate | 500 rows at risk |
| 1,000 | 1 | Higher | 1,000 rows at risk |
| 5,000 | 1 | Highest | 5,000 rows at risk |

Larger batches improve throughput (fewer round-trips) but increase the "blast radius" of failures — a single `producer.send()` failure routes the entire batch to the DLQ. The default of 500 balances throughput with failure isolation.

## Scheduling & Retry Overhead

The cron scheduler (default: `0 0 * * *`, once daily at midnight) has negligible overhead outside of job execution. Retry behavior adds latency only on failure:

| Scenario | Total Time |
| --- | --- |
| All CSVs succeed | < 1 second |
| One 5xx → retry succeeds | ~30 minutes (first backoff) |
| Max retries exhausted (3 attempts) | ~30 + 60 + 120 = **210 minutes** |

Retries are per-report-type and run independently, so a failing hail CSV does not block wind or tornado processing.

## Scaling Considerations

### Vertical Scaling

- Increase `BATCH_SIZE` to reduce Kafka round-trips
- Increase `MAX_CONCURRENT_CSV` (up to 10) for more parallelism
- Add Kafka compression for network-bound deployments

### Horizontal Scaling

- Multiple instances can run with staggered `CRON_SCHEDULE` values
- The singleton Kafka producer is per-process, so each instance maintains its own connection
- No shared state between instances — each fetches and publishes independently

### Current Bottlenecks (in order)

1. **Kafka broker latency** — Dominates end-to-end time for small CSV files
2. **CSV source server** — External dependency, rate limits unknown
3. **Network bandwidth** — Relevant only for very large CSV files or high compression ratios
4. **CPU (CSV parsing)** — Unlikely to be a bottleneck at current data volumes

See [[Configuration]] for all tunable parameters and [[Architecture]] for the error handling flow.

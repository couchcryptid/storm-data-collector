# Theoretical Performance

This page analyzes the theoretical throughput and resource characteristics of the Storm Data Collector under its current configuration.

## Pipeline Overview

Each scheduled job runs a three-stage pipeline per report type:

```
HTTP Fetch (CSV) → Stream Parse (csv-parser) → Batch Publish (KafkaJS)
```

All report types are processed concurrently via `Promise.allSettled()`. Within each report type, rows are streamed line-by-line and published to Kafka in a single batch.

## Throughput Estimates

### Single Report Type

| Stage         | Bottleneck                 | Estimated Throughput   |
| ------------- | -------------------------- | ---------------------- |
| HTTP Fetch    | Network I/O, source server | 10–100 MB/s (typical)  |
| CSV Parse     | CPU-bound stream transform | ~50,000–100,000 rows/s |
| Kafka Publish | Network I/O, broker acks   | ~5,000–20,000 msgs/s   |

Kafka publishing is the primary bottleneck. The entire parsed CSV is published to Kafka as a single batch in one `producer.send()` call, so throughput depends on CSV size and round-trip latency to the broker.

**Estimated latency per CSV:**

- 500 rows → ~500 KB serialized JSON
- Single `producer.send()` round-trip → ~5–50ms (local broker), ~20–200ms (remote broker)
- **Total per CSV**: 50–200ms (local), 100–500ms (remote)

### Concurrent Processing

All configured report types (`REPORT_TYPES` environment variable, default: `torn,hail,wind`) are processed concurrently via `Promise.allSettled()`. With three report types running in parallel:

| Configuration                           | Concurrent Report Types | Theoretical Peak Time                        |
| --------------------------------------- | ----------------------- | -------------------------------------------- |
| Default (`REPORT_TYPES=torn,hail,wind`) | 3                       | ~500ms (local broker) – 1.5s (remote broker) |
| Single type (`REPORT_TYPES=hail`)       | 1                       | ~200ms (local) – 500ms (remote)              |

> **Note:** Actual throughput depends on CSV source server rate limits, Kafka broker capacity, network conditions, and Node.js event loop saturation. Typical SPC data volumes complete within **1–5 seconds** per job cycle.

### Typical SPC Storm Report Volumes

Storm Prediction Center CSV files are relatively small — a busy severe weather day might produce:

| Report Type | Typical Row Count | Extreme Day |
| ----------- | ----------------- | ----------- |
| Hail        | 50–500            | ~2,000      |
| Wind        | 100–800           | ~3,000      |
| Tornado     | 10–100            | ~500        |
| **Total**   | **~160–1,400**    | **~5,500**  |

At these volumes, even the most conservative throughput estimate processes an entire day's reports in **under 1 second**. The pipeline is significantly over-provisioned for the expected data volume, which provides headroom for:

- Network latency spikes
- Kafka broker degradation
- Future data source expansion

## Memory Characteristics

### Streaming Architecture

The CSV parser operates as a Node.js stream transform, processing rows one at a time. The entire parsed CSV is accumulated in memory before publishing to Kafka. Peak memory usage is bounded by:

| Component                     | Memory Usage                                  |
| ----------------------------- | --------------------------------------------- |
| HTTP response stream buffer   | ~16–64 KB (Node.js default highWaterMark)     |
| CSV parser internal buffer    | ~16 KB                                        |
| Accumulated rows (entire CSV) | **~1–10 MB** per report (depends on CSV size) |
| Kafka serialization buffer    | ~1–10 MB per `producer.send()`                |
| **Steady-state per stream**   | **~5–20 MB**                                  |

With 3 concurrent report types, peak application memory usage should stay under **~50–100 MB** (excluding Node.js runtime overhead of ~30–50 MB).

## Kafka Producer Behavior

The producer uses KafkaJS defaults (no custom producer configuration):

| Setting               | KafkaJS Default        | Impact                                                             |
| --------------------- | ---------------------- | ------------------------------------------------------------------ |
| `acks`                | `-1` (all replicas)    | Higher durability, slightly higher latency (~50–200ms per message) |
| `timeout`             | `30000ms`              | Per-request timeout                                                |
| `compression`         | `None`                 | No CPU cost, larger network payloads (~500 KB per CSV)             |
| `maxInFlightRequests` | `undefined` (no limit) | Allows pipelining, but single CSV per call limits benefit          |

Currently, KafkaJS producer options cannot be customized via environment variables. Each `producer.send()` call publishes the entire parsed CSV as a single message batch.

## Publishing Strategy

Currently, the entire parsed CSV is published to Kafka in a single `producer.send()` call. This approach:

**Advantages:**

- Simple implementation with no state management
- All-or-nothing semantics (all rows succeed or all fail together)
- Minimal latency for CSV delivery

**Disadvantages:**

- Unbounded memory usage proportional to CSV size
- Single failure routes entire CSV to error log (no partial recovery)
- Not optimized for multi-gigabyte CSVs

## Retry Behavior

HTTP 500-599 errors trigger automatic retries with fixed 5-minute intervals:

| Scenario                           | Retry Logic                               | Total Time        |
| ---------------------------------- | ----------------------------------------- | ----------------- |
| All CSVs succeed                   | No retries                                | < 1 second        |
| One 5xx error → retry succeeds     | 5-minute fixed delay, 1 retry             | ~5 minutes        |
| Max retries exhausted (3 attempts) | 5-minute delay between each of 3 attempts | ~15 minutes total |

Retries use a **fixed 5-minute interval**:

- Attempt 1: Immediate
- Attempt 2: +5 minutes
- Attempt 3: +5 more minutes
- Attempt 4: +5 more minutes
- Max 3 retries = up to 15 minutes of delay

Retries are per-report-type and run independently, so a failing hail CSV does not block wind or tornado processing.

**Retry conditions:**

- **5xx errors** (server errors): Retried up to 3 times
- **4xx errors** (client errors, 404, etc.): No retry, immediate failure
- **Network errors** (fetch failures): No retry, immediate failure

## Scaling Considerations

### Current Bottlenecks (in order of impact)

1. **CSV size ↔ Memory** — Unbounded memory growth with CSV rows (primary limiter)
2. **Kafka broker latency** — Dominates end-to-end time for small CSVs (~100–500ms per call)
3. **CSV source server** — External dependency, rate limits unknown
4. **Network bandwidth** — Secondary; compression disabled by default
5. **CPU (CSV parsing & JSON serialization)** — Unlikely bottleneck at current volumes (<2% CPU typical)

### Future Optimization

For data volumes >100x current SPC levels, consider implementing **batch-based publishing** (e.g., 500–1000 rows per Kafka call) to decouple memory from throughput.

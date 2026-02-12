# Deployment

## Docker Compose (Local Development)

The `compose.yml` at the repo root runs the full stack: Kafka (KRaft mode), the collector service, and Kafka UI.

### Start

```sh
cp .env.example .env
docker compose up
```

### Stop

```sh
docker compose down
```

### Services

| Service                | Image                          | Port  | Description                            |
| ---------------------- | ------------------------------ | ----- | -------------------------------------- |
| `storm-data-collector` | Built from `Dockerfile`        | 3000  | Collector service (development target) |
| `kafka`                | `apache/kafka:3.7.0`           | 29092 | Message broker (KRaft, no Zookeeper)   |
| `kafka-ui`             | `provectuslabs/kafka-ui:latest`| 8080  | Kafka management UI                    |

### Health Checks

All services have health checks configured:

- **Kafka**: `kafka-topics --list` against the internal listener
- **Collector**: HTTP `GET /healthz`
- **Kafka UI**: HTTP health actuator endpoint

Services start in dependency order: Kafka -> Collector (waits for healthy Kafka).

### Resource Limits

| Service | Memory Limit | Memory Reservation |
| ------- | ------------ | ------------------ |
| Kafka   | 1 GB         | 512 MB             |

## Docker Image

The service uses a multi-stage build:

1. **deps** (`node:24-alpine`): Installs production and dev dependencies with `npm ci`
2. **development** (`node:24-alpine`): Full source with hot reload via `npm run dev`
3. **builder** (`node:24-alpine`): Compiles TypeScript to JavaScript
4. **prod-deps** (`node:24-alpine`): Production dependencies only (`npm ci --omit=dev`)
5. **runner** (`node:24-alpine`): Minimal image with compiled output, non-root user

The production image runs as a non-root `appuser` for security.

### Build Manually

```sh
docker build -t storm-data-collector .
```

### Run Standalone

```sh
docker run -p 3000:3000 \
  -e KAFKA_BROKERS=host.docker.internal:9092 \
  -e KAFKA_TOPIC=raw-weather-reports \
  -e REPORTS_BASE_URL=https://www.spc.noaa.gov/climo/reports/ \
  storm-data-collector
```

## Environment Files

| File           | Used By                    | Description                                       |
| -------------- | -------------------------- | ------------------------------------------------- |
| `.env.example` | Reference                  | Template for the collector service config          |
| `.env`         | `storm-data-collector`     | Actual collector config (gitignored)               |
| `.env.kafka`   | `kafka` container          | Kafka KRaft broker settings (listeners, controller, replication) |
| `.env.kafka-ui`| `kafka-ui` container       | Kafka UI connection settings                       |

## Production

For cloud deployment options and cost analysis, see the [system Architecture wiki](https://github.com/couchcryptid/storm-data-system/wiki/Architecture#gcp-cloud-cost-analysis). The cron schedule (`CRON_SCHEDULE`) should be set to run after NOAA publishes daily reports (typically after midnight UTC). The service is stateless and idempotent -- safe to restart or run multiple instances.

## Related

- [System Deployment](https://github.com/couchcryptid/storm-data-system/wiki/Deployment) -- full-stack Docker Compose with all services
- [System Architecture](https://github.com/couchcryptid/storm-data-system/wiki/Architecture) -- cloud cost analysis and deployment topology
- [[Configuration]] -- environment variables and validation
- [[Development]] -- local development setup and testing

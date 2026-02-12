# Development

## Prerequisites

- Node.js 24+ (LTS)
- Docker and Docker Compose (for integration tests and local Kafka)
- [pre-commit](https://pre-commit.com/) (optional, via Husky + lint-staged)

## Setup

```sh
git clone <repo-url>
cd storm-data-collector
cp .env.example .env
npm install
```

## Testing

### Unit Tests

```sh
npm run test:unit
```

Fast, isolated tests with mocked dependencies. Located in `src/**/*.test.ts` (excluding `*.integration.test.ts`).

### Coverage

```sh
npm run test:coverage
npm run test:coverage:unit   # Unit tests only
```

Generates a coverage report using `@vitest/coverage-v8`.

### Integration Tests

Integration tests use [testcontainers](https://github.com/testcontainers/testcontainers-node) to spin up a real Kafka instance and verify end-to-end message flow.

```sh
npm run test:integration
```

These tests require Docker to be running and may take 60-90 seconds to start the containers.

### Test Data

The integration test verifies the full CSV-to-Kafka pipeline:

1. Spins up real Kafka using Testcontainers
2. Starts an HTTP mock server serving test CSV data
3. Tests CSV fetch -> parse -> batch -> publish
4. Consumes messages from Kafka to verify correct publishing

### Commands

| Command                    | Description                         |
| -------------------------- | ----------------------------------- |
| `npm test`                 | Run all tests                       |
| `npm run test:unit`        | Unit tests only (fast)              |
| `npm run test:integration` | Integration tests (requires Docker) |
| `npm run test:coverage`    | Coverage report (all tests)         |
| `npm run test:coverage:unit` | Coverage report (unit tests)      |
| `npm run test:watch`       | Watch mode                          |
| `npm run test:ui`          | Visual browser UI                   |

## Linting

```sh
npm run lint
npm run lint:fix   # Auto-fix
```

Uses ESLint with `@typescript-eslint` and Prettier integration.

## Formatting

```sh
npm run format         # Format all files
npm run format:check   # Check without modifying
```

Uses Prettier for consistent code formatting.

## Type Checking

```sh
npm run typecheck
```

Runs the TypeScript compiler in `--noEmit` mode to verify type safety.

## Pre-commit Hooks

The project uses **Husky** + **lint-staged** to run checks on every commit:

1. `prettier --write` on staged TypeScript files
2. `eslint --fix` on staged TypeScript files
3. Unit test suite (`npm run test:unit`)

Configuration in `package.json`:

```json
{
  "lint-staged": {
    "*.ts": ["prettier --write", "eslint --fix"]
  }
}
```

> Integration tests are NOT run on commit (too slow). Run them manually before PRs with `npm run test:integration`.

## CI Pipeline

The `.github/workflows/ci.yml` workflow runs on pushes and pull requests to `main`:

| Job | What It Does |
| --- | --- |
| `test-unit` | `npm run test:unit` (unit tests) |
| `lint` | `npm run lint` + `npm run typecheck` (linting and type checking) |
| `build` | `npm run build` (compile check) |

A separate `release.yml` workflow (triggered by CI success on `main`) handles versioning, GitHub releases, and Docker image publishing.

## Logging

The project uses [Pino](https://getpino.io/) for structured logging. All log calls should pass context as an object first argument:

```typescript
logger.info({ url: csvUrl, type: 'hail', statusCode: 200 }, 'CSV fetch successful');
```

Control verbosity via `LOG_LEVEL` (see [[Configuration]]). In development, `pino-pretty` provides color-coded human-readable output. In production, logs are emitted as JSON.

## Metrics

All custom Prometheus metrics use the `storm_collector_` prefix and are exposed via `GET /metrics`. Metrics are defined in `src/metrics.ts` and instrumented in:

- `src/scheduler/scheduler.ts` -- job duration, job runs, retries
- `src/csv/csv-stream.ts` -- rows processed, rows published
- `src/kafka/publisher.ts` -- Kafka publish retries

See the README for the full metric reference table. Default Node.js runtime metrics (`nodejs_*`, `process_*`) are also collected automatically by prom-client.

## Related

- [System Development](https://github.com/couchcryptid/storm-data-system/wiki/Development) -- multi-repo workflow, CI conventions, and cross-service patterns
- [System Testing](https://github.com/couchcryptid/storm-data-system/wiki/Testing) -- E2E and UAT tests that validate the full pipeline
- [System Observability](https://github.com/couchcryptid/storm-data-system/wiki/Observability) -- health checks, metrics, and structured logging across all services
- [[Configuration]] -- environment variables and Zod validation
- [[Architecture]] -- service design, error handling, and retry strategy
- [[Code Quality]] -- linting, static analysis, and quality gates

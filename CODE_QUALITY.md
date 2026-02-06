# Code Quality Tools

This document describes the code quality tools configured for this project.

## 1. Zod - Runtime Configuration Validation

**Package:** `zod@4.3.6`

### What it does

Validates environment variables and configuration at startup, catching configuration errors before they cause runtime issues.

### Configuration

See [src/config.ts](src/config.ts) for the validation schema.

### Validation Rules

- `KAFKA_BROKERS` - String (default: "localhost:9092")
- `KAFKA_CLIENT_ID` - String (default: "ht-weather-collector")
- `KAFKA_TOPIC` - String (default: "raw-weather-reports")
- `CSV_BASE_URL` - Valid URL (default: "https://example.com/")
- `BATCH_SIZE` - Positive number (default: 500)
- `MAX_CONCURRENT_CSV` - Positive number, max 10 (default: 3)
- `CRON_SECHEDULE` - String (default "0 0 \* \* \*")
- `CRON_RETRY_INTERVAL` - Positive number, max 48 (default: 6)
- `CSV_TYPES` - Comma-separated string (default: "torn,hail,wind")

### Example Error

```bash
$ CSV_BASE_URL="not-a-url" npm run dev

ZodError: [
  {
    "code": "invalid_format",
    "format": "url",
    "path": ["CSV_BASE_URL"],
    "message": "Invalid URL"
  }
]
```

---

## 2. Vitest Testing & Coverage

**Packages:**

- `@vitest/coverage-v8@4.0.18`
- `@vitest/ui@4.0.18`
- `testcontainers@11.11.0`
- `@testcontainers/kafka@11.11.0`

### What it does

Provides comprehensive testing infrastructure including unit tests, integration tests, and test coverage reports.

### Test Types

**Unit Tests** - Fast, isolated tests with mocked dependencies

- Located in: `src/**/*.test.ts` (excluding `*.integration.test.ts`)
- Run with: `npm run test:unit`
- Used in pre-commit hooks
- Takes 1-2 seconds

**Integration Tests** - Full end-to-end tests with real Kafka

- Located in: `src/**/*.integration.test.ts`
- Run with: `npm run test:integration`
- Uses Testcontainers to spin up real Kafka instance
- Requires Docker to be running
- Takes 60-90 seconds

### Usage

**Run all tests:**

```bash
npm test
```

**Run only unit tests (fast):**

```bash
npm run test:unit
```

**Run only integration tests (slow, requires Docker):**

```bash
npm run test:integration
```

**Generate coverage report (unit tests only):**

```bash
npm run test:coverage:unit
```

**Generate coverage report (all tests):**

```bash
npm run test:coverage
```

**Watch mode (re-run on file changes):**

```bash
npm run test:watch
```

**Visual test UI:**

```bash
npm run test:ui
```

Opens an interactive browser UI for running and inspecting tests.

### Coverage Output Example

```
File           | % Stmts | % Branch | % Funcs | % Lines | Uncovered Line #s
---------------|---------|----------|---------|---------|-------------------
All files      |   82.55 |    75.86 |   76.47 |   84.14 |
 csv           |   85.71 |    88.88 |   66.66 |   89.47 |
  csvStream.ts |   85.71 |    88.88 |   66.66 |   89.47 | 40,45
 kafka         |   88.88 |       75 |     100 |     100 |
  client.ts    |     100 |      100 |     100 |     100 |
  publisher.ts |      75 |       50 |     100 |     100 | 8
 scheduler     |   80.35 |    68.75 |      75 |      80 |
  retry.ts     |     100 |      100 |     100 |     100 |
  scheduler.ts |   68.57 |       50 |      60 |   67.64 | 59-86
```

### Coverage Goals

- **Current:** 82.55% statement coverage (unit tests)
- **Target:** 85%+ statement coverage
- **Uncovered areas:**
  - scheduler.ts retry callback (lines 59-86) - integration testing challenge
  - csvStream.ts error paths (lines 40, 45)

### Integration Test Details

The integration tests verify the full CSV-to-Kafka pipeline:

1. **Kafka Container Setup** - Spins up real Kafka using Testcontainers
2. **HTTP Mock Server** - Serves test CSV data
3. **End-to-End Flow** - Tests CSV fetch → parse → batch → publish → consume
4. **Verification** - Consumes messages from Kafka to verify correct publishing

**Test coverage:**

- ✅ Publishing CSV data and consuming from Kafka
- ✅ Batch publishing with configurable batch sizes
- ✅ Message metadata (type, timestamps)

**Requirements:**

- Docker must be running
- Takes 60-90 seconds to start containers
- Each test creates fresh Kafka consumer for isolation

**Example test:**

```typescript
it('publishes CSV data to Kafka and can be consumed', async () => {
  // Arrange: Set up test CSV data
  testCsvContent = `id,name,value
1,item-1,100
2,item-2,200`;

  // Act: Publish to Kafka
  await csvStreamToKafka({
    csvUrl: `${httpServerUrl}/test.csv`,
    topic: testTopic,
    kafka: { clientId: 'test', brokers: [kafkaBrokers] },
    batchSize: 2,
    type: 'test',
  });

  // Assert: Consume and verify messages
  expect(consumedMessages).toHaveLength(2);
  expect(messages[0]).toMatchObject({ id: '1', name: 'item-1', value: '100' });
});
```

---

## 3. Husky + Lint-Staged - Git Hooks

**Packages:**

- `husky@9.1.7`
- `lint-staged@16.2.7`

### What it does

Automatically runs code quality checks before each commit, preventing bad code from being committed.

### Pre-commit Hook

**Location:** `.husky/pre-commit`

**Actions:**

1. Runs `prettier --write` on staged TypeScript files (auto-format)
2. Runs `eslint --fix` on staged TypeScript files (auto-fix linting issues)
3. Runs unit test suite (`npm run test:unit`)
   - Note: Integration tests are NOT run on commit (too slow)
   - Run integration tests manually before PRs with `npm run test:integration`

### Configured in package.json

```json
{
  "lint-staged": {
    "*.ts": ["prettier --write", "eslint --fix"]
  }
}
```

### How it works

1. You make changes to TypeScript files
2. You run `git add` to stage files
3. You run `git commit`
4. **Pre-commit hook runs automatically:**
   - Formats staged files with Prettier
   - Fixes linting issues with ESLint
   - Runs all tests
5. If all checks pass → commit succeeds
6. If any check fails → commit is blocked

### Bypassing (not recommended)

```bash
git commit --no-verify
```

### Example Output

```bash
$ git commit -m "Add new feature"

✔ Preparing lint-staged...
✔ Running tasks for staged files...
  ✔ package.json — 2 files
    ✔ *.ts — 1 file
      ✔ prettier --write
      ✔ eslint --fix
✔ Applying modifications from tasks...
✔ Cleaning up temporary files...

> ht-weather-data-collector@1.0.0 test
> vitest run

✓ src/csv/csvStream.test.ts (4 tests) 5ms
✓ src/scheduler/retry.test.ts (9 tests) 27ms
✓ src/scheduler/scheduler.test.ts (7 tests) 26ms

Test Files  3 passed (3)
     Tests  20 passed (20)

[main abc1234] Add new feature
 1 file changed, 10 insertions(+), 2 deletions(-)
```

---

## Best Practices

### 1. Always Use Valid Environment Variables

- Check `.env.example` for required format
- Use `npm run dev` to catch config errors early
- Validation errors show exact field and issue

### 2. Monitor Test Coverage

- Run `npm run test:coverage` before PRs
- Aim to maintain or improve coverage percentage
- Add tests for any new features
- Run integration tests before PRs: `npm run test:integration`
- Ensure Docker is running for integration tests

### 3. Trust the Git Hooks

- Let them auto-format and auto-fix code
- Don't bypass unless absolutely necessary
- Fix failing tests before committing

### 4. Use Test UI for Debugging

- Run `npm run test:ui` for visual debugging
- See which tests fail and why
- Inspect coverage interactively

---

## Troubleshooting

### "ZodError: Invalid URL"

- Check `CSV_BASE_URL` in `.env` file
- Must be a valid URL format (e.g., `https://example.com/`)

### "husky - pre-commit script failed"

- Tests are failing - run `npm test` to see why
- Linting errors - run `npm run lint:fix`
- Formatting issues - run `npm run format`

### Coverage percentage dropped

- New code added without tests
- Run `npm run test:coverage` to see uncovered lines
- Add tests for new functionality

### Integration tests failing

- Ensure Docker is running
- Check Docker has enough resources (2GB+ memory recommended)
- Container startup can take 60-90 seconds
- Check logs: integration tests print container status messages

---

## Summary

| Tool                  | Purpose               | Command                                      |
| --------------------- | --------------------- | -------------------------------------------- |
| **Zod**               | Config validation     | Automatic on startup                         |
| **Unit Tests**        | Fast isolated tests   | `npm run test:unit`                          |
| **Integration Tests** | Full Kafka e2e tests  | `npm run test:integration` (requires Docker) |
| **Coverage**          | Test coverage report  | `npm run test:coverage`                      |
| **Test UI**           | Visual test interface | `npm run test:ui`                            |
| **Husky**             | Git hooks             | Automatic on commit                          |
| **Lint-Staged**       | Stage-only formatting | Automatic with Husky                         |

All tools are configured and ready to use! 🎉

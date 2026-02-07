# Code Quality

## Testing with Vitest

**Packages:** `@vitest/coverage-v8`, `@vitest/ui`, `testcontainers`, `@testcontainers/kafka`

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

### Commands

| Command | Description |
| --- | --- |
| `npm test` | Run all tests |
| `npm run test:unit` | Unit tests only (fast) |
| `npm run test:integration` | Integration tests (requires Docker) |
| `npm run test:coverage:unit` | Coverage report (unit tests) |
| `npm run test:coverage` | Coverage report (all tests) |
| `npm run test:watch` | Watch mode |
| `npm run test:ui` | Visual browser UI |

### Coverage

```
File           | % Stmts | % Branch | % Funcs | % Lines
---------------|---------|----------|---------|--------
All files      |   82.55 |    75.86 |   76.47 |  84.14
 csv           |   85.71 |    88.88 |   66.66 |  89.47
 kafka         |   88.88 |       75 |     100 |    100
 scheduler     |   80.35 |    68.75 |      75 |     80
```

**Target:** 85%+ statement coverage.

### Integration Test Details

The integration tests verify the full CSV-to-Kafka pipeline:

1. **Kafka Container Setup** - Spins up real Kafka using Testcontainers
2. **HTTP Mock Server** - Serves test CSV data
3. **End-to-End Flow** - Tests CSV fetch → parse → batch → publish → consume
4. **Verification** - Consumes messages from Kafka to verify correct publishing

**Example:**

```typescript
it('publishes CSV data to Kafka and can be consumed', async () => {
  testCsvContent = `id,name,value
1,item-1,100
2,item-2,200`;

  await csvStreamToKafka({
    csvUrl: `${httpServerUrl}/test.csv`,
    topic: testTopic,
    kafka: { clientId: 'test', brokers: [kafkaBrokers] },
    batchSize: 2,
    type: 'test',
  });

  expect(consumedMessages).toHaveLength(2);
  expect(messages[0]).toMatchObject({ id: '1', name: 'item-1', value: '100' });
});
```

---

## Git Hooks with Husky + Lint-Staged

**Packages:** `husky`, `lint-staged`

### Pre-commit Hook

Located in `.husky/pre-commit`, the hook runs automatically on every commit:

1. `prettier --write` on staged TypeScript files
2. `eslint --fix` on staged TypeScript files
3. Unit test suite (`npm run test:unit`)

> Integration tests are NOT run on commit (too slow). Run them manually before PRs with `npm run test:integration`.

### Configuration (package.json)

```json
{
  "lint-staged": {
    "*.ts": ["prettier --write", "eslint --fix"]
  }
}
```

### Workflow

1. Make changes to TypeScript files
2. `git add` to stage files
3. `git commit` triggers the pre-commit hook
4. If all checks pass, commit succeeds
5. If any check fails, commit is blocked

### Bypassing (not recommended)

```bash
git commit --no-verify
```

---

## Best Practices

1. **Always Use Valid Environment Variables** - See [[Configuration]] for required format
2. **Monitor Test Coverage** - Run `npm run test:coverage` before PRs
3. **Trust the Git Hooks** - Let them auto-format and auto-fix code
4. **Use Test UI for Debugging** - Run `npm run test:ui` for visual debugging
5. **Run Integration Tests Before PRs** - `npm run test:integration`

---

## Troubleshooting

### "ZodError: Invalid URL"

Check `REPORTS_BASE_URL` in `.env` file. Must be a valid URL format.

### "husky - pre-commit script failed"

- Tests failing: run `npm test` to see why
- Linting errors: run `npm run lint:fix`
- Formatting issues: run `npm run format`

### Coverage percentage dropped

New code added without tests. Run `npm run test:coverage` to see uncovered lines.

### Integration tests failing

- Ensure Docker is running
- Check Docker has enough resources (2GB+ memory recommended)
- Container startup can take 60-90 seconds

---

## Summary

| Tool | Purpose | Command |
| --- | --- | --- |
| **Unit Tests** | Fast isolated tests | `npm run test:unit` |
| **Integration Tests** | Full Kafka e2e tests | `npm run test:integration` |
| **Coverage** | Test coverage report | `npm run test:coverage` |
| **Test UI** | Visual test interface | `npm run test:ui` |
| **Husky** | Git hooks | Automatic on commit |
| **Lint-Staged** | Stage-only formatting | Automatic with Husky |

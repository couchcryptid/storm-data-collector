# Logging

The project uses **Pino** for structured logging combined with **Chalk** for color-coded console output during startup.

**Packages:** `pino`, `pino-pretty`, `chalk`

## Basic Usage

```typescript
import logger from './logger';

logger.info('Application started');
logger.warn('This is a warning');
logger.error('An error occurred', { errorCode: 500 });
logger.debug('Debug information', { userId: 123 });
```

## Log Levels

| Level     | Numeric | Usage                                    |
| --------- | ------- | ---------------------------------------- |
| **fatal** | 60      | Unrecoverable errors, app must exit      |
| **error** | 50      | Error conditions, operation failed       |
| **warn**  | 40      | Warning conditions, something unexpected |
| **info**  | 30      | General informational messages (default) |
| **debug** | 10      | Detailed debugging information           |

Control verbosity via `LOG_LEVEL`:

```bash
LOG_LEVEL=debug npm run dev   # Development - see everything
LOG_LEVEL=warn node dist/index.js  # Production - only important
LOG_LEVEL=info npm run dev    # Default
```

## Structured Logging

Always add context as object fields:

```typescript
// Good - structured with context
logger.info('CSV fetch started', {
  url: csvUrl,
  type: 'hail',
  timestamp: new Date().toISOString(),
});

// Bad - unstructured message
logger.info(`Fetching CSV from ${csvUrl}`);
```

### Error Logging

```typescript
import { getErrorMessage } from './shared/errors';

try {
  await fetchCsv(url);
} catch (error) {
  logger.error('CSV fetch failed', {
    url,
    type: 'hail',
    error: getErrorMessage(error),
  });
}
```

## Styled Console Output

For startup messages and configuration display:

```typescript
import {
  styled,
  printHeader,
  printConfig,
  printDivider,
  printStartupSuccess,
  printStartupError,
} from './logger';

printHeader('Application Configuration');
printConfig('Kafka Brokers', 'localhost:9092');
printConfig('Batch Size', '500');
printDivider();
printStartupSuccess('Application started successfully');
```

### Available Styles

| Function                | Color      |
| ----------------------- | ---------- |
| `styled.success()`      | Green      |
| `styled.error()`        | Red        |
| `styled.warning()`      | Yellow     |
| `styled.info()`         | Blue       |
| `styled.highlight()`    | Cyan       |
| `styled.bold()`         | Bold       |
| `styled.dim()`          | Dim/Gray   |
| `styled.success_bold()` | Bold Green |
| `styled.error_bold()`   | Bold Red   |

## Output Format

### Development (with pino-pretty)

```
10:45:23 INFO - CSV fetch started
10:45:25 INFO - Batch published to Kafka
10:45:25 WARN - Retry 1/3 for batch 2
10:45:26 ERROR - CSV fetch failed
```

Color-coded by level, human-readable timestamps, pretty-printed objects.

### Production (JSON)

```json
{"level":30,"time":1707132323000,"msg":"CSV fetch started","url":"https://example.com/csv","type":"hail"}
{"level":50,"time":1707132325000,"msg":"CSV fetch failed","url":"https://example.com/csv","error":"Connection timeout"}
```

## Logger Configuration

Defined in `src/logger.ts`:

```typescript
const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  transport: {
    target: 'pino-pretty',
    options: {
      colorize: true,
      translateTime: 'SYS:standard',
      ignore: 'pid,hostname',
      singleLine: false,
      messageFormat: '{levelLabel} - {msg}',
      timeFormat: 'HH:mm:ss Z',
    },
  },
});
```

## Best Practices

### Use Appropriate Log Levels

```typescript
logger.info('Batch published', { batchId, recordCount: 500 });
logger.warn('CSV fetch slow', { duration: 5000, timeout: 3000 });
logger.error('Kafka publish failed', { error: err.message });
logger.debug('Processing record', { recordId, index: 42 });
```

### Always Include Context

```typescript
// Good
logger.info('CSV parsing started', {
  filename: 'hail_reports.csv',
  rowCount: 1500,
  batchSize: 500,
});

// Bad
logger.info('Starting parse');
```

### Log at Entry and Exit Points

```typescript
export async function processFile(filename: string) {
  logger.info('File processing started', { filename });
  try {
    const result = await parse(filename);
    logger.info('File processing completed', {
      filename,
      recordsProcessed: result.length,
    });
    return result;
  } catch (error) {
    logger.error('File processing failed', {
      filename,
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}
```

### Avoid Logging Sensitive Data

```typescript
// Bad
logger.info('DB connected', { url: 'postgres://user:password@host/db' });

// Good
logger.info('DB connected', { host: 'postgres.example.com' });
```

## Common Patterns

### Batch Processing

```typescript
logger.info('Batch processing started', {
  batchId: uuidv4(),
  totalRecords: 5000,
  batchSize: 500,
});

for (let i = 0; i < batches.length; i++) {
  logger.debug('Processing batch', {
    batchNumber: i + 1,
    totalBatches: batches.length,
  });
}

logger.info('Batch processing completed', {
  batchId,
  totalBatches: batches.length,
  duration: endTime - startTime,
});
```

### Retry Logic

```typescript
logger.warn('Publish failed, retrying', {
  attempt: 1,
  maxAttempts: 3,
  nextRetryIn: 5000,
  error: err.message,
});
logger.info('Publish succeeded after retry', {
  attempts: 2,
  totalDuration: 5500,
});
```

## Production Considerations

### Log Aggregation

```bash
node dist/index.js 2>&1 | my-log-aggregator
```

### Environment-Specific Levels

| Environment | Level   | Command                             |
| ----------- | ------- | ----------------------------------- |
| Production  | `warn`  | `LOG_LEVEL=warn node dist/index.js` |
| Staging     | `info`  | `LOG_LEVEL=info node dist/index.js` |
| Development | `debug` | `LOG_LEVEL=debug npm run dev`       |

### Monitoring Alerts

| Level     | Alert Policy                  |
| --------- | ----------------------------- |
| **FATAL** | Immediate alert               |
| **ERROR** | Alert within 5 minutes        |
| **WARN**  | Track trends, alert on spikes |
| **INFO**  | General metrics               |

### Log Rotation (bare metal)

```
/var/log/app/*.json {
  daily
  rotate 7
  compress
  delaycompress
}
```

## Troubleshooting

| Issue              | Solution                                                                            |
| ------------------ | ----------------------------------------------------------------------------------- |
| Logs not appearing | Check `LOG_LEVEL` env var; ensure messages are at or above configured level         |
| Too much output    | Set `LOG_LEVEL=info` or higher                                                      |
| JSON vs pretty     | Pretty format is automatic in dev; JSON in production without pino-pretty transport |

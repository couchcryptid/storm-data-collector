# Logging

The project uses **Pino** for structured logging.

**Package:** `pino`, `pino-pretty`

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

Control verbosity via `LOG_LEVEL` (see [[Configuration]]):

```bash
LOG_LEVEL=debug npm run dev   # Development - see everything
LOG_LEVEL=warn node dist/index.js  # Production - only important
LOG_LEVEL=info npm run dev    # Default
```

## Structured Logging

Always add context as object fields:

```typescript
// Good - structured with context
logger.info(
  { url: csvUrl, type: 'hail', statusCode: 200 },
  'CSV fetch successful'
);

// Bad - unstructured message
logger.info(`Fetching CSV from ${csvUrl}`);
```

### Error Logging

```typescript
import { getErrorMessage, isHttpError } from './shared/errors';

try {
  await csvStreamToKafka({ csvUrl, topic, kafka, type });
} catch (error) {
  if (isHttpError(error)) {
    logger.error(
      { url: csvUrl, statusCode: error.statusCode },
      'CSV fetch failed'
    );
  } else {
    logger.error({ error: getErrorMessage(error) }, 'CSV processing failed');
  }
}
```

## Output Format

### Development (with pino-pretty)

```
3000 INFO - CSV fetch started
3050 INFO - Batch published to Kafka
3100 WARN - Retry 1/3 for CSV
3200 ERROR - CSV fetch failed
```

Color-coded by level, human-readable timestamps, pretty-printed objects.

### Production (JSON)

```json
{"level":30,"time":1707132323000,"msg":"CSV fetch successful","url":"https://example.com/csv","type":"hail"}
{"level":50,"time":1707132325000,"msg":"CSV fetch failed","url":"https://example.com/csv","statusCode":500}
```

## Logger Configuration

Defined in `src/logger.ts`:

```typescript
const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
});
```

## Best Practices

1. **Use appropriate log levels** - info for events, warn for retries, error for failures
2. **Always include context** - Pass object with relevant data (url, statusCode, type, etc.)
3. **Use consistent field names** - Use `url`, `statusCode`, `type`, `count` consistently
4. **Log at decision points** - Log before retries, before publishing, on success/failure
5. **Don't log sensitive data** - Avoid logging passwords, API keys, or PII

/**
 * HTTP Status Code Constants
 * Group related status codes for clearer intent and DRY principle
 *
 * Used in retry logic and error handling to distinguish between:
 * - Server errors (500-599): Retry with exponential backoff
 * - Client errors (400-499): Log and skip
 * - Not found (404): Skip, CSV not published yet
 */
export const HTTP_STATUS_CODES = {
  // Success
  OK: 200,

  // Client Errors
  NOT_FOUND: 404,
  CLIENT_ERROR_MIN: 400,
  CLIENT_ERROR_MAX: 499,

  // Server Errors
  SERVER_ERROR_MIN: 500,
  SERVER_ERROR_MAX: 599,
} as const;

/**
 * Data Processing Constants
 * Default batch sizes and unit conversions
 */
export const DATA_PROCESSING = {
  DEFAULT_BATCH_SIZE: 500,
  BYTES_PER_MB: 1024 * 1024,
} as const;

/**
 * Retry and Timing Constants
 * Time unit conversions for scheduling and delays
 */
export const TIMING = {
  MS_PER_MINUTE: 60 * 1000,
} as const;

/**
 * File/Timestamp Constants
 * Formatting rules for safe filenames and timestamps
 */
export const FILE_FORMAT = {
  // Characters to replace in timestamps for safe filenames
  TIMESTAMP_UNSAFE_CHARS: /[:.]/g,
  TIMESTAMP_SAFE_CHAR: '-',
} as const;

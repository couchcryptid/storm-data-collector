/**
 * Extract error message from unknown error type
 *
 * Safely handles Error objects, strings, and other types that may be thrown.
 * Always returns a string, never throws.
 *
 * @param error - Error of any type
 * @returns String message describing the error
 * @example
 * try { } catch (err) {
 *   logger.error({ error: getErrorMessage(err) });
 * }
 */
export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

/**
 * Determine if error is an HTTP error with status code
 *
 * Type guard for checking if an error is an HTTP error.
 * Used for distinguishing HTTP errors (400-599) from network/other errors.
 *
 * @param error - Error to check
 * @returns true if error has statusCode property and is a number
 * @example
 * if (isHttpError(err)) {
 *   console.log(`HTTP ${err.statusCode}: ${err.message}`);
 * }
 */
export function isHttpError(
  error: unknown
): error is { statusCode: number; message: string } {
  return (
    error instanceof Error &&
    'statusCode' in error &&
    typeof (error as Record<string, unknown>).statusCode === 'number'
  );
}

/**
 * Extract HTTP status code from error
 *
 * Returns status code if error is HTTP error, otherwise returns default.
 * Safe to use with any error type.
 *
 * @param error - Error of any type
 * @param defaultCode - Value to return if not an HTTP error (default: 0)
 * @returns HTTP status code or default value
 */
export function getHttpStatusCode(error: unknown, defaultCode = 0): number {
  if (isHttpError(error)) {
    return error.statusCode;
  }
  return defaultCode;
}

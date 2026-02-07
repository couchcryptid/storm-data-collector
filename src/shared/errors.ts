export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

export function isHttpError(
  error: unknown
): error is { statusCode: number; message: string } {
  return (
    error instanceof Error &&
    'statusCode' in error &&
    typeof (error as Record<string, unknown>).statusCode === 'number'
  );
}

import { describe, it, expect } from 'vitest';
import { getErrorMessage, isHttpError } from './errors.js';

describe('getErrorMessage', () => {
  it('returns message from Error instance', () => {
    expect(getErrorMessage(new Error('test error'))).toBe('test error');
  });

  it('converts string to string', () => {
    expect(getErrorMessage('plain string')).toBe('plain string');
  });

  it('converts number to string', () => {
    expect(getErrorMessage(42)).toBe('42');
  });

  it('converts null to string', () => {
    expect(getErrorMessage(null)).toBe('null');
  });

  it('converts undefined to string', () => {
    expect(getErrorMessage(undefined)).toBe('undefined');
  });
});

describe('isHttpError', () => {
  it('returns true for error with statusCode', () => {
    class HttpError extends Error {
      statusCode: number;
      constructor(message: string, statusCode: number) {
        super(message);
        this.statusCode = statusCode;
      }
    }
    expect(isHttpError(new HttpError('not found', 404))).toBe(true);
  });

  it('returns false for plain Error', () => {
    expect(isHttpError(new Error('plain'))).toBe(false);
  });

  it('returns false for non-Error object', () => {
    expect(isHttpError({ statusCode: 500, message: 'fail' })).toBe(false);
  });

  it('returns false for string', () => {
    expect(isHttpError('error string')).toBe(false);
  });
});

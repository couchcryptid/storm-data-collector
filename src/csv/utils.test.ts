import { describe, it, expect } from 'vitest';
import { formatCsvFilename, buildCsvUrl, expandHHMMToISO } from './utils.js';

describe('formatCsvFilename', () => {
  it('formats filename with correct YYMMDD pattern', () => {
    const date = new Date(2026, 1, 6); // Feb 6, 2026
    expect(formatCsvFilename('hail', date)).toBe('260206_rpts_hail.csv');
  });

  it('pads single-digit month and day with leading zeros', () => {
    const date = new Date(2026, 0, 5); // Jan 5, 2026
    expect(formatCsvFilename('wind', date)).toBe('260105_rpts_wind.csv');
  });

  it('handles double-digit month and day without extra padding', () => {
    const date = new Date(2026, 11, 25); // Dec 25, 2026
    expect(formatCsvFilename('torn', date)).toBe('261225_rpts_torn.csv');
  });

  it('uses current date when no date argument provided', () => {
    const now = new Date();
    const yy = String(now.getFullYear()).slice(-2);
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const dd = String(now.getDate()).padStart(2, '0');
    const expected = `${yy}${mm}${dd}_rpts_hail.csv`;

    expect(formatCsvFilename('hail')).toBe(expected);
  });
});

describe('buildCsvUrl', () => {
  it('combines base URL and formatted filename', () => {
    const date = new Date(2026, 1, 6);
    expect(
      buildCsvUrl('https://spc.noaa.gov/climo/reports/', 'hail', date)
    ).toBe('https://spc.noaa.gov/climo/reports/260206_rpts_hail.csv');
  });

  it('concatenates directly without inserting a separator', () => {
    const date = new Date(2026, 1, 6);
    // Base URL without trailing slash results in no slash before filename
    expect(buildCsvUrl('https://example.com', 'wind', date)).toBe(
      'https://example.com260206_rpts_wind.csv'
    );
  });

  it('preserves trailing slash in base URL', () => {
    const date = new Date(2026, 1, 6);
    expect(buildCsvUrl('https://example.com/', 'torn', date)).toBe(
      'https://example.com/260206_rpts_torn.csv'
    );
  });

  it('uses current date when no date argument provided', () => {
    const now = new Date();
    const yy = String(now.getFullYear()).slice(-2);
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const dd = String(now.getDate()).padStart(2, '0');
    const expected = `https://example.com/${yy}${mm}${dd}_rpts_hail.csv`;

    expect(buildCsvUrl('https://example.com/', 'hail')).toBe(expected);
  });
});

describe('expandHHMMToISO', () => {
  const date = new Date('2024-04-26T00:00:00Z');

  it('expands four-digit HHMM to ISO 8601', () => {
    expect(expandHHMMToISO('1510', date)).toBe('2024-04-26T15:10:00Z');
  });

  it('zero-pads three-digit HHMM', () => {
    expect(expandHHMMToISO('930', date)).toBe('2024-04-26T09:30:00Z');
  });

  it('handles midnight', () => {
    expect(expandHHMMToISO('0000', date)).toBe('2024-04-26T00:00:00Z');
  });

  it('returns midnight for empty string', () => {
    expect(expandHHMMToISO('', date)).toBe('2024-04-26T00:00:00Z');
  });

  it('returns midnight for too-short string', () => {
    expect(expandHHMMToISO('12', date)).toBe('2024-04-26T00:00:00Z');
  });

  it('returns midnight for invalid hour', () => {
    expect(expandHHMMToISO('2510', date)).toBe('2024-04-26T00:00:00Z');
  });

  it('returns midnight for invalid minute', () => {
    expect(expandHHMMToISO('1299', date)).toBe('2024-04-26T00:00:00Z');
  });

  it('trims whitespace', () => {
    expect(expandHHMMToISO('  1510  ', date)).toBe('2024-04-26T15:10:00Z');
  });

  it('passes through ISO 8601 timestamps unchanged', () => {
    const today = new Date();
    expect(expandHHMMToISO('2024-04-26T15:10:00Z', today)).toBe(
      '2024-04-26T15:10:00Z'
    );
  });
});

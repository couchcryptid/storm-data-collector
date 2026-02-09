import { describe, it, expect, vi, beforeEach } from 'vitest';

describe('config', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllEnvs();
  });

  it('uses defaults when no env vars are set', async () => {
    const { config } = await import('./config.js');

    expect(config.kafka.clientId).toBe('csv-producer');
    expect(config.kafka.brokers).toEqual(['localhost:9092']);
    expect(config.topic).toBe('raw-weather-reports');
    expect(config.cron.schedule).toBe('0 0 * * *');
    expect(config.reportsBaseUrl).toBe('https://example.com/');
    expect(config.reportTypes).toEqual(['torn', 'hail', 'wind']);
    expect(config.logLevel).toBe('info');
  });

  it('overrides defaults with custom env vars', async () => {
    vi.stubEnv('KAFKA_CLIENT_ID', 'my-producer');
    vi.stubEnv('KAFKA_BROKERS', 'kafka1:9092');
    vi.stubEnv('KAFKA_TOPIC', 'custom-topic');
    vi.stubEnv('CRON_SCHEDULE', '*/5 * * * *');
    vi.stubEnv('REPORTS_BASE_URL', 'https://custom.example.com/reports/');
    vi.stubEnv('REPORT_TYPES', 'hail');
    vi.stubEnv('LOG_LEVEL', 'debug');

    const { config } = await import('./config.js');

    expect(config.kafka.clientId).toBe('my-producer');
    expect(config.kafka.brokers).toEqual(['kafka1:9092']);
    expect(config.topic).toBe('custom-topic');
    expect(config.cron.schedule).toBe('*/5 * * * *');
    expect(config.reportsBaseUrl).toBe('https://custom.example.com/reports/');
    expect(config.reportTypes).toEqual(['hail']);
    expect(config.logLevel).toBe('debug');
  });

  it('splits KAFKA_BROKERS by comma into array', async () => {
    vi.stubEnv('KAFKA_BROKERS', 'broker1:9092,broker2:9092,broker3:9092');

    const { config } = await import('./config.js');

    expect(config.kafka.brokers).toEqual([
      'broker1:9092',
      'broker2:9092',
      'broker3:9092',
    ]);
  });

  it('trims whitespace when splitting brokers', async () => {
    vi.stubEnv('KAFKA_BROKERS', ' broker1:9092 , broker2:9092 ');

    const { config } = await import('./config.js');

    expect(config.kafka.brokers).toEqual(['broker1:9092', 'broker2:9092']);
  });

  it('splits REPORT_TYPES by comma into array', async () => {
    vi.stubEnv('REPORT_TYPES', 'torn,hail');

    const { config } = await import('./config.js');

    expect(config.reportTypes).toEqual(['torn', 'hail']);
  });

  it('trims whitespace when splitting report types', async () => {
    vi.stubEnv('REPORT_TYPES', ' torn , hail , wind ');

    const { config } = await import('./config.js');

    expect(config.reportTypes).toEqual(['torn', 'hail', 'wind']);
  });

  it('throws ZodError when REPORTS_BASE_URL is not a valid URL', async () => {
    vi.stubEnv('REPORTS_BASE_URL', 'not-a-url');

    await expect(import('./config.js')).rejects.toThrow();
  });
});

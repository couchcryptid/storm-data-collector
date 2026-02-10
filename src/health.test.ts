import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';

vi.mock('./kafka/client.js', () => ({
  isProducerConnected: vi.fn(() => true),
}));

vi.mock('./metrics.js', () => ({
  register: {
    metrics: vi.fn(
      async () =>
        '# HELP test_metric A test metric\n# TYPE test_metric gauge\ntest_metric 1\n'
    ),
    contentType: 'text/plain; version=0.0.4; charset=utf-8',
  },
}));

vi.mock('./logger.js', () => ({
  default: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

import { startHealthServer } from './health.js';
import { isProducerConnected } from './kafka/client.js';

let server: Server;
let baseUrl: string;

beforeAll(async () => {
  server = startHealthServer(0);
  await new Promise<void>((resolve) => {
    server.once('listening', resolve);
  });
  const addr = server.address() as AddressInfo;
  baseUrl = `http://127.0.0.1:${addr.port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve, reject) => {
    server.close((err) => (err ? reject(err) : resolve()));
  });
});

describe('health server', () => {
  describe('GET /healthz', () => {
    it('returns 200 with healthy status', async () => {
      const res = await fetch(`${baseUrl}/healthz`);

      expect(res.status).toBe(200);
      expect(res.headers.get('content-type')).toBe('application/json');

      const body = (await res.json()) as {
        status: string;
        timestamp: string;
        uptime: number;
      };
      expect(body.status).toBe('healthy');
      expect(body.timestamp).toBeDefined();
      expect(body.uptime).toBeTypeOf('number');
    });
  });

  describe('GET /readyz', () => {
    it('returns 200 when producer is connected', async () => {
      vi.mocked(isProducerConnected).mockReturnValue(true);

      const res = await fetch(`${baseUrl}/readyz`);

      expect(res.status).toBe(200);

      const body = (await res.json()) as { status: string };
      expect(body.status).toBe('ready');
    });

    it('returns 503 when producer is not connected', async () => {
      vi.mocked(isProducerConnected).mockReturnValue(false);

      const res = await fetch(`${baseUrl}/readyz`);

      expect(res.status).toBe(503);

      const body = (await res.json()) as { status: string; error: string };
      expect(body.status).toBe('not ready');
      expect(body.error).toBe('kafka producer not connected');
    });
  });

  describe('GET /metrics', () => {
    it('returns 200 with prometheus metrics content', async () => {
      const res = await fetch(`${baseUrl}/metrics`);

      expect(res.status).toBe(200);
      expect(res.headers.get('content-type')).toBe(
        'text/plain; version=0.0.4; charset=utf-8'
      );

      const body = await res.text();
      expect(body).toContain('# HELP test_metric');
    });
  });

  describe('unknown routes', () => {
    it('returns 404 for unknown paths', async () => {
      const res = await fetch(`${baseUrl}/unknown`);

      expect(res.status).toBe(404);
    });

    it('returns 404 for POST to /healthz', async () => {
      const res = await fetch(`${baseUrl}/healthz`, { method: 'POST' });

      expect(res.status).toBe(404);
    });
  });
});

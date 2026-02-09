import { createServer } from 'node:http';
import { register } from './metrics.js';
import { isProducerConnected } from './kafka/client.js';
import logger from './logger.js';

/**
 * Start HTTP health check server for Docker/Kubernetes probes
 *
 * Responds to GET /healthz with 200 OK and JSON status. Used for:
 * - Docker health checks (HEALTHCHECK instruction)
 * - Kubernetes liveness probes
 * - Load balancer health verification
 *
 * @param port - Port to listen on (default: 3000)
 * @returns HTTP server instance (call .close() to stop)
 * @example
 * const server = startHealthServer(3000);
 * // Server now responds to: curl http://localhost:3000/healthz
 */
export function startHealthServer(port = 3000) {
  const server = createServer((req, res) => {
    if (req.url === '/healthz' && req.method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          status: 'healthy',
          timestamp: new Date().toISOString(),
          uptime: process.uptime(),
        })
      );
    } else if (req.url === '/readyz' && req.method === 'GET') {
      const ready = isProducerConnected();
      const status = ready ? 200 : 503;
      res.writeHead(status, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          status: ready ? 'ready' : 'not ready',
          ...(ready ? {} : { error: 'kafka producer not connected' }),
        })
      );
    } else if (req.url === '/metrics' && req.method === 'GET') {
      register
        .metrics()
        .then((body) => {
          res.writeHead(200, { 'Content-Type': register.contentType });
          res.end(body);
        })
        .catch((err) => {
          res.writeHead(500);
          res.end(String(err));
        });
    } else {
      res.writeHead(404);
      res.end();
    }
  });

  server.headersTimeout = 10000;
  server.requestTimeout = 10000;
  server.keepAliveTimeout = 30000;

  server.listen(port, () => {
    logger.info({ port }, 'Health check server listening');
  });

  return server;
}

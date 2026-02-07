import { createServer } from 'http';
import logger from './logger.js';

/**
 * Simple HTTP health check server for Docker health checks
 * Responds to GET /health with 200 OK
 */
export function startHealthServer(port = 3000) {
  const server = createServer((req, res) => {
    if (req.url === '/health' && req.method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          status: 'healthy',
          timestamp: new Date().toISOString(),
          uptime: process.uptime(),
        })
      );
    } else {
      res.writeHead(404);
      res.end();
    }
  });

  server.listen(port, () => {
    logger.info({ port }, 'Health check server listening');
  });

  return server;
}

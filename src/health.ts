// src/health.ts
import { createServer } from 'http';

/**
 * Simple HTTP health check server for Docker health checks
 * Responds to GET / with 200 OK
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
    console.log(`Health check server listening on port ${port}`);
  });

  return server;
}

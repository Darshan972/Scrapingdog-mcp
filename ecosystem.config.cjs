// pm2 app for the hosted MCP server.
//
//   pm2 start ecosystem.config.cjs
//   pm2 reload ecosystem.config.cjs --update-env   (zero-downtime, used by CI)
//
// Cluster mode is safe here because the server is stateless: no session map, no
// shared memory between requests, so any worker can answer any call. The only
// per-process state is the api-key verdict cache in src/auth.ts, which is just a
// cache - a cold worker re-checks the key once.
module.exports = {
  apps: [
    {
      name: 'scrapingdog-mcp',
      script: 'dist/http.js',
      instances: 2,
      exec_mode: 'cluster',
      // Bound to loopback: nginx is the only way in. See src/http.ts.
      env: {
        NODE_ENV: 'production',
        HOST: '127.0.0.1',
        PORT: 8731,
      },
      max_memory_restart: '400M',
      // A tool call can run ~90s. Give in-flight scrapes time to finish on
      // reload instead of killing them and handing callers a 502.
      kill_timeout: 20000,
      // Don't declare the worker up until it is actually listening.
      wait_ready: false,
      listen_timeout: 10000,
      autorestart: true,
      // Guard against a crash loop hammering the API in a tight circle.
      min_uptime: '20s',
      max_restarts: 10,
      merge_logs: true,
      time: true,
    },
  ],
};

# Scrapingdog MCP Server

The [Model Context Protocol](https://modelcontextprotocol.io) server for the
[Scrapingdog](https://www.scrapingdog.com) APIs, hosted at **`https://mcp.scrapingdog.com/mcp`**.

It gives an AI assistant 35 tools for live web data — Google SERPs, Maps, News, Shopping, Lens,
Amazon, LinkedIn, YouTube, X, Walmart, eBay, screenshots and a general-purpose scraper — each
backed by the corresponding Scrapingdog endpoint.

There is nothing to install. Point your client at the URL and send your own API key.

## Connect

Get an API key from the [Scrapingdog dashboard](https://www.scrapingdog.com), then:

**Claude Code**

```bash
claude mcp add --transport http scrapingdog https://mcp.scrapingdog.com/mcp \
  --header "Authorization: Bearer YOUR_API_KEY"
```

**Cursor / Windsurf / any client with an `mcp.json`**

```json
{
  "mcpServers": {
    "scrapingdog": {
      "url": "https://mcp.scrapingdog.com/mcp",
      "headers": { "Authorization": "Bearer YOUR_API_KEY" }
    }
  }
}
```

**claude.ai** — Settings → Connectors → Add custom connector, URL
`https://mcp.scrapingdog.com/mcp`, authentication "API key", paste your key.

**Check it by hand**

```bash
curl -s https://mcp.scrapingdog.com/mcp \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'
```

Calls are billed to the key you send, at the same credit cost as the REST API. A tool's
description states what it costs.

## How it works

```
MCP client ──Authorization: Bearer <key>──> mcp.scrapingdog.com ──api_key=<key>──> api.scrapingdog.com
```

The server is **stateless**: every request builds its own MCP server and transport from the key on
that request and tears them down with the response. One process serves many customers without a
session map, so a key never outlives the request it came on and cannot leak into another caller's
session. `npm run smoke` asserts exactly that, among other things.

Keys are verified against Scrapingdog's own `/account` endpoint (which resolves user keys and team
member keys, and costs no credits), cached briefly. If that check is unreachable the request is let
through, because the API itself still enforces the key on every tool call — an outage in the
verifier must not take the whole MCP surface down. No database credentials are needed anywhere in
this service.

## Layout

| Path | What it is |
| --- | --- |
| `src/endpoints.ts` | The 35 endpoints, declared. **Adding an API means appending one object here** — no handler code. |
| `src/server.ts` | Builds the MCP server and derives each tool's schema from that registry |
| `src/client.ts` | The HTTP client for api.scrapingdog.com |
| `src/auth.ts` | API-key verification and caching |
| `src/http.ts` | The hosted entry point (Streamable HTTP) |
| `src/index.ts` | A stdio entry point, for local development only |
| `deploy/nginx/` | The `mcp.scrapingdog.com` vhost |
| `ecosystem.config.cjs` | pm2 app definition |
| `scripts/smoke.mjs` | Pre-deploy checks against a stubbed API |

## Local development

```bash
npm ci
npm run build
npm run smoke          # stubs the API: no key needed, no credits spent

npm run dev            # the HTTP server on http://127.0.0.1:8731/mcp
SCRAPINGDOG_API_KEY=... npm run dev:stdio   # stdio, for poking at one tool
```

Inspect it interactively:

```bash
npx @modelcontextprotocol/inspector
# transport: Streamable HTTP, url: http://127.0.0.1:8731/mcp,
# header: Authorization: Bearer <your key>
```

Settings live in `.env.example`.

## Deploying

Pushing to `main` typechecks, builds, runs the smoke suite, and only then rolls out to the
production boxes with `pm2 reload` (see `.github/workflows/deploy.yml`). The health check requires
`/healthz` to answer 200 **and** an unauthenticated `POST /mcp` to answer 401, so a deploy that
accidentally opened the gateway fails instead of going green.

First time on a box:

```bash
sudo cp deploy/nginx/mcp.scrapingdog.com.conf /etc/nginx/sites-available/
sudo ln -s /etc/nginx/sites-available/mcp.scrapingdog.com.conf /etc/nginx/sites-enabled/
sudo certbot --nginx -d mcp.scrapingdog.com
sudo nginx -t && sudo systemctl reload nginx
pm2 start ecosystem.config.cjs && pm2 save
```

The app binds `127.0.0.1` so nginx is the only route in. Don't change that on a public host: the
key check lives in this process, so an exposed port is an open proxy to the API.

## License

MIT

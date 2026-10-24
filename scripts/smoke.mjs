#!/usr/bin/env node
/**
 * Pre-deploy smoke test for the hosted server. Run with `npm run smoke` after
 * `npm run build`; CI runs it before touching any box.
 *
 * It stands up a stub of api.scrapingdog.com and points the built server at it,
 * so nothing here calls the real API, spends a credit, or needs a real key.
 *
 * Checks, in order of how much they would cost to get wrong:
 *   1. an unauthenticated POST is refused              (an open gateway)
 *   2. an unknown key is refused                        (anyone scrapes for free)
 *   3. a valid key lists every tool and can call one    (the service works at all)
 *   4. two keys in parallel never cross over            (one customer billed for another)
 */
import http from 'node:http';
import { spawn } from 'node:child_process';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

const STUB_PORT = 8744;
const MCP_PORT = 8745;
const KEY_A = 'a'.repeat(24);
const KEY_B = 'b'.repeat(24);
const MCP_URL = `http://127.0.0.1:${MCP_PORT}/mcp`;

let failures = 0;
const check = (ok, label, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures++;
};

// --- stub api.scrapingdog.com ------------------------------------------------
// /account knows two keys; every scrape endpoint echoes the key it was given so
// a crossover between callers would be visible in the result.
const stub = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  const key = url.searchParams.get('api_key');
  if (url.pathname === '/account') {
    if (key !== KEY_A && key !== KEY_B) {
      res.writeHead(404, { 'content-type': 'application/json' });
      return res.end('{"message":"User not found","success":false}');
    }
    res.writeHead(200, { 'content-type': 'application/json' });
    return res.end('{"pack":"pro","success":true}');
  }
  res.writeHead(200, { 'content-type': 'application/json' });
  res.end(JSON.stringify({ sawKey: key, path: url.pathname }));
});
await new Promise((r) => stub.listen(STUB_PORT, '127.0.0.1', r));

// --- the built server, pointed at the stub -----------------------------------
const server = spawn(process.execPath, ['dist/http.js'], {
  env: {
    ...process.env,
    PORT: String(MCP_PORT),
    HOST: '127.0.0.1',
    SCRAPINGDOG_API_BASE: `http://127.0.0.1:${STUB_PORT}`,
  },
  stdio: ['ignore', 'pipe', 'pipe'],
});
server.stdout.on('data', () => {});
server.stderr.on('data', () => {});

const deadline = Date.now() + 15_000;
for (;;) {
  try {
    const r = await fetch(`http://127.0.0.1:${MCP_PORT}/healthz`);
    if (r.ok) break;
  } catch { /* not up yet */ }
  if (Date.now() > deadline) {
    console.error('server never became healthy');
    server.kill('SIGKILL');
    process.exit(1);
  }
  await new Promise((r) => setTimeout(r, 250));
}

const connect = async (key) => {
  const transport = new StreamableHTTPClientTransport(new URL(MCP_URL), {
    requestInit: { headers: { authorization: `Bearer ${key}` } },
  });
  const client = new Client({ name: 'smoke', version: '0' });
  await client.connect(transport);
  return client;
};

try {
  // 1. no credentials
  const anon = await fetch(MCP_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: '{}',
  });
  check(anon.status === 401, 'unauthenticated POST /mcp is refused', `got ${anon.status}`);

  // 2. a key the API does not know
  const bad = await fetch(MCP_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${'z'.repeat(24)}` },
    body: '{}',
  });
  check(bad.status === 401, 'unknown API key is refused', `got ${bad.status}`);

  // 3. the happy path
  const client = await connect(KEY_A);
  const { tools } = await client.listTools();
  check(tools.length > 0, 'tools are listed', `${tools.length} tools`);
  const named = tools.find((t) => t.name === 'google_search');
  check(Boolean(named), 'google_search is present');
  const out = await client.callTool({ name: 'google_search', arguments: { query: 'scrapingdog' } });
  const body = JSON.parse(out.content[0].text);
  check(body.sawKey === KEY_A, 'a tool call reaches the API with the caller\'s key');
  check(body.path === '/google', 'google_search hits /google', body.path);
  await client.close();

  // 4. isolation: the property that makes one process safe for many customers
  const hammer = async (key, n) => {
    const c = await connect(key);
    const seen = new Set();
    for (let i = 0; i < n; i++) {
      const r = await c.callTool({ name: 'google_search', arguments: { query: `q${i}` } });
      seen.add(JSON.parse(r.content[0].text).sawKey);
    }
    await c.close();
    return [...seen];
  };
  const [seenA, seenB] = await Promise.all([hammer(KEY_A, 10), hammer(KEY_B, 10)]);
  check(
    seenA.length === 1 && seenA[0] === KEY_A && seenB.length === 1 && seenB[0] === KEY_B,
    'two concurrent callers never share a key',
    `a saw ${seenA.length}, b saw ${seenB.length}`,
  );
} catch (err) {
  console.error('smoke test threw:', err);
  failures++;
} finally {
  server.kill('SIGKILL');
  stub.close();
}

console.log(failures ? `\n${failures} check(s) failed` : '\nall checks passed');
process.exit(failures ? 1 : 0);

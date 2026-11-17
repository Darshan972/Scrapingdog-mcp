/**
 * The hosted Scrapingdog MCP server (mcp.scrapingdog.com).
 *
 * Users point any MCP client at https://mcp.scrapingdog.com/mcp and send their
 * own Scrapingdog key as `Authorization: Bearer <api_key>`. Nothing to install.
 *
 * Deliberately STATELESS (`sessionIdGenerator: undefined`): a fresh McpServer and
 * transport are built per POST and closed when the response ends. That is what
 * makes one process safe for many customers — a key cannot outlive the request it
 * arrived on, there is no session map to leak one caller's key into another's
 * session, and nothing is lost when a pm2 worker restarts mid-deploy.
 *
 * Plain node:http on purpose: the SDK transport speaks raw req/res, so the whole
 * service needs no web framework.
 *
 * Binds 127.0.0.1 by default — nginx terminates TLS and proxies in. Never bind
 * 0.0.0.0 on a public box: the key check lives in this process, so an exposed
 * port is an open proxy to it.
 */

import http from "node:http";

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";

import { SUPPORTED_PROTOCOL_VERSIONS } from "@modelcontextprotocol/sdk/types.js";

import { createServer, SERVER_NAME, SERVER_VERSION } from "./server.js";
import { verifyApiKey, keyTail } from "./auth.js";

const PORT = Number(process.env.PORT ?? 8731);
const HOST = process.env.HOST ?? "127.0.0.1";
const MAX_BODY_BYTES = Number(process.env.MCP_MAX_BODY_BYTES ?? 4 * 1024 * 1024);

interface LogRow {
  what: string;
  key?: string;
  status: number;
  ms: number;
}

/** One line per request. No key material, no payloads — both end up in log aggregators. */
function log(row: LogRow): void {
  console.log(JSON.stringify({ at: new Date().toISOString(), ...row }));
}

function json(res: http.ServerResponse, status: number, body: unknown): void {
  const text = JSON.stringify(body);
  res.writeHead(status, { "content-type": "application/json", "content-length": Buffer.byteLength(text) });
  res.end(text);
}

/**
 * Browser-based MCP clients preflight before posting. Credentials travel in the
 * Authorization header rather than a cookie, so a wildcard origin is safe: a
 * hostile page still cannot read a key it does not already hold.
 */
function setCors(res: http.ServerResponse): void {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader(
    "Access-Control-Allow-Headers",
    "authorization, content-type, mcp-protocol-version, mcp-session-id, last-event-id",
  );
  res.setHeader("Access-Control-Allow-Methods", "POST, GET, DELETE, OPTIONS");
  res.setHeader("Access-Control-Expose-Headers", "mcp-session-id, www-authenticate");
  res.setHeader("Access-Control-Max-Age", "86400");
}

function bearer(req: http.IncomingMessage): string | undefined {
  const header = req.headers.authorization ?? "";
  const token = /^Bearer\s+(.+)$/i.exec(header)?.[1]?.trim();
  return token ? token : undefined;
}

/** Reads the JSON body, refusing anything oversized before it is buffered whole. */
async function readJsonBody(req: http.IncomingMessage): Promise<unknown> {
  const declared = Number(req.headers["content-length"] ?? 0);
  if (declared > MAX_BODY_BYTES) throw new Error("payload_too_large");

  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    const buf = chunk as Buffer;
    size += buf.length;
    if (size > MAX_BODY_BYTES) throw new Error("payload_too_large");
    chunks.push(buf);
  }
  if (!chunks.length) return undefined;
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

/** The method/tool being called, for the log line. Arguments are never logged. */
function describeCall(body: unknown): string {
  const rpc = body as { method?: string; params?: { name?: string } } | undefined;
  if (rpc?.method === "tools/call" && rpc.params?.name) return `tools/call:${rpc.params.name}`;
  return rpc?.method ?? "unknown";
}

async function handleMcpPost(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
  const startedAt = Date.now();

  const apiKey = bearer(req);
  if (!apiKey) {
    res.setHeader("WWW-Authenticate", `Bearer realm="${SERVER_NAME}"`);
    json(res, 401, {
      error: "missing_api_key",
      message:
        "Send your Scrapingdog API key as 'Authorization: Bearer <api_key>'. " +
        "Get one at https://www.scrapingdog.com/.",
    });
    log({ what: "auth", status: 401, ms: Date.now() - startedAt });
    return;
  }

  let body: unknown;
  try {
    body = await readJsonBody(req);
  } catch (err) {
    const tooBig = (err as Error).message === "payload_too_large";
    json(res, tooBig ? 413 : 400, {
      error: tooBig ? "payload_too_large" : "invalid_json",
      message: tooBig ? `Request body exceeds ${MAX_BODY_BYTES} bytes.` : "Request body is not valid JSON.",
    });
    log({ what: "body", key: keyTail(apiKey), status: tooBig ? 413 : 400, ms: Date.now() - startedAt });
    return;
  }

  const what = describeCall(body);

  // claude.ai opens every connection under MCP revision 2026-07-28, which no
  // released SDK knows (1.32.2, the latest, tops out at 2025-11-25). The SDK
  // rejects an unrecognised version outright with 400, so the connector's first
  // call dies before it reaches us and the UI reports the server as unreachable.
  //
  // Dropping the header is what the SDK itself does for a request that omits it:
  // fall back to the negotiated default. We lose nothing, because we implement
  // no 2026-07-28 feature anyway - the wire format for what we do serve is
  // unchanged. Revisit once an SDK ships that version and this can go.
  const claimed = req.headers["mcp-protocol-version"];
  if (typeof claimed === "string" && !SUPPORTED_PROTOCOL_VERSIONS.includes(claimed)) {
    delete req.headers["mcp-protocol-version"];
    // The SDK's node adapter rebuilds the request from rawHeaders and never
    // reads .headers, so dropping it from one and not the other changes
    // nothing. Both have to lose the pair.
    const raw = req.rawHeaders;
    const kept: string[] = [];
    for (let i = 0; i < raw.length; i += 2) {
      if (raw[i]?.toLowerCase() !== "mcp-protocol-version") kept.push(raw[i], raw[i + 1]);
    }
    req.rawHeaders = kept;
  }

  const verdict = await verifyApiKey(apiKey);
  if (!verdict.ok) {
    res.setHeader("WWW-Authenticate", `Bearer realm="${SERVER_NAME}", error="invalid_token"`);
    json(res, verdict.status, { error: verdict.code, message: verdict.message });
    log({ what, key: keyTail(apiKey), status: verdict.status, ms: Date.now() - startedAt });
    return;
  }

  // Part of the same revision: a probe the SDK has no handler for. Letting it
  // through produces a transport-level 400, which clients read as a dead
  // session rather than "method I do not have" - so answer it the way JSON-RPC
  // says to. A notification (no id) gets 202 and no body, per spec.
  if (what === "server/discover") {
    const id = (body as { id?: string | number | null } | undefined)?.id;
    if (id === undefined || id === null) {
      res.writeHead(202).end();
    } else {
      json(res, 200, {
        jsonrpc: "2.0",
        id,
        error: { code: -32601, message: "Method not found: server/discover" },
      });
    }
    log({ what, key: keyTail(apiKey), status: res.statusCode, ms: Date.now() - startedAt });
    return;
  }

  let server: McpServer | undefined;
  let transport: StreamableHTTPServerTransport | undefined;
  try {
    server = createServer({ apiKey });
    transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
    // Both are per-request, so they must go when the response does. Without this
    // every call leaks a transport and its listeners.
    res.on("close", () => {
      void transport?.close();
      void server?.close();
    });
    await server.connect(transport);
    await transport.handleRequest(req, res, body);
    log({ what, key: keyTail(apiKey), status: res.statusCode, ms: Date.now() - startedAt });
  } catch (err) {
    console.error(`[${SERVER_NAME}] request failed:`, err);
    if (!res.headersSent) {
      json(res, 500, { jsonrpc: "2.0", error: { code: -32603, message: "Internal server error" }, id: null });
    }
    log({ what, key: keyTail(apiKey), status: 500, ms: Date.now() - startedAt });
  }
}

const httpServer = http.createServer((req, res) => {
  setCors(res);
  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  const path = new URL(req.url ?? "/", "http://localhost").pathname;

  if (path === "/healthz") {
    json(res, 200, { ok: true, server: SERVER_NAME, version: SERVER_VERSION });
    return;
  }

  if (path === "/mcp") {
    if (req.method === "POST") {
      void handleMcpPost(req, res);
      return;
    }
    // Stateless mode serves no standalone SSE stream and keeps no session to
    // delete, so answer plainly instead of letting a client hang on a GET.
    json(res, 405, {
      jsonrpc: "2.0",
      error: { code: -32000, message: "This server is stateless; use POST /mcp." },
      id: null,
    });
    return;
  }

  json(res, 404, { error: "not_found", message: "Try POST /mcp" });
});

// Scrapes can take ~90s; the default 2-minute socket timeout would cut the
// longest of them off mid-flight.
httpServer.requestTimeout = Number(process.env.MCP_REQUEST_TIMEOUT_MS ?? 180_000);
httpServer.headersTimeout = 65_000;
httpServer.keepAliveTimeout = 61_000;

httpServer.listen(PORT, HOST, () => {
  console.error(`${SERVER_NAME} MCP server v${SERVER_VERSION} listening on http://${HOST}:${PORT}/mcp`);
});

// pm2 reload sends SIGINT then SIGKILL; let in-flight scrapes finish first.
for (const signal of ["SIGTERM", "SIGINT"] as const) {
  process.on(signal, () => {
    httpServer.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 15_000).unref();
  });
}

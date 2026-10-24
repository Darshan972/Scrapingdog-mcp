/**
 * API-key verification for the hosted server.
 *
 * Keys are checked against Scrapingdog's own /account endpoint, which resolves
 * both a User._id and a Team member key and costs no credits. No database
 * credentials are needed, so this process stays stateless and can run anywhere.
 *
 * Verdicts are cached because one MCP session is many HTTP requests (initialize,
 * tools/list, then every tool call), and each would otherwise re-check the same
 * key. A short TTL keeps a revoked or exhausted key from working for long.
 *
 * On a validator failure the request is allowed through ("fail open"). This is
 * deliberate: the gateway's check only exists to return one clean 401 instead of
 * N confusing tool errors. The real enforcement is the API itself, which gets the
 * key on every tool call and rejects it there, so an outage here must not take
 * the whole MCP surface down with it.
 */

const API_BASE = process.env.SCRAPINGDOG_API_BASE ?? "https://api.scrapingdog.com";
const POSITIVE_TTL_MS = Number(process.env.MCP_AUTH_POSITIVE_TTL_MS ?? 5 * 60_000);
const NEGATIVE_TTL_MS = Number(process.env.MCP_AUTH_NEGATIVE_TTL_MS ?? 60_000);
const VALIDATE_TIMEOUT_MS = Number(process.env.MCP_AUTH_TIMEOUT_MS ?? 5_000);
const MAX_CACHE_ENTRIES = 10_000;

export type Verdict =
  | { ok: true; cached: boolean }
  | { ok: false; status: number; code: string; message: string };

interface CacheRow {
  expiresAt: number;
  verdict: Verdict;
}

const cache = new Map<string, CacheRow>();

/** Last 4 characters only — enough to correlate logs, useless if the logs leak. */
export function keyTail(apiKey: string): string {
  return apiKey.length <= 4 ? "****" : `…${apiKey.slice(-4)}`;
}

function remember(apiKey: string, verdict: Verdict, ttl: number): void {
  // Oldest-first eviction: Map preserves insertion order, so the first key is
  // the least recently written.
  if (cache.size >= MAX_CACHE_ENTRIES) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
  cache.set(apiKey, { expiresAt: Date.now() + ttl, verdict });
}

export async function verifyApiKey(apiKey: string): Promise<Verdict> {
  const hit = cache.get(apiKey);
  if (hit && hit.expiresAt > Date.now()) {
    return hit.verdict.ok ? { ok: true, cached: true } : hit.verdict;
  }
  cache.delete(apiKey);

  const url = new URL("/account", API_BASE);
  url.searchParams.set("api_key", apiKey);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), VALIDATE_TIMEOUT_MS);
  let response: Response;
  try {
    response = await fetch(url, { headers: { accept: "application/json" }, signal: controller.signal });
  } catch {
    // Fail open — see the note at the top of this file.
    return { ok: true, cached: false };
  } finally {
    clearTimeout(timer);
  }

  if (response.ok) {
    const verdict: Verdict = { ok: true, cached: false };
    remember(apiKey, verdict, POSITIVE_TTL_MS);
    return verdict;
  }

  // 400 = malformed key, 404 = no such account. Anything else is the API having
  // a bad time rather than a verdict on this key, so do not cache it as a denial.
  if (response.status === 400 || response.status === 404) {
    const verdict: Verdict = {
      ok: false,
      status: 401,
      code: "invalid_api_key",
      message:
        "This Scrapingdog API key was not recognised. Check it in your dashboard at " +
        "https://api.scrapingdog.com/billing or get one at https://www.scrapingdog.com/.",
    };
    remember(apiKey, verdict, NEGATIVE_TTL_MS);
    return verdict;
  }

  return { ok: true, cached: false };
}

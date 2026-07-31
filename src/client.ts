/**
 * Thin HTTP client for the Scrapingdog API.
 *
 * The API key is resolved from the SCRAPINGDOG_API_KEY environment variable so
 * it never has to travel through individual tool-call arguments (keeping it out
 * of model context, transcripts and logs).
 */

import type { Endpoint } from "./types.js";

const API_BASE = process.env.SCRAPINGDOG_API_BASE ?? "https://api.scrapingdog.com";
const DEFAULT_TIMEOUT_MS = Number(process.env.SCRAPINGDOG_TIMEOUT_MS ?? 90_000);

export function getApiKey(): string | undefined {
  const key = process.env.SCRAPINGDOG_API_KEY;
  return key && key.trim() ? key.trim() : undefined;
}

export interface TextResult {
  kind: "text";
  contentType: string | null;
  body: string;
}

export interface BinaryResult {
  kind: "binary";
  contentType: string;
  base64: string;
}

export type ScrapingdogResult = TextResult | BinaryResult;

export class ScrapingdogError extends Error {
  constructor(message: string, readonly status?: number, readonly body?: string) {
    super(message);
    this.name = "ScrapingdogError";
  }
}

/**
 * Build the fully-qualified request URL for an endpoint, injecting the API key
 * and serializing the provided arguments as query parameters. `undefined`,
 * `null` and empty-string values are dropped; booleans become "true"/"false".
 */
export function buildUrl(endpoint: Endpoint, args: Record<string, unknown>, apiKey: string): string {
  const url = new URL(API_BASE + endpoint.path);
  url.searchParams.set("api_key", apiKey);

  for (const param of endpoint.params) {
    const value = args[param.name];
    if (value === undefined || value === null || value === "") continue;
    url.searchParams.set(param.name, typeof value === "boolean" ? String(value) : String(value));
  }
  return url.toString();
}

export async function callEndpoint(
  endpoint: Endpoint,
  args: Record<string, unknown>,
  apiKey: string,
): Promise<ScrapingdogResult> {
  const url = buildUrl(endpoint, args, apiKey);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(url, {
      method: "GET",
      headers: { Accept: endpoint.binary ? "*/*" : "application/json, text/plain, */*" },
      signal: controller.signal,
    });
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      throw new ScrapingdogError(`Request timed out after ${DEFAULT_TIMEOUT_MS}ms`);
    }
    throw new ScrapingdogError(`Network error: ${(err as Error).message}`);
  } finally {
    clearTimeout(timeout);
  }

  const contentType = response.headers.get("content-type");

  if (!response.ok) {
    const body = await safeText(response);
    throw new ScrapingdogError(
      `Scrapingdog API returned HTTP ${response.status} ${response.statusText}`,
      response.status,
      body,
    );
  }

  if (endpoint.binary || (contentType && contentType.startsWith("image/"))) {
    const buffer = Buffer.from(await response.arrayBuffer());
    return { kind: "binary", contentType: contentType ?? "image/png", base64: buffer.toString("base64") };
  }

  return { kind: "text", contentType, body: await response.text() };
}

async function safeText(response: Response): Promise<string> {
  try {
    return (await response.text()).slice(0, 2000);
  } catch {
    return "";
  }
}

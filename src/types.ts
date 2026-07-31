/**
 * Shared types for the Scrapingdog MCP server.
 *
 * Every Scrapingdog product is described declaratively as an {@link Endpoint}.
 * Adding a new API is a matter of appending one object to the registry in
 * `endpoints.ts` — no handler code required.
 */

export type ParamType = "string" | "number" | "boolean";

export interface EndpointParam {
  /** Exact query-string parameter name expected by the Scrapingdog API. */
  name: string;
  type: ParamType;
  /** Whether the Scrapingdog API rejects the request when this is absent. */
  required?: boolean;
  /** Human/LLM-facing description surfaced in the tool's input schema. */
  description: string;
  /** Restrict string values to a fixed set. */
  enum?: string[];
  /** Documentation-only hint about the API's default when omitted. */
  default?: string;
}

export interface Endpoint {
  /** MCP tool name (snake_case, must be unique across the registry). */
  tool: string;
  /** Short human-readable title. */
  title: string;
  /** Path appended to the API base, e.g. "/scrape" or "/amazon/search". */
  path: string;
  /** Tool description shown to the model. */
  description: string;
  params: EndpointParam[];
  /**
   * Set for endpoints that return raw bytes (e.g. the Screenshot API) rather
   * than JSON/text so the response is returned as an image content block.
   */
  binary?: boolean;
  /**
   * When true, the path and/or params were inferred from Scrapingdog's naming
   * convention rather than confirmed against the published docs, and should be
   * validated against the live API. Surfaced by `npm run list:unverified`.
   */
  verify?: boolean;
}

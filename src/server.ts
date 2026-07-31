/**
 * Builds the MCP server and registers one tool per Scrapingdog endpoint,
 * deriving each tool's input schema from the declarative registry.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z, type ZodRawShape, type ZodTypeAny } from "zod";

import { ENDPOINTS } from "./endpoints.js";
import { callEndpoint, getApiKey, ScrapingdogError } from "./client.js";
import type { Endpoint, EndpointParam } from "./types.js";

export const SERVER_NAME = "scrapingdog";
export const SERVER_VERSION = "0.1.0";

function baseSchema(param: EndpointParam): ZodTypeAny {
  if (param.type === "boolean") return z.boolean();
  if (param.type === "number") return z.number();
  if (param.enum && param.enum.length > 0) {
    return z.enum(param.enum as [string, ...string[]]);
  }
  return z.string();
}

function buildInputSchema(endpoint: Endpoint): ZodRawShape {
  const shape: ZodRawShape = {};
  for (const param of endpoint.params) {
    let schema = baseSchema(param);
    const suffix = param.default !== undefined ? ` (API default: ${param.default})` : "";
    schema = schema.describe(param.description + suffix);
    shape[param.name] = param.required ? schema : schema.optional();
  }
  return shape;
}

function formatError(err: unknown): string {
  if (err instanceof ScrapingdogError) {
    const parts = [err.message];
    if (err.body) parts.push(`\nResponse body:\n${err.body}`);
    return parts.join("");
  }
  return err instanceof Error ? err.message : String(err);
}

export function createServer(): McpServer {
  const server = new McpServer({ name: SERVER_NAME, version: SERVER_VERSION });

  for (const endpoint of ENDPOINTS) {
    server.registerTool(
      endpoint.tool,
      {
        title: endpoint.title,
        description: endpoint.description,
        inputSchema: buildInputSchema(endpoint),
      },
      async (args: Record<string, unknown>) => {
        const apiKey = getApiKey();
        if (!apiKey) {
          return {
            isError: true,
            content: [
              {
                type: "text" as const,
                text: "SCRAPINGDOG_API_KEY is not set. Add it to the MCP server's environment (get a key at https://www.scrapingdog.com/).",
              },
            ],
          };
        }

        try {
          const result = await callEndpoint(endpoint, args, apiKey);
          if (result.kind === "binary") {
            return {
              content: [{ type: "image" as const, data: result.base64, mimeType: result.contentType }],
            };
          }
          return { content: [{ type: "text" as const, text: result.body }] };
        } catch (err) {
          return { isError: true, content: [{ type: "text" as const, text: formatError(err) }] };
        }
      },
    );
  }

  return server;
}

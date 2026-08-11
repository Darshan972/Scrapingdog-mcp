import assert from "node:assert/strict";
import { createServer } from "node:http";
import { after, before, describe, test } from "node:test";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

describe("YouTube search tool", () => {
  let apiServer;
  let apiBase;
  let requestedUrl;

  before(async () => {
    apiServer = createServer((request, response) => {
      requestedUrl = new URL(request.url, apiBase);
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify({ video_results: [{ title: "MCP test result" }] }));
    });

    await new Promise((resolve, reject) => {
      apiServer.once("error", reject);
      apiServer.listen(0, "127.0.0.1", resolve);
    });

    const address = apiServer.address();
    assert(address && typeof address === "object");
    apiBase = `http://127.0.0.1:${address.port}`;
  });

  after(async () => {
    await new Promise((resolve, reject) => {
      apiServer.close((error) => (error ? reject(error) : resolve()));
    });
  });

  test("calls the JSON search endpoint through MCP stdio", async () => {
    const transport = new StdioClientTransport({
      command: process.execPath,
      args: ["dist/index.js"],
      cwd: process.cwd(),
      env: {
        SCRAPINGDOG_API_KEY: "test-api-key",
        SCRAPINGDOG_API_BASE: apiBase,
        SCRAPINGDOG_TIMEOUT_MS: "5000",
      },
      stderr: "pipe",
    });
    const client = new Client({ name: "scrapingdog-e2e-test", version: "1.0.0" });

    try {
      await client.connect(transport);
      const result = await client.callTool({
        name: "youtube_search",
        arguments: {
          search_query: "OpenAI",
          country: "us",
          language: "en",
        },
      });

      assert.equal(result.isError, undefined);
      assert.deepEqual(result.content, [
        {
          type: "text",
          text: JSON.stringify({ video_results: [{ title: "MCP test result" }] }),
        },
      ]);
      assert.equal(requestedUrl.pathname, "/youtube/search");
      assert.equal(requestedUrl.searchParams.get("search_query"), "OpenAI");
      assert.equal(requestedUrl.searchParams.get("country"), "us");
      assert.equal(requestedUrl.searchParams.get("language"), "en");
      assert.equal(requestedUrl.searchParams.get("api_key"), "test-api-key");
    } finally {
      await client.close();
    }
  });
});

# Scrapingdog MCP Server

A [Model Context Protocol](https://modelcontextprotocol.io) server that exposes the
[Scrapingdog](https://www.scrapingdog.com) web-scraping and SERP APIs as tools any
MCP-compatible client (Claude Desktop, Claude Code, Cursor, etc.) can call.

One tool per Scrapingdog product — general web scraping, the full Google family,
Amazon, Walmart, eBay, LinkedIn, X, YouTube, Bing, Baidu, and screenshots.

## Requirements

- Node.js ≥ 18
- A Scrapingdog API key — get one on your [dashboard](https://www.scrapingdog.com/).

## Install & build

```bash
npm install
npm run build
```

## Configuration

The server reads your API key from the **`SCRAPINGDOG_API_KEY`** environment
variable. It is never passed as a tool argument, so it stays out of the model's
context, transcripts, and logs.

| Variable | Required | Default | Description |
| --- | --- | --- | --- |
| `SCRAPINGDOG_API_KEY` | yes | — | Your Scrapingdog API key. |
| `SCRAPINGDOG_API_BASE` | no | `https://api.scrapingdog.com` | Override the API base URL. |
| `SCRAPINGDOG_TIMEOUT_MS` | no | `90000` | Per-request timeout in milliseconds. |

### Claude Desktop

Add to `claude_desktop_config.json`
(macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "scrapingdog": {
      "command": "node",
      "args": ["/absolute/path/to/ScrapingdogMCP/dist/index.js"],
      "env": {
        "SCRAPINGDOG_API_KEY": "your_api_key_here"
      }
    }
  }
}
```

### Claude Code

```bash
claude mcp add scrapingdog -e SCRAPINGDOG_API_KEY=your_api_key_here -- node /absolute/path/to/ScrapingdogMCP/dist/index.js
```

## Available tools

**36 tools.** Each tool's full parameter set (with descriptions and API
defaults) is generated from [`src/endpoints.ts`](src/endpoints.ts) and surfaced
to the client as the tool's input schema. Rows marked ⚠️ have a path/params
inferred from Scrapingdog's naming convention rather than confirmed against the
published docs — see [Unverified endpoints](#unverified-endpoints).

### General

| Tool | Scrapingdog endpoint | Key required args |
| --- | --- | --- |
| `web_scrape` | `/scrape` | `url` |

### Google family

| Tool | Scrapingdog endpoint | Key required args |
| --- | --- | --- |
| `google_search` | `/google` | `query` |
| `google_maps` | `/google_maps` | `query` |
| `google_news` | `/google_news/v2` | — (`query` or a `*_token`) |
| `google_trends` | `/google_trends` | `query` |
| `google_shopping` | `/google_shopping` | `query` |
| `google_scholar` | `/google_scholar` | `query` (or `cites`) |
| `google_jobs` | `/google_jobs` | `query` |
| `google_finance` | `/google_finance` | `query` |
| `google_lens` | `/google_lens` | `url` |
| `google_ai_mode` | `/google/ai_mode` | `query` |
| `google_ai_overview` | `/google/ai_overview` | `url` |
| `google_shorts` | `/google_shorts` | `query` |
| `google_hotels` | `/google_hotels` | `query`, `check_in_date`, `check_out_date` |
| `google_patents` | `/google_patents` | `query` |
| `google_immersive_product` | `/google_immersive_product` | `page_token` |
| `google_images` ⚠️ | `/google_images` | `query` |
| `google_light_search` ⚠️ | `/google_light` | `query` |

### E-commerce

| Tool | Scrapingdog endpoint | Key required args |
| --- | --- | --- |
| `amazon_search` | `/amazon/search` | `query`, `domain`, `page`, `country` |
| `amazon_product` ⚠️ | `/amazon/product` | `asin` |
| `amazon_reviews` ⚠️ | `/amazon/reviews` | `asin` |
| `amazon_offers` ⚠️ | `/amazon/offers` | `asin` |
| `walmart_search` | `/walmart/search` | `url` |
| `ebay_search` | `/ebay/search` | `url` |

### Social / professional

| Tool | Scrapingdog endpoint | Key required args |
| --- | --- | --- |
| `linkedin_profile` ⚠️ | `/linkedin` | `type`, `linkId` |
| `x_profile` | `/x/profile` | `profileId` |
| `youtube_search` | `/youtube` | `search_query` |
| `youtube_transcripts` ⚠️ | `/youtube/transcripts` | `v` |
| `youtube_video` ⚠️ | `/youtube/video` | `v` |
| `youtube_channel` ⚠️ | `/youtube/channel` | `channel_id` |
| `youtube_comments` ⚠️ | `/youtube/comments` | `v` |

### Other search engines

| Tool | Scrapingdog endpoint | Key required args |
| --- | --- | --- |
| `bing_search` | `/bing/search` | `query` |
| `baidu_search` | `/baidu/search` | `query` |
| `universal_search` | `/search` | `query` |

### AI / LLM & tools

| Tool | Scrapingdog endpoint | Key required args |
| --- | --- | --- |
| `chatgpt` | `/chatgpt` | `prompt` |
| `screenshot` | `/screenshot` | `url` (returns an image) |

## Unverified endpoints

The following tools were added for full coverage using Scrapingdog's standard
path convention, but the documentation fetcher could not confirm their exact
paths/params. Please validate them against the live API (a live smoke test with
a real key is the fastest way) and adjust `src/endpoints.ts` if needed:

```bash
npm run list:unverified
```

`amazon_product`, `amazon_reviews`, `amazon_offers`, `linkedin_profile`,
`youtube_transcripts`, `youtube_video`, `youtube_channel`, `youtube_comments`,
`google_images`, `google_light_search`.

Once confirmed, remove the `verify: true` flag from the corresponding entry.

## Adding or adjusting an endpoint

Every endpoint is a single declarative object in
[`src/endpoints.ts`](src/endpoints.ts) — no handler code to write. To add a
Scrapingdog product (e.g. Google Hotels, Patents, TikTok), append:

```ts
{
  tool: "google_hotels",
  title: "Google Hotels API",
  path: "/google_hotels",
  description: "…",
  params: [
    { name: "query", type: "string", required: true, description: "…" },
    // …
  ],
}
```

Rebuild with `npm run build`.

## Architecture

```
src/
  types.ts       Endpoint / EndpointParam type definitions
  endpoints.ts   Declarative registry of every Scrapingdog API
  client.ts      HTTP client: URL building, API-key resolution, error handling
  server.ts      Compiles each endpoint into an MCP tool + Zod input schema
  index.ts       stdio entry point
```

## License

MIT

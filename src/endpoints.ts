/**
 * Declarative registry of every Scrapingdog API exposed as an MCP tool.
 *
 * Base URL for all endpoints is https://api.scrapingdog.com (see client.ts).
 * `api_key` is injected automatically from the environment and is therefore
 * intentionally omitted from each endpoint's `params`.
 *
 * To add another Scrapingdog product, append an {@link Endpoint} object below.
 */

import type { Endpoint } from "./types.js";

// Reusable parameter fragments -------------------------------------------------

const COUNTRY = {
  name: "country",
  type: "string" as const,
  description: "Two-letter ISO country code to geo-target results (e.g. us, gb, in, de).",
  default: "us",
};

const LANGUAGE = {
  name: "language",
  type: "string" as const,
  description: "Result language code (e.g. en, es, fr, de).",
  default: "en",
};

const DOMAIN = {
  name: "domain",
  type: "string" as const,
  description: "Country-specific Google domain (e.g. google.co.uk, google.co.in).",
  default: "google.com",
};

export const ENDPOINTS: Endpoint[] = [
  // ------------------------------------------------------------------ Web scrape
  {
    tool: "web_scrape",
    title: "Web Scraping API",
    path: "/scrape",
    description:
      "General-purpose web scraper. Fetches any URL through Scrapingdog's rotating proxies with optional JavaScript rendering, premium proxies, geo-targeting, and AI-based extraction. Returns the page HTML (or extracted data).",
    params: [
      { name: "url", type: "string", required: true, description: "The absolute URL of the page to scrape." },
      { name: "dynamic", type: "boolean", description: "Set true to render JavaScript with a headless browser. Costs more credits.", default: "false" },
      { name: "premium", type: "boolean", description: "Set true to use premium (residential) proxies for hard-to-scrape sites.", default: "false" },
      { name: "country", type: "string", description: "Two-letter ISO country code for the proxy geo-location (requires premium).", default: "us" },
      { name: "wait", type: "number", description: "Milliseconds to wait after page load before capturing (only with dynamic=true)." },
      { name: "session_number", type: "number", description: "Reuse the same proxy IP across requests by passing a stable integer." },
      { name: "ai_query", type: "string", description: "Natural-language instruction to extract specific data from the page via AI." },
      { name: "ai_extract_rules", type: "string", description: "JSON string of field->instruction rules for structured AI extraction." },
      { name: "markdown", type: "boolean", description: "Return the page content converted to clean markdown instead of raw HTML.", default: "false" },
    ],
  },

  // -------------------------------------------------------------- Google family
  {
    tool: "google_search",
    title: "Google Search (SERP) API",
    path: "/google",
    description:
      "Scrape real-time Google Search results as structured JSON (organic results, ads, knowledge graph, people-also-ask, etc.).",
    params: [
      { name: "query", type: "string", required: true, description: "Search query. Supports operators like site:, inurl:, intitle:." },
      { name: "results", type: "number", description: "Number of results to return per page." },
      { name: "page", type: "number", description: "Zero-based page number (0 = first page).", default: "0" },
      DOMAIN,
      COUNTRY,
      LANGUAGE,
      { name: "location", type: "string", description: "Search origin location, ideally at city level. Incompatible with uule." },
      { name: "advance_search", type: "boolean", description: "Enable rich feature snippets (extra credits).", default: "false" },
      { name: "mob_search", type: "boolean", description: "Return mobile search results.", default: "false" },
      { name: "tbs", type: "string", description: "Advanced filter for time ranges / verbatim mode." },
      { name: "safe", type: "string", description: "Adult-content filter.", enum: ["active", "off"], default: "off" },
      { name: "html", type: "boolean", description: "Return the full HTML of the Google page instead of parsed JSON.", default: "false" },
    ],
  },
  {
    tool: "google_maps",
    title: "Google Maps API",
    path: "/google_maps",
    description: "Scrape local business listings and place details from Google Maps.",
    params: [
      { name: "query", type: "string", required: true, description: "Google Maps search query, e.g. 'pizza'." },
      { name: "ll", type: "string", description: "GPS origin as @latitude,longitude,zoom (e.g. @40.7,-74.0,14z). Required for pagination." },
      DOMAIN,
      LANGUAGE,
      COUNTRY,
      { name: "type", type: "string", description: "Result type.", enum: ["search", "place"] },
      { name: "place_id", type: "string", description: "Unique Google Maps place identifier (for place lookups)." },
      { name: "data", type: "string", description: "Google Maps 'data' filter string copied from a Maps URL." },
      { name: "page", type: "number", description: "Pagination offset; increment by 20. Requires ll.", default: "0" },
    ],
  },
  {
    tool: "google_news",
    title: "Google News API",
    path: "/google_news/v2",
    description: "Scrape Google News headlines, sources and timestamps.",
    params: [
      { name: "query", type: "string", description: "Search terms. Supports operators like site: and when:. Cannot combine with *_token params." },
      COUNTRY,
      LANGUAGE,
      { name: "topic_token", type: "string", description: "Topic identifier (World, Business, Technology, ...). Mutually exclusive with query." },
      { name: "publication_token", type: "string", description: "Publisher identifier. Mutually exclusive with query." },
      { name: "section_token", type: "string", description: "Subsection token; only with topic_token or publication_token." },
      { name: "so", type: "string", description: "Sort order (only with story_token): 0 = relevance, 1 = date.", enum: ["0", "1"], default: "0" },
    ],
  },
  {
    tool: "google_trends",
    title: "Google Trends API",
    path: "/google_trends",
    description: "Track keyword search interest over time and by region via Google Trends.",
    params: [
      { name: "query", type: "string", required: true, description: "Up to 5 comma-separated terms (1 for map-only types); max 100 chars each." },
      { name: "data_type", type: "string", description: "Type of Trends data.", enum: ["TIMESERIES", "GEO_MAP", "GEO_MAP_0"], default: "TIMESERIES" },
      { name: "geo", type: "string", description: "Location origin (e.g. US, GB). Defaults to worldwide." },
      { name: "region", type: "string", description: "Map granularity.", enum: ["COUNTRY", "REGION", "DMA", "CITY"] },
      LANGUAGE,
      { name: "date", type: "string", description: "Time range: e.g. 'now 1-H', 'now 7-d', 'today 12-m', 'all', or 'yyyy-mm-dd yyyy-mm-dd'." },
      { name: "cat", type: "string", description: "Category id.", default: "0" },
      { name: "gprop", type: "string", description: "Property filter.", enum: ["images", "news", "froogle", "youtube"] },
      { name: "tz", type: "string", description: "Timezone offset in minutes (-1439..1439).", default: "420" },
    ],
  },
  {
    tool: "google_shopping",
    title: "Google Shopping API",
    path: "/google_shopping",
    description: "Scrape product listings and prices from Google Shopping.",
    params: [
      { name: "query", type: "string", required: true, description: "Product search term." },
      COUNTRY,
      { name: "page", type: "number", description: "Zero-based page number.", default: "0" },
      DOMAIN,
      LANGUAGE,
      { name: "tbs", type: "string", description: "Advanced result filter." },
      { name: "safe", type: "string", description: "Adult-content filter.", enum: ["active", "off"], default: "off" },
      { name: "html", type: "boolean", description: "Return raw HTML instead of parsed JSON.", default: "false" },
    ],
  },
  {
    tool: "google_scholar",
    title: "Google Scholar API",
    path: "/google_scholar",
    description: "Search academic papers, authors and citation counts via Google Scholar.",
    params: [
      { name: "query", type: "string", description: "Search query (optional when using cites)." },
      LANGUAGE,
      { name: "cites", type: "string", description: "Article id for 'Cited by' searches." },
      { name: "as_ylo", type: "string", description: "Filter: results from this year onward." },
      { name: "as_yhi", type: "string", description: "Filter: results up to this year." },
      { name: "as_sdt", type: "string", description: "Search type / filter (patents, case law, courts)." },
      { name: "page", type: "number", description: "Zero-based page number.", default: "0" },
      { name: "results", type: "number", description: "Results per page." },
    ],
  },
  {
    tool: "google_jobs",
    title: "Google Jobs API",
    path: "/google_jobs",
    description: "Scrape job listings aggregated across Google Jobs.",
    params: [
      { name: "query", type: "string", required: true, description: "Job search query." },
      COUNTRY,
      { name: "language", type: "string", description: "Result language, e.g. en_us.", default: "en_us" },
      DOMAIN,
      { name: "next_page_token", type: "string", description: "Token from a previous response to fetch the next page." },
      { name: "chips", type: "string", description: "Extra query filters from the Google Jobs UI." },
      { name: "ltype", type: "string", description: "Work-from-home filter." },
    ],
  },
  {
    tool: "google_finance",
    title: "Google Finance API",
    path: "/google_finance",
    description: "Fetch live stock quotes and market data from Google Finance.",
    params: [
      { name: "query", type: "string", required: true, description: "Ticker in Google Finance format, e.g. GOOGL:NASDAQ or NIFTY_50:INDEXNSE." },
      LANGUAGE,
      { name: "html", type: "boolean", description: "Return raw HTML instead of parsed JSON.", default: "false" },
    ],
  },
  {
    tool: "google_lens",
    title: "Google Lens API",
    path: "/google_lens",
    description: "Reverse-image search via Google Lens for visual matches and products.",
    params: [
      { name: "url", type: "string", required: true, description: "URL of the image to run through Google Lens." },
      { name: "query", type: "string", description: "Optional text query to run alongside the image." },
      COUNTRY,
      LANGUAGE,
      { name: "product", type: "boolean", description: "Enable product results.", default: "false" },
      { name: "visual_matches", type: "boolean", description: "Enable visual-match results.", default: "false" },
      { name: "exact_matches", type: "boolean", description: "Enable exact-match results.", default: "false" },
    ],
  },
  {
    tool: "google_ai_mode",
    title: "Google AI Mode API",
    path: "/google/ai_mode",
    description: "Retrieve Google's AI Mode conversational answer for a query.",
    params: [
      { name: "query", type: "string", required: true, description: "The query to search in Google AI Mode." },
      COUNTRY,
      LANGUAGE,
      { name: "location", type: "string", description: "Search origin location. Incompatible with uule." },
      { name: "safe", type: "string", description: "Adult-content filter.", enum: ["active", "off"], default: "off" },
      { name: "html", type: "boolean", description: "Return raw HTML instead of parsed JSON.", default: "false" },
    ],
  },

  // -------------------------------------------------------------- E-commerce
  {
    tool: "amazon_search",
    title: "Amazon Search API",
    path: "/amazon/search",
    description: "Scrape Amazon search-result listings for a query.",
    params: [
      { name: "query", type: "string", required: true, description: "Amazon search query." },
      { name: "domain", type: "string", required: true, description: "Amazon TLD, e.g. com, in, de, co.uk.", default: "com" },
      { name: "page", type: "number", required: true, description: "Page number, starting at 1.", default: "1" },
      { name: "country", type: "string", required: true, description: "Two-letter ISO marketplace country code.", default: "us" },
      LANGUAGE,
      { name: "postal_code", type: "string", description: "Postal/ZIP code to localize results." },
      { name: "premium", type: "boolean", description: "Use premium proxies (raises success rate; extra credits).", default: "false" },
    ],
  },
  {
    tool: "amazon_product",
    title: "Amazon Product API",
    path: "/amazon/product",
    description: "Scrape a single Amazon product page (price, specs, ratings) by ASIN.",
    params: [
      { name: "asin", type: "string", required: true, description: "Amazon Standard Identification Number (ASIN) of the product." },
      { name: "domain", type: "string", description: "Amazon TLD, e.g. com, in, de, co.uk.", default: "com" },
      { name: "country", type: "string", description: "Two-letter ISO marketplace country code.", default: "us" },
      { name: "postal_code", type: "string", description: "Postal/ZIP code to localize price and availability." },
    ],
  },
  {
    tool: "walmart_search",
    title: "Walmart Search API",
    path: "/walmart/search",
    description: "Scrape Walmart search results from a Walmart search URL.",
    params: [
      { name: "url", type: "string", required: true, description: "Full Walmart search URL, e.g. https://www.walmart.com/search?q=football." },
    ],
  },
  {
    tool: "ebay_search",
    title: "eBay Search API",
    path: "/ebay/search",
    description: "Scrape eBay search listings from an eBay search URL.",
    params: [
      { name: "url", type: "string", required: true, description: "Full eBay search URL, e.g. https://www.ebay.com/sch/i.html?_nkw=laptop." },
      { name: "html", type: "boolean", description: "Return raw HTML instead of parsed JSON.", default: "false" },
    ],
  },

  // -------------------------------------------------------- Social / Professional
  {
    tool: "linkedin_profile",
    title: "LinkedIn Profile / Company API",
    path: "/linkedin",
    description:
      "Scrape a public LinkedIn person or company profile by its public identifier (the slug in the profile URL).",
    params: [
      { name: "type", type: "string", required: true, description: "Profile type to scrape.", enum: ["profile", "company"] },
      { name: "linkId", type: "string", required: true, description: "The public LinkedIn id/slug, e.g. 'williamhgates' for linkedin.com/in/williamhgates." },
      { name: "premium", type: "boolean", description: "Use premium mode for higher success rate.", default: "false" },
    ],
  },
  {
    tool: "x_profile",
    title: "X (Twitter) Profile API",
    path: "/x/profile",
    description: "Scrape a public X (Twitter) profile's metadata (bio, followers, counts, etc.).",
    params: [
      { name: "profileId", type: "string", required: true, description: "X username or user id, e.g. 'elonmusk' or 'nasa'." },
    ],
  },
  {
    tool: "youtube_search",
    title: "YouTube Search API",
    path: "/youtube",
    description: "Retrieve YouTube search results with video titles and metadata.",
    params: [
      { name: "search_query", type: "string", required: true, description: "YouTube search query, e.g. 'elon musk interview'." },
      COUNTRY,
      LANGUAGE,
      { name: "sp", type: "string", description: "Pagination/filter token; pass next_page_token from a previous response." },
    ],
  },
  {
    tool: "youtube_transcripts",
    title: "YouTube Transcripts API",
    path: "/youtube/transcripts",
    description: "Get the transcript (with timestamps) for a YouTube video.",
    params: [
      { name: "v", type: "string", required: true, description: "YouTube video id (the part after ?v= in the URL)." },
      LANGUAGE,
      COUNTRY,
    ],
  },

  // ------------------------------------------------------------ Other search engines
  {
    tool: "bing_search",
    title: "Bing Search API",
    path: "/bing/search",
    description: "Scrape Bing search results as structured JSON.",
    params: [
      { name: "query", type: "string", required: true, description: "Bing search query; supports standard Bing operators." },
      { name: "lat", type: "string", description: "GPS latitude for the search origin." },
      { name: "lon", type: "string", description: "GPS longitude for the search origin." },
      { name: "mkt", type: "string", description: "Market as language-country, e.g. en-US. Mutually exclusive with cc." },
      { name: "cc", type: "string", description: "Two-letter ISO country code. Mutually exclusive with mkt." },
      { name: "first", type: "number", description: "Result offset to start from.", default: "1" },
      { name: "count", type: "number", description: "Results per page (1-50)." },
      { name: "safeSearch", type: "string", description: "Content filter level.", enum: ["Off", "Moderate", "Strict"] },
    ],
  },
  {
    tool: "baidu_search",
    title: "Baidu Search API",
    path: "/baidu/search",
    description: "Scrape Baidu (Chinese-market) search results as structured JSON.",
    params: [
      { name: "query", type: "string", required: true, description: "Baidu search query; supports Baidu operators (site:, inurl:, intitle:)." },
      { name: "ct", type: "string", description: "Language filter: 1=all, 2=Simplified Chinese, 3=Traditional Chinese." },
      { name: "pn", type: "number", description: "Pagination offset (0=first page, 10=second, ...).", default: "0" },
      { name: "rn", type: "number", description: "Results per page (max 50).", default: "10" },
      { name: "html", type: "boolean", description: "Return raw HTML instead of parsed JSON.", default: "false" },
    ],
  },

  // ------------------------------------------------ Google family (additions)
  {
    tool: "google_ai_overview",
    title: "Google AI Overview API",
    path: "/google/ai_overview",
    description:
      "Fetch the Google AI Overview block for a search. Pass the AI-overview URL returned in a google_search response (that URL expires ~2 minutes after it is issued).",
    params: [
      { name: "url", type: "string", required: true, description: "AI Overview URL taken from a google_search response. Expires ~2 minutes after issuance." },
    ],
  },
  {
    tool: "google_images",
    title: "Google Images API",
    path: "/google_images",
    description: "Get Google Images search results with sources and thumbnails.",
    params: [
      { name: "query", type: "string", required: true, description: "Image search query." },
      DOMAIN,
      COUNTRY,
      LANGUAGE,
      { name: "tbs", type: "string", description: "Advanced filter (size, color, type, time range)." },
      { name: "safe", type: "string", description: "Adult-content filter.", enum: ["active", "off"], default: "off" },
      { name: "start", type: "number", description: "Result offset (e.g. 20 skips the first 20)." },
      { name: "html", type: "boolean", description: "Return raw HTML instead of parsed JSON.", default: "false" },
    ],
  },
  {
    tool: "google_shorts",
    title: "Google Shorts API",
    path: "/google_shorts",
    description: "Retrieve Google short videos with sources, thumbnails and dates.",
    params: [
      { name: "query", type: "string", required: true, description: "Search query." },
      DOMAIN,
      COUNTRY,
      LANGUAGE,
      { name: "lr", type: "string", description: "Restrict results to specific language(s)." },
      { name: "tbs", type: "string", description: "Advanced result filter." },
      { name: "safe", type: "string", description: "Adult-content filter.", enum: ["active", "off"], default: "off" },
      { name: "nfpr", type: "string", description: "Set 1 to exclude auto-corrected misspellings.", enum: ["0", "1"], default: "0" },
      { name: "start", type: "number", description: "Result offset (e.g. 12 skips the first 12)." },
      { name: "html", type: "boolean", description: "Return raw HTML instead of parsed JSON.", default: "false" },
    ],
  },
  {
    tool: "google_hotels",
    title: "Google Hotels API",
    path: "/google_hotels",
    description: "Get hotel and vacation-rental prices, ratings and availability from Google Hotels.",
    params: [
      { name: "query", type: "string", required: true, description: "Hotel search query (e.g. 'hotels in Paris')." },
      { name: "check_in_date", type: "string", required: true, description: "Check-in date, YYYY-MM-DD." },
      { name: "check_out_date", type: "string", required: true, description: "Check-out date, YYYY-MM-DD." },
      { name: "adults", type: "number", description: "Number of adults.", default: "2" },
      { name: "children", type: "number", description: "Number of children.", default: "0" },
      { name: "children_ages", type: "string", description: "Comma-separated child ages 1-17 (e.g. '5,8,10')." },
      COUNTRY,
      LANGUAGE,
      { name: "currency", type: "string", description: "Pricing currency.", default: "USD" },
      { name: "sort_by", type: "string", description: "Sort: 3=lowest price, 8=highest rating, 13=most reviews.", enum: ["3", "8", "13"] },
      { name: "min_price", type: "number", description: "Minimum price filter." },
      { name: "max_price", type: "number", description: "Maximum price filter." },
      { name: "rating", type: "string", description: "Min rating: 7=3.5+, 8=4.0+, 9=4.5+.", enum: ["7", "8", "9"] },
      { name: "hotel_class", type: "string", description: "Star class filter (2-5), comma-separated." },
      { name: "free_cancellation", type: "boolean", description: "Only show free-cancellation options." },
      { name: "vacation_rentals", type: "boolean", description: "Search vacation rentals instead of hotels.", default: "false" },
      { name: "property_token", type: "string", description: "Token for detailed property information." },
      { name: "next_page_token", type: "string", description: "Pagination token from a previous response." },
      { name: "html", type: "boolean", description: "Return raw HTML instead of parsed JSON.", default: "false" },
    ],
  },
  {
    tool: "google_patents",
    title: "Google Patents API",
    path: "/google_patents",
    description: "Search patent records and metadata via Google Patents.",
    params: [
      { name: "query", type: "string", required: true, description: "Search terms; separate multiple with semicolons." },
      { name: "page", type: "number", description: "Zero-based page number.", default: "0" },
      { name: "num", type: "number", description: "Results per page (1-100).", default: "10" },
      { name: "sort", type: "string", description: "Sort order.", enum: ["new", "old"] },
      { name: "before", type: "string", description: "Max date as type:YYYYMMDD (type = priority|filing|publication)." },
      { name: "after", type: "string", description: "Min date as type:YYYYMMDD (type = priority|filing|publication)." },
      { name: "inventor", type: "string", description: "Comma-separated inventor names." },
      { name: "assignee", type: "string", description: "Comma-separated assignee names." },
      { name: "country", type: "string", description: "Comma-separated country codes (e.g. WO,US)." },
      { name: "language", type: "string", description: "Comma-separated languages (e.g. ENGLISH,GERMAN)." },
      { name: "status", type: "string", description: "Filter by status.", enum: ["GRANT", "APPLICATION"] },
      { name: "type", type: "string", description: "Filter by type.", enum: ["PATENT", "DESIGN"] },
      { name: "scholar", type: "boolean", description: "Include Google Scholar results.", default: "false" },
    ],
  },
  {
    tool: "google_immersive_product",
    title: "Google Immersive Product API",
    path: "/google_immersive_product",
    description: "Retrieve detailed product info from Google's immersive product popup via a page token.",
    params: [
      { name: "page_token", type: "string", required: true, description: "Immersive-product token (from a Google Shopping/Search response)." },
      COUNTRY,
      LANGUAGE,
      { name: "stores", type: "boolean", description: "Enable seller pagination (requires sori).", default: "false" },
      { name: "sori", type: "string", description: "Seller pagination cursor; works with stores." },
    ],
  },
  {
    tool: "universal_search",
    title: "Universal Search API",
    path: "/search",
    description: "Single endpoint that scrapes major search engines and returns unified organic results.",
    params: [
      { name: "query", type: "string", required: true, description: "Search query." },
      COUNTRY,
      LANGUAGE,
    ],
  },

  // -------------------------------------------------- E-commerce (additions)
  {
    tool: "amazon_reviews",
    title: "Amazon Reviews API",
    path: "/amazon/reviews",
    description: "Scrape customer reviews, ratings and reviewer details for an Amazon product by ASIN.",
    // Route confirmed correct, but as of 2026-08-01 the live endpoint returns
    // HTTP 400 "Something went wrong" for every input — a Scrapingdog backend
    // issue (or plan scope), not a wrapper bug. Kept flagged until it returns data.
    verify: true,
    params: [
      { name: "asin", type: "string", required: true, description: "Amazon ASIN of the product." },
      { name: "domain", type: "string", description: "Amazon TLD, e.g. com, in, de, co.uk.", default: "com" },
      { name: "country", type: "string", description: "Two-letter ISO marketplace country code.", default: "us" },
      { name: "page", type: "number", description: "Reviews page number, starting at 1.", default: "1" },
    ],
  },
  {
    tool: "amazon_offers",
    title: "Amazon Offers API",
    path: "/amazon/offers",
    description: "Fetch all buying offers and sellers for an Amazon product by ASIN.",
    params: [
      { name: "asin", type: "string", required: true, description: "Amazon ASIN of the product." },
      { name: "domain", type: "string", description: "Amazon TLD, e.g. com, in, de, co.uk.", default: "com" },
      { name: "country", type: "string", description: "Two-letter ISO marketplace country code.", default: "us" },
    ],
  },

  // ------------------------------------------ Social / Professional (additions)
  {
    tool: "youtube_video",
    title: "YouTube Video API",
    path: "/youtube/video",
    description: "Get details and metadata for a single YouTube video.",
    params: [
      { name: "v", type: "string", required: true, description: "YouTube video id (the part after ?v= in the URL)." },
      COUNTRY,
      LANGUAGE,
    ],
  },
  {
    tool: "youtube_channel",
    title: "YouTube Channel API",
    path: "/youtube/channel",
    description: "Get a YouTube channel's details and videos.",
    params: [
      { name: "channel_id", type: "string", required: true, description: "YouTube channel id." },
      COUNTRY,
      LANGUAGE,
    ],
  },
  {
    tool: "youtube_comments",
    title: "YouTube Comments API",
    path: "/youtube/comments",
    description: "Get comments for a YouTube video.",
    params: [
      { name: "v", type: "string", required: true, description: "YouTube video id (the part after ?v= in the URL)." },
      COUNTRY,
      LANGUAGE,
    ],
  },

  // -------------------------------------------------------- AI / LLM (additions)
  {
    tool: "chatgpt",
    title: "ChatGPT Scraper API",
    path: "/chatgpt",
    description: "Send a prompt to ChatGPT and get the response as structured JSON, at scale.",
    params: [
      { name: "prompt", type: "string", required: true, description: "The prompt to send to ChatGPT." },
      { name: "html", type: "boolean", description: "Return raw HTML instead of parsed JSON.", default: "false" },
    ],
  },

  // ------------------------------------------------------------------- Tools
  {
    tool: "screenshot",
    title: "Screenshot API",
    path: "/screenshot",
    description: "Capture a screenshot (PNG/JPG/WEBP) of any web page. Returns the image.",
    binary: true,
    params: [
      { name: "url", type: "string", required: true, description: "URL of the page to screenshot." },
      { name: "fullPage", type: "boolean", description: "Capture the full scrollable page instead of just the viewport.", default: "false" },
      { name: "width", type: "number", description: "Viewport width in pixels." },
      { name: "height", type: "number", description: "Viewport height in pixels." },
      { name: "wait_until", type: "string", description: "Navigation completion trigger.", enum: ["load", "domcontentloaded", "networkidle"], default: "domcontentloaded" },
      { name: "format", type: "string", description: "Image format.", enum: ["png", "jpg", "webp"], default: "png" },
      { name: "quality", type: "number", description: "Image quality 0-100 (jpg/webp).", default: "80" },
    ],
  },
];

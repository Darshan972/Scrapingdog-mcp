# Scrapingdog MCP server.
#
# Two entry points from one image:
#   stdio (what the npm package runs):
#     docker run --rm -i -e SCRAPINGDOG_API_KEY=your_key scrapingdog-mcp
#   hosted Streamable HTTP (mcp.scrapingdog.com), key comes per request:
#     docker run --rm -p 8731:8731 scrapingdog-mcp dist/http.js

FROM node:22-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY tsconfig.json ./
COPY src ./src
RUN npm run build && npm prune --omit=dev

FROM node:22-alpine
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY package.json ./
EXPOSE 8731
# stdio by default (keep STDIN open with `docker run -i`); override the CMD for HTTP.
ENTRYPOINT ["node"]
CMD ["dist/index.js"]

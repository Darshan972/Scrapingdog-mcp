# Scrapingdog MCP server — container image (stdio transport).
# Build:  docker build -t scrapingdog-mcp .
# Run:    docker run --rm -i -e SCRAPINGDOG_API_KEY=your_key scrapingdog-mcp
#
# MCP clients that support container commands can launch it with:
#   "command": "docker",
#   "args": ["run","--rm","-i","-e","SCRAPINGDOG_API_KEY","scrapingdog-mcp"]

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
# stdio server: keep STDIN open with `docker run -i`.
ENTRYPOINT ["node", "dist/index.js"]

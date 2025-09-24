# Dockerfile — MCP server (mcp-server/ 기준)
FROM node:20-alpine
WORKDIR /app/mcp-server

# deps
COPY mcp-server/package*.json ./
RUN npm install --omit=dev

# app
COPY mcp-server/ ./
ENV NODE_ENV=production
EXPOSE 3000

# health
HEALTHCHECK --interval=30s --timeout=5s --retries=30 CMD wget -qO- http://127.0.0.1:3000/ || exit 1

# entrypoint
CMD ["node","index.js"]

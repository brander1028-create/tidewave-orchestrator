# Dockerfile — MCP server
FROM node:20-alpine
WORKDIR /app

# deps
COPY package*.json ./
RUN npm ci --omit=dev || npm install --omit=dev

# app
COPY . .
ENV NODE_ENV=production
EXPOSE 3000

# health
HEALTHCHECK --interval=30s --timeout=5s --retries=30 CMD wget -qO- http://127.0.0.1:3000/ || exit 1

# entrypoint: mcp-server/index.js
CMD ["node","mcp-server/index.js"]

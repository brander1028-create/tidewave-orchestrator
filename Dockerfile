FROM node:18-alpine
WORKDIR /app
COPY mcp-server/package*.json ./mcp-server/
RUN cd mcp-server && npm ci --only=production
COPY mcp-server ./mcp-server
WORKDIR /app/mcp-server
ENV NODE_ENV=production
EXPOSE 3000
CMD ["node","index.js"]
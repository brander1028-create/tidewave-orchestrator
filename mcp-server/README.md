# MCP Server

This folder contains a simple Model Connector Proxy (MCP) server built with Node.js and Express. It exposes endpoints for ChatGPT to interact with GitHub repositories and deployment providers like Vercel and Render.

## Setup

1. Install dependencies using `npm install`.
2. Create a `.env` file in this directory with the following variables:
   - `GH_TOKEN` – your GitHub Personal Access Token with repo access.
   - `GH_OWNER` – GitHub owner (username or org).
   - `GH_REPO` – repository name.
   - `VERCEL_DEPLOY_HOOK` – optional Vercel deploy hook URL.
   - `RENDER_DEPLOY_HOOK` – optional Render deploy hook URL.
   - `PREVIEW_URL` – optional current preview URL.
3. Start the server with `npm start`.

The server listens on port 3000 by default.

## Endpoints

- **POST /fs_read** – Read a file from the GitHub repository.
- **POST /fs_write** – Write or update a file in the repository.
- **POST /deploy_vercel** – Trigger a deployment via Vercel hook.
- **POST /deploy_render** – Trigger a deployment via Render hook.
- **GET /preview_url** – Retrieve the latest preview URL.

See `index.js` for implementation details and response formats.

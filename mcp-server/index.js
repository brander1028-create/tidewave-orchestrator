import express from 'express';
import bodyParser from 'body-parser';
import { Octokit } from '@octokit/rest';
import axios from 'axios';

/*
 * Minimal MCP server for ChatGPT connectors.
 *
 * This server exposes a handful of endpoints that implement the core
 * functionality required to build a Git/Vercel based development loop.
 *
 * Each endpoint expects JSON bodies and returns JSON responses. Errors
 * propagate as HTTP 400 responses with an "error" message.
 *
 * To use this server you must supply several environment variables:
 *
 *   GH_TOKEN  – a GitHub personal access token with repo scope.
 *   GH_OWNER  – the GitHub username or organization that owns the repository.
 *   GH_REPO   – the repository name (without owner).
 *   VERCEL_DEPLOY_HOOK (optional) – a deploy hook URL for Vercel.
 *   RENDER_DEPLOY_HOOK (optional) – a deploy hook URL for Render.
 *
 * This file is intentionally lightweight and avoids complex build/run logic.
 * Users can extend the endpoints as needed or plug in other services.
 */

const app = express();
const port = process.env.PORT || 3000;

app.use(bodyParser.json({ limit: '10mb' }));

// Creat
const ghToken = process.env.GH_TOKEN;
let octokit;
if (ghToken) {
  octokit = new Octokit({ auth: ghToken });
} else {
  console.warn('Warning: GH_TOKEN not set. GitHub endpoints will fail.');
}
const ghOwner = process.env.GH_OWNER;
const ghRepo = process.env.GH_REPO;

/**
 * Helper to read file contents from a GitHub repository.
 * @param {string} path Relative path within the repo (no leading slash).
 */
async function readGitHubFile(path) {
  if (!octokit || !ghOwner || !ghRepo) {
    throw new Error('Missing GitHub configuration (GH_TOKEN, GH_OWNER, GH_REPO).');
  }
  const result = await octokit.repos.getContent({ owner: ghOwner, repo: ghRepo, path });
  if (Array.isArray(result.data)) {
    throw new Error('Path ' + path + ' is a directory. Only files are supported.');
  }
  const 

/**
 * Helper to write file contents to a GitHub repository. If the file exists,
 * it is updated; otherwise it is created. Commits are created directly on
 * the default branch.
 *
 * @param {string} path Relative path within the repo (no leading slash).
 * @param {string} content Raw UTF-8 file contents.
 * @param {string} message Commit message.
 */
async function writeGitHubFile(path, content, message = 'Update file') {
  if (!octokit || !ghOwner || !ghRepo) {
    throw new Error('Missing GitHub configuration (GH_TOKEN, GH_OWNER, GH_REPO).');
  }
  const encoded = Buffer.from(content).toString('base64');
  let sha;
  try {
    // Try to get existing file SHA to update
    const { data } = await octokit.repos.getContent({ owner: ghOwner, repo: ghRepo, path });
    if (!Array.isArray(data)) {
      sha = data.sha;
    }
  } catch (err) {
    // File does not exist; ignore.
  }
  const res = await octokit.repos.createOrUpdateFileContents({
    owner: ghOwner,
    repo: ghRepo,
    path,
    message,
    content: encoded,
    sha,
  });
  return res.data.commit.sha;
}

// --- Endpoint definitions ---

/**
 * POST /fs_read
 *
 * Body:
 *   { "file_path": "path/to/file.txt" }
 *
 * Reads a single file from GitHub and returns its contents.
 */
app.post('/fs_read', async (req, res) => {
  const { file_path } = req.body;
  if (!file_path) {
    return res.status(400).json({ error: 'file_path is required' });
  }
  try {
    const data = await readGitHubFile(file_path);
    return res.json({ content: data });
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
});

/**
 * POST /fs_write
 *
 * Body:
 *   {
 *     "file_path": "path/to/file.txt",
 *     "content": "New file contents",
 *     "message": "Commit message" (optional)
 *   }
 *
 * Writes a file to GitHub, creating or updating it, and returns the commit SHA.
 */
app.post('/fs_write', async (req, res) => {
  const { file_path, content, message } = req.body;
  if (!file_path || typeof content !== 'string') {
    return res.status(400).json({ error: 'file_path and content are required' });
  }
  try {
    const sha = await writeGitHubFile(file_path, content, message);
    return res.json({ ok: true, commit_sha: sha });
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
});

/**
 * POST /deploy_vercel
 *
 * Triggers a Vercel deployment using the configured deploy hook. Returns
 * the response from Vercel or a status message if the hook is not set.
 */
app.post('/deploy_vercel', async (req, res) => {
  const hook = process.env.VERCEL_DEPLOY_HOOK;
  if (!hook) {
    return res.status(400).json({ error: 'VERCEL_DEPLOY_HOOK is not configured' });
  }
  try {
    const response = await axios.post(hook, {});
    return res.json({ status: response.status, data: response.data });
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
});

/**
 * POST /deploy_render
 *
 * Triggers a Render deployment using the configured deploy hook. Returns
 * the response from Render or a status message if the hook is not set.
 */
app.post('/deploy_render', async (req, res) => {
  const hook = process.env.RENDER_DEPLOY_HOOK;
  if (!hook) {
    return res.status(400).json({ error: 'RENDER_DEPLOY_HOOK is not configured' });
  }
  try {
    const response = await axios.post(hook, {});
    return res.json({ status: response.status, data: response.data });
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
});

/**
 * POST /preview_url_get
 *
 * Returns a pre-configured preview URL. This is a simple implementation
 * that just returns the value of PREVIEW_URL environment variable. Users
 * should update this variable externally (e.g., via deployment logs).
 */
app.post('/preview_url_get', (req, res) => {
  const url = process.env.PREVIEW_URL;
  if (!url) {
    return res.status(400).json({ error: 'PREVIEW_URL is not configured' });
  }
  return res.json({ url });
});

// Default route for health checks
app.get('/', (req, res) => {
  res.json({ status: 'ok', message: 'MCP server is running' });
});

app.listen(port, () => {
  console.log('MCP server listening on port ' + port);
});

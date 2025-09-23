const express = require('express');
const bodyParser = require('body-parser');
const { Octokit } = require('@octokit/rest');
const axios = require('axios');

const app = express();
try { require("./sse-compat")(app); } catch (e) { console.error("sse-compat load failed", e); }

const port = process.env.PORT || 3000;

app.use(bodyParser.json({ limit: '10mb' }));

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
  const content = Buffer.from(result.data.content, result.data.encoding).toString('utf8');
  return content;
}

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
    const { data } = await octokit.repos.getContent({ owner: ghOwner, repo: ghRepo, path });
    if (!Array.isArray(data)) {
      sha = data.sha;
    }
  } catch (err) {
    // File does not exist; ignore
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

// Endpoint definitions

// fs_read: reads a single file from GitHub and returns its contents
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

// fs_write: writes a file to GitHub, creating or updating it
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

// deploy_vercel: triggers a Vercel deployment using the configured deploy hook
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

// deploy_render: triggers a Render deployment using the configured deploy hook
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

// preview_url_get: returns a pre-configured preview URL
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

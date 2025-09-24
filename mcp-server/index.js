// mcp-server/index.js (FINAL)

const express = require('express');
const bodyParser = require('body-parser');
const { Octokit } = require('@octokit/rest');
const axios = require('axios');

const app = express();
const port = process.env.PORT || 3000;

/* ---------- /sse: CORS 고정 + 프리플라이트(OPTIONS) 조기 종료 ---------- */
/* 반드시 다른 미들웨어(cos()/helmet()/static 등)보다 '앞'에 있어야 함 */
function setSseCors(req, res) {
  const origin = req.headers.origin || 'https://chat.openai.com';
  try { res.removeHeader('Access-Control-Allow-Origin'); } catch {}
  res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Methods', 'GET,HEAD,OPTIONS');
  res.setHeader(
    'Access-Control-Allow-Headers',
    req.headers['access-control-request-headers'] || 'accept, content-type, authorization'
  );
  res.setHeader('Access-Control-Max-Age', '86400');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('X-Accel-Buffering', 'no');
  res.setHeader('Content-Encoding', 'identity');
}

// /sse 전용 가드(프리플라이트는 여기서 즉시 204로 종료)
app.use(['/sse','/sse/'], (req, res, next) => {
  setSseCors(req, res);
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  return next();
});

/* ---------- 공통 미들웨어 ---------- */
app.use(bodyParser.json({ limit: '10mb' }));

/* ---------- GitHub 설정 ---------- */
const ghToken = process.env.GH_TOKEN;
let octokit;
if (ghToken) {
  octokit = new Octokit({ auth: ghToken });
} else {
  console.warn('Warning: GH_TOKEN not set. GitHub endpoints will fail.');
}
const ghOwner = process.env.GH_OWNER;
const ghRepo  = process.env.GH_REPO;

/* ---------- GitHub helpers ---------- */
/** Read file from GitHub repo */
async function readGitHubFile(path) {
  if (!octokit || !ghOwner || !ghRepo) {
    throw new Error('Missing GitHub configuration (GH_TOKEN, GH_OWNER, GH_REPO).');
  }
  const result = await octokit.repos.getContent({ owner: ghOwner, repo: ghRepo, path });
  if (Array.isArray(result.data)) throw new Error(`Path ${path} is a directory.`);
  const content = Buffer.from(result.data.content, result.data.encoding).toString('utf8');
  return content;
}

/** Create/Update file in GitHub repo (commit on default branch) */
async function writeGitHubFile(path, content, message = 'Update file') {
  if (!octokit || !ghOwner || !ghRepo) {
    throw new Error('Missing GitHub configuration (GH_TOKEN, GH_OWNER, GH_REPO).');
  }
  const encoded = Buffer.from(content).toString('base64');
  let sha;
  try {
    const { data } = await octokit.repos.getContent({ owner: ghOwner, repo: ghRepo, path });
    if (!Array.isArray(data)) sha = data.sha;
  } catch (_) { /* not exists, ignore */ }
  const res = await octokit.repos.createOrUpdateFileContents({
    owner: ghOwner, repo: ghRepo, path, message, content: encoded, sha,
  });
  return res.data.commit.sha;
}

/* ---------- HTTP endpoints ---------- */
// fs_read
app.post('/fs_read', async (req, res) => {
  const { file_path } = req.body;
  if (!file_path) return res.status(400).json({ error: 'file_path is required' });
  try { const data = await readGitHubFile(file_path); res.json({ content: data }); }
  catch (err) { res.status(400).json({ error: err.message }); }
});

// fs_write
app.post('/fs_write', async (req, res) => {
  const { file_path, content, message } = req.body;
  if (!file_path || typeof content !== 'string') {
    return res.status(400).json({ error: 'file_path and content are required' });
  }
  try { const sha = await writeGitHubFile(file_path, content, message); res.json({ ok: true, commit_sha: sha }); }
  catch (err) { res.status(400).json({ error: err.message }); }
});

// deploy_vercel
app.post('/deploy_vercel', async (req, res) => {
  const hook = process.env.VERCEL_DEPLOY_HOOK;
  if (!hook) return res.status(400).json({ error: 'VERCEL_DEPLOY_HOOK is not configured' });
  try { const r = await axios.post(hook, {}); res.json({ status: r.status, data: r.data }); }
  catch (err) { res.status(400).json({ error: err.message }); }
});

// deploy_render
app.post('/deploy_render', async (req, res) => {
  const hook = process.env.RENDER_DEPLOY_HOOK;
  if (!hook) return res.status(400).json({ error: 'RENDER_DEPLOY_HOOK is not configured' });
  try { const r = await axios.post(hook, {}); res.json({ status: r.status, data: r.data }); }
  catch (err) { res.status(400).json({ error: err.message }); }
});

// preview_url_get
app.post('/preview_url_get', (req, res) => {
  const url = process.env.PREVIEW_URL;
  if (!url) return res.status(400).json({ error: 'PREVIEW_URL is not configured' });
  res.json({ url });
});

// health
app.get('/', (_req, res) => res.json({ status: 'ok', message: 'MCP server is running' }));

/* ---------- /sse: HEAD/GET (handshake + keepalive) ---------- */
app.head(['/sse','/sse/'], (req, res) => {
  setSseCors(req, res);
  res.type('text/event-stream');
  if (typeof res.flushHeaders === 'function') res.flushHeaders();
  return res.sendStatus(200);
});

app.get(['/sse','/sse/'], (req, res) => {
  setSseCors(req, res);
  res.type('text/event-stream; charset=utf-8');
  if (typeof res.flushHeaders === 'function') res.flushHeaders();

  const hello = {
    type: 'handshake',
    protocol: '2024-11-05',
    server: { name: 'tidewave-mcp', version: '0.1.0' },
    capabilities: { tools: true }
  };

  res.write('event: handshake\n');
  res.write(`data: ${JSON.stringify(hello)}\n\n`);
  res.write('retry: 15000\n\n');

  const ka = setInterval(() => res.write(':\n\n'), 15000);
  req.on('close', () => clearInterval(ka));
});

/* ---------- start ---------- */
const server = app.listen(port, () => {
  console.log('MCP server listening on port ' + port);
});
// SSE 안정화용 타임아웃(프록시 환경 대비)
server.keepAliveTimeout = 65000;
server.headersTimeout   = 66000;

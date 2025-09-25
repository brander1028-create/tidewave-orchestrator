// mcp-server/index.js — FINAL (Render-ready; /mcp JSON-RPC + /run compat + healthz + robots)
//
// - JSON-RPC: tools.list / tools/list, tools.call / tools/call / call_tool 모두 지원
// - 툴 이름 정규화: mcp-server_* / mcp-server-new_* 접두사도 허용
// - /run 호환: /run, /tools/run, /batch_run (항상 200 JSON)
// - 진단용 REST: /tools/env_check, /tools/fs_read, /tools/fs_write

const express = require('express');
const { Octokit } = require('@octokit/rest');

const app = express();
app.set('trust proxy', true);
const port = process.env.PORT || 3000;

/* -------------------- CORS helpers -------------------- */
const ALLOW_ORIGINS = (process.env.CORS_ALLOW_ORIGINS || 'https://chatgpt.com,https://chat.openai.com,https://staging.chatgpt.com')
  .split(',').map(s => s.trim()).filter(Boolean);

function chooseOrigin(req) {
  const o = req.headers.origin || '';
  if (ALLOW_ORIGINS.includes(o)) return o;
  return ALLOW_ORIGINS[0] || '*';
}
function lockCors(res, origin) {
  const origSetHeader = res.setHeader.bind(res);
  res.setHeader = function (name, value) {
    const key = String(name).toLowerCase();
    if (key === 'access-control-allow-origin') value = origin;
    if (key === 'access-control-allow-credentials') value = 'true';
    if (key === 'vary') {
      const parts = String(value || '').split(',').map(s => s.trim().toLowerCase());
      if (!parts.includes('origin')) value = (value ? String(value) + ', Origin' : 'Origin');
    }
    return origSetHeader(name, value);
  };
}
function setCors(res, { origin, methods, allowHeaders, maxAge = 86400 }) {
  res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Methods', methods.join(','));
  res.setHeader('Access-Control-Allow-Headers', allowHeaders);
  res.setHeader('Access-Control-Max-Age', String(maxAge));
  // SSE-friendly
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('X-Accel-Buffering', 'no');
  res.setHeader('Content-Encoding', 'identity');
}
function externalBaseUrl(req) {
  const proto = (req.headers['x-forwarded-proto'] || '').split(',')[0] || req.protocol;
  const host = req.get('x-forwarded-host') || req.get('host');
  return `${proto}://${host}`;
}

/* -------------------- SSE helper -------------------- */
function sseHandshake(req, res) {
  const origin = chooseOrigin(req);
  lockCors(res, origin);
  setCors(res, {
    origin,
    methods: ['GET','POST','OPTIONS'],
    allowHeaders: 'accept, content-type, authorization, mcp-protocol-version',
  });
  res.type('text/event-stream; charset=utf-8');
  res.setHeader('Connection', 'keep-alive');
  if (typeof res.flushHeaders === 'function') res.flushHeaders();

  const postUrl = `${externalBaseUrl(req)}/mcp`;
  res.write(`event: endpoint\n`);
  res.write(`data: ${JSON.stringify({ post: postUrl })}\n`);
  res.write(`retry: 15000\n\n`);

  const ka = setInterval(() => { try { res.write(`:\n\n`); } catch (_) {} }, 15000);
  req.on('close', () => clearInterval(ka));
}

/* -------------------- Preflight guards -------------------- */
app.use(['/mcp','/mcp/'], (req, res, next) => {
  const origin = chooseOrigin(req);
  lockCors(res, origin);
  setCors(res, {
    origin,
    methods: ['GET','POST','OPTIONS'],
    allowHeaders: req.headers['access-control-request-headers'] || 'accept, content-type, authorization, mcp-protocol-version',
  });
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  return next();
});
app.use(['/run','/tools/run','/batch_run'], (req, res, next) => {
  const origin = chooseOrigin(req);
  lockCors(res, origin);
  setCors(res, {
    origin,
    methods: ['POST','OPTIONS'],
    allowHeaders: req.headers['access-control-request-headers'] || 'accept, content-type, authorization',
  });
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  return next();
});

/* -------------------- Global JSON body parser -------------------- */
app.use(express.json({ limit: '10mb' }));

/* -------------------- /mcp HEAD/GET (SSE discovery) -------------------- */
app.head(['/mcp','/mcp/'], (req, res) => {
  const origin = chooseOrigin(req);
  lockCors(res, origin);
  setCors(res, {
    origin,
    methods: ['GET','POST','OPTIONS'],
    allowHeaders: 'accept, content-type, authorization, mcp-protocol-version',
  });
  return res.sendStatus(200);
});
app.get(['/mcp','/mcp/'], (req, res) => sseHandshake(req, res));

/* -------------------- Root as SSE (dev-mode) -------------------- */
app.options('/', (req, res) => {
  const origin = chooseOrigin(req);
  lockCors(res, origin);
  setCors(res, {
    origin,
    methods: ['GET','POST','OPTIONS'],
    allowHeaders: req.headers['access-control-request-headers'] || 'accept, content-type, authorization, mcp-protocol-version',
  });
  return res.sendStatus(204);
});
app.get('/', (req, res) => sseHandshake(req, res));

/* -------------------- GitHub helpers -------------------- */
const ghToken  = process.env.GH_TOKEN;
const ghOwner  = process.env.GH_OWNER || 'brander1028-create';
const ghRepo   = process.env.GH_REPO  || 'tidewave-orchestrator';
const ghBranch = process.env.GH_BRANCH; // optional

let octokit = ghToken ? new Octokit({ auth: ghToken }) : null;
if (!octokit) console.warn('Warning: GH_TOKEN not set. GitHub endpoints will fail.');

async function readGitHubFile(path) {
  if (!octokit || !ghOwner || !ghRepo) throw new Error('Missing GitHub configuration (GH_TOKEN, GH_OWNER, GH_REPO).');
  const params = { owner: ghOwner, repo: ghRepo, path };
  if (ghBranch) params.ref = ghBranch;
  const { data } = await octokit.repos.getContent(params);
  if (Array.isArray(data)) throw new Error(`Path ${path} is a directory.`);
  return Buffer.from(data.content, data.encoding).toString('utf8');
}
async function writeGitHubFile(path, content, message = 'Update file') {
  if (!octokit || !ghOwner || !ghRepo) throw new Error('Missing GitHub configuration (GH_TOKEN, GH_OWNER, GH_REPO).');
  const encoded = Buffer.from(content).toString('base64');
  let sha;
  try {
    const getParams = { owner: ghOwner, repo: ghRepo, path };
    if (ghBranch) getParams.ref = ghBranch;
    const { data } = await octokit.repos.getContent(getParams);
    if (!Array.isArray(data)) sha = data.sha;
  } catch (_) { /* create new file */ }
  const putParams = { owner: ghOwner, repo: ghRepo, path, message, content: encoded, sha };
  if (ghBranch) putParams.branch = ghBranch;
  const r = await octokit.repos.createOrUpdateFileContents(putParams);
  return r.data.commit.sha;
}

/* -------------------- Tool schemas -------------------- */
const TOOL_DEFS = [
  {
    name: 'echo',
    description: 'Echo back input',
    inputSchema: { type: 'object', properties: { text: { type: 'string' } }, required: ['text'] }
  },
  {
    name: 'env_check',
    description: 'Report which GitHub env vars are set (booleans only)',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false }
  },
  {
    name: 'fs_read',
    description: 'Read file from GitHub',
    inputSchema: { type: 'object', properties: { file_path: { type: 'string' } }, required: ['file_path'] }
  },
  {
    name: 'fs_write',
    description: 'Write file to GitHub',
    inputSchema: {
      type: 'object',
      properties: { file_path: { type: 'string' }, content: { type: 'string' }, message: { type: 'string' } },
      required: ['file_path', 'content']
    }
  }
];

//* -------------------- Tool dispatcher (normalize + async) -------------------- */
async function callToolByName(name, args = {}) {
  // 접두사 허용: mcp-server_ / mcp-server-new_ / mcp_ / mcp-
  name = String(name || '')
    .replace(/^mcp-server-(new_)?/, '')
    .replace(/^mcp[-_]/, '');

  if (name === 'echo') {
    return { ok: true, tool: 'echo', data: { type: 'text', text: String(args?.text ?? '') } };
  }

  if (name === 'env_check') {
    return {
      ok: true,
      tool: 'env_check',
      data: { type: 'json', json: {
        GH_OWNER: !!ghOwner, GH_REPO: !!ghRepo, GH_TOKEN: !!ghToken, GH_BRANCH: !!ghBranch
      } }
    };
  }

  if (name === 'fs_read') {
    if (!args?.file_path) throw new Error('file_path is required');
    const content = await readGitHubFile(args.file_path);
    return { ok: true, tool: 'fs_read', data: { type: 'text', text: content } };
  }

  if (name === 'fs_write') {
    if (!args?.file_path || typeof args?.content !== 'string')
      throw new Error('file_path and content are required');
    const sha = await writeGitHubFile(args.file_path, args.content, args?.message || 'update via mcp');
    return { ok: true, tool: 'fs_write', data: { type: 'text', text: `commit=${sha}` }, commit_sha: sha };
  }

  throw new Error(`Unknown tool: ${name}`);
}


/* -------------------- /run compatibility (always 200 JSON) -------------------- */
function safeJson(res, payload) {
  try { return res.status(200).json(payload); }
  catch (e) { return res.status(200).json({ ok: false, error: String(e?.message || e) }); }
}
function normToolName(name = '') {
  return String(name).replace(/^mcp-server-(new_)?/, '');
}
async function runToolCompat(nameRaw, args = {}) {
  const name = normToolName(nameRaw);
  try {
    const out = await callToolByName(name, args);
    return { ok: true, ...out };
  } catch (e) {
    return { ok: false, error: String(e?.message || e) };
  }
}
app.post(['/run','/tools/run'], async (req, res) => {
  try {
    const { name, arguments: args = {} } = req.body || {};
    const out = await runToolCompat(name, args);
    return safeJson(res, out);
  } catch (e) {
    console.error('[compat /run] error', e);
    return safeJson(res, { ok: false, error: String(e?.message || e) });
  }
});
app.post('/batch_run', async (req, res) => {
  try {
    const steps = Array.isArray(req.body?.steps) ? req.body.steps : [];
    const results = [];
    for (const s of steps) results.push(await runToolCompat(s?.name, s?.arguments || {}));
    return safeJson(res, { ok: true, results });
  } catch (e) {
    console.error('[compat /batch_run] error', e);
    return safeJson(res, { ok: false, error: String(e?.message || e) });
  }
});

/* -------------------- JSON-RPC (/mcp) -------------------- */
app.post(['/mcp','/mcp/'], async (req, res) => {
  const origin = chooseOrigin(req);
  lockCors(res, origin);
  setCors(res, {
    origin,
    methods: ['GET','POST','OPTIONS'],
    allowHeaders: 'accept, content-type, authorization, mcp-protocol-version',
  });
  res.type('application/json; charset=utf-8');

  const msg = req.body || {};
  const isRequest    = msg && typeof msg === 'object' && 'method' in msg && 'id' in msg;
  const isNotifyOnly = msg && typeof msg === 'object' && 'method' in msg && !('id' in msg);
  if (isNotifyOnly) return res.sendStatus(202);

  const rid = isRequest ? msg.id : null;
  const ok  = (result)  => res.status(200).json({ jsonrpc: '2.0', id: rid, result });
  const err = (message) => res.status(200).json({ jsonrpc: '2.0', id: rid, error: { code: -32001, message } });
  const bad = (code, message) => res.status(200).json({ jsonrpc: '2.0', id: rid, error: { code, message } });

  if (!isRequest) return bad(-32600, 'Invalid Request');

  if (msg.method === 'initialize') {
    return ok({
      protocolVersion: '2025-06-18',
      capabilities: { tools: { listChanged: true } },
      serverInfo: { name: 'tidewave-mcp', title: 'Tidewave MCP', version: '0.1.0' },
      instructions: 'OK'
    });
  }

  if (msg.method === 'tools/list' || msg.method === 'tools.list') {
    return ok({ tools: TOOL_DEFS });
  }

  if (msg.method === 'tools/call' || msg.method === 'tools.call' || msg.method === 'call_tool') {
    const { name, arguments: args } = msg.params || {};
    try {
      const result = await callToolByName(name, args || {});
      return ok(result);
    } catch (e) {
      console.error('[MCP] tools/call error', e, {
        owner: !!ghOwner, repo: !!ghRepo, token: !!ghToken, branch: ghBranch || '(default)'
      });
      const msgText = e?.response?.data?.message || e?.message || String(e);
      return err(msgText); // keep 200 JSON with error envelope
    }
  }

  return bad(-32601, `Method not found: ${msg.method}`);
});

/* -------------------- Diagnostics (always 200 JSON) -------------------- */
app.get('/healthz', (req, res) => {
  const origin = chooseOrigin(req);
  lockCors(res, origin);
  setCors(res, { origin, methods: ['GET','OPTIONS'], allowHeaders: 'accept' });
  res.json({ status: 'ok', message: 'MCP server is healthy' });
});
app.get('/favicon.ico', (_req, res) => res.sendStatus(204));
app.get('/robots.txt', (_req, res) => res.type('text/plain').send('User-agent: *\nDisallow:'));

app.post('/tools/env_check', async (_req, res) => {
  return res.status(200).json({ GH_OWNER: !!process.env.GH_OWNER, GH_REPO: !!process.env.GH_REPO, GH_TOKEN: !!process.env.GH_TOKEN });
});
app.post('/tools/fs_read', async (req, res) => {
  try {
    const fp = req.body?.file_path;
    if (!fp) throw new Error('file_path is required');
    const content = await readGitHubFile(fp);
    return res.status(200).json({ ok: true, content });
  } catch (e) {
    return res.status(200).json({ ok: false, error: String(e?.message || e) });
  }
});
app.post('/tools/fs_write', async (req, res) => {
  try {
    const { file_path, content, message } = req.body || {};
    if (!file_path || typeof content !== 'string') throw new Error('file_path and content are required');
    const sha = await writeGitHubFile(file_path, content, message || 'via /tools');
    return res.status(200).json({ ok: true, commit_sha: sha });
  } catch (e) {
    return res.status(200).json({ ok: false, error: String(e?.message || e) });
  }
});

/* -------------------- Error & signals -------------------- */
app.use((err, _req, res, _next) => {
  try { console.error('[EXPRESS ERROR]', err); } catch (_) {}
  if (!res.headersSent) res.status(500).json({ error: 'internal' });
});
process.on('uncaughtException', (e) => { console.error('[uncaughtException]', e); setTimeout(() => process.exit(1), 100); });
process.on('unhandledRejection', (e) => { console.error('[unhandledRejection]', e); });

/* -------------------- Bridge: /mcp/<link-id>/<tool> (always 200 JSON) -------------------- */
// 위치: app.listen(...) 위(중요). callToolByName는 "블록 A"로 정의돼 있어야 함.
app.post(/^\/mcp\/[^\/]+\/([a-zA-Z0-9_\-\.]+)$/, async (req, res) => {
  try {
    const raw  = req.params[0];  // e.g. "echo", "mcp_echo"
    const tool = String(raw || '')
      .replace(/^mcp-server-(new_)?/, '')
      .replace(/^mcp[-_]/, '');   // mcp_echo / mcp-echo -> echo

    const args = (req.body && typeof req.body === 'object') ? req.body : {};
    const out  = await callToolByName(tool, args);
    return res.status(200).json({ ok: true, ...out });
  } catch (e) {
    return res.status(200).json({ ok: false, error: String(e?.message || e) });
  }
});


/* -------------------- start -------------------- */
const server = app.listen(port, () => { console.log('MCP server listening on port ' + port); });
server.keepAliveTimeout = 65000;
server.headersTimeout   = 66000;
server.requestTimeout   = 0; // never kill long SSE

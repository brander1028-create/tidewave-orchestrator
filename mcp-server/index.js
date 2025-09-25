// mcp-server/index.js — FINAL (Render-ready, /mcp + /run, healthz, robots, robust handlers)

const express = require('express');
const bodyParser = require('body-parser');
const { Octokit } = require('@octokit/rest');

const app = express();
app.set('trust proxy', true);
const port = process.env.PORT || 3000;

// === MCP Tool Definitions ===
const TOOL_DEFS = [
  {
    name: "env_check",
    description: "Show which GH_* envs are set",
    input_schema: { type: "object", properties: {} },
    output_schema: {
      type: "object",
      properties: {
        GH_OWNER:  { type: "boolean" },
        GH_REPO:   { type: "boolean" },
        GH_TOKEN:  { type: "boolean" },
        GH_BRANCH: { type: "boolean" }
      },
      required: ["GH_OWNER","GH_REPO","GH_TOKEN"]
    }
  },
  {
    name: "fs_read",
    description: "Read a file from repo",
    input_schema: {
      type: "object",
      properties: { file_path: { type: "string" } },
      required: ["file_path"]
    },
    output_schema: { type: "object" }
  },
  {
    name: "fs_write",
    description: "Write file & commit to repo",
    input_schema: {
      type: "object",
      properties: {
        file_path: { type: "string" },
        content:   { type: "string" },
        message:   { type: "string" }
      },
      required: ["file_path","content"]
    },
    output_schema: {
      type: "object",
      properties: { commit_sha: { type: "string" } },
      required: ["commit_sha"]
    }
  }
];

// (없다면 추가) 툴 실행 스위치
async function callToolByName(name, args) {
  if (name === "env_check") {
    const GH_OWNER  = !!process.env.GH_OWNER;
    const GH_REPO   = !!process.env.GH_REPO;
    const GH_TOKEN  = !!process.env.GH_TOKEN;
    const GH_BRANCH = !!(process.env.GH_BRANCH || "main"); // 기본 main 가정 → true
    return { GH_OWNER, GH_REPO, GH_TOKEN, GH_BRANCH };
  }
  // fs_read / fs_write 기존 구현은 그대로 유지
  if (name === "fs_read")  { /* ...existing... */ }
  if (name === "fs_write") { /* ...existing... */ }
  throw new Error(`Unknown tool: ${name}`);
}


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

  const ka = setInterval(() => {
    try { res.write(`:\n\n`); } catch (_) {}
  }, 15000);
  req.on('close', () => clearInterval(ka));
}

/* -------------------- /mcp (guard + body) -------------------- */
app.use(['/mcp', '/mcp/'], (req, res, next) => {
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

app.use(bodyParser.json({ limit: '10mb' }));

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

// GET /mcp -> SSE (endpoint discovery)
app.get(['/mcp','/mcp/'], (req, res) => sseHandshake(req, res));

/* -------------------- Root as SSE (dev-mode friendly) -------------------- */
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
  const putParams = {
    owner: ghOwner, repo: ghRepo, path, message, content: encoded, sha,
  };
  if (ghBranch) putParams.branch = ghBranch;
  const r = await octokit.repos.createOrUpdateFileContents(putParams);
  return r.data.commit.sha;
}

/* -------------------- /run compatibility layer (for connectors calling /run) -------------------- */
function normToolName(name = '') {
  return String(name).replace(/^mcp-server-(new_)?/, '');
}

async function runToolCompat(nameRaw, args = {}) {
  const name = normToolName(nameRaw);
  if (name === 'env_check') {
    return { ok: true, tool: 'env_check', data: { type: 'json', json: {
      GH_OWNER: !!ghOwner, GH_REPO: !!ghRepo, GH_TOKEN: !!ghToken, GH_BRANCH: !!ghBranch
    } } };
  }
  if (name === 'fs_read') {
    if (!args.file_path) throw new Error('file_path is required');
    const content = await readGitHubFile(args.file_path);
    return { ok: true, tool: 'fs_read', data: { type: 'text', text: content } };
  }
  if (name === 'fs_write') {
    if (!args.file_path || typeof args.content !== 'string')
      throw new Error('file_path and content are required');
    const sha = await writeGitHubFile(args.file_path, args.content, args.message || 'via /run');
    return { ok: true, tool: 'fs_write', data: { type: 'text', text: `commit=${sha}` }, commit_sha: sha };
  }
  return { ok: false, error: `unknown tool: ${nameRaw}` };
}

// CORS/OPTIONS for /run family
app.use(['/run','/tools/run','/batch_run'], (req, res, next) => {
  const origin = chooseOrigin(req);
  lockCors(res, origin);
  setCors(res, {
    origin,
    methods: ['POST','OPTIONS'],
    allowHeaders: req.headers['access-control-request-headers'] || 'accept, content-type, authorization',
  });
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

// always 200 JSON to avoid 424 wrapping
function safeJson(res, payload) {
  try { return res.status(200).json(payload); }
  catch (e) { return res.status(200).json({ ok:false, error:String(e?.message||e) }); }
}

// /run & /tools/run
app.post(['/run','/tools/run'], express.json(), async (req, res) => {
  try {
    const { name, arguments: args = {} } = req.body || {};
    const out = await runToolCompat(name, args);
    return safeJson(res, out);
  } catch (e) {
    console.error('[compat /run] error', e);
    return safeJson(res, { ok:false, error:String(e?.message||e) });
  }
});

// /batch_run
app.post('/batch_run', express.json(), async (req, res) => {
  try {
    const steps = Array.isArray(req.body?.steps) ? req.body.steps : [];
    const results = [];
    for (const s of steps) results.push(await runToolCompat(s?.name, s?.arguments||{}));
    return safeJson(res, { ok:true, results });
  } catch (e) {
    console.error('[compat /batch_run] error', e);
    return safeJson(res, { ok:false, error:String(e?.message||e) });
  }
app.post("/mcp", express.json(), async (req, res) => {
  const { jsonrpc, id, method, params } = req.body || {};
  try {
    // 1) 필수: 툴 목록 제공 (슬래시 버전)
    if (method === "tools/list") {
      return res.json({ jsonrpc: "2.0", id, result: { tools: TOOL_DEFS } });
    }
    // 2) 실행: 호환을 위해 3가지 메서드 모두 허용
    if (method === "tools/call" || method === "call_tool" || method === "tools.call") {
      const { name, arguments: args = {} } = params || {};
      const result = await callToolByName(name, args);
      return res.json({ jsonrpc: "2.0", id, result });
    }
    // 3) 기본: 표준 에러
    return res.json({ jsonrpc: "2.0", id, error: { code: -32601, message: "Method not found" } });
  } catch (e) {
    return res.json({ jsonrpc: "2.0", id, error: { code: -32000, message: String(e?.message || e) } });
  }
});

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

  const _rxAt = new Date().toISOString();
  console.log('[MCP] POST /mcp rx @', _rxAt, 'body=', JSON.stringify(req.body));

  const msg = req.body || {};
  const isRequest    = msg && typeof msg === 'object' && 'method' in msg && 'id' in msg;
  const isNotifyOnly = msg && typeof msg === 'object' && 'method' in msg && !('id' in msg);
  if (isNotifyOnly) return res.sendStatus(202);

  const rid = isRequest ? msg.id : null;
  const ok  = (result)  => res.status(200).json({ jsonrpc:'2.0', id: rid, result });
  const err = (message) => res.status(200).json({ jsonrpc:'2.0', id: rid, error:{ code:-32001, message } });
  const bad = (code, message) => res.status(200).json({ jsonrpc:'2.0', id: rid, error:{ code, message } });

  if (!isRequest) return bad(-32600, 'Invalid Request');

  // initialize
  if (msg.method === 'initialize') {
    return ok({
      protocolVersion: '2025-06-18',
      capabilities: { tools: { listChanged: true } },
      serverInfo: { name: 'tidewave-mcp', title: 'Tidewave MCP', version: '0.1.0' },
      instructions: 'OK'
    });
  }

  // tools/list
  if (msg.method === 'tools/list') {
    return ok({
      tools: [
        { name: 'echo',
          description: 'Echo back input',
          inputSchema: { type:'object', properties:{ text:{ type:'string' } }, required:['text'] } },
        { name: 'env_check',
          description: 'Report which GitHub env vars are set (booleans only)',
          inputSchema: { type:'object', properties:{}, additionalProperties:false } },
        { name: 'fs_read',
          description: 'Read file from GitHub',
          inputSchema: { type:'object', properties:{ file_path:{ type:'string' } }, required:['file_path'] } },
        { name: 'fs_write',
          description: 'Write file to GitHub',
          inputSchema: { type:'object', properties:{ file_path:{ type:'string' }, content:{ type:'string' }, message:{ type:'string' } }, required:['file_path','content'] } },
      ]
    });
  }

  // tools/call
  if (msg.method === 'tools/call') {
    const { name, arguments: args } = msg.params || {};
    console.log('[MCP] tools/call', { name, args, env: { owner: !!ghOwner, repo: !!ghRepo, token: !!ghToken, branch: !!ghBranch } });

    try {
      if (name === 'echo') {
        return ok({ ok:true, tool:'echo', data:{ type:'text', text:String(args?.text ?? '') } });
      }

      if (name === 'env_check') {
        try {
          return ok({ ok:true, tool:'env_check', data:{ type:'json', json:{
            GH_OWNER: !!ghOwner, GH_REPO: !!ghRepo, GH_TOKEN: !!ghToken, GH_BRANCH: !!ghBranch
          } } });
        } catch (e) {
          return ok({ ok:false, tool:'env_check', error:String(e?.message || e) }); // keep 200 JSON
        }
      }

      if (name === 'fs_read') {
        if (!args?.file_path) return err('file_path is required');
        const content = await readGitHubFile(args.file_path);
        return ok({ ok:true, tool:'fs_read', data:{ type:'text', text: content } });
      }

      if (name === 'fs_write') {
        if (!args?.file_path || typeof args?.content !== 'string')
          return err('file_path and content are required');
        const sha = await writeGitHubFile(args.file_path, args.content, args?.message || 'update via mcp');
        return ok({ ok:true, tool:'fs_write', data:{ type:'text', text:`commit=${sha}` }, commit_sha: sha });
      }

      return err(`Unknown tool: ${name}`);
    } catch (e) {
      console.error('[MCP] tools/call error', e, {
        owner: !!ghOwner, repo: !!ghRepo, token: !!ghToken, branch: ghBranch || '(default)'
      });
      const msgText = e?.response?.data?.message || e?.message || String(e);
      return err(msgText); // keep 200 JSON with error envelope
    }
  }

  // fallback
  return bad(-32601, `Method not found: ${msg.method}`);
});

/* -------------------- health & misc -------------------- */
app.get('/healthz', (req, res) => {
  const origin = chooseOrigin(req);
  lockCors(res, origin);
  setCors(res, { origin, methods: ['GET','OPTIONS'], allowHeaders: 'accept' });
  res.json({ status: 'ok', message: 'MCP server is healthy' });
});

// quiet fav/robots
app.get('/favicon.ico', (_req, res) => res.sendStatus(204));
app.get('/robots.txt', (_req, res) =>
  res.type('text/plain').send('User-agent: *\nDisallow:')
);

/* -------------------- error & signal handlers -------------------- */
app.use((err, _req, res, _next) => {
  try { console.error('[EXPRESS ERROR]', err); } catch (_) {}
  if (!res.headersSent) res.status(500).json({ error: 'internal' });
});

process.on('uncaughtException', (e) => {
  console.error('[uncaughtException]', e);
  setTimeout(() => process.exit(1), 100); // let Render restart
});
process.on('unhandledRejection', (e) => {
  console.error('[unhandledRejection]', e);
});
// ---- REST 진단 엔드포인트 (항상 200 JSON) ----
app.post('/tools/env_check', express.json(), (req, res) => {
  try {
    res.status(200).json({
      GH_OWNER: !!process.env.GH_OWNER,
      GH_REPO:  !!process.env.GH_REPO,
      GH_TOKEN: !!process.env.GH_TOKEN,
    });
  } catch (e) {
    res.status(200).json({ ok:false, error:String(e) });
  }
});

app.post('/tools/fs_read', express.json(), async (req, res) => {
  try {
    const fp = req.body?.file_path;
    if (!fp) throw new Error('file_path is required');
    const content = await readGitHubFile(fp);
    res.status(200).json({ ok:true, content });
  } catch (e) {
    res.status(200).json({ ok:false, error:String(e?.message||e) });
  }
});

app.post('/tools/fs_write', express.json(), async (req, res) => {
  try {
    const { file_path, content, message } = req.body || {};
    if (!file_path || typeof content !== 'string') throw new Error('file_path and content are required');
    const sha = await writeGitHubFile(file_path, content, message || 'via /tools');
    res.status(200).json({ ok:true, commit_sha: sha });
  } catch (e) {
    res.status(200).json({ ok:false, error:String(e?.message||e) });
  }
});

/* -------------------- start -------------------- */
const server = app.listen(port, () => {
  console.log('MCP server listening on port ' + port);
});
server.keepAliveTimeout = 65000;
server.headersTimeout   = 66000;
server.requestTimeout   = 0; // never kill long SSE

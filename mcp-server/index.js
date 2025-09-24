// mcp-server/index.js — FINAL

const express = require('express');
const bodyParser = require('body-parser');
const { Octokit } = require('@octokit/rest');
const axios = require('axios');

const app = express();
const port = process.env.PORT || 3000;

/* -------------------- 공통 유틸: CORS 락/세팅 -------------------- */
function lockCors(res, origin) {
  const origSetHeader = res.setHeader.bind(res);
  res.setHeader = function (name, value) {
    const key = String(name).toLowerCase();
    if (key === 'access-control-allow-origin') value = origin;
    if (key === 'vary') {
      const parts = String(value || '').split(',').map(s => s.trim().toLowerCase());
      if (!parts.includes('origin')) value = (value ? String(value)+', Origin' : 'Origin');
    }
    return origSetHeader(name, value);
  };

  const origWriteHead = res.writeHead?.bind(res);
  if (origWriteHead) {
    res.writeHead = function (statusCode, statusMessage, headers) {
      // (statusMessage 가 생략된 형태도 안전 처리)
      if (statusMessage && typeof statusMessage === 'object' && !headers) {
        headers = statusMessage; statusMessage = undefined;
      }
      if (headers && typeof headers === 'object') {
        for (const k of Object.keys(headers)) {
          const key = k.toLowerCase();
          if (key === 'access-control-allow-origin') headers[k] = origin;
          if (key === 'vary') {
            const v = String(headers[k] || '');
            if (!v.toLowerCase().split(',').map(s=>s.trim()).includes('origin')) {
              headers[k] = v ? (v + ', Origin') : 'Origin';
            }
          }
        }
      }
      return origWriteHead(statusCode, statusMessage, headers);
    };
  }

  const origEnd = res.end.bind(res);
  res.end = function (chunk, encoding, cb) {
    // 응답 종료 직전 최종 보정
    origSetHeader('Access-Control-Allow-Origin', origin);
    return origEnd(chunk, encoding, cb);
  };
}

function setCors(res, { origin, methods, allowHeaders, maxAge = 86400 }) {
  res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Methods', methods.join(','));
  res.setHeader('Access-Control-Allow-Headers', allowHeaders);
  res.setHeader('Access-Control-Max-Age', String(maxAge));
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('X-Accel-Buffering', 'no');
  res.setHeader('Content-Encoding', 'identity');
}

/* -------------------- /mcp (신규 MCP 단일 엔드포인트) -------------------- */
// 프리플라이트/헤더는 가장 먼저 처리(다른 미들웨어보다 위)
app.use(['/mcp','/mcp/'], (req, res, next) => {
  lockCors(res, 'https://chat.openai.com');
  setCors(res, {
    origin: req.headers.origin || 'https://chat.openai.com',
    methods: ['GET','POST','OPTIONS'],
    allowHeaders: req.headers['access-control-request-headers'] || 'accept, content-type, authorization, mcp-protocol-version',
  });
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  return next();
});

// 바디 파서(이 아래에서 정의하는 POST 라우트에 적용됨)
app.use(bodyParser.json({ limit: '10mb' }));

// HEAD /mcp (헬스/헤더 확인용)
app.head(['/mcp','/mcp/'], (req, res) => res.sendStatus(200));

// GET /mcp → SSE 오픈 + 최초 'endpoint' 이벤트(구규격 폴백용)
app.get(['/mcp','/mcp/'], (req, res) => {
  lockCors(res, 'https://chat.openai.com');
  setCors(res, {
    origin: req.headers.origin || 'https://chat.openai.com',
    methods: ['GET','POST','OPTIONS'],
    allowHeaders: 'accept, content-type, authorization, mcp-protocol-version',
  });

  res.type('text/event-stream; charset=utf-8');
  if (typeof res.flushHeaders === 'function') res.flushHeaders();

  const postUrl = `${req.protocol}://${req.get('host')}/mcp`;
  res.write('event: endpoint\n');
  res.write(`data: ${JSON.stringify({ post: postUrl })}\n\n`);
  res.write('retry: 15000\n\n');

  const ka = setInterval(() => res.write(':\n\n'), 15000);
  req.on('close', () => clearInterval(ka));
});

// POST /mcp → JSON-RPC 최소 구현(initialize, tools/list)
app.post(['/mcp','/mcp/'], (req, res) => {
  lockCors(res, 'https://chat.openai.com');
  setCors(res, {
    origin: req.headers.origin || 'https://chat.openai.com',
    methods: ['GET','POST','OPTIONS'],
    allowHeaders: 'accept, content-type, authorization, mcp-protocol-version',
  });
  res.type('application/json; charset=utf-8');

  const msg = req.body || {};
  const isRequest    = msg && typeof msg === 'object' && 'method' in msg && 'id' in msg;
  const isNotifyOnly = msg && typeof msg === 'object' && 'method' in msg && !('id' in msg);
  if (isNotifyOnly) return res.sendStatus(202);

  const rid = isRequest ? msg.id : null;
  const bad = (code, message) => res.status(200).json({ jsonrpc: '2.0', id: rid, error: { code, message } });
  if (!isRequest) return bad(-32600, 'Invalid Request');

  if (msg.method === 'initialize') {
    const result = {
      protocolVersion: '2025-06-18',
      capabilities: { tools: { listChanged: true } },
      serverInfo: { name: 'tidewave-mcp', title: 'Tidewave MCP', version: '0.1.0' },
      instructions: 'OK'
    };
    return res.status(200).json({ jsonrpc: '2.0', id: rid, result });
  }

  if (msg.method === 'tools/list') {
    // 최소 1개 도구를 노출하는 편이 호환성↑ — 필요 시 추가
    const result = { tools: [] };
    return res.status(200).json({ jsonrpc: '2.0', id: rid, result });
  }

  return bad(-32601, `Method not found: ${msg.method}`);
});

/* -------------------- (선택) /sse 레거시 핸들러 유지 -------------------- */
// /sse도 커넥터가 찔러볼 수 있으니 CORS 락을 동일하게 적용
app.use(['/sse','/sse/'], (req, res, next) => {
  lockCors(res, 'https://chat.openai.com');
  setCors(res, {
    origin: req.headers.origin || 'https://chat.openai.com',
    methods: ['GET','HEAD','OPTIONS'],
    allowHeaders: req.headers['access-control-request-headers'] || 'accept, content-type, authorization',
  });
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  return next();
});

app.head(['/sse','/sse/'], (req, res) => res.sendStatus(200));

app.get(['/sse','/sse/'], (req, res) => {
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

/* -------------------- 기타 API (GitHub/Deploy/Health) -------------------- */
const ghToken = process.env.GH_TOKEN;
let octokit = ghToken ? new Octokit({ auth: ghToken }) : null;
if (!octokit) console.warn('Warning: GH_TOKEN not set. GitHub endpoints will fail.');
const ghOwner = process.env.GH_OWNER;
const ghRepo  = process.env.GH_REPO;

async function readGitHubFile(path) {
  if (!octokit || !ghOwner || !ghRepo) throw new Error('Missing GitHub configuration (GH_TOKEN, GH_OWNER, GH_REPO).');
  const result = await octokit.repos.getContent({ owner: ghOwner, repo: ghRepo, path });
  if (Array.isArray(result.data)) throw new Error(`Path ${path} is a directory.`);
  return Buffer.from(result.data.content, result.data.encoding).toString('utf8');
}

async function writeGitHubFile(path, content, message = 'Update file') {
  if (!octokit || !ghOwner || !ghRepo) throw new Error('Missing GitHub configuration (GH_TOKEN, GH_OWNER, GH_REPO).');
  const encoded = Buffer.from(content).toString('base64');
  let sha;
  try {
    const { data } = await octokit.repos.getContent({ owner: ghOwner, repo: ghRepo, path });
    if (!Array.isArray(data)) sha = data.sha;
  } catch (_) {}
  const res = await octokit.repos.createOrUpdateFileContents({
    owner: ghOwner, repo: ghRepo, path, message, content: encoded, sha,
  });
  return res.data.commit.sha;
}

app.post('/fs_read', async (req, res) => {
  const { file_path } = req.body;
  if (!file_path) return res.status(400).json({ error: 'file_path is required' });
  try { const data = await readGitHubFile(file_path); res.json({ content: data }); }
  catch (err) { res.status(400).json({ error: err.message }); }
});

app.post('/fs_write', async (req, res) => {
  const { file_path, content, message } = req.body;
  if (!file_path || typeof content !== 'string') return res.status(400).json({ error: 'file_path and content are required' });
  try { const sha = await writeGitHubFile(file_path, content, message); res.json({ ok: true, commit_sha: sha }); }
  catch (err) { res.status(400).json({ error: err.message }); }
});

app.post('/deploy_vercel', async (_req, res) => {
  const hook = process.env.VERCEL_DEPLOY_HOOK;
  if (!hook) return res.status(400).json({ error: 'VERCEL_DEPLOY_HOOK is not configured' });
  try { const r = await axios.post(hook, {}); res.json({ status: r.status, data: r.data }); }
  catch (err) { res.status(400).json({ error: err.message }); }
});

app.post('/deploy_render', async (_req, res) => {
  const hook = process.env.RENDER_DEPLOY_HOOK;
  if (!hook) return res.status(400).json({ error: 'RENDER_DEPLOY_HOOK is not configured' });
  try { const r = await axios.post(hook, {}); res.json({ status: r.status, data: r.data }); }
  catch (err) { res.status(400).json({ error: err.message }); }
});

app.post('/preview_url_get', (_req, res) => {
  const url = process.env.PREVIEW_URL;
  if (!url) return res.status(400).json({ error: 'PREVIEW_URL is not configured' });
  res.json({ url });
});

app.get('/', (_req, res) => res.json({ status: 'ok', message: 'MCP server is running' }));

/* -------------------- start -------------------- */
const server = app.listen(port, () => {
  console.log('MCP server listening on port ' + port);
});
server.keepAliveTimeout = 65000;
server.headersTimeout   = 66000;

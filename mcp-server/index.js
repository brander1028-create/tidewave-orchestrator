// mcp-server/index.js (FINAL)

const express = require('express');
const bodyParser = require('body-parser');
const { Octokit } = require('@octokit/rest');
const axios = require('axios');

const app = express();
const port = process.env.PORT || 3000;

// res.end 직전 최종 강제(마지막 보정)
const __origEnd = res.end.bind(res);
res.end = function (chunk, encoding, cb) {
  res.setHeader('Access-Control-Allow-Origin', 'https://chat.openai.com');
  return __origEnd(chunk, encoding, cb);
};

/* === MCP endpoint (Streamable HTTP) — POST+GET in one path ===
   참고 스펙: 단일 엔드포인트에서 POST/GET을 모두 처리. (2025-06-18)
   https://modelcontextprotocol.io/specification/2025-06-18/basic/transports
*/
function setMcpCors(req, res) {
  const origin = req.headers.origin || 'https://chat.openai.com';
  // 최종 오버라이드 훅: '*'로 덮여도 마지막에 교체
  const origSet = res.setHeader.bind(res);
  res.setHeader = function (name, value) {
    const key = String(name).toLowerCase();
    if (key === 'access-control-allow-origin') value = 'https://chat.openai.com';
    if (key === 'vary') {
      const parts = String(value || '').split(',').map(s => s.trim().toLowerCase());
      if (!parts.includes('origin')) value = (value ? String(value)+', Origin' : 'Origin');
    }
    return origSet(name, value);
  };
  const origWH = res.writeHead?.bind(res);
  if (origWH) {
    res.writeHead = function (code, msg, headers) {
      if (headers && typeof headers === 'object') {
        for (const k of Object.keys(headers)) {
          if (k.toLowerCase() === 'access-control-allow-origin') headers[k] = 'https://chat.openai.com';
          if (k.toLowerCase() === 'vary') {
            const v = String(headers[k] || '');
            if (!v.toLowerCase().split(',').map(s=>s.trim()).includes('origin')) {
              headers[k] = v ? (v + ', Origin') : 'Origin';
            }
          }
        }
      }
      return origWH(code, msg, headers);
    };
  }

  // 기본 CORS
  res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader(
    'Access-Control-Allow-Headers',
    req.headers['access-control-request-headers'] || 'accept, content-type, authorization, mcp-protocol-version'
  );
  res.setHeader('Access-Control-Max-Age', '86400');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('X-Accel-Buffering', 'no');
  res.setHeader('Content-Encoding', 'identity');
}

// /mcp 전용 가드(프리플라이트는 즉시 204)
app.use(['/mcp','/mcp/'], (req, res, next) => {
  setMcpCors(req, res);
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  return next();
});

// (옵션) HEAD /mcp: CORS 노출 확인용
app.head(['/mcp','/mcp/'], (req, res) => {
  setMcpCors(req, res);
  return res.sendStatus(200);
});

// GET /mcp → SSE 열고 최초에 'endpoint' 이벤트 전송 (구규격 호환 경로)
// 클라가 구규격으로 폴백할 때 첫 이벤트로 POST 보낼 URL을 알려줘야 함.
app.get(['/mcp','/mcp/'], (req, res) => {
  setMcpCors(req, res);
  res.type('text/event-stream; charset=utf-8');
  res.flushHeaders?.();

  const postUrl = `${req.protocol}://${req.get('host')}/mcp`;
  res.write('event: endpoint\n');
  res.write(`data: ${JSON.stringify({ post: postUrl })}\n\n`);
  res.write('retry: 15000\n\n');

  const ka = setInterval(()=>res.write(':\n\n'), 15000);
  req.on('close', ()=>clearInterval(ka));
});

// POST /mcp → JSON-RPC 단일 요청 처리 (최소 구현)
// initialize / tools/list만 응답. 나머지는 미구현 에러.
app.post(['/mcp','/mcp/'], (req, res) => {
  setMcpCors(req, res);
  res.type('application/json; charset=utf-8');

  const msg = req.body || {};
  const isRequest    = msg && typeof msg === 'object' && 'method' in msg && 'id' in msg;
  const isNotifyOnly = msg && typeof msg === 'object' && 'method' in msg && !('id' in msg);

  // 알림은 202 무응답
  if (isNotifyOnly) return res.sendStatus(202);

  const rid = isRequest ? msg.id : null;
  const bad = (code, message) => res.status(200).json({ jsonrpc: '2.0', id: rid, error: { code, message } });

  if (!isRequest) return bad(-32600, 'Invalid Request');

  if (msg.method === 'initialize') {
    // 스펙 예시 형태의 최소 응답(프로토콜/서버/캡ABILITIES) :contentReference[oaicite:1]{index=1}
    const result = {
      protocolVersion: '2025-06-18',
      capabilities: {
        tools: { listChanged: true }
      },
      serverInfo: { name: 'tidewave-mcp', title: 'Tidewave MCP', version: '0.1.0' },
      instructions: 'OK'
    };
    return res.status(200).json({ jsonrpc: '2.0', id: rid, result });
  }

  if (msg.method === 'tools/list') {
    const result = { tools: [] }; // 필요 시 이후 툴 추가
    return res.status(200).json({ jsonrpc: '2.0', id: rid, result });
  }

  // 미구현
  return bad(-32601, `Method not found: ${msg.method}`);
});



// --- /sse 전용 CORS 가드(최종 오버라이드) ---
app.use(['/sse','/sse/'], (req, res, next) => {
  // 최종 단계까지 헤더 강제 교체: setHeader + writeHead 둘 다 훅
  const origSetHeader = res.setHeader.bind(res);
  res.setHeader = function(name, value) {
    const key = String(name).toLowerCase();
    if (key === 'access-control-allow-origin') value = 'https://chat.openai.com';
    if (key === 'vary') {
      const parts = String(value || '').split(',').map(s => s.trim().toLowerCase());
      if (!parts.includes('origin')) value = (value ? String(value)+', Origin' : 'Origin');
    }
    return origSetHeader(name, value);
  };
  const origWriteHead = res.writeHead.bind(res);
  res.writeHead = function(statusCode, statusMessage, headers) {
    // headers 인자로 넘어오는 경우까지 최종 보정
    if (headers && typeof headers === 'object') {
      const keys = Object.keys(headers);
      for (const k of keys) {
        if (k.toLowerCase() === 'access-control-allow-origin') {
          headers[k] = 'https://chat.openai.com';
        }
        if (k.toLowerCase() === 'vary') {
          const v = String(headers[k] || '');
          if (!v.toLowerCase().split(',').map(s=>s.trim()).includes('origin')) {
            headers[k] = v ? (v + ', Origin') : 'Origin';
          }
        }
      }
    }
    return origWriteHead(statusCode, statusMessage, headers);
  };

  // 기본 값 세팅 + 프리플라이트 즉시 종료
  res.setHeader('Access-Control-Allow-Origin', req.headers.origin || 'https://chat.openai.com');
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Methods', 'GET,HEAD,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers',
    req.headers['access-control-request-headers'] || 'accept, content-type, authorization');
  res.setHeader('Access-Control-Max-Age', '86400');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('X-Accel-Buffering', 'no');

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

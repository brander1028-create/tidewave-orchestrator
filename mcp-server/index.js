const express = require('express');
const bodyParser = require('body-parser');
const { Octokit } = require('@octokit/rest');
const axios = require('axios');

const app = express();
const port = process.env.PORT || 3000;

/* CORS helpers */
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
      if (statusMessage && typeof statusMessage === 'object' && !headers) { headers = statusMessage; statusMessage = undefined; }
      if (headers && typeof headers === 'object') {
        for (const k of Object.keys(headers)) {
          const kk = k.toLowerCase();
          if (kk === 'access-control-allow-origin') headers[k] = origin;
          if (kk === 'vary') {
            const v = String(headers[k] || '');
            if (!v.toLowerCase().split(',').map(s=>s.trim()).includes('origin')) headers[k] = v ? (v + ', Origin') : 'Origin';
          }
        }
      }
      return origWriteHead(statusCode, statusMessage, headers);
    };
  }
  const origEnd = res.end.bind(res);
  res.end = function (chunk, encoding, cb) {
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

/* /mcp: guard + body */
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
app.use(bodyParser.json({ limit: '10mb' }));

app.head(['/mcp','/mcp/'], (_req, res) => res.sendStatus(200));
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

/* GitHub helpers */
const ghToken = process.env.GH_TOKEN;
let octokit = ghToken ? new Octokit({ auth: ghToken }) : null;
if (!octokit) console.warn('Warning: GH_TOKEN not set. GitHub endpoints will fail.');
const ghOwner = process.env.GH_OWNER;
const ghRepo  = process.env.GH_REPO;

async function readGitHubFile(path) {
  if (!octokit || !ghOwner || !ghRepo) throw new Error('Missing GitHub configuration (GH_TOKEN, GH_OWNER, GH_REPO).');
  const { data } = await octokit.repos.getContent({ owner: ghOwner, repo: ghRepo, path });
  if (Array.isArray(data)) throw new Error(`Path ${path} is a directory.`);
  return Buffer.from(data.content, data.encoding).toString('utf8');
}
async function writeGitHubFile(path, content, message = 'Update file') {
  if (!octokit || !ghOwner || !ghRepo) throw new Error('Missing GitHub configuration (GH_TOKEN, GH_OWNER, GH_REPO).');
  const encoded = Buffer.from(content).toString('base64');
  let sha;
  try {
    const { data } = await octokit.repos.getContent({ owner: ghOwner, repo: ghRepo, path });
    if (!Array.isArray(data)) sha = data.sha;
  } catch (_) {}
  const r = await octokit.repos.createOrUpdateFileContents({ owner: ghOwner, repo: ghRepo, path, message, content: encoded, sha });
  return r.data.commit.sha;
}

/* JSON-RPC: initialize / tools/list / tools/call */
// POST /mcp → JSON-RPC (initialize / tools/list / tools/call)
app.post(['/mcp','/mcp/'], async (req, res) => {
  lockCors(res, 'https://chat.openai.com');
  setCors(res, {
    origin: req.headers.origin || 'https://chat.openai.com',
    methods: ['GET','POST','OPTIONS'],
    allowHeaders: 'accept, content-type, authorization, mcp-protocol-version',
  });
  res.type('application/json; charset=utf-8');

  // (선택) 실행 로깅 — 문제시 디버깅에 도움
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

  // ---- initialize ----
  if (msg.method === 'initialize') {
    return ok({
      protocolVersion: '2025-06-18',
      capabilities: { tools: { listChanged: true } },
      serverInfo: { name: 'tidewave-mcp', title: 'Tidewave MCP', version: '0.1.0' },
      instructions: 'OK'
    });
  }

  // ---- tools/list ----
  if (msg.method === 'tools/list') {
    return ok({
      tools: [
        {
          name: 'echo',
          description: 'Echo back input',
          inputSchema: {
            type: 'object',
            properties: { text: { type: 'string' } },
            required: ['text']
          }
        },
        {
          name: 'fs_read',
          description: 'Read file from GitHub',
          inputSchema: {
            type: 'object',
            properties: { file_path: { type: 'string' } },
            required: ['file_path']
          }
        },
        {
          name: 'fs_write',
          description: 'Write file to GitHub',
          inputSchema: {
            type: 'object',
            properties: {
              file_path: { type: 'string' },
              content:   { type: 'string' },
              message:   { type: 'string' }
            },
            required: ['file_path','content']
          }
        }
      ]
    });
  }

  // ---- tools/call ----
if (msg.method === 'tools/call') {
  const { name, arguments: args } = msg.params || {};
  console.log('[MCP] tools/call', { name, args });

  try {
    if (name === 'echo') {
      // ← UI가 좋아하는 보수적 결과 래핑
      return ok({ ok: true, tool: 'echo', data: { type: 'text', text: String(args?.text ?? '') } });
    }

    if (name === 'fs_read') {
      if (!args?.file_path) return err('file_path is required');
      const content = await readGitHubFile(args.file_path);
      // 텍스트를 명시적으로 전달
      return ok({ ok: true, tool: 'fs_read', data: { type: 'text', text: content } });
    }

    if (name === 'fs_write') {
      if (!args?.file_path || typeof args?.content !== 'string')
        return err('file_path and content are required');
      const sha = await writeGitHubFile(
        args.file_path, args.content, args?.message || 'update via mcp'
      );
      // 커밋 해시를 텍스트로도 함께 제공
      return ok({ ok: true, tool: 'fs_write', data: { type: 'text', text: `commit=${sha}` }, commit_sha: sha });
    }

    return err(`Unknown tool: ${name}`);
  } catch (e) {
    console.error('[MCP] tools/call error', e);
    return err(String(e?.message ?? e));
  }
}


  // ---- 기타 ----
  return bad(-32601, `Method not found: ${msg.method}`);
});


  return bad(-32601, `Method not found: ${msg.method}`);
// ---- __diag (진단용): 현재 핸들러 버전/시간/라우트 유무를 반환 ----
if (msg.method === '__diag') {
  return ok({
    handler: 'mcp-post-vFINAL',
    time: new Date().toISOString(),
    routes: {
      hasToolsList: true,
      hasToolsCall: true
    }
  });
}

// ---- tools/list ----
if (msg.method === 'tools/list') {
  return ok({
    tools: [
      {
        name: 'echo',
        description: 'Echo back input',
        inputSchema: {
          type: 'object',
          properties: { text: { type: 'string' } },
          required: ['text']
        }
      },
      {
        name: 'fs_read',
        description: 'Read file from GitHub',
        inputSchema: {
          type: 'object',
          properties: { file_path: { type: 'string' } },
          required: ['file_path']
        }
      },
      {
        name: 'fs_write',
        description: 'Write file to GitHub',
        inputSchema: {
          type: 'object',
          properties: {
            file_path: { type: 'string' },
            content:   { type: 'string' },
            message:   { type: 'string' }
          },
          required: ['file_path','content']
        }
      }
    ]
  });
}

// ---- tools/call ----
if (msg.method === 'tools/call') {
  const { name, arguments: args } = msg.params || {};
  try {
    if (name === 'echo') {
      return ok({ text: String(args?.text ?? '') });
    }
    if (name === 'fs_read') {
      if (!args?.file_path) return err('file_path is required');
      const content = await readGitHubFile(args.file_path);
      return ok({ content });
    }
    if (name === 'fs_write') {
      if (!args?.file_path || typeof args?.content !== 'string')
        return err('file_path and content are required');
      const sha = await writeGitHubFile(
        args.file_path, args.content, args?.message || 'update via mcp'
      );
      return ok({ ok: true, commit_sha: sha });
    }
    return err(`Unknown tool: ${name}`);
  } catch (e) {
    return err(String(e?.message ?? e));
  }
}

});

/* health */
app.get('/', (_req, res) => res.json({ status: 'ok', message: 'MCP server is running' }));

/* start */
const server = app.listen(port, () => { console.log('MCP server listening on port ' + port); });
server.keepAliveTimeout = 65000; server.headersTimeout = 66000;

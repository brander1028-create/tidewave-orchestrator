diff --git a//dev/null b/mcp-server/index.js
index 0000000000000000000000000000000000000000..32ff67a786d51728a6bb42120f2517b5710077cf 100644
--- a//dev/null
+++ b/mcp-server/index.js
@@ -0,0 +1,538 @@
+import express from 'express';
+import crypto from 'crypto';
+
+const app = express();
+app.use(express.json({ limit: '1mb' }));
+
+const APP_NAME = process.env.APP_NAME || 'mcp-server';
+const MCP_SHARED_SECRET = process.env.MCP_SHARED_SECRET || '';
+const MCP_REQUIRE_SHARED_SECRET = parseBool(process.env.MCP_REQUIRE_SHARED_SECRET, false);
+
+const tools = [
+  {
+    name: 'echo',
+    description: 'Echo the provided text back to the caller.',
+    input_schema: {
+      type: 'object',
+      properties: {
+        text: { type: 'string', description: 'Text to echo back.' }
+      },
+      required: ['text']
+    }
+  },
+  {
+    name: 'env_check',
+    description: 'Returns configured GitHub, Render, Vercel, and Supabase environment flags.',
+    input_schema: { type: 'object', properties: {}, additionalProperties: false }
+  },
+  {
+    name: 'fs_read',
+    description: 'Reads a file from the configured GitHub repository using the Contents API.',
+    input_schema: {
+      type: 'object',
+      properties: {
+        file_path: { type: 'string', description: 'Path to the file within the repository.' }
+      },
+      required: ['file_path']
+    }
+  },
+  {
+    name: 'fs_write',
+    description: 'Creates or updates a file in the configured GitHub repository.',
+    input_schema: {
+      type: 'object',
+      properties: {
+        file_path: { type: 'string' },
+        content: { type: 'string' },
+        message: { type: 'string' },
+        sha: {
+          type: 'string',
+          description: 'Known blob SHA from a prior fs_read; skips the extra GitHub read and fails fast on conflicts.'
+        }
+      },
+      required: ['file_path', 'content']
+    }
+  },
+  {
+    name: 'render_deploy',
+    description: 'Trigger a Render deployment using either a deploy hook or the Render API.',
+    input_schema: {
+      type: 'object',
+      properties: {
+        clear_cache: { type: 'boolean', default: true }
+      },
+      additionalProperties: false
+    }
+  },
+  {
+    name: 'vercel_deploy',
+    description: 'Trigger a Vercel deployment via deploy hook or the Vercel REST API.',
+    input_schema: {
+      type: 'object',
+      properties: {
+        production: { type: 'boolean', default: false },
+        payload: { type: 'object' },
+        deploy_hook: { type: 'string' },
+        team_id: { type: 'string' },
+        project_id: { type: 'string' }
+      },
+      additionalProperties: false
+    }
+  },
+  {
+    name: 'supabase_query',
+    description: 'Call a Supabase REST endpoint with the service role key.',
+    input_schema: {
+      type: 'object',
+      properties: {
+        path: { type: 'string', description: 'Relative path under the Supabase URL.' },
+        method: { type: 'string', default: 'GET' },
+        params: { type: 'object' },
+        body: { type: 'object' },
+        headers: { type: 'object', additionalProperties: { type: 'string' } }
+      },
+      required: ['path']
+    }
+  }
+];
+
+function parseBool(value, defaultValue) {
+  if (value === undefined || value === null) return defaultValue;
+  const lowered = String(value).trim().toLowerCase();
+  if (['1', 'true', 'yes', 'on'].includes(lowered)) return true;
+  if (['0', 'false', 'no', 'off', ''].includes(lowered)) return false;
+  return defaultValue;
+}
+
+function redact(value) {
+  return value ? '***' : null;
+}
+
+function jsonRpcResult(id, result) {
+  return { jsonrpc: '2.0', id, result };
+}
+
+function jsonRpcError(id, message, code = -32603, data) {
+  const error = { code, message };
+  if (data !== undefined) error.data = data;
+  return { jsonrpc: '2.0', id, error };
+}
+
+function extractSharedSecret(req) {
+  const auth = req.get('authorization');
+  if (auth) {
+    const token = auth.toLowerCase().startsWith('bearer ')
+      ? auth.slice(7).trim()
+      : auth.trim();
+    if (token) return token;
+  }
+  const headerToken = req.get('x-mcp-shared-secret') || req.get('mcp-shared-secret');
+  return headerToken ? headerToken.trim() : '';
+}
+
+function secretsEqual(a, b) {
+  if (!a || !b) return false;
+  const buffA = Buffer.from(a, 'utf8');
+  const buffB = Buffer.from(b, 'utf8');
+  if (buffA.length !== buffB.length) return false;
+  return crypto.timingSafeEqual(buffA, buffB);
+}
+
+function githubEnv() {
+  return {
+    owner: process.env.GH_OWNER || '',
+    repo: process.env.GH_REPO || '',
+    token: process.env.GH_TOKEN || '',
+    branch: process.env.GH_BRANCH || ''
+  };
+}
+
+async function githubRequest(method, filePath, { params, body } = {}) {
+  const { owner, repo, token } = githubEnv();
+  if (!owner || !repo) {
+    throw new Error('GH_OWNER and GH_REPO must be configured');
+  }
+  if (!token) {
+    throw new Error('GH_TOKEN is required for GitHub operations');
+  }
+  const safePath = (filePath || '').replace(/^\/+/, '');
+  if (!safePath) {
+    throw new Error('file_path must not be empty');
+  }
+  const url = new URL(`https://api.github.com/repos/${owner}/${repo}/contents/${safePath}`);
+  if (params) {
+    Object.entries(params).forEach(([key, value]) => {
+      if (value !== undefined && value !== null) {
+        url.searchParams.set(key, String(value));
+      }
+    });
+  }
+  const headers = {
+    Authorization: `Bearer ${token}`,
+    Accept: 'application/vnd.github+json',
+    'X-GitHub-Api-Version': '2022-11-28'
+  };
+  const response = await fetch(url, {
+    method,
+    headers,
+    body: body ? JSON.stringify(body) : undefined
+  });
+  return response;
+}
+
+async function githubReadFile(filePath) {
+  const branch = process.env.GH_BRANCH;
+  const response = await githubRequest('GET', filePath, {
+    params: branch ? { ref: branch } : undefined
+  });
+  if (response.status === 404) {
+    throw Object.assign(new Error('File not found'), { status: 404 });
+  }
+  if (!response.ok) {
+    throw new Error(`GitHub read failed with ${response.status}`);
+  }
+  const data = await response.json();
+  const encoding = data.encoding;
+  let decoded = data.content;
+  if (encoding === 'base64' && typeof data.content === 'string') {
+    decoded = Buffer.from(data.content, 'base64').toString('utf8');
+  }
+  return {
+    file_path: filePath,
+    content: decoded,
+    sha: data.sha,
+    encoding
+  };
+}
+
+async function githubWriteFile(filePath, { content, message, sha }) {
+  const branch = process.env.GH_BRANCH;
+  let effectiveSha = sha || null;
+  if (!effectiveSha) {
+    try {
+      const existing = await githubReadFile(filePath);
+      effectiveSha = existing.sha || null;
+    } catch (error) {
+      if (error && error.status === 404) {
+        effectiveSha = null;
+      } else {
+        throw error;
+      }
+    }
+  }
+  const payload = {
+    message: message || `Update ${filePath}`,
+    content: Buffer.from(content, 'utf8').toString('base64')
+  };
+  if (effectiveSha) payload.sha = effectiveSha;
+  if (branch) payload.branch = branch;
+
+  const response = await githubRequest('PUT', filePath, { body: payload });
+  if (response.status === 409) {
+    const details = await response.json().catch(() => undefined);
+    const error = new Error('GitHub reported a conflict');
+    error.code = 'GITHUB_CONFLICT';
+    error.details = details;
+    throw error;
+  }
+  if (!response.ok) {
+    const text = await response.text();
+    throw new Error(`GitHub write failed with ${response.status}: ${text}`);
+  }
+  const data = await response.json();
+  return {
+    file_path: filePath,
+    commit_sha: data.commit?.sha,
+    content: data.content,
+    branch
+  };
+}
+
+async function triggerRenderDeploy({ clearCache = true } = {}) {
+  const deployHook = process.env.RENDER_DEPLOY_HOOK;
+  if (deployHook) {
+    const hookResponse = await fetch(deployHook, { method: 'POST' });
+    const bodyText = await hookResponse.text();
+    if (!hookResponse.ok) {
+      throw new Error(`Render deploy hook failed with ${hookResponse.status}: ${bodyText}`);
+    }
+    return { status: 'triggered', via: 'hook', response: safeJsonParse(bodyText) };
+  }
+  const serviceId = process.env.RENDER_SERVICE_ID;
+  const apiKey = process.env.RENDER_API_KEY;
+  if (!serviceId || !apiKey) {
+    throw new Error('Render deploy requires either RENDER_DEPLOY_HOOK or (RENDER_SERVICE_ID + RENDER_API_KEY)');
+  }
+  const baseUrl = process.env.RENDER_BASE_URL || 'https://api.render.com';
+  const url = `${baseUrl.replace(/\/$/, '')}/v1/services/${serviceId}/deploys`;
+  const response = await fetch(url, {
+    method: 'POST',
+    headers: {
+      Authorization: `Bearer ${apiKey}`,
+      'Content-Type': 'application/json'
+    },
+    body: JSON.stringify({ clearCache })
+  });
+  const payload = await response.json().catch(() => undefined);
+  if (!response.ok) {
+    throw new Error(`Render API deploy failed with ${response.status}`);
+  }
+  return { status: 'triggered', via: 'api', response: payload };
+}
+
+async function triggerVercelDeploy({ production = false, payload, deploy_hook, team_id, project_id } = {}) {
+  const hook = deploy_hook || process.env.VERCEL_DEPLOY_HOOK;
+  if (hook) {
+    const response = await fetch(hook, {
+      method: 'POST',
+      headers: { 'Content-Type': 'application/json' },
+      body: JSON.stringify(payload || {})
+    });
+    const text = await response.text();
+    if (!response.ok) {
+      throw new Error(`Vercel deploy hook failed with ${response.status}: ${text}`);
+    }
+    return { status: 'triggered', via: 'hook', response: safeJsonParse(text) };
+  }
+  const token = process.env.VERCEL_TOKEN;
+  const projectId = project_id || process.env.VERCEL_PROJECT_ID;
+  if (!token || !projectId) {
+    throw new Error('Vercel deploy requires a deploy hook or VERCEL_TOKEN + VERCEL_PROJECT_ID');
+  }
+  const query = new URLSearchParams();
+  if (team_id || process.env.VERCEL_TEAM_ID) {
+    query.set('teamId', team_id || process.env.VERCEL_TEAM_ID);
+  }
+  const url = `https://api.vercel.com/v13/deployments?${query.toString()}`;
+  const response = await fetch(url, {
+    method: 'POST',
+    headers: {
+      Authorization: `Bearer ${token}`,
+      'Content-Type': 'application/json'
+    },
+    body: JSON.stringify({
+      name: projectId,
+      project: projectId,
+      target: production ? 'production' : 'preview',
+      ...payload
+    })
+  });
+  const json = await response.json().catch(() => undefined);
+  if (!response.ok) {
+    throw new Error(`Vercel API deploy failed with ${response.status}`);
+  }
+  return { status: 'triggered', via: 'api', response: json };
+}
+
+async function supabaseQuery({ path, method = 'GET', params, body, headers } = {}) {
+  const urlBase = process.env.SUPABASE_URL;
+  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY;
+  if (!urlBase || !serviceKey) {
+    throw new Error('Supabase query requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY');
+  }
+  const safePath = (path || '').replace(/^\/+/, '');
+  const url = new URL(`${urlBase.replace(/\/$/, '')}/${safePath}`);
+  if (params) {
+    Object.entries(params).forEach(([key, value]) => {
+      if (value !== undefined && value !== null) {
+        url.searchParams.set(key, String(value));
+      }
+    });
+  }
+  const response = await fetch(url, {
+    method,
+    headers: {
+      Authorization: `Bearer ${serviceKey}`,
+      apikey: serviceKey,
+      'Content-Type': 'application/json',
+      ...(headers || {})
+    },
+    body: body ? JSON.stringify(body) : undefined
+  });
+  const text = await response.text();
+  let data;
+  try {
+    data = text ? JSON.parse(text) : null;
+  } catch (error) {
+    data = text;
+  }
+  return {
+    status_code: response.status,
+    data,
+    headers: Object.fromEntries(response.headers.entries())
+  };
+}
+
+function safeJsonParse(text) {
+  if (!text) return null;
+  try {
+    return JSON.parse(text);
+  } catch (error) {
+    return text;
+  }
+}
+
+async function handleToolCall(name, args = {}) {
+  switch (name) {
+    case 'echo':
+      if (typeof args.text === 'undefined') {
+        throw new Error('text is required');
+      }
+      return { text: String(args.text) };
+    case 'env_check': {
+      const gh = githubEnv();
+      const render = {
+        deploy_hook: Boolean(process.env.RENDER_DEPLOY_HOOK),
+        service_id: process.env.RENDER_SERVICE_ID || null,
+        api_key: redact(process.env.RENDER_API_KEY),
+        base_url: process.env.RENDER_BASE_URL || null,
+        admin_key: redact(process.env.ADMIN_DEPLOY_KEY)
+      };
+      const vercel = {
+        deploy_hook: Boolean(process.env.VERCEL_DEPLOY_HOOK),
+        project_id: process.env.VERCEL_PROJECT_ID || null,
+        team_id: process.env.VERCEL_TEAM_ID || null,
+        token: redact(process.env.VERCEL_TOKEN)
+      };
+      const supabase = {
+        url: process.env.SUPABASE_URL || null,
+        service_role: redact(process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY),
+        anon: redact(process.env.SUPABASE_ANON_KEY)
+      };
+      const anthropic = {
+        api_key: redact(process.env.ANTHROPIC_API_KEY)
+      };
+      return {
+        GH_OWNER: gh.owner || null,
+        GH_REPO: gh.repo || null,
+        GH_BRANCH: gh.branch || null,
+        GH_TOKEN: redact(gh.token),
+        MCP_SHARED_SECRET_SET: Boolean(MCP_SHARED_SECRET),
+        MCP_REQUIRE_SHARED_SECRET,
+        RENDER_DEPLOY_HOOK: render.deploy_hook,
+        RENDER_SERVICE_ID: render.service_id,
+        RENDER_API_KEY: render.api_key,
+        VERCEL_DEPLOY_HOOK: vercel.deploy_hook,
+        VERCEL_PROJECT_ID: vercel.project_id,
+        VERCEL_TOKEN: vercel.token,
+        SUPABASE_URL: supabase.url,
+        SUPABASE_SERVICE_ROLE_KEY: supabase.service_role,
+        github: {
+          owner: gh.owner || null,
+          repo: gh.repo || null,
+          branch: gh.branch || null,
+          token: redact(gh.token)
+        },
+        render,
+        vercel,
+        supabase,
+        anthropic
+      };
+    }
+    case 'fs_read': {
+      const { file_path } = args;
+      if (!file_path) throw new Error('file_path is required');
+      return await githubReadFile(file_path);
+    }
+    case 'fs_write': {
+      const { file_path, content, message, sha } = args;
+      if (!file_path || typeof content === 'undefined') {
+        throw new Error('file_path and content are required');
+      }
+      return await githubWriteFile(file_path, { content, message, sha });
+    }
+    case 'render_deploy':
+      return await triggerRenderDeploy({ clearCache: args.clear_cache !== false });
+    case 'vercel_deploy':
+      return await triggerVercelDeploy(args);
+    case 'supabase_query':
+      return await supabaseQuery(args);
+    default:
+      throw new Error(`Unknown tool: ${name}`);
+  }
+}
+
+function buildHealthPayload() {
+  return {
+    status: 'ok',
+    app: APP_NAME,
+    commit: process.env.COMMIT_SHA || null,
+    built_at: process.env.BUILT_AT || null,
+    time: new Date().toISOString()
+  };
+}
+
+app.get('/', (_req, res) => {
+  res.status(200).send('ok');
+});
+
+app.get('/healthz', (_req, res) => {
+  res.status(200).json(buildHealthPayload());
+});
+
+app.post('/admin/deploy', async (req, res) => {
+  try {
+    const guard = req.get('x-admin-key');
+    if (!process.env.ADMIN_DEPLOY_KEY) {
+      return res.status(404).json({ ok: false, error: 'admin deploy not configured' });
+    }
+    if (!guard || !secretsEqual(guard, process.env.ADMIN_DEPLOY_KEY)) {
+      return res.status(403).json({ ok: false, error: 'forbidden' });
+    }
+    const result = await triggerRenderDeploy({ clearCache: true });
+    res.json({ ok: true, result });
+  } catch (error) {
+    res.json({ ok: false, error: error.message });
+  }
+});
+
+app.post('/mcp', async (req, res) => {
+  const payload = req.body;
+  const rpcId = payload && typeof payload === 'object' ? payload.id : null;
+  if (MCP_SHARED_SECRET && MCP_REQUIRE_SHARED_SECRET) {
+    const provided = extractSharedSecret(req);
+    if (!secretsEqual(provided, MCP_SHARED_SECRET)) {
+      return res.status(200).json(jsonRpcError(rpcId, 'Unauthorized', -32001));
+    }
+  }
+  if (!payload || payload.jsonrpc !== '2.0' || !payload.method) {
+    return res.status(200).json(jsonRpcError(rpcId, 'Invalid JSON-RPC request', -32600));
+  }
+
+  const methodAliases = {
+    'tools/list': 'tools.list',
+    'tools.call': 'tools/call'
+  };
+  const method = methodAliases[payload.method] || payload.method;
+
+  try {
+    if (method === 'tools.list') {
+      return res.status(200).json(jsonRpcResult(rpcId, { tools }));
+    }
+    if (method === 'tools/call') {
+      const params = payload.params || {};
+      const name = params.name;
+      const args = params.arguments || {};
+      if (!name) {
+        return res.status(200).json(jsonRpcError(rpcId, 'Tool name is required', -32602));
+      }
+      const result = await handleToolCall(name, args);
+      return res.status(200).json(jsonRpcResult(rpcId, result));
+    }
+    return res.status(200).json(jsonRpcError(rpcId, `Method '${method}' not found`, -32601));
+  } catch (error) {
+    if (error && error.code === 'GITHUB_CONFLICT') {
+      return res.status(200).json(jsonRpcError(rpcId, 'GitHub conflict', -32010, error.details || null));
+    }
+    if (error && error.name === 'AbortError') {
+      return res.status(200).json(jsonRpcError(rpcId, 'Request timed out', -32002));
+    }
+    return res.status(200).json(jsonRpcError(rpcId, error.message || 'Tool execution failed'));
+  }
+});
+
+const PORT = Number(process.env.PORT) || 10000;
+const HOST = '0.0.0.0';
+app.listen(PORT, HOST, () => {
+  console.log(`MCP server listening on http://${HOST}:${PORT}`);
+});

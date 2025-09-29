diff --git a//dev/null b/mcp-server/index.js
index 0000000000000000000000000000000000000000..9fe54c10359763d4dad96b70ba4589e23cbfff5b 100644
--- a//dev/null
+++ b/mcp-server/index.js
@@ -0,0 +1,988 @@
+const express = require('express');
+const cors = require('cors');
+const crypto = require('crypto');
+
+const APP_NAME = 'outreach-api';
+const DEFAULT_PORT = parseInt(process.env.PORT || '10000', 10);
+
+function parseBoolEnv(value, defaultValue) {
+  if (value === undefined || value === null) {
+    return defaultValue;
+  }
+  const normalized = String(value).trim().toLowerCase();
+  if (['1', 'true', 'yes', 'on'].includes(normalized)) {
+    return true;
+  }
+  if (['0', 'false', 'no', 'off', ''].includes(normalized)) {
+    return false;
+  }
+  return defaultValue;
+}
+
+const MCP_SHARED_SECRET = process.env.MCP_SHARED_SECRET || null;
+const MCP_REQUIRE_SHARED_SECRET = parseBoolEnv(process.env.MCP_REQUIRE_SHARED_SECRET, false);
+
+const DEFAULT_TIMEOUT_MS = 10000;
+const DEPLOY_TIMEOUT_MS = 20000;
+const TOOL_EXECUTION_TIMEOUT = parseFloat(process.env.MCP_TOOL_TIMEOUT || '25');
+const INLINE_WAIT_MAX_SECONDS = Math.max(0, parseFloat(process.env.MCP_INLINE_WAIT_MAX || '10'));
+const JOB_RETENTION_SECONDS = parseInt(process.env.MCP_JOB_RETENTION_SECONDS || '3600', 10);
+
+function boolFlag(value) {
+  return Boolean(value);
+}
+
+function coerceBool(value) {
+  if (value === undefined || value === null) {
+    return null;
+  }
+  if (typeof value === 'boolean') {
+    return value;
+  }
+  if (typeof value === 'number') {
+    return value !== 0;
+  }
+  if (typeof value === 'string') {
+    const normalized = value.trim().toLowerCase();
+    if (['true', '1', 'yes', 'on'].includes(normalized)) {
+      return true;
+    }
+    if (['false', '0', 'no', 'off', ''].includes(normalized)) {
+      return false;
+    }
+  }
+  return null;
+}
+
+function redact(value) {
+  if (!value) {
+    return null;
+  }
+  return '***';
+}
+
+function getHealthPayload() {
+  const commit =
+    process.env.RENDER_GIT_COMMIT ||
+    process.env.GIT_COMMIT ||
+    process.env.COMMIT ||
+    process.env.SOURCE_VERSION ||
+    null;
+  const builtAt =
+    process.env.RENDER_BUILD_TIMESTAMP ||
+    process.env.RENDER_GIT_COMMIT_TIMESTAMP ||
+    process.env.BUILD_TIMESTAMP ||
+    process.env.BUILT_AT ||
+    null;
+  return {
+    status: 'ok',
+    app: APP_NAME,
+    commit,
+    built_at: builtAt,
+  };
+}
+
+function githubEnv() {
+  return {
+    GH_OWNER: process.env.GH_OWNER || null,
+    GH_REPO: process.env.GH_REPO || null,
+    GH_TOKEN: process.env.GH_TOKEN || null,
+    GH_BRANCH: process.env.GH_BRANCH || null,
+  };
+}
+
+function renderEnv() {
+  return {
+    RENDER_DEPLOY_HOOK: process.env.RENDER_DEPLOY_HOOK || null,
+    RENDER_SERVICE_ID: process.env.RENDER_SERVICE_ID || null,
+    RENDER_API_KEY: process.env.RENDER_API_KEY || null,
+    RENDER_BASE_URL: process.env.RENDER_BASE_URL || null,
+    ADMIN_DEPLOY_KEY: process.env.ADMIN_DEPLOY_KEY || null,
+  };
+}
+
+function vercelEnv() {
+  return {
+    VERCEL_DEPLOY_HOOK: process.env.VERCEL_DEPLOY_HOOK || null,
+    VERCEL_PROJECT_ID: process.env.VERCEL_PROJECT_ID || null,
+    VERCEL_TEAM_ID: process.env.VERCEL_TEAM_ID || null,
+    VERCEL_TOKEN: process.env.VERCEL_TOKEN || null,
+  };
+}
+
+function supabaseEnv() {
+  return {
+    SUPABASE_URL: process.env.SUPABASE_URL || null,
+    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY || null,
+    SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY || null,
+  };
+}
+
+function anthropicEnv() {
+  return {
+    ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY || null,
+  };
+}
+
+function jsonRpcError(id, message, code = -32000, data) {
+  const error = { code, message };
+  if (data !== undefined) {
+    error.data = data;
+  }
+  return { jsonrpc: '2.0', id, error };
+}
+
+function jsonRpcResult(id, result) {
+  return { jsonrpc: '2.0', id, result };
+}
+
+async function fetchWithTimeout(url, options = {}, timeoutMs = DEFAULT_TIMEOUT_MS) {
+  const controller = new AbortController();
+  const timeout = setTimeout(() => controller.abort(), timeoutMs);
+  try {
+    return await fetch(url, { ...options, signal: controller.signal });
+  } finally {
+    clearTimeout(timeout);
+  }
+}
+
+class JobRecord {
+  constructor(rpcId, name, args, timeoutSeconds) {
+    this.id = crypto.randomUUID().replace(/-/g, '');
+    this.rpcId = rpcId;
+    this.name = name;
+    this.arguments = { ...args };
+    this.status = 'pending';
+    const now = new Date();
+    this.createdAt = now;
+    this.updatedAt = now;
+    this.completedAt = null;
+    this.response = null;
+    this.timeout = timeoutSeconds;
+    this.waiters = [];
+  }
+
+  markRunning() {
+    this.status = 'running';
+    this.updatedAt = new Date();
+  }
+
+  markComplete(status, response) {
+    this.status = status;
+    this.response = response;
+    this.completedAt = new Date();
+    this.updatedAt = this.completedAt;
+    this.resolveWaiters();
+  }
+
+  resolveWaiters() {
+    const waiters = [...this.waiters];
+    this.waiters.length = 0;
+    waiters.forEach((resolve) => resolve(true));
+  }
+
+  wait(timeoutSeconds) {
+    const done = this.status === 'succeeded' || this.status === 'failed';
+    if (done) {
+      return Promise.resolve(true);
+    }
+    const timeoutMs = timeoutSeconds !== undefined && timeoutSeconds !== null ? timeoutSeconds * 1000 : null;
+    return new Promise((resolve) => {
+      let timer = null;
+      const waiter = () => {
+        if (timer) {
+          clearTimeout(timer);
+        }
+        resolve(true);
+      };
+      this.waiters.push(waiter);
+      if (timeoutMs !== null) {
+        timer = setTimeout(() => {
+          const index = this.waiters.indexOf(waiter);
+          if (index >= 0) {
+            this.waiters.splice(index, 1);
+          }
+          resolve(false);
+        }, timeoutMs);
+      }
+    });
+  }
+
+  toJSON() {
+    return {
+      job_id: this.id,
+      name: this.name,
+      status: this.status,
+      created_at: this.createdAt.toISOString(),
+      updated_at: this.updatedAt.toISOString(),
+      completed_at: this.completedAt ? this.completedAt.toISOString() : null,
+      response: this.response,
+    };
+  }
+}
+
+class JobManager {
+  constructor(retentionSeconds) {
+    this.jobs = new Map();
+    this.retentionSeconds = Math.max(retentionSeconds || 0, 0);
+  }
+
+  createJob(rpcId, name, args, timeoutSeconds) {
+    const job = new JobRecord(rpcId, name, args, timeoutSeconds);
+    this.jobs.set(job.id, job);
+    this.prune();
+    return job;
+  }
+
+  getJob(jobId) {
+    return this.jobs.get(jobId) || null;
+  }
+
+  prune() {
+    if (!this.retentionSeconds) {
+      return;
+    }
+    const cutoff = Date.now() - this.retentionSeconds * 1000;
+    for (const [id, job] of this.jobs.entries()) {
+      if (job.completedAt && job.completedAt.getTime() < cutoff) {
+        this.jobs.delete(id);
+      }
+    }
+  }
+}
+
+const jobManager = new JobManager(JOB_RETENTION_SECONDS);
+
+const TOOLS = [
+  {
+    name: 'echo',
+    description: 'Echo the provided text back to the caller.',
+    input_schema: {
+      type: 'object',
+      properties: {
+        text: { type: 'string', description: 'Text to echo back.' },
+      },
+      required: ['text'],
+    },
+  },
+  {
+    name: 'env_check',
+    description: 'Returns configured GitHub environment variables.',
+    input_schema: { type: 'object', properties: {}, additionalProperties: false },
+  },
+  {
+    name: 'fs_read',
+    description: 'Reads a file from the configured GitHub repository using the Contents API.',
+    input_schema: {
+      type: 'object',
+      properties: {
+        file_path: { type: 'string', description: 'Path to the file within the repository.' },
+      },
+      required: ['file_path'],
+    },
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
+          description: 'Known blob SHA from a prior fs_read; skips the extra GitHub read and fails fast on conflicts.',
+        },
+      },
+      required: ['file_path', 'content'],
+    },
+  },
+];
+
+async function githubRequest(method, filePath, { params, body } = {}) {
+  const env = githubEnv();
+  const { GH_OWNER: owner, GH_REPO: repo, GH_TOKEN: token } = env;
+  if (!owner || !repo) {
+    const error = new Error('GH_OWNER and GH_REPO must be configured');
+    error.code = 'INVALID_CONFIGURATION';
+    throw error;
+  }
+  if (!token) {
+    const error = new Error('GH_TOKEN is required for GitHub operations');
+    error.status = 401;
+    throw error;
+  }
+  const safePath = String(filePath || '').replace(/^\/+/, '');
+  if (!safePath) {
+    const error = new Error('file_path must not be empty');
+    error.code = 'INVALID_PARAMS';
+    throw error;
+  }
+  const url = new URL(`https://api.github.com/repos/${owner}/${repo}/contents/${safePath}`);
+  if (params) {
+    for (const [key, value] of Object.entries(params)) {
+      if (value !== undefined && value !== null) {
+        url.searchParams.set(key, String(value));
+      }
+    }
+  }
+  const headers = {
+    Authorization: `Bearer ${token}`,
+    Accept: 'application/vnd.github+json',
+    'X-GitHub-Api-Version': '2022-11-28',
+    'Content-Type': 'application/json',
+  };
+  return fetchWithTimeout(url, {
+    method,
+    headers,
+    body: body ? JSON.stringify(body) : undefined,
+  });
+}
+
+async function githubReadFile(filePath) {
+  const branch = process.env.GH_BRANCH || null;
+  const params = branch ? { ref: branch } : undefined;
+  const response = await githubRequest('GET', filePath, { params });
+  if (response.status === 404) {
+    const error = new Error(filePath);
+    error.code = 'ENOENT';
+    throw error;
+  }
+  if (!response.ok) {
+    throw new Error(`GitHub read failed with ${response.status}`);
+  }
+  const data = await response.json();
+  const encoding = data.encoding;
+  const content = data.content;
+  let decoded = content;
+  if (encoding === 'base64' && typeof content === 'string') {
+    decoded = Buffer.from(content, 'base64').toString('utf8');
+  }
+  return {
+    file_path: filePath,
+    content: decoded,
+    sha: data.sha,
+    encoding,
+  };
+}
+
+async function githubWriteFile(filePath, { content, message, sha }) {
+  const branch = process.env.GH_BRANCH || null;
+  let existingSha = sha || null;
+  if (!existingSha) {
+    try {
+      const existing = await githubReadFile(filePath);
+      existingSha = existing.sha || null;
+    } catch (error) {
+      if (error && error.code === 'ENOENT') {
+        existingSha = null;
+      } else {
+        throw error;
+      }
+    }
+  }
+  const payload = {
+    message: message || `Update ${filePath}`,
+    content: Buffer.from(content, 'utf8').toString('base64'),
+  };
+  if (existingSha) {
+    payload.sha = existingSha;
+  }
+  if (branch) {
+    payload.branch = branch;
+  }
+  const response = await githubRequest('PUT', filePath, { body: payload });
+  if (response.status === 409) {
+    let body;
+    try {
+      body = await response.json();
+    } catch (err) {
+      body = { text: await response.text() };
+    }
+    const conflictError = new Error('GitHub reported a conflict for the provided sha');
+    conflictError.code = 'GITHUB_CONFLICT';
+    conflictError.response = body;
+    throw conflictError;
+  }
+  if (response.status !== 200 && response.status !== 201) {
+    const text = await response.text();
+    throw new Error(`GitHub write failed with ${response.status}: ${text}`);
+  }
+  const data = await response.json();
+  return {
+    file_path: filePath,
+    commit_sha: data.commit ? data.commit.sha : null,
+    content_sha: data.content ? data.content.sha : null,
+    message: payload.message,
+  };
+}
+
+async function triggerRenderDeploy(clearCache) {
+  const env = renderEnv();
+  const deployHook = env.RENDER_DEPLOY_HOOK;
+  const serviceId = env.RENDER_SERVICE_ID;
+  const apiKey = env.RENDER_API_KEY;
+  const baseUrl = (env.RENDER_BASE_URL || 'https://api.render.com').replace(/\/+$/, '');
+  if (!deployHook && !(serviceId && apiKey)) {
+    const error = new Error('Render deploy requires RENDER_DEPLOY_HOOK or RENDER_SERVICE_ID/RENDER_API_KEY');
+    error.code = 'INVALID_CONFIGURATION';
+    throw error;
+  }
+  const payload = { clearCache: Boolean(clearCache) };
+  let response;
+  if (serviceId && apiKey) {
+    const url = `${baseUrl}/v1/services/${serviceId}/deploys`;
+    response = await fetchWithTimeout(
+      url,
+      {
+        method: 'POST',
+        headers: {
+          Authorization: `Bearer ${apiKey}`,
+          'Content-Type': 'application/json',
+        },
+        body: JSON.stringify(payload),
+      },
+      DEPLOY_TIMEOUT_MS,
+    );
+  } else {
+    response = await fetchWithTimeout(
+      deployHook,
+      {
+        method: 'POST',
+        headers: { 'Content-Type': 'application/json' },
+        body: JSON.stringify(payload),
+      },
+      DEPLOY_TIMEOUT_MS,
+    );
+  }
+  let body;
+  try {
+    body = await response.json();
+  } catch (error) {
+    body = await response.text();
+  }
+  return {
+    status_code: response.status,
+    response: body,
+  };
+}
+
+async function triggerVercelDeploy({ production, payload, deployHook, teamId, projectId }) {
+  const env = vercelEnv();
+  const hook = deployHook || env.VERCEL_DEPLOY_HOOK;
+  const token = env.VERCEL_TOKEN;
+  const resolvedProjectId = projectId || env.VERCEL_PROJECT_ID;
+  const resolvedTeamId = teamId || env.VERCEL_TEAM_ID;
+  let response;
+  if (hook) {
+    const body = { ...(payload || {}) };
+    if (production) {
+      body.target = 'production';
+    }
+    response = await fetchWithTimeout(
+      hook,
+      {
+        method: 'POST',
+        headers: { 'Content-Type': 'application/json' },
+        body: JSON.stringify(body),
+      },
+      DEPLOY_TIMEOUT_MS,
+    );
+  } else if (token && resolvedProjectId) {
+    const url = new URL('https://api.vercel.com/v13/deployments');
+    if (resolvedTeamId) {
+      url.searchParams.set('teamId', resolvedTeamId);
+    }
+    const body = {
+      name: resolvedProjectId,
+      project: resolvedProjectId,
+      target: production ? 'production' : 'preview',
+      ...(payload || {}),
+    };
+    response = await fetchWithTimeout(
+      url,
+      {
+        method: 'POST',
+        headers: {
+          Authorization: `Bearer ${token}`,
+          'Content-Type': 'application/json',
+        },
+        body: JSON.stringify(body),
+      },
+      DEPLOY_TIMEOUT_MS,
+    );
+  } else {
+    const error = new Error('Vercel deploy requires VERCEL_DEPLOY_HOOK or VERCEL_TOKEN/VERCEL_PROJECT_ID');
+    error.code = 'INVALID_CONFIGURATION';
+    throw error;
+  }
+  let body;
+  try {
+    body = await response.json();
+  } catch (error) {
+    body = await response.text();
+  }
+  return {
+    status_code: response.status,
+    response: body,
+  };
+}
+
+async function supabaseRequest({ path, method = 'GET', params, body, headers }) {
+  const env = supabaseEnv();
+  const url = env.SUPABASE_URL;
+  const key = env.SUPABASE_SERVICE_ROLE_KEY;
+  if (!url || !key) {
+    const error = new Error('Supabase requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY');
+    error.code = 'INVALID_CONFIGURATION';
+    throw error;
+  }
+  const normalizedPath = String(path || '').replace(/^\/+/, '');
+  const requestUrl = new URL(`${url.replace(/\/+$/, '')}/${normalizedPath}`);
+  if (params) {
+    for (const [k, v] of Object.entries(params)) {
+      if (v !== undefined && v !== null) {
+        requestUrl.searchParams.set(k, String(v));
+      }
+    }
+  }
+  const requestHeaders = {
+    apikey: key,
+    Authorization: `Bearer ${key}`,
+  };
+  if (headers) {
+    for (const [k, v] of Object.entries(headers)) {
+      if (v !== undefined && v !== null) {
+        requestHeaders[k] = v;
+      }
+    }
+  }
+  const response = await fetchWithTimeout(
+    requestUrl,
+    {
+      method: String(method || 'GET').toUpperCase(),
+      headers: {
+        'Content-Type': 'application/json',
+        ...requestHeaders,
+      },
+      body: body !== undefined ? JSON.stringify(body) : undefined,
+    },
+  );
+  let payload;
+  try {
+    payload = await response.json();
+  } catch (error) {
+    payload = await response.text();
+  }
+  return {
+    status_code: response.status,
+    data: payload,
+    headers: Object.fromEntries(response.headers.entries()),
+  };
+}
+
+function toolExceptionToResponse(rpcId, error) {
+  if (!error || typeof error !== 'object') {
+    return jsonRpcError(rpcId, 'Internal error', -32603);
+  }
+  if (error.code === 'INVALID_PARAMS') {
+    return jsonRpcError(rpcId, error.message || 'Invalid params', -32602);
+  }
+  if (error.code === 'ENOENT') {
+    return jsonRpcError(rpcId, error.message || 'Not found', -32000, { status_code: 404 });
+  }
+  if (error.code === 'GITHUB_CONFLICT') {
+    return jsonRpcError(rpcId, error.message || 'GitHub conflict', -32010, {
+      status_code: 409,
+      response: error.response,
+    });
+  }
+  if (error.code === 'INVALID_CONFIGURATION') {
+    return jsonRpcError(rpcId, error.message || 'Invalid configuration', -32602);
+  }
+  if (error.status === 401) {
+    return jsonRpcError(rpcId, error.message || 'Unauthorized', -32001, { status_code: 401 });
+  }
+  if (error.name === 'AbortError') {
+    return jsonRpcError(rpcId, 'Upstream request timed out', -32002, { detail: error.message });
+  }
+  return jsonRpcError(rpcId, 'Internal error', -32603, { detail: error.message });
+}
+
+function invalidParams(message) {
+  const error = new Error(message);
+  error.code = 'INVALID_PARAMS';
+  return error;
+}
+
+async function callTool(name, args) {
+  switch (name) {
+    case 'echo': {
+      if (!Object.prototype.hasOwnProperty.call(args, 'text')) {
+        throw invalidParams('text is required');
+      }
+      return { text: String(args.text) };
+    }
+    case 'env_check': {
+      const gh = githubEnv();
+      const render = renderEnv();
+      const vercel = vercelEnv();
+      const supabase = supabaseEnv();
+      const anthropic = anthropicEnv();
+      return {
+        GH_OWNER: gh.GH_OWNER,
+        GH_REPO: gh.GH_REPO,
+        GH_BRANCH: gh.GH_BRANCH,
+        GH_TOKEN: redact(gh.GH_TOKEN),
+        MCP_SHARED_SECRET_SET: boolFlag(MCP_SHARED_SECRET),
+        MCP_REQUIRE_SHARED_SECRET,
+        RENDER_DEPLOY_HOOK: boolFlag(render.RENDER_DEPLOY_HOOK),
+        RENDER_SERVICE_ID: render.RENDER_SERVICE_ID,
+        RENDER_API_KEY: redact(render.RENDER_API_KEY),
+        VERCEL_DEPLOY_HOOK: boolFlag(vercel.VERCEL_DEPLOY_HOOK),
+        VERCEL_PROJECT_ID: vercel.VERCEL_PROJECT_ID,
+        VERCEL_TOKEN: redact(vercel.VERCEL_TOKEN),
+        SUPABASE_URL: supabase.SUPABASE_URL,
+        SUPABASE_SERVICE_ROLE_KEY: redact(supabase.SUPABASE_SERVICE_ROLE_KEY),
+        github: {
+          owner: gh.GH_OWNER,
+          repo: gh.GH_REPO,
+          branch: gh.GH_BRANCH,
+          token: redact(gh.GH_TOKEN),
+        },
+        render: {
+          deploy_hook: boolFlag(render.RENDER_DEPLOY_HOOK),
+          service_id: render.RENDER_SERVICE_ID,
+          api_key: redact(render.RENDER_API_KEY),
+          base_url: render.RENDER_BASE_URL,
+          admin_key: redact(render.ADMIN_DEPLOY_KEY),
+        },
+        vercel: {
+          deploy_hook: boolFlag(vercel.VERCEL_DEPLOY_HOOK),
+          project_id: vercel.VERCEL_PROJECT_ID,
+          team_id: vercel.VERCEL_TEAM_ID,
+          token: redact(vercel.VERCEL_TOKEN),
+        },
+        supabase: {
+          url: supabase.SUPABASE_URL,
+          service_role: redact(supabase.SUPABASE_SERVICE_ROLE_KEY),
+          anon: redact(supabase.SUPABASE_ANON_KEY),
+        },
+        anthropic: {
+          api_key: redact(anthropic.ANTHROPIC_API_KEY),
+        },
+      };
+    }
+    case 'fs_read': {
+      const filePath = args.file_path;
+      if (!filePath) {
+        throw invalidParams('file_path is required');
+      }
+      return githubReadFile(filePath);
+    }
+    case 'fs_write': {
+      const filePath = args.file_path;
+      const content = args.content;
+      if (!filePath || content === undefined || content === null) {
+        throw invalidParams('file_path and content are required');
+      }
+      const message = args.message;
+      const sha = args.sha;
+      return githubWriteFile(filePath, { content, message, sha });
+    }
+    case 'render_deploy': {
+      const clearCache = args.clear_cache !== undefined ? Boolean(args.clear_cache) : true;
+      return triggerRenderDeploy(clearCache);
+    }
+    case 'vercel_deploy': {
+      const production = Boolean(args.production);
+      const payload = args.payload;
+      const deployHook = args.deploy_hook;
+      const teamId = args.team_id;
+      const projectId = args.project_id;
+      return triggerVercelDeploy({ production, payload, deployHook, teamId, projectId });
+    }
+    case 'supabase_query': {
+      const path = args.path;
+      if (!path) {
+        throw invalidParams('path is required');
+      }
+      return supabaseRequest({
+        path,
+        method: args.method || 'GET',
+        params: args.params,
+        body: args.body,
+        headers: args.headers,
+      });
+    }
+    default: {
+      throw invalidParams(`Unknown tool: ${name}`);
+    }
+  }
+}
+
+function createToolTimeoutPromise(timeoutSeconds) {
+  let timer;
+  const promise = new Promise((_, reject) => {
+    timer = setTimeout(() => {
+      const error = new Error('Tool execution timed out');
+      error.code = 'TOOL_TIMEOUT';
+      reject(error);
+    }, timeoutSeconds * 1000);
+  });
+  return { promise, cancel: () => clearTimeout(timer) };
+}
+
+async function runToolJob(job) {
+  job.markRunning();
+  const { promise: timeoutPromise, cancel } = createToolTimeoutPromise(job.timeout);
+  try {
+    const result = await Promise.race([callTool(job.name, job.arguments), timeoutPromise]);
+    cancel();
+    job.markComplete('succeeded', jsonRpcResult(job.rpcId, result));
+  } catch (error) {
+    cancel();
+    if (error && error.code === 'TOOL_TIMEOUT') {
+      job.markComplete('failed', jsonRpcError(job.rpcId, 'Tool execution timed out', -32002));
+      return;
+    }
+    const response = toolExceptionToResponse(job.rpcId, error);
+    job.markComplete('failed', response);
+  }
+}
+
+function scheduleJob(rpcId, name, args) {
+  const job = jobManager.createJob(rpcId, name, args, TOOL_EXECUTION_TIMEOUT);
+  setImmediate(() => {
+    runToolJob(job).catch((error) => {
+      const response = toolExceptionToResponse(job.rpcId, error);
+      job.markComplete('failed', response);
+    });
+  });
+  return job;
+}
+
+function extractSharedSecret(req) {
+  const authHeader = req.headers['authorization'];
+  if (typeof authHeader === 'string' && authHeader.trim()) {
+    const lower = authHeader.toLowerCase();
+    if (lower.startsWith('bearer ')) {
+      return authHeader.slice(7).trim();
+    }
+    return authHeader.trim();
+  }
+  const alt = req.headers['x-mcp-shared-secret'] || req.headers['mcp-shared-secret'];
+  if (typeof alt === 'string' && alt.trim()) {
+    return alt.trim();
+  }
+  return null;
+}
+
+const app = express();
+app.use(cors());
+app.use(express.json({ limit: '1mb' }));
+app.use((err, req, res, next) => {
+  if (err instanceof SyntaxError && 'body' in err) {
+    res.status(200).json(jsonRpcError(null, 'Invalid JSON', -32700));
+    return;
+  }
+  next(err);
+});
+
+app.get('/', (req, res) => {
+  res.status(200).send('ok');
+});
+
+app.get('/health', (req, res) => {
+  res.status(200).json(getHealthPayload());
+});
+
+app.get('/healthz', (req, res) => {
+  res.status(200).json(getHealthPayload());
+});
+
+app.post('/mcp', async (req, res) => {
+  const payload = req.body;
+  const rpcId = payload && typeof payload === 'object' ? payload.id : null;
+  if (MCP_SHARED_SECRET && MCP_REQUIRE_SHARED_SECRET) {
+    const provided = extractSharedSecret(req);
+    let authorized = false;
+    if (provided && MCP_SHARED_SECRET && provided.length === MCP_SHARED_SECRET.length) {
+      try {
+        authorized = crypto.timingSafeEqual(Buffer.from(provided), Buffer.from(MCP_SHARED_SECRET));
+      } catch (error) {
+        authorized = false;
+      }
+    }
+    if (!authorized) {
+      res.status(200).json(jsonRpcError(rpcId, 'Unauthorized', -32001));
+      return;
+    }
+  }
+  if (!payload || typeof payload !== 'object' || Array.isArray(payload) || payload.jsonrpc !== '2.0') {
+    res.status(200).json(jsonRpcError(rpcId, 'Invalid JSON-RPC request', -32600));
+    return;
+  }
+  const aliases = {
+    'tools/list': 'tools.list',
+    'tools.call': 'tools/call',
+  };
+  const method = aliases[payload.method] || payload.method;
+  if (!method) {
+    res.status(200).json(jsonRpcError(rpcId, 'Invalid JSON-RPC request', -32600));
+    return;
+  }
+  if (method === 'tools.list') {
+    res.status(200).json(jsonRpcResult(rpcId, { tools: TOOLS }));
+    return;
+  }
+  if (method === 'tools/call') {
+    const params = payload.params || {};
+    const rawName = params.name;
+    const args = params.arguments || {};
+    const asyncParam = params.async;
+    const asyncValue = asyncParam !== undefined ? coerceBool(asyncParam) : null;
+    if (asyncParam !== undefined && asyncValue === null) {
+      res.status(200).json(jsonRpcError(rpcId, 'async must be boolean', -32602));
+      return;
+    }
+    const asyncRequested = asyncValue === null ? false : asyncValue;
+
+    const waitParam = params.wait;
+    const waitValue = waitParam !== undefined ? coerceBool(waitParam) : null;
+    if (waitParam !== undefined && waitValue === null) {
+      res.status(200).json(jsonRpcError(rpcId, 'wait must be boolean', -32602));
+      return;
+    }
+    const waitRequested = waitParam === undefined ? !asyncRequested : waitValue;
+
+    let waitTimeoutSeconds = null;
+    if (params.wait_timeout !== undefined && params.wait_timeout !== null) {
+      if (typeof params.wait_timeout === 'number') {
+        waitTimeoutSeconds = params.wait_timeout;
+      } else if (typeof params.wait_timeout === 'string') {
+        const parsed = Number(params.wait_timeout);
+        if (Number.isNaN(parsed)) {
+          res.status(200).json(jsonRpcError(rpcId, 'wait_timeout must be numeric', -32602));
+          return;
+        }
+        waitTimeoutSeconds = parsed;
+      } else {
+        res.status(200).json(jsonRpcError(rpcId, 'wait_timeout must be numeric', -32602));
+        return;
+      }
+      if (waitTimeoutSeconds < 0) {
+        res.status(200).json(jsonRpcError(rpcId, 'wait_timeout must be non-negative', -32602));
+        return;
+      }
+    }
+
+    if (!rawName) {
+      res.status(200).json(jsonRpcError(rpcId, 'Tool name is required', -32602));
+      return;
+    }
+
+    const normName = String(rawName || '')
+      .replace(/^mcp-server-(new_)?/, '')
+      .replace(/^mcp[-_]/, '');
+
+    let inlineTimeout = TOOL_EXECUTION_TIMEOUT;
+    if (waitTimeoutSeconds !== null) {
+      inlineTimeout = waitTimeoutSeconds;
+    }
+    if (INLINE_WAIT_MAX_SECONDS > 0) {
+      inlineTimeout = Math.min(inlineTimeout, INLINE_WAIT_MAX_SECONDS);
+    }
+
+    if (!asyncRequested && waitRequested) {
+      const { promise: timeoutPromise, cancel } = createToolTimeoutPromise(inlineTimeout);
+      try {
+        const result = await Promise.race([callTool(normName, args), timeoutPromise]);
+        cancel();
+        res.status(200).json(jsonRpcResult(rpcId, result));
+        return;
+      } catch (error) {
+        cancel();
+        if (error && error.code === 'TOOL_TIMEOUT') {
+          const job = scheduleJob(rpcId, normName, args);
+          res.status(202).json(
+            jsonRpcResult(rpcId, {
+              job_id: job.id,
+              status: job.status,
+              poll_url: `/mcp/jobs/${job.id}`,
+            }),
+          );
+          return;
+        }
+        res.status(200).json(toolExceptionToResponse(rpcId, error));
+        return;
+      }
+    }
+
+    const job = scheduleJob(rpcId, normName, args);
+    if (waitRequested) {
+      const finished = await job.wait(inlineTimeout);
+      if (finished && job.response) {
+        const statusCode = job.status === 'succeeded' || job.status === 'failed' ? 200 : 202;
+        res.status(statusCode).json(job.response);
+        return;
+      }
+    }
+    res.status(202).json(
+      jsonRpcResult(rpcId, {
+        job_id: job.id,
+        status: job.status,
+        poll_url: `/mcp/jobs/${job.id}`,
+      }),
+    );
+    return;
+  }
+  res.status(200).json(jsonRpcError(rpcId, `Method '${method}' not found`, -32601));
+});
+
+app.get('/mcp/jobs/:jobId', async (req, res) => {
+  const jobId = req.params.jobId;
+  const wait = req.query.wait;
+  const job = jobManager.getJob(jobId);
+  if (!job) {
+    res.status(404).json({ detail: 'Job not found' });
+    return;
+  }
+  if (wait !== undefined) {
+    const waitNumber = Number(wait);
+    if (Number.isNaN(waitNumber) || waitNumber < 0) {
+      res.status(400).json({ detail: 'wait must be non-negative' });
+      return;
+    }
+    await job.wait(waitNumber);
+  }
+  const done = job.status === 'succeeded' || job.status === 'failed';
+  res.status(done ? 200 : 202).json(job.toJSON());
+});
+
+/* -------------------- Bridge: /mcp/<link-id>/<tool> (always 200 JSON) -------------------- */
+app.post(/^\/mcp\/[^\/]+\/([a-zA-Z0-9_\-\.]+)$/, async (req, res) => {
+  try {
+    const raw = req.params[0];
+    const name = String(raw || '')
+      .replace(/^mcp-server-(new_)?/, '')
+      .replace(/^mcp[-_]/, '');
+    const args = req.body && typeof req.body === 'object' ? req.body : {};
+    const result = await callTool(name, args);
+    return res.status(200).json(jsonRpcResult(null, result));
+  } catch (e) {
+    return res.status(200).json(toolExceptionToResponse(null, e));
+  }
+});
+
+const server = app.listen(DEFAULT_PORT, '0.0.0.0', () => {
+  const address = server.address();
+  if (address && typeof address === 'object') {
+    console.log(`Server listening on ${address.address}:${address.port}`);
+  } else {
+    console.log(`Server listening on port ${DEFAULT_PORT}`);
+  }
+});
+
+module.exports = { app };

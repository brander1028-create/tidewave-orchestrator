"use strict";

const express = require("express");
const cors = require("cors");

const APP_NAME = "mcp-server";
const PORT = parseInt(process.env.PORT || "10000", 10);

const app = express();
app.use(cors());
app.use(express.json());

// Health endpoints
app.get("/healthz", (req, res) => {
  res.status(200).json({ ok: true, service: "mcp-server", time: new Date().toISOString() });
});
app.head("/healthz", (req, res) => res.status(200).end());
app.get("/", (req, res) => res.status(200).send("ok"));
app.get("/health", (req, res) => res.status(200).json({ status: "ok" }));

// Utilities
function ok(res, payload) { return res.status(200).json(payload); }
function boolEnv(k) { return !!process.env[k]; }

function requireSecretIfNeeded(req, res, next) {
  const s = process.env.MCP_SHARED_SECRET;
  if (!s) return next();
  const auth = (req.headers["authorization"] || "");
  const good = (auth === ("Bearer " + s)) || (auth === s);
  if (!good) return ok(res, { result: { is_error: true, isError: true, error: "unauthorized" } });
  return next();
}

// GitHub integration
function ghConfigured() {
  return boolEnv("GITHUB_TOKEN") && boolEnv("GITHUB_REPO_OWNER") && boolEnv("GITHUB_REPO_NAME");
}

async function ghReadFile(file_path, ref) {
  if (!ghConfigured()) throw new Error("missing GitHub env");
  const owner = process.env.GITHUB_REPO_OWNER;
  const repo = process.env.GITHUB_REPO_NAME;
  const token = process.env.GITHUB_TOKEN;
  const refQ = ref ? ("?ref=" + encodeURIComponent(ref)) : "";
  const url = `https://api.github.com/repos/${owner}/${repo}/contents/${encodeURIComponent(file_path)}${refQ}`;
  
  const r = await fetch(url, {
    headers: {
      "User-Agent": APP_NAME,
      "Accept": "application/vnd.github+json",
      "Authorization": `token ${token}`
    }
  });
  
  if (!r.ok) throw new Error(`GitHub ${r.status}: ${await r.text()}`);
  const j = await r.json();
  const content = Buffer.from(j.content, "base64").toString("utf8");
  return { path: file_path, sha: j.sha, content };
}

async function ghWriteFile(file_path, content, message) {
  if (!ghConfigured()) throw new Error("missing GitHub env");
  const owner = process.env.GITHUB_REPO_OWNER;
  const repo = process.env.GITHUB_REPO_NAME;
  const token = process.env.GITHUB_TOKEN;
  
  let sha = null;
  try {
    const u0 = `https://api.github.com/repos/${owner}/${repo}/contents/${encodeURIComponent(file_path)}`;
    const t0 = await fetch(u0, {
      headers: {
        "User-Agent": APP_NAME,
        "Accept": "application/vnd.github+json",
        "Authorization": `token ${token}`
      }
    });
    if (t0.ok) {
      const j0 = await t0.json();
      sha = j0.sha || null;
    }
  } catch (e) {}
  
  const u = `https://api.github.com/repos/${owner}/${repo}/contents/${encodeURIComponent(file_path)}`;
  const body = {
    message: message || `chore: write ${file_path} via MCP`,
    content: Buffer.from(String(content), "utf8").toString("base64")
  };
  if (sha) body.sha = sha;
  
  const r = await fetch(u, {
    method: "PUT",
    headers: {
      "User-Agent": APP_NAME,
      "Accept": "application/vnd.github+json",
      "Authorization": `token ${token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body)
  });
  
  if (!r.ok) throw new Error(`GitHub ${r.status}: ${await r.text()}`);
  const j = await r.json();
  return { path: file_path, committed_sha: (j.commit && j.commit.sha) };
}

// MCP Tools
const tools = {
  echo: async (args) => {
    const text = (args && typeof args.text !== "undefined") ? String(args.text) : "";
    return { is_error: false, isError: false, value: text };
  },
  
  health: async () => ({
    is_error: false,
    isError: false,
    value: { status: "ok" }
  }),
  
  env_check: async () => ({
    is_error: false,
    isError: false,
    value: {
      GITHUB_TOKEN: boolEnv("GITHUB_TOKEN"),
      GITHUB_REPO_OWNER: boolEnv("GITHUB_REPO_OWNER"),
      GITHUB_REPO_NAME: boolEnv("GITHUB_REPO_NAME")
    }
  }),
  
  fs_read: async (args) => {
    try {
      const file_path = args && args.file_path;
      const ref = args && args.ref;
      if (!file_path) return { is_error: true, isError: true, error: "missing file_path" };
      const out = await ghReadFile(file_path, ref);
      return { is_error: false, isError: false, value: out };
    } catch (e) {
      return { is_error: true, isError: true, error: String(e && e.message ? e.message : e) };
    }
  },
  
  fs_write: async (args) => {
    try {
      const file_path = args && args.file_path;
      const content = args && args.content;
      const message = args && args.message;
      if (!file_path || typeof content !== "string") {
        return { is_error: true, isError: true, error: "missing file_path or content" };
      }
      const out = await ghWriteFile(file_path, content, message);
      return { is_error: false, isError: false, value: out };
    } catch (e) {
      return { is_error: true, isError: true, error: String(e && e.message ? e.message : e) };
    }
  }
};

// REST endpoints
app.get("/mcp/tools/list", (req, res) => {
  const names = Object.keys(tools);
  return ok(res, { tools: names.map(n => ({ name: n })) });
});

app.post("/mcp/tools/call", requireSecretIfNeeded, async (req, res) => {
  try {
    const body = (req && req.body) ? req.body : {};
    const name = body && body.name ? body.name : null;
    const args = (body && (body.arguments || body.args)) ? (body.arguments || body.args) : {};
    
    if (!name) return ok(res, { result: { is_error: true, isError: true, error: "missing name" } });
    
    const fn = tools[name];
    if (!fn) return ok(res, { result: { is_error: true, isError: true, error: "unknown tool: " + name } });
    
    const result = await fn(args || {});
    const textOut = (result && typeof result.value === "string") ? result.value : undefined;
    return ok(res, { result, text: textOut });
  } catch (e) {
    return ok(res, { result: { is_error: true, isError: true, error: String(e && e.message ? e.message : e) } });
  }
});

// MCP JSON-RPC endpoint
function normalizeMethod(m) {
  return String(m || "").toLowerCase().replace(/\/+/g, ".");
}

function normalizeToolResult(r) {
  try {
    if (r && typeof r === "object" && r.result) r = r.result;
    
    if (r && typeof r === "object" && typeof r.value !== "undefined" && !Array.isArray(r.content)) {
      const isErr = !!(r.is_error || r.isError);
      return {
        content: [{ type: "text", text: typeof r.value === "object" ? JSON.stringify(r.value, null, 2) : String(r.value) }],
        is_error: isErr,
        isError: isErr
      };
    }
    
    if (Array.isArray(r)) return { content: r, is_error: false, isError: false };
    
    if (r && typeof r === "object" && Array.isArray(r.content)) {
      if (typeof r.is_error === "undefined") r.is_error = !!r.isError;
      if (typeof r.isError === "undefined") r.isError = !!r.is_error;
      return r;
    }
    
    return { content: [{ type: "json", json: r }], is_error: false, isError: false };
  } catch (e) {
    return {
      content: [{ type: "text", text: String(e && e.message || e) }],
      is_error: true,
      isError: true
    };
  }
}

async function callTool(name, args) {
  const fn = tools[name];
  if (!fn) {
    return {
      content: [{ type: "text", text: `unknown tool: ${name}` }],
      is_error: true,
      isError: true
    };
  }
  return await fn(args || {});
}

function toolList() {
  return { tools: Object.keys(tools).map(n => ({ name: n })) };
}

app.get("/mcp", (req, res) => {
  try {
    res.set("Cache-Control", "no-store");
    return res.status(200).json({
      ok: true,
      transport: "http",
      spec: "mcp/streamable-http",
      endpoints: ["POST /mcp", "GET /mcp/jobs/:id"]
    });
  } catch (e) {
    return res.status(200).json({ ok: false, error: String(e && e.message || e) });
  }
});

app.post("/mcp", requireSecretIfNeeded, async (req, res) => {
  const body = req.body || {};
  const id = Object.prototype.hasOwnProperty.call(body, "id") ? body.id : null;
  const method = normalizeMethod(body.method);
  res.set("X-MCP-Handler", "v2");
  
  if (method === "tools.list" || method === "tools/list") {
    return res.status(200).json({ jsonrpc: "2.0", id, result: toolList() });
  }
  
  if (method === "tools.call" || method === "tool.call" || method === "tools/call" || method === "tool/call") {
    const params = body.params || {};
    const name = params.name || "";
    const args = params.arguments || {};
    const wait = Object.prototype.hasOwnProperty.call(params, "wait") ? !!params.wait : true;
    
    if (wait) {
      const r = await callTool(name, args);
      return res.status(200).json({ jsonrpc: "2.0", id, result: normalizeToolResult(r) });
    } else {
      return res.status(200).json({
        jsonrpc: "2.0",
        id,
        result: {
          content: [{ type: "text", text: "queued (not implemented)" }],
          is_error: false,
          isError: false
        }
      });
    }
  }
  
  return res.status(200).json({
    jsonrpc: "2.0",
    id,
    result: {
      content: [{ type: "text", text: `unknown method: ${method}` }],
      is_error: true,
      isError: true
    }
  });
});

// Start server
app.listen(PORT, () => {
  console.log(APP_NAME + " listening on " + PORT);
});
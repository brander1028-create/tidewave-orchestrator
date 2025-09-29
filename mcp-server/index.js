"use strict";

const express = require("express");
const cors = require("cors");

const APP_NAME = "mcp-server";
const PORT = parseInt(process.env.PORT || "10000", 10);

const app = express();
app.use(cors());
app.use(express.json());

// Optional shared-secret (no 4xx: always 200 + is_error)
function requireSecretIfNeeded(req, res, next) {
  const secret = process.env.MCP_SHARED_SECRET;
  if (!secret) return next();
  const auth = req.headers["authorization"] || "";
  const ok = auth === `Bearer ${secret}` || auth === secret;
  if (!ok) return res.status(200).json({ result: { is_error: true, error: "unauthorized" } });
  return next();
}

function ok(res, payload){ return res.status(200).json(payload); }
function boolEnv(k){ return Boolean(process.env[k]); }

// ----- GitHub helpers (Node 18+ has global fetch) -----
async function ghFetch(path, options) {
  const owner = process.env.GITHUB_REPO_OWNER;
  const repo  = process.env.GITHUB_REPO_NAME;
  const token = process.env.GITHUB_TOKEN;
  if (!owner || !repo || !token) throw new Error("missing GitHub env");
  const url = `https://api.github.com/repos/${owner}/${repo}${path}`;
  const headers = Object.assign({
    "User-Agent": APP_NAME,
    "Accept": "application/vnd.github+json",
    "Authorization": `token ${token}`
  }, (options && options.headers) ? options.headers : {});
  const res = await fetch(url, Object.assign({}, options, { headers }));
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`GitHub ${res.status}: ${text}`);
  }
  return res;
}

async function ghReadFile(file_path, ref) {
  const refQ = ref ? `?ref=${encodeURIComponent(ref)}` : "";
  const res = await ghFetch(`/contents/${encodeURIComponent(file_path)}${refQ}`);
  const json = await res.json();
  const content = Buffer.from(json.content, "base64").toString("utf8");
  return { path: file_path, sha: json.sha, content };
}

async function ghWriteFile(file_path, content, message, shaOpt) {
  const owner = process.env.GITHUB_REPO_OWNER;
  const repo  = process.env.GITHUB_REPO_NAME;
  const token = process.env.GITHUB_TOKEN;
  if (!owner || !repo || !token) throw new Error("missing GitHub env");
  const b64 = Buffer.from(content, "utf8").toString("base64");
  const body = { message: message || `chore: write ${file_path} via MCP`, content: b64 };
  if (shaOpt) body.sha = shaOpt;
  const url = `https://api.github.com/repos/${owner}/${repo}/contents/${encodeURIComponent(file_path)}`;
  const res = await fetch(url, {
    method: "PUT",
    headers: {
      "User-Agent": APP_NAME,
      "Accept": "application/vnd.github+json",
      "Authorization": `token ${token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body)
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`GitHub ${res.status}: ${text}`);
  }
  const json = await res.json();
  return { path: file_path, committed_sha: json.commit && json.commit.sha };
}

// ----- Tools -----
const tools = {
  echo: async (args) => {
    const text = args && typeof args.text !== "undefined" ? String(args.text) : "";
    return { is_error: false, value: text };
  },
  health: async () => {
    return { is_error: false, value: { status: "ok" } };
  },
  env_check: async () => {
    return { is_error: false, value: {
      GITHUB_TOKEN:      boolEnv("GITHUB_TOKEN"),
      GITHUB_REPO_OWNER: boolEnv("GITHUB_REPO_OWNER"),
      GITHUB_REPO_NAME:  boolEnv("GITHUB_REPO_NAME")
    }};
  },
  fs_read: async (args) => {
    try {
      const file_path = args && args.file_path;
      const ref = args && args.ref;
      if (!file_path) return { is_error: true, error: "missing file_path" };
      const out = await ghReadFile(file_path, ref);
      return { is_error: false, value: out };
    } catch (e) {
      return { is_error: true, error: String(e && e.message ? e.message : e) };
    }
  },
  fs_write: async (args) => {
    try {
      const file_path = args && args.file_path;
      const content   = args && args.content;
      const message   = args && args.message;
      if (!file_path || typeof content !== "string") {
        return { is_error: true, error: "missing file_path or content" };
      }
      let sha = null;
      try {
        const existing = await ghReadFile(file_path);
        sha = existing.sha || null;
      } catch (e) { /* new file */ }
      const out = await ghWriteFile(file_path, content, message, sha);
      return { is_error: false, value: out };
    } catch (e) {
      return { is_error: true, error: String(e && e.message ? e.message : e) };
    }
  }
};

// ----- REST endpoints (always HTTP 200) -----
app.get("/health", (req, res) => ok(res, { status: "ok" }));

app.get("/mcp/tools/list", (req, res) => {
  const names = Object.keys(tools);
  return ok(res, { tools: names.map(n => ({ name: n })) });
});

app.post("/mcp/tools/call", requireSecretIfNeeded, async (req, res) => {
  try {
    const body = req && req.body ? req.body : {};
    const name = body && body.name ? body.name : null;
    const args = (body && (body.arguments || body.args)) ? (body.arguments || body.args) : {};
    const wait = (typeof body.wait !== "undefined") ? body.wait : true;
    if (!name) return ok(res, { result: { is_error: true, error: "missing name" } });
    const fn = tools[name];
    if (!fn) return ok(res, { result: { is_error: true, error: "unknown tool: " + name } });
    const result = await fn(args || {});
    const textOut = (result && typeof result.value === "string") ? result.value : undefined;
    return ok(res, { result, text: textOut });
  } catch (e) {
    return ok(res, { result: { is_error: true, error: String(e && e.message ? e.message : e) } });
  }
});

// Keep generic bridge but bypass for /mcp/tools/*
app.post("/mcp/:linkId/:tool", requireSecretIfNeeded, async (req, res, next) => {
  const linkId = (req.params.linkId || "").toLowerCase();
  if (linkId === "tools") return next();
  return ok(res, { result: { is_error: true, error: "bridge route not implemented" } });
});

app.listen(PORT, () => {
  console.log(`${APP_NAME} listening on ${PORT}`);
});

"use strict";

const http = require("http");
let express;
try { express = require("express"); } catch (e) {
  console.error("express not installed"); process.exit(1);
}

let cors;
try { cors = require("cors"); } catch (e) {
  cors = () => (req, res, next) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Headers", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
    if (req.method === "OPTIONS") return res.status(204).end();
    next();
  };
}

const app = express();
app.disable("x-powered-by");
app.use(cors());
app.use(express.json({ limit: "1mb" }));

const PORT = parseInt(process.env.PORT || "10000", 10);
const HOST = "0.0.0.0";

const REQUIRE_SECRET = String(process.env.MCP_REQUIRE_SHARED_SECRET || "false").toLowerCase() === "true";
const SHARED_SECRET = process.env.MCP_SHARED_SECRET || "";

const GH_OWNER  = process.env.GH_OWNER || "";
const GH_REPO   = process.env.GH_REPO  || "";
const GH_TOKEN  = process.env.GH_TOKEN || "";
const GH_BRANCH = process.env.GH_BRANCH || "main";

const jobs = new Map();

function makeJsonRpcResult(id, result) { return { jsonrpc: "2.0", id, result }; }
function ok(content) {
  const arr = Array.isArray(content) ? content : [{ type: "text", text: String(content ?? "") }];
  return { content: arr, is_error: false };
}
function err(objOrText) {
  const item = (typeof objOrText === "object" && objOrText !== null)
    ? { type: "json", json: objOrText }
    : { type: "text", text: String(objOrText ?? "error") };
  return { content: [item], is_error: true };
}

function requireSecretIfNeeded(req, res, next) {
  if (!REQUIRE_SECRET) return next();
  const h = req.headers || {};
  const auth = String(h["authorization"] || "");
  const x = String(h["x-mcp-shared-secret"] || "");
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : auth;
  if (token && token === SHARED_SECRET) return next();
  if (x && x === SHARED_SECRET) return next();
  res.status(200).json(makeJsonRpcResult(null, err({ ok:false, code:"UNAUTHORIZED" })));
}

function normalizeName(name) {
  if (!name) return "";
  let s = String(name).toLowerCase().trim();
  s = s.replace(/^mcp[./:_-]*/g, "");
  s = s.replace(/^(tools?|tool|call)[./:_-]*/g, "");
  s = s.replace(/[^\w]/g, "");
  s = s.replace(/_/g, "");
  return s;
}

function listTools() {
  return {
    tools: [
      { name: "fetch", description: "Fetch a URL and return text (first 5000 chars)", inputSchema: { type: "object", properties: { url: { type: "string" } }, required: ["url"] } },
      { name: "search", description: "Simple search stub", inputSchema: { type: "object", properties: { query: { type: "string" } }, required: ["query"] } },
      {
        name: "health",
        description: "Return server health check result.",
        inputSchema: { type: "object", properties: {}, required: [] }
      },
      {
        name: "echo",
        description: "Echo text back to the caller.",
        inputSchema: { type: "object", properties: { text: { type: "string" } }, required: ["text"] }
      },
      {
        name: "env_check",
        description: "Report presence of GitHub env variables.",
        inputSchema: { type: "object", properties: {}, required: [] }
      },
      {
        name: "fs_read",
        description: "Read a file from the configured GitHub repo via Contents API.",
        inputSchema: {
          type: "object",
          properties: { file_path: { type: "string" }, ref: { type: "string" } },
          required: ["file_path"]
        }
      },
      {
        name: "fs_write",
        description: "Write a file to the configured GitHub repo via Contents API.",
        inputSchema: {
          type: "object",
          properties: { file_path: { type: "string" }, content: { type: "string" }, message: { type: "string" } },
          required: ["file_path", "content"]
        }
      }
    ]
  };
}

async function ghReadFile({ file_path, ref }) {
  if (!(GH_OWNER && GH_REPO && GH_TOKEN)) {
    return err({ ok:false, code:"MISSING_GH_CREDENTIALS",
      missing: { GH_OWNER: !!GH_OWNER, GH_REPO: !!GH_REPO, GH_TOKEN: !!GH_TOKEN } });
  }
  const url = `https://api.github.com/repos/${encodeURIComponent(GH_OWNER)}/${encodeURIComponent(GH_REPO)}/contents/${file_path}${ref ? `?ref=${encodeURIComponent(ref)}` : ""}`;
  const r = await fetch(url, {
    headers: {
      "Authorization": `Bearer ${GH_TOKEN}`,
      "User-Agent": "mcp-server/1.0",
      "Accept": "application/vnd.github+json"
    }
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) return err({ ok:false, code:"GITHUB_API_ERROR", status:r.status, body:j });
  const b64 = j && j.content ? j.content : "";
  let text = ""; try { text = Buffer.from(b64, "base64").toString("utf8"); } catch { text = ""; }
  return ok([{ type:"text", text }]);
}

async function ghWriteFile({ file_path, content, message }) {
  if (!(GH_OWNER && GH_REPO && GH_TOKEN)) {
    return err({ ok:false, code:"MISSING_GH_CREDENTIALS",
      missing: { GH_OWNER: !!GH_OWNER, GH_REPO: !!GH_REPO, GH_TOKEN: !!GH_TOKEN } });
  }
  const base = `https://api.github.com/repos/${encodeURIComponent(GH_OWNER)}/${encodeURIComponent(GH_REPO)}/contents/${file_path}`;
  let sha;
  const r0 = await fetch(`${base}?ref=${encodeURIComponent(GH_BRANCH)}`, {
    headers: { "Authorization": `Bearer ${GH_TOKEN}`, "User-Agent": "mcp-server/1.0", "Accept":"application/vnd.github+json" }
  });
  if (r0.ok) { const j0 = await r0.json().catch(() => ({})); if (j0 && j0.sha) sha = j0.sha; }

  const payload = {
    message: message || "update via mcp",
    content: Buffer.from(String(content ?? ""), "utf8").toString("base64"),
    branch: GH_BRANCH
  };
  if (sha) payload.sha = sha;

  const r = await fetch(base, {
    method: "PUT",
    headers: {
      "Authorization": `Bearer ${GH_TOKEN}`,
      "User-Agent": "mcp-server/1.0",
      "Accept": "application/vnd.github+json",
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) return err({ ok:false, code:"GITHUB_API_ERROR", status:r.status, body:j });
  return ok([{ type:"json", json: { ok:true, commit:j.commit || null } }]);
}

async function callTool(rawName, args = {}) {
  const name = normalizeName(rawName);
  try {
    switch (name) {
      case "health": { return ok([{ type:"json", json: { ok:true, service:"mcp-server", time:new Date().toISOString() } }]); }
      case "search": {
  const query = (args && typeof args.query !== "undefined") ? String(args.query) : "";
  return ok([{ type: "json", json: { query, items: [] } }]); // 최소 스텁
}
      case "fetch": {
  const url = (args && typeof args.url !== "undefined") ? String(args.url) : "";
  if (!/^https?:\/\//i.test(url)) return err({ ok:false, code:"INVALID_URL" });
  try {
    const resp = await fetch(url, { headers: { "Accept": "*/*", "User-Agent": "mcp-server/1.0" } });
    const text = await resp.text();
    return ok([{ type: "text", text: String(text).slice(0,5000) }]);
  } catch (e) {
    return err({ ok:false, code:"FETCH_ERROR", message: String(e && e.message || e) });
  }
}
      case "echo": {
        const text = (args && typeof args.text !== "undefined") ? String(args.text) : "pong";
        return ok([{ type:"text", text }]);
      }
      case "envcheck": {
        return ok([{ type:"json", json: { GH_OWNER: !!GH_OWNER, GH_REPO: !!GH_REPO, GH_TOKEN: !!GH_TOKEN, GH_BRANCH } }]);
      }
      case "fsread": {
        if (!args || !args.file_path) return err({ ok:false, code:"MISSING_ARGUMENT", arg:"file_path" });
        return await ghReadFile({ file_path: args.file_path, ref: args.ref || GH_BRANCH });
      }
      case "fswrite": {
        if (!args || !args.file_path || typeof args.content === "undefined") {
          return err({ ok:false, code:"MISSING_ARGUMENT", required:["file_path","content"] });
        }
        return await ghWriteFile({ file_path: args.file_path, content: args.content, message: args.message || "update via mcp" });
      }
      default:
        return err({ ok:false, code:"UNKNOWN_TOOL", name: rawName, normalized: name });
    }
  } catch (e) {
    return err({ ok:false, code:"TOOL_EXCEPTION", message: String(e && e.message || e) });
  }
}

function scheduleJob(fn) {
  const id = (crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2));
  jobs.set(id, { status: "pending", result: null });
  setImmediate(async () => {
    try { jobs.set(id, { status: "done", result: await fn() }); }
    catch (e) { jobs.set(id, { status: "error", result: err({ ok:false, code:"JOB_EXCEPTION", message:String(e && e.message || e) }) }); }
  });
  return id;
}

app.get("/healthz", (req, res) => {
  res.status(200).json({ ok:true, service:"mcp-server", time:new Date().toISOString() });
});

app.get("/mcp/jobs/:id", (req, res) => {
  const j = jobs.get(req.params.id);
  if (!j) return res.status(200).json(makeJsonRpcResult(null, err({ ok:false, code:"JOB_NOT_FOUND" })));
  return res.status(200).json(makeJsonRpcResult(req.params.id, ok([{ type:"json", json:j }])));
});

app.post("/mcp", requireSecretIfNeeded, async (req, res) => {
  const body = req.body || {};
  const id = body.id ?? null;
  const method = String(body.method || "").toLowerCase();
  try {
    if (method === "tools.list" || method === "tools/list") {
      return res.status(200).json(makeJsonRpcResult(id, listTools()));
    }
    if (method === "tools.call" || method === "tools/call" || method === "tool.call" || method === "tool/call") {
      const params = body.params || {};
      const name = params.name || "";
      const args = params.arguments || {};
      const wait = Object.prototype.hasOwnProperty.call(params, "wait") ? !!params.wait : true;
      if (wait) {
        const r = await callTool(name, args);
        return res.status(200).json(makeJsonRpcResult(id, r));
      } else {
        const jobId = scheduleJob(() => callTool(name, args));
        return res.status(200).json(makeJsonRpcResult(id, ok([{ type:"json", json:{ ok:true, jobId } }])));
      }
    }
    return res.status(200).json(makeJsonRpcResult(id, err({ ok:false, code:"UNKNOWN_METHOD", method: body.method })));
  } catch (e) {
    return res.status(200).json(makeJsonRpcResult(id, err({ ok:false, code:"HANDLER_EXCEPTION", message:String(e && e.message || e) })));
  }
});

app.post("/mcp/:linkId/:tool", requireSecretIfNeeded, async (req, res) => {
  try {
    const tool = req.params.tool;
    const args = (req.body && req.body.arguments) || {};
    const wait = (req.body && Object.prototype.hasOwnProperty.call(req.body, "wait")) ? !!req.body.wait : true;
    if (wait) {
      const r = await callTool(tool, args);
      return res.status(200).json(makeJsonRpcResult(null, r));
    } else {
      const jobId = scheduleJob(() => callTool(tool, args));
      return res.status(200).json(makeJsonRpcResult(null, ok([{ type:"json", json:{ ok:true, jobId } }])));
    }
  } catch (e) {
    return res.status(200).json(makeJsonRpcResult(null, err({ ok:false, code:"BRIDGE_EXCEPTION", message:String(e && e.message || e) })));
  }
});

app.get("/", (req, res) => {
  res.status(200).json({ ok:true, service:"mcp-server", endpoints:["/healthz","/mcp"] });
});

app.get("/mcp", (req, res) => {
  res.status(200).json({ ok: true, transport: "http", spec: "mcp/streamable-http", endpoints: ["POST /mcp","GET /mcp/jobs/:id"] });
});
http.createServer(app).listen(PORT, HOST, () => {
  console.log(`[mcp-server] listening on http://${HOST}:${PORT}`);
});






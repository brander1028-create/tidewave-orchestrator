function flattenRpcResult(r) {
  try {
    if (r && typeof r === "object" && r.result) {
      const inner = r.result;
      if (inner && (Array.isArray(inner.content) || "is_error" in inner || "isError" in inner || "value" in inner)) {
        return inner;
      }
    }
  } catch {}
  return r;
}
"use strict";

const express = require("express");
const cors = require("cors");

const APP_NAME = "mcp-server";
const PORT = parseInt(process.env.PORT || "10000", 10);

const app = express();
app.use(cors());
app.use(express.json());
app.get("/healthz", (req, res) => {
  res.status(200).json({ ok:true, service:"mcp-server", time:new Date().toISOString() });
});
app.head("/healthz", (req, res) => res.status(200).end());

/** MCP JSON-RPC method normalizer (dot→slash).
 *  NOTE: must run AFTER express.json() so req.body is available. */
/* removed wrong method-normalizer (dot→slash) */
// ----- health / root (Render 헬스용/웜업용) -----
app.get("/", (req, res) => res.status(200).send("ok"));
app.get("/health", (req, res) => res.status(200).json({ status: "ok" }));

// ----- 공통 헬퍼 -----
function ok(res, payload){ return res.status(200).json(payload); }
function boolEnv(k){ return !!process.env[k]; }

function requireSecretIfNeeded(req, res, next){
  const s = process.env.MCP_SHARED_SECRET;
  if(!s) return next();
  const auth = (req.headers["authorization"] || "");
  const good = (auth === ("Bearer " + s)) || (auth === s);
  if(!good) return ok(res, { result: { is_error: true,  isError: true, error: "unauthorized" } });
  return next();
}

// ----- GitHub Contents API (있을 때만 사용) -----
function ghConfigured(){
  return boolEnv("GITHUB_TOKEN") && boolEnv("GITHUB_REPO_OWNER") && boolEnv("GITHUB_REPO_NAME");
}
async function ghReadFile(file_path, ref){
  if(!ghConfigured()) throw new Error("missing GitHub env");
  const owner = process.env.GITHUB_REPO_OWNER;
  const repo  = process.env.GITHUB_REPO_NAME;
  const token = process.env.GITHUB_TOKEN;
  const refQ = ref ? ("?ref=" + encodeURIComponent(ref)) : "";
  const url = "https://api.github.com/repos/" + owner + "/" + repo + "/contents/" + encodeURIComponent(file_path) + refQ;
  const r = await fetch(url, { headers: {
    "User-Agent": APP_NAME, "Accept": "application/vnd.github+json", "Authorization": "token " + token
  }});
  if(!r.ok){ throw new Error("GitHub " + r.status + ": " + (await r.text())); }
  const j = await r.json();
  const content = Buffer.from(j.content, "base64").toString("utf8");
  return { path: file_path, sha: j.sha, content };
}
async function ghWriteFile(file_path, content, message){
  if(!ghConfigured()) throw new Error("missing GitHub env");
  const owner = process.env.GITHUB_REPO_OWNER;
  const repo  = process.env.GITHUB_REPO_NAME;
  const token = process.env.GITHUB_TOKEN;
  // sha 확인(존재 시 업데이트)
  let sha = null;
  try {
    const u0 = "https://api.github.com/repos/" + owner + "/" + repo + "/contents/" + encodeURIComponent(file_path);
    const t0 = await fetch(u0, { headers: {
      "User-Agent": APP_NAME, "Accept": "application/vnd.github+json", "Authorization": "token " + token
    }});
    if(t0.ok){ const j0 = await t0.json(); sha = j0.sha || null; }
  } catch(e){}
  const u = "https://api.github.com/repos/" + owner + "/" + repo + "/contents/" + encodeURIComponent(file_path);
  const body = { message: (message || ("chore: write " + file_path + " via MCP")),
                 content: Buffer.from(String(content), "utf8").toString("base64") };
  if(sha) body.sha = sha;
  const r = await fetch(u, { method: "PUT", headers: {
    "User-Agent": APP_NAME, "Accept": "application/vnd.github+json", "Authorization": "token " + token,
    "Content-Type": "application/json"
  }, body: JSON.stringify(body) });
  if(!r.ok){ throw new Error("GitHub " + r.status + ": " + (await r.text())); }
  const j = await r.json();
  return { path: file_path, committed_sha: (j.commit && j.commit.sha) };
}

// ----- Tools (항상 200, is_error 플래그 사용) -----
const tools = {
  echo: async (args) => {
    const text = (args && typeof args.text !== "undefined") ? String(args.text) : "";
    return { is_error: false, isError: false, value: text };
  },
  health: async () => ({ is_error: false, isError: false, value: { status: "ok" } }),
  env_check: async () => ({
    is_error: false, isError: false,
    value: {
      GITHUB_TOKEN:      boolEnv("GITHUB_TOKEN"),
      GITHUB_REPO_OWNER: boolEnv("GITHUB_REPO_OWNER"),
      GITHUB_REPO_NAME:  boolEnv("GITHUB_REPO_NAME")
    }
  }),
  fs_read: async (args) => {
    try {
      const file_path = args && args.file_path;
      const ref       = args && args.ref;
      if(!file_path) return { is_error: true,  isError: true, error: "missing file_path" };
      const out = await ghReadFile(file_path, ref);
      return { is_error: false, isError: false, value: out };
    } catch(e){
      return { is_error: true,  isError: true, error: String(e && e.message ? e.message : e) };
    }
  },
  fs_write: async (args) => {
    try {
      const file_path = args && args.file_path;
      const content   = args && args.content;
      const message   = args && args.message;
      if(!file_path || typeof content !== "string") return { is_error: true,  isError: true, error: "missing file_path or content" };
      const out = await ghWriteFile(file_path, content, message);
      return { is_error: false, isError: false, value: out };
    } catch(e){
      return { is_error: true,  isError: true, error: String(e && e.message ? e.message : e) };
    }
  }
};

// ----- REST (항상 200) -----
app.get("/mcp/tools/list", (req, res) => {
  const names = Object.keys(tools);
  return ok(res, { tools: names.map(n => ({ name: n })) });
});
app.post("/mcp/tools/call", requireSecretIfNeeded, async (req, res) => {
  try {
    const body = (req && req.body) ? req.body : {};
    const name = body && body.name ? body.name : null;
    const args = (body && (body.arguments || body.args)) ? (body.arguments || body.args) : {};
    if(!name) return ok(res, { result: { is_error: true,  isError: true, error: "missing name" } });
    const fn = tools[name];
    if(!fn) return ok(res, { result: { is_error: true,  isError: true, error: "unknown tool: " + name } });
    const result = await fn(args || {});
    const textOut = (result && typeof result.value === "string") ? result.value : undefined;
    return ok(res, { result, text: textOut });
  } catch(e){
    return ok(res, { result: { is_error: true,  isError: true, error: String(e && e.message ? e.message : e) } });
  }
});

// ----- JSON-RPC (/mcp) -----
/* removed legacy /mcp handler */


    const isList = (m) => m === "tools.list" || m === "tools/list";
    const isCall = (m) => m === "tools.call" || m === "tool.call" || m === "tools/call" || m === "tool/call";

    if (isList(method)) {
      // 도구 목록 그대로 반환 (JSON-RPC 표준: result 바로 아래)
      return res.status(200).json({ jsonrpc: "2.0", id, result: toolList() });
    }

    if (isCall(method)) {
      const params = body.params || {};
      const name = params.name || "";
      const args = params.arguments || {};
      const wait = Object.prototype.hasOwnProperty.call(params, "wait") ? !!params.wait : true;

      if (wait) {
        const r = await callTool(name, args);
        // r을 중첩하지 않고 그대로 result에 넣음
        return res.status(200).json({ jsonrpc: "2.0", id, result: r });
      } else {
        const jobId = scheduleJob(() => callTool(name, args));
        return res.status(200).json({
          jsonrpc: "2.0",
          id,
          result: { content: [{ type: "json", json: { ok: true, jobId } }], is_error: false, isError: false }
        });
      }
    }

    // 미지원 메서드도 200 + isError로만 표현
    return res.status(200).json({
      jsonrpc: "2.0",
      id,
      result: { content: [{ type: "text", text: `unknown method: ${method}` }], is_error: true, isError: true }
    });
  } catch (e) {
    return res.status(200).json({
      jsonrpc: "2.0",
      id: null,
      result: { content: [{ type: "text", text: String(e && e.message || e) }], is_error: true, isError: true }
    });
  }
});const sendErr = (code, message, data) => ok(res, { jsonrpc: "2.0", id, error: { code, message, data } });

  try {
    if(method === "ping") return sendOk({ pong: true, t: Date.now() });
    if(((method==="tools.list"||method==="tools.list")||method==="tools.list")){
      const names = Object.keys(tools);
      return sendOk({ tools: names.map(n => ({ name: n })) });
    }
    if(((method==="tools.call"||method==="tools.call"||(method==="tools.call"||method==="tools.call"||method==="tool.call"||method==="tool.call")||(method==="tools.call"||method==="tools.call"||(method==="tools.call"||method==="tools.call"||method==="tool.call"||method==="tool.call")||method==="tool.call"))||method==="tools.call"||(method==="tools.call"||method==="tools.call"||method==="tool.call"||method==="tool.call")||(method==="tools.call"||method==="tools.call"||(method==="tools.call"||method==="tools.call"||method==="tool.call"||method==="tool.call")||method==="tool.call"))){
      const name = params && (params.name || (params.tool && params.tool.name)) ? (params.name || params.tool.name) : null;
      const args = (params && (params.arguments || params.args)) ? (params.arguments || params.args) : {};
      if(!name) return sendErr(-32602, "missing tool name");
      const fn = tools[name];
      if(!fn) return sendErr(-32601, "unknown tool: " + name);
      const result = await fn(args || {});
      return sendOk({ result });
    }
    return sendErr(-32601, "method not found: " + method);
  } catch(e){
    return sendErr(-32000, String(e && e.message ? e.message : e));
  }
});

// (선택) 브리지 라우트가 기존에 필요했다면 아래처럼 두되, /mcp/tools/* 는 통과
app.post("/mcp/:linkId/:tool", requireSecretIfNeeded, async (req, res, next) => {
  const linkId = (req.params.linkId || "").toLowerCase();
  if(linkId === "tools") return next();
  return ok(res, { result: { is_error: true,  isError: true, error: "bridge route not implemented" } });
});

app.listen(PORT, () => {
  console.log(APP_NAME + " listening on " + PORT);
});

app.get("/mcp", (req, res) => {
  try {
    res.set("Cache-Control","no-store");
    return res.status(200).json({ ok:true, transport:"http", spec:"mcp/streamable-http", endpoints:["POST /mcp","GET /mcp/jobs/:id"] });
  } catch (e) {
    return res.status(200).json({ ok:false, error:String(e && e.message || e) });
  }
});

/* ==== MCP JSON-RPC: canonical single handler (v2) ==== */
function _mcpNormalizeMethod(m){ return String(m||"").toLowerCase().replace(/\/+/g,"."); }
function _mcpNormalizeToolResult(r){
  try{
    if (r && typeof r === "object" && r.result) r = r.result; // flatten nested {result:...}
    // legacy { value: ... } -> text content
    if (r && typeof r === "object" && typeof r.value !== "undefined" && !Array.isArray(r.content)){
      const isErr = !!(r.is_error || r.isError);
      return { content:[{ type:"text", text:String(r.value) }], is_error:isErr, isError:isErr };
    }
    if (Array.isArray(r)) return { content:r, is_error:false, isError:false };
    if (r && typeof r === "object" && Array.isArray(r.content)){
      if (typeof r.is_error === "undefined") r.is_error = !!r.isError;
      if (typeof r.isError === "undefined") r.isError = !!r.is_error;
      return r;
    }
    return { content:[{ type:"json", json:r }], is_error:false, isError:false };
  }catch(e){
    return { content:[{ type:"text", text:String(e && e.message || e) }], is_error:true, isError:true };
  }
}
const _mcpCallToolFn = (typeof callTool === "function") ? callTool : async function(name, args){
  switch(String(name)){
    case "echo": {
      const text = (args && typeof args.text !== "undefined") ? String(args.text) : "pong";
      return { content:[{ type:"text", text }], is_error:false, isError:false };
    }
    case "health": {
      return { content:[{ type:"json", json:{ ok:true, service:"mcp-server", time:new Date().toISOString() } }], is_error:false, isError:false };
    }
    case "env_check": {
      return { content:[{ type:"json", json:{ node:process.version, pid:process.pid } }], is_error:false, isError:false };
    }
    default:
      return { content:[{ type:"text", text:`unknown tool: ${name}` }], is_error:true, isError:true };
  }
};
function _mcpToolList(){
  try { if (typeof toolList === "function") return toolList(); } catch {}
  return { tools: [ {name:"echo"}, {name:"health"}, {name:"env_check"}, {name:"fs_read"}, {name:"fs_write"} ] };
}
try {
  if (app && app._router && Array.isArray(app._router.stack)) {
    app._router.stack = app._router.stack.filter(layer => !(layer && layer.route && layer.route.path === "/mcp" && layer.route.methods && layer.route.methods.post));
  }
} catch{}
app.post("/mcp_legacy", requireSecretIfNeeded, async (req, res) => {
  const body = req.body || {};
  const id = Object.prototype.hasOwnProperty.call(body,"id") ? body.id : null;
  const method = _mcpNormalizeMethod(body.method);
  res.set("X-MCP-Handler","v2");

  if (method === "tools.list" || method === "tools/list") {
    return res.status(200).json({ jsonrpc:"2.0", id, result: _mcpToolList() });
  }
  if (method === "tools.call" || method === "tool.call" || method === "tools/call" || method === "tool/call") {
    const params = body.params || {};
    const name = params.name || "";
    const args = params.arguments || {};
    const wait = Object.prototype.hasOwnProperty.call(params,"wait") ? !!params.wait : true;
    if (wait) {
      const r = await _mcpCallToolFn(name, args);
      return res.status(200).json({ jsonrpc:"2.0", id, result: _mcpNormalizeToolResult(r) });
    } else {
      return res.status(200).json({
        jsonrpc:"2.0", id,
        result: { content:[{ type:"text", text:"queued (not implemented)" }], is_error:false, isError:false }
      });
    }
  }
  return res.status(200).json({
    jsonrpc:"2.0", id,
    result: { content:[{ type:"text", text:`unknown method: ${method}` }], is_error:true, isError:true }
  });
});
/* ==== end of canonical handler ==== */

/* ==== MCP JSON-RPC v2 (canonical) ==== */
function _mcpNormalizeMethod(m){ return String(m||"").toLowerCase().replace(/\/+/g,"."); }
function _mcpNormalizeToolResult(r){
  try{
    if (r && typeof r==="object" && r.result) r=r.result;                   // flatten nested {result:...}
    if (r && typeof r==="object" && typeof r.value!=="undefined" && !Array.isArray(r.content)){
      const e=!!(r.is_error||r.isError); return {content:[{type:"text",text:String(r.value)}],is_error:e,isError:e};
    }
    if (Array.isArray(r)) return {content:r,is_error:false,isError:false};   // already content[]
    if (r && typeof r==="object" && Array.isArray(r.content)){
      if (typeof r.is_error==="undefined") r.is_error=!!r.isError;
      if (typeof r.isError==="undefined") r.isError=!!r.is_error;
      return r;
    }
    return {content:[{type:"json",json:r}],is_error:false,isError:false};
  }catch(e){ return {content:[{type:"text",text:String(e&&e.message||e)}],is_error:true,isError:true}; }
}
const _mcpCallToolFn = (typeof callTool==="function")? callTool : async (name,args)=>{
  if(name==="echo"){ const t=String((args&&args.text)??"pong"); return {content:[{type:"text",text:t}],is_error:false,isError:false}; }
  if(name==="health"){ return {content:[{type:"json",json:{ok:true,service:"mcp-server",time:new Date().toISOString()}}],is_error:false,isError:false}; }
  if(name==="env_check"){ return {content:[{type:"json",json:{node:process.version,pid:process.pid}}],is_error:false,isError:false}; }
  return {content:[{type:"text",text:`unknown tool: ${name}`}],is_error:true,isError:true};
};
function _mcpToolList(){ try{ if(typeof toolList==="function") return toolList(); }catch{} return {tools:[{name:"echo"},{name:"health"},{name:"env_check"},{name:"fs_read"},{name:"fs_write"}]}; }
app.post("/mcp", requireSecretIfNeeded, async async (req, res) => {
  const body=req.body||{}; const id=(Object.prototype.hasOwnProperty.call(body,"id")?body.id:null);
  const method=_mcpNormalizeMethod(body.method); res.set("X-MCP-Handler","v2");
  if(method==="tools.list"||method==="tools/list"){ return res.status(200).json({jsonrpc:"2.0",id,result:_mcpToolList()}); }
  if(method==="tools.call"||method==="tool.call"||method==="tools/call"||method==="tool/call"){
    const p=body.params||{}; const name=p.name||""; const args=p.arguments||{}; const wait=(Object.prototype.hasOwnProperty.call(p,"wait")?!!p.wait:true);
    if(wait){ const r=await _mcpCallToolFn(name,args); return res.status(200).json({jsonrpc:"2.0",id,result:_mcpNormalizeToolResult(r)}); }
    return res.status(200).json({jsonrpc:"2.0",id,result:{content:[{type:"text",text:"queued"}],is_error:false,isError:false}});
  }
  return res.status(200).json({jsonrpc:"2.0",id,result:{content:[{type:"text",text:`unknown method: ${method}`}],is_error:true,isError:true}});
});
/* ==== end v2 ==== */

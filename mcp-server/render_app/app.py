diff --git a/render_app/app.py b/render_app/app.py
index f88b359c19b81435428e6f909496e35d8e957eeb..db5228089ce6b7789873f1e1f6c7dde8c9aba7f3 100644
--- a/render_app/app.py
+++ b/render_app/app.py
@@ -1,58 +1,102 @@
 from fastapi import FastAPI, Request
 from fastapi.responses import JSONResponse
 import os, httpx
 from datetime import datetime, timezone
 
 APP_NAME = "outreach-api"
 app = FastAPI(title=APP_NAME)
 
+_mcp_env_url = os.getenv("MCP_SERVER_URL") or "http://127.0.0.1:10000"
+MCP_SERVER_URL = _mcp_env_url.rstrip("/") or "http://127.0.0.1:10000"
+if not MCP_SERVER_URL.endswith("/mcp"):
+    MCP_SERVER_URL = f"{MCP_SERVER_URL}/mcp"
+MCP_SHARED_SECRET = os.getenv("MCP_SHARED_SECRET", "")
+
 @app.get("/health")
 async def health():
     return JSONResponse({"status":"ok","app":APP_NAME}, status_code=200)
 
 async def log_to_supabase(data):
     SUPABASE_URL = os.getenv("SUPABASE_URL")
     SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY") or os.getenv("SUPABASE_KEY")
     if not (SUPABASE_URL and SUPABASE_KEY):
         return {"status": "supabase_not_configured"}
     headers = {
         "apikey": SUPABASE_KEY,
         "Authorization": f"Bearer {SUPABASE_KEY}",
         "Content-Type": "application/json",
         "Prefer": "return=representation",
     }
     async with httpx.AsyncClient(timeout=10) as c:
         r = await c.post(f"{SUPABASE_URL}/rest/v1/ai_logs", headers=headers, json=data)
         ok = r.status_code in (200, 201)
         return {"status": "logged" if ok else "failed", "code": r.status_code}
 
 async def forward_to_n8n(data):
     N8N_URL = os.getenv("N8N_URL")
     if not N8N_URL:
         return None
     url = N8N_URL.rstrip("/") + "/webhook/outreach-mvp"
     try:
         async with httpx.AsyncClient(timeout=10) as c:
             r = await c.post(url, json=data)
             return {"n8n": r.status_code}
     except Exception as e:
         return {"n8n_error": str(e)}
 
 @app.post("/mvp")
 async def mvp(request: Request):
     try:
         payload = await request.json()
     except Exception:
         payload = {}
     data = {
         "source": "api/mvp",
         "app": APP_NAME,
         "ts": datetime.now(timezone.utc).isoformat(),
         "payload": payload,
     }
     supa = await log_to_supabase(data)
     n8n  = await forward_to_n8n(data)
     body = {"supa": supa}
     if n8n: body.update(n8n)
     code = 200 if (supa and supa.get("status") == "logged") else 400
     return JSONResponse(body, status_code=code)
+
+@app.post("/mcp")
+async def mcp(request: Request):
+    try:
+        payload = await request.json()
+    except Exception as e:
+        return JSONResponse(status_code=502, content={"error": str(e)})
+    if not isinstance(payload, dict):
+        return JSONResponse(status_code=400, content={"error": "Invalid payload"})
+    def _canon(m: str) -> str:
+        m = (m or "").strip().lower().replace(".", "/")
+        if m in ("tool/call", "tools/call", "call"):
+            return "tools/call"
+        if m in ("tool/list", "tools/list", "list"):
+            return "tools/list"
+        return m
+    raw_method = str(payload.get("method", ""))
+    method = _canon(raw_method)
+    payload["method"] = method
+    if method == "tools/call":
+        params = payload.setdefault("params", {})
+        if not isinstance(params, dict):
+            params = {}
+            payload["params"] = params
+        params["wait"] = True
+    headers = {}
+    if method == "tools/list":
+        headers["cache-control"] = "no-cache"
+    if MCP_SHARED_SECRET:
+        headers["authorization"] = f"Bearer {MCP_SHARED_SECRET}"
+    target_url = MCP_SERVER_URL
+    try:
+        async with httpx.AsyncClient(timeout=15.0) as client:
+            response = await client.post(target_url, json=payload, headers=headers)
+        data = response.json()
+        return JSONResponse(status_code=200, content=data)
+    except Exception as e:
+        return JSONResponse(status_code=502, content={"error": str(e)})

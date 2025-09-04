import os
import json
from typing import Any, Dict, Optional
from fastapi import FastAPI, Body, HTTPException
from pydantic import BaseModel
import httpx

app = FastAPI(title="Tidewave Orchestrator", version="1.0.0")

# Add CORS middleware so that requests from the Vercel frontend (e.g. web-d7jk.vercel.app) and other origins
# can communicate with this API without being blocked by the browser.  This is especially important when
# serving the API behind a different domain (like Render) and proxying through Vercel or calling directly
# from the browser.  You may restrict `allow_origins` to the exact origins of your frontend for additional
# security.
from fastapi.middleware.cors import CORSMiddleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # TODO: replace with specific origin like "https://web-d7jk.vercel.app" in production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Read from environment (provided via .env or platform env)
SUPABASE_URL = os.getenv("SUPABASE_URL", "").strip()
SUPABASE_KEY = os.getenv("SUPABASE_KEY", "").strip()
ANTHROPIC_API_KEY = os.getenv("ANTHROPIC_API_KEY", "").strip()
ANTHROPIC_API_URL = os.getenv("ANTHROPIC_API_URL", "https://api.anthropic.com").strip()
ANTHROPIC_API_VERSION = os.getenv("ANTHROPIC_API_VERSION", "2023-06-01").strip()
LLM_PROMOTION_THRESHOLD = int(os.getenv("LLM_PROMOTION_THRESHOLD", "120"))
LLM_MAX_TOKENS = int(os.getenv("LLM_MAX_TOKENS", "512"))
VERCEL_HOOKS = [v for v in [os.getenv("VERCEL_HOOK_1", "").strip(), os.getenv("VERCEL_HOOK_2", "").strip()] if v]
API_HEALTH = os.getenv("API_HEALTH", "").strip()

class OrchestrateIn(BaseModel):
    text: str
    user: Optional[str] = None
    critical: Optional[bool] = False
    meta: Optional[Dict[str, Any]] = None

async def log_supabase(level: str, message: str, meta: Optional[dict] = None) -> None:
    if not SUPABASE_URL or not SUPABASE_KEY:
        return
    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            headers = {
                "apikey": SUPABASE_KEY,
                "Authorization": f"Bearer {SUPABASE_KEY}",
                "Content-Type": "application/json",
                "Prefer": "return=representation",
            }
            payload = {
                "source": "orchestrator/api",
                "level": level,
                "message": message,
                "meta": meta or {},
            }
            await client.post(f"{SUPABASE_URL}/rest/v1/ai_logs", headers=headers, json=payload)
    except Exception:
        pass

async def call_anthropic(prompt: str, critical: bool = False) -> Dict[str, Any]:
    if not ANTHROPIC_API_KEY:
        return {"ok": False, "reason": "missing_ANTHROPIC_API_KEY"}
    model = "claude-3-5-sonnet-20240620" if (critical or len(prompt) > LLM_PROMOTION_THRESHOLD) else "claude-3-5-haiku-20240307"
    body = {
        "model": model,
        "max_tokens": LLM_MAX_TOKENS,
        "messages": [{"role": "user", "content": prompt}],
    }
    headers = {
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": ANTHROPIC_API_VERSION,
        "Content-Type": "application/json",
    }
    async with httpx.AsyncClient(timeout=60.0) as client:
        r = await client.post(f"{ANTHROPIC_API_URL}/v1/messages", headers=headers, json=body)
        try:
            data = r.json()
        except Exception:
            data = {"status_code": r.status_code, "text": r.text}
        return {
            "ok": r.status_code in (200, 201),
            "status": r.status_code,
            "model": model,
            "raw": data,
        }

async def call_vercel_hooks() -> list:
    results = []
    async with httpx.AsyncClient(timeout=20.0) as client:
        for url in VERCEL_HOOKS:
            try:
                resp = await client.post(url)
                results.append({"url": url, "status": resp.status_code})
            except Exception as e:
                results.append({"url": url, "error": str(e)})
    return results

async def call_health() -> Any:
    if not API_HEALTH:
        return {"ok": False, "reason": "missing_API_HEALTH"}
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            r = await client.get(API_HEALTH)
            return {"ok": r.status_code == 200, "status": r.status_code, "body": r.text[:400]}
    except Exception as e:
        return {"ok": False, "error": str(e)}

@app.get("/health")
async def health():
    """
    Simple health check endpoint used by Render's healthCheckPath. Returns a JSON
    object with the status of the service. Keeping the key names stable
    (``status`` and ``app``) means existing monitoring scripts or front‑end
    dashboards that expect this format will continue to work without changes.

    Returns
    -------
    dict
        A dictionary containing two keys:

        - ``status`` (str): Always ``"ok"`` to indicate the service is healthy.
        - ``app`` (str): A short identifier for this service.
    """
    return {"status": "ok", "app": "tidewave-orchestrator"}

@app.get("/ping")
async def ping() -> dict:
    """
    Compatibility endpoint for legacy health checks. Some client code may
    attempt to call ``/ping`` instead of ``/health``. Without this route,
    FastAPI would return a 404 and certain dashboards would show "FAIL".

    Returns
    -------
    dict
        Always returns ``{"status": "ok", "app": "tidewave-orchestrator"}``.
    """
    return {"status": "ok", "app": "tidewave-orchestrator"}

@app.post("/mvp")
async def mvp_log(payload: Dict[str, Any] = Body(...)):
    await log_supabase("info", "mvp_log", payload)
    return {"ok": True, "logged": True, "echo": payload}

@app.post("/orchestrate")
async def orchestrate(body: OrchestrateIn):
    text = (body.text or "").strip()
    if not text:
        raise HTTPException(status_code=400, detail="text is required")

    # quick intent routing
    intent = "llm_plan"
    import re
    if re.search(r"(배포|redeploy|deploy|재배포)", text, re.I):
        intent = "deploy_frontend"
    elif re.search(r"(헬스|health|상태|status|살아있)", text, re.I):
        intent = "health_check"

    results = {"intent": intent, "steps": []}

    if intent == "deploy_frontend":
        vercels = await call_vercel_hooks()
        results["steps"].append({"deploy": vercels})
        hl = await call_health()
        results["steps"].append({"health": hl})

    elif intent == "health_check":
        hl = await call_health()
        results["steps"].append({"health": hl})

    else:
        ai = await call_anthropic(text, bool(body.critical))
        results["steps"].append({"llm": ai})

    await log_supabase("info", "orchestrate", {"intent": intent, "user": body.user})
    return {"ok": True, "result": results}

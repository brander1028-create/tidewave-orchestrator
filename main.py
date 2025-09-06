import os, asyncio, httpx
from typing import Dict, Any, List, Optional
from enum import Enum
from fastapi import FastAPI, Body
from pydantic import BaseModel, Field
from langgraph.graph import StateGraph, START, END

VERCEL_HOOK_1 = os.environ.get("VERCEL_HOOK_1", "")
VERCEL_HOOK_2 = os.environ.get("VERCEL_HOOK_2", "")
SUPABASE_URL = os.environ.get("SUPABASE_URL", "")
SUPABASE_KEY = os.environ.get("SUPABASE_KEY", "")
ANTHROPIC_API_KEY = os.environ.get("ANTHROPIC_API_KEY", "")
HEALTH_URL = os.environ.get("HEALTH_URL")  # optional explicit health URL
PORT = int(os.environ.get("PORT", "8000"))

class Intent(str, Enum):
    DEPLOY = "deploy"
    HEALTH = "health"
    OTHER = "other"

class OrchestratorState(BaseModel):
    instruction: str
    intent: Optional[Intent] = None
    plan: Optional[str] = None
    retries: int = 0
    verify_passed: Optional[bool] = None
    logs: List[str] = Field(default_factory=list)

async def plan_node(state: OrchestratorState) -> OrchestratorState:
    txt = state.instruction.lower()
    intent = Intent.OTHER
    if any(k in txt for k in ["배포", "재배포", "deploy"]):
        intent = Intent.DEPLOY
    elif any(k in txt for k in ["헬스", "health", "상태", "alive"]):
        intent = Intent.HEALTH
    plan = f"intent={intent.value}; steps=[implement→verify→(heal if fail)]"
    state.intent = intent
    state.plan = plan
    state.logs.append(f"[plan] {plan}")
    return state

async def implement_node(state: OrchestratorState) -> OrchestratorState:
    if state.intent == Intent.HEALTH:
        state.logs.append("[implement] skip (health only)")
        return state
    async with httpx.AsyncClient(timeout=30) as client:
        for idx, hook in enumerate([VERCEL_HOOK_1, VERCEL_HOOK_2], start=1):
            if not hook:
                continue
            try:
                r = await client.post(hook)
                state.logs.append(f"[implement] vercel_hook_{idx} status={r.status_code}")
            except Exception as e:
                state.logs.append(f"[implement] vercel_hook_{idx} error={e}")
    return state

async def verify_node(state: OrchestratorState) -> OrchestratorState:
    url = HEALTH_URL
    if not url:
        url = f"http://127.0.0.1:{PORT}/health"
    try:
        async with httpx.AsyncClient(timeout=15) as client:
            r = await client.get(url)
            ok = (r.status_code == 200)
            state.verify_passed = ok
            state.logs.append(f"[verify] GET {url} -> {r.status_code}")
    except Exception as e:
        state.verify_passed = False
        state.logs.append(f"[verify] error={e}")
    return state

async def heal_node(state: OrchestratorState) -> OrchestratorState:
    state.retries += 1
    state.logs.append(f"[heal] attempt={state.retries} → redeploy")
    return await implement_node(state)

builder = StateGraph(OrchestratorState)
builder.add_node("plan", plan_node)
builder.add_node("implement", implement_node)
builder.add_node("verify", verify_node)
builder.add_node("heal", heal_node)

builder.add_edge(START, "plan")
builder.add_edge("plan", "implement")
builder.add_edge("implement", "verify")

def verify_router(state: OrchestratorState) -> str:
    if state.intent == Intent.HEALTH:
        return END if (state.verify_passed is not False) else "heal"
    if state.verify_passed:
        return END
    return "heal" if state.retries < 1 else END

builder.add_conditional_edges("verify", verify_router, {END: END, "heal": "heal"})
builder.add_edge("heal", "verify")

graph = builder.compile()

app = FastAPI()

@app.get("/health")
async def health() -> Dict[str, Any]:
    return {"ok": True}

class NLReq(BaseModel):
    text: str

@app.post("/orchestrate")
async def orchestrate(req: NLReq) -> Dict[str, Any]:
    init = OrchestratorState(instruction=req.text)
    final: OrchestratorState = await graph.ainvoke(init)  # type: ignore
    return {
        "instruction": final.instruction,
        "intent": (final.intent.value if final.intent else None),
        "plan": final.plan,
        "verify_passed": final.verify_passed,
        "retries": final.retries,
        "logs": final.logs,
    }

@app.get("/ops")
async def ops() -> Dict[str, Any]:
    return {
        "budget_daily": int(os.environ.get("DAILY_TOKEN_BUDGET", "3000")),
        "budget_monthly": int(os.environ.get("MONTHLY_TOKEN_BUDGET", "80000")),
        "llm_promotion_threshold": int(os.environ.get("LLM_PROMOTION_THRESHOLD", "2")),
        "supabase_url": SUPABASE_URL != "",
        "anthropic": ANTHROPIC_API_KEY != "",
        "vercel_hooks": bool(VERCEL_HOOK_1 or VERCEL_HOOK_2),
    }

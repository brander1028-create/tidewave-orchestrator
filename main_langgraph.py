"""
FastAPI application with LangGraph-based Plan→Implement→Verify→Self‑Heal orchestration.

This module uses the `langgraph` library to define a declarative state machine
that can interpret natural language instructions, generate plans via Anthropic
LLM, deploy changes via Vercel hooks (or GitHub PRs in the future), verify
deployments via health checks, and attempt self‑healing if verification
fails. The configuration relies on environment variables defined in
`automation.env` or your Render environment settings.

To deploy:
1. Ensure your `requirements.txt` includes `langgraph` and other
   dependencies (FastAPI, httpx, pydantic).
2. Replace your existing `main.py` with this file or import the app
   from this module (`from main_langgraph import app`).
3. Update Render's start command to `uvicorn main_langgraph:app --host 0.0.0.0 --port $PORT`.

Note: This implementation assumes that `langgraph` and its dependencies are
available at runtime. You may need to install it via pip in your build.
"""

import os
import re
from enum import Enum
from typing import Any, Dict, Optional, Tuple

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
import httpx

# LangGraph imports: these modules define the StateGraph and State types.
try:
    from langgraph.graph import StateGraph
    from langgraph.schema import State
except ImportError:
    # If langgraph is not installed, raise a clear error on import.
    raise RuntimeError(
        "The langgraph package is required for this module. "
        "Please add 'langgraph' to your requirements.txt and install it in your environment."
    )

# ----------------------------------------------------------------------------
# Configuration (from environment variables)
# ----------------------------------------------------------------------------
SUPABASE_URL = os.getenv("SUPABASE_URL", "").strip()
SUPABASE_KEY = os.getenv("SUPABASE_KEY", "").strip()

ANTHROPIC_API_KEY = os.getenv("ANTHROPIC_API_KEY", "").strip()
ANTHROPIC_API_URL = os.getenv("ANTHROPIC_API_URL", "https://api.anthropic.com").strip()
ANTHROPIC_API_VERSION = os.getenv("ANTHROPIC_API_VERSION", "2023-06-01").strip()

VERCEL_HOOK_1 = os.getenv("VERCEL_HOOK_1", "").strip()
VERCEL_HOOK_2 = os.getenv("VERCEL_HOOK_2", "").strip()
VERCEL_HOOKS = [h for h in [VERCEL_HOOK_1, VERCEL_HOOK_2] if h]

API_HEALTH = os.getenv("API_HEALTH", "").strip()

LLM_PROMOTION_THRESHOLD = int(os.getenv("LLM_PROMOTION_THRESHOLD", "120"))
LLM_MAX_TOKENS = int(os.getenv("LLM_MAX_TOKENS", "512"))

# Budgets
DAILY_TOKEN_BUDGET = int(os.getenv("DAILY_TOKEN_BUDGET", "3000"))
MONTHLY_TOKEN_BUDGET = int(os.getenv("MONTHLY_TOKEN_BUDGET", "80000"))

# Supabase tables
AI_LOGS_TABLE = os.getenv("AI_LOGS_TABLE", "ai_logs")
JOBS_TABLE = os.getenv("JOBS_TABLE", "jobs")
ARTIFACTS_TABLE = os.getenv("ARTIFACTS_TABLE", "artifacts")


# ----------------------------------------------------------------------------
# Helper functions for external API calls
# ----------------------------------------------------------------------------
async def call_anthropic(prompt: str, critical: bool = False) -> Dict[str, Any]:
    """
    Call Anthropic's LLM. Chooses model based on text length or critical flag.
    Returns a dictionary with success flag and response data.
    """
    if not ANTHROPIC_API_KEY:
        return {"ok": False, "reason": "missing_ANTHROPIC_API_KEY"}
    model = (
        "claude-3-5-sonnet-20240620"
        if (critical or len(prompt) > LLM_PROMOTION_THRESHOLD)
        else "claude-3-5-haiku-20240307"
    )
    headers = {
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": ANTHROPIC_API_VERSION,
        "Content-Type": "application/json",
    }
    body = {
        "model": model,
        "max_tokens": LLM_MAX_TOKENS,
        "messages": [{"role": "user", "content": prompt}],
    }
    async with httpx.AsyncClient(timeout=30.0) as client:
        resp = await client.post(f"{ANTHROPIC_API_URL}/v1/messages", headers=headers, json=body)
        try:
            data = resp.json()
        except Exception:
            data = {"status": resp.status_code, "text": resp.text[:400]}
    return {
        "ok": resp.status_code in (200, 201),
        "status": resp.status_code,
        "model": model,
        "data": data,
    }


async def call_vercel_hooks() -> Dict[str, Any]:
    """Trigger Vercel hooks sequentially and return status codes."""
    results = {}
    async with httpx.AsyncClient(timeout=10.0) as client:
        for idx, hook in enumerate(VERCEL_HOOKS, start=1):
            try:
                r = await client.post(hook)
                results[f"hook{idx}"] = r.status_code
            except Exception as e:
                results[f"hook{idx}"] = f"error: {e}"
    return results


async def call_health() -> Dict[str, Any]:
    """Check the health endpoint and return status and body."""
    if not API_HEALTH:
        return {"ok": False, "reason": "missing_API_HEALTH"}
    async with httpx.AsyncClient(timeout=10.0) as client:
        try:
            resp = await client.get(API_HEALTH)
            return {
                "ok": resp.status_code == 200,
                "status": resp.status_code,
                "body": resp.text[:400],
            }
        except Exception as e:
            return {"ok": False, "error": str(e)}


async def log_supabase(action: str, meta: Dict[str, Any]) -> None:
    """Log an event to Supabase (ai_logs table)."""
    if not SUPABASE_URL or not SUPABASE_KEY:
        return
    headers = {
        "apikey": SUPABASE_KEY,
        "Authorization": f"Bearer {SUPABASE_KEY}",
        "Content-Type": "application/json",
    }
    payload = {
        "level": action,
        "meta": meta,
    }
    async with httpx.AsyncClient(timeout=10.0) as client:
        await client.post(f"{SUPABASE_URL}/rest/v1/{AI_LOGS_TABLE}", headers=headers, json=payload)


# ----------------------------------------------------------------------------
# LangGraph state functions
# ----------------------------------------------------------------------------
class OrchestratorState(State):
    """
    LangGraph state definition. Holds intermediate data through the graph.
    """
    prompt: str
    intent: str
    user: Optional[str]
    plan_result: Optional[Dict[str, Any]] = None
    implement_result: Optional[Dict[str, Any]] = None
    verify_result: Optional[Dict[str, Any]] = None
    heal_result: Optional[Dict[str, Any]] = None


async def node_plan(state: OrchestratorState) -> Tuple[OrchestratorState, str]:
    """Generate a plan using Anthropic based on intent and prompt."""
    plan = await call_anthropic(f"Plan for intent: {state.intent}\nInstruction: {state.prompt}")
    state.plan_result = plan
    return state, "implement" if state.intent == "deploy" else "verify"


async def node_implement(state: OrchestratorState) -> Tuple[OrchestratorState, str]:
    """Perform deployment actions (e.g. Vercel hooks)."""
    if state.intent == "deploy":
        implement = await call_vercel_hooks()
        state.implement_result = implement
    else:
        state.implement_result = {"skipped": True}
    return state, "verify"


async def node_verify(state: OrchestratorState) -> Tuple[OrchestratorState, str]:
    """Verify health or return LLM response for other intents."""
    if state.intent == "deploy":
        verify = await call_health()
        state.verify_result = verify
        return state, "heal" if not verify.get("ok") else "done"
    elif state.intent == "health":
        verify = await call_health()
        state.verify_result = verify
        return state, "done"
    else:
        # For other intents, simply call LLM again for completion
        llm = await call_anthropic(state.prompt, len(state.prompt) > 200)
        state.verify_result = {"llm": llm}
        return state, "done"


async def node_heal(state: OrchestratorState) -> Tuple[OrchestratorState, str]:
    """Attempt to heal deployment by redeploying via hooks and re-checking health."""
    heal = await call_vercel_hooks()
    state.heal_result = heal
    verify2 = await call_health()
    # merge second verify into heal_result for convenience
    state.heal_result["verify2"] = verify2
    return state, "done"


async def node_done(state: OrchestratorState) -> Tuple[OrchestratorState, str]:
    """Terminal node: return state and finish."""
    return state, ""


def build_graph() -> StateGraph:
    """Build and return a LangGraph StateGraph."""
    graph = StateGraph(OrchestratorState)
    graph.add_node("plan", node_plan)
    graph.add_node("implement", node_implement)
    graph.add_node("verify", node_verify)
    graph.add_node("heal", node_heal)
    graph.add_node("done", node_done)
    # Define edges
    graph.add_edge("plan", "implement")
    graph.add_edge("plan", "verify")
    graph.add_edge("implement", "verify")
    graph.add_edge("verify", "heal")
    graph.add_edge("verify", "done")
    graph.add_edge("heal", "done")
    return graph


# Compile the LangGraph state machine
_graph = build_graph()
_graph_runner = _graph.compile()


# ----------------------------------------------------------------------------
# FastAPI application
# ----------------------------------------------------------------------------
app = FastAPI(title="Tidewave Orchestrator (LangGraph)", version="3.0.0")


class NLRequest(BaseModel):
    prompt: str
    user: Optional[str] = None
    critical: Optional[bool] = False


@app.get("/health")
async def health() -> Dict[str, str]:
    return {"status": "ok", "app": "tidewave-orchestrator-langgraph"}


@app.post("/orchestrate")
async def orchestrate(req: NLRequest) -> Dict[str, Any]:
    """
    Entry point for natural language instructions.

    Determines the intent, runs the state machine, logs the request, and
    returns the aggregated state results.
    """
    prompt = req.prompt.strip()
    if not prompt:
        raise HTTPException(status_code=400, detail="prompt is required")
    # Classify intent using simple regex patterns
    intent = "other"
    if re.search(r"배포|deploy|재배포", prompt, re.I):
        intent = "deploy"
    elif re.search(r"헬스|health|상태", prompt, re.I):
        intent = "health"
    # Initialize state
    state = OrchestratorState(prompt=prompt, intent=intent, user=req.user)
    # Run the LangGraph state machine to completion
    final_state, _ = await _graph_runner(state)
    # Log the orchestration event
    await log_supabase("orchestrate", {
        "intent": intent,
        "prompt": prompt,
        "user": req.user,
        "plan": final_state.plan_result,
        "implement": final_state.implement_result,
        "verify": final_state.verify_result,
        "heal": final_state.heal_result,
    })
    return {
        "ok": True,
        "intent": intent,
        "plan": final_state.plan_result,
        "implement": final_state.implement_result,
        "verify": final_state.verify_result,
        "heal": final_state.heal_result,
    }


@app.get("/ops")
async def ops() -> Dict[str, Any]:
    """
    Returns a summary of budget settings and dummy metrics. This endpoint can be
    extended to query Supabase for job and artifact logs and compute budget usage.
    """
    budgets = {
        "daily_token_budget": DAILY_TOKEN_BUDGET,
        "monthly_token_budget": MONTHLY_TOKEN_BUDGET,
        "promotion_threshold": LLM_PROMOTION_THRESHOLD,
        "max_tokens_per_call": LLM_MAX_TOKENS,
    }
    return {"ok": True, "budgets": budgets}

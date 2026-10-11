"""Compose an AI purchasing proposal and the *existing* TrustLayer evaluator.

No tool is executed here. This module deliberately does not make any approval
judgment; the policy engine remains authoritative.
"""
from __future__ import annotations
from collections.abc import Awaitable, Callable
from typing import Any

from pydantic import BaseModel, Field
from .ai_agent import AIProposeRequest
from .schemas import EvaluationRequest


class AgentRunRequest(BaseModel):
    intent: str = Field(min_length=5, max_length=2000)
    agent_id: str = Field(default="purchase-pilot", min_length=1, max_length=120)
    use_ai: bool = True


async def run_workflow(
    request: AgentRunRequest,
    *,
    propose_fn: Callable[[AIProposeRequest], Awaitable[dict[str, Any]]],
    evaluate_fn: Callable[[EvaluationRequest], Awaitable[dict[str, Any]]],
) -> dict[str, Any]:
    """Produce then evaluate; only the independent gateway may execute later."""
    proposal = await propose_fn(AIProposeRequest(
        intent=request.intent,
        agent_id=request.agent_id,
    ))
    # Allowlist the proposal fields so model-generated explanations and flags
    # cannot set an evaluation's authorization state or control the gateway.
    eval_request = EvaluationRequest.model_validate({
        "agent_id": proposal["agent_id"],
        "intent": proposal["intent"],
        "action": proposal["action"],
        "evidence": proposal["evidence"],
        "policy_id": proposal["policy_id"],
        "use_ai": request.use_ai,
    })
    evaluation = await evaluate_fn(eval_request)
    return {
        "status": "EVALUATED_NOT_EXECUTED",
        "proposal": proposal,
        "evaluation": evaluation,
        "execution": None,
    }

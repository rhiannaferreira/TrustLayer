"""Discover products, rank them, propose one, and run the *existing* TrustLayer evaluator.

No tool is executed here. This module deliberately does not make any approval
judgment; the policy engine and execution gateway remain authoritative.
"""
from __future__ import annotations
from collections.abc import Awaitable, Callable
from typing import Any

from pydantic import BaseModel, Field

from .discovery import discover, exclusion_reason
from .providers import listing_evidence
from .ranking import rank_products
from .schemas import EvaluationRequest
from .web_search import WebSearchUnavailable, research, web_search_status


class AgentRunRequest(BaseModel):
    intent: str = Field(min_length=5, max_length=2000)
    agent_id: str = Field(default="purchase-pilot", min_length=1, max_length=120)
    use_ai: bool = True
    rank_with_ai: bool = True


def build_proposal(request: AgentRunRequest, product: dict[str, Any], ranking: dict[str, Any],
                   reason: str | None) -> dict[str, Any]:
    """Every value in the action comes from the server's own copy of the listing."""
    return {
        "agent_id": request.agent_id,
        "intent": request.intent,
        "action": {"type": "place_order", "parameters": {
            "product_id": product["product_id"],
            "price": product["price"],
            "currency": product["currency"],
            "vendor": product["seller"],
            "category": product["category"],
        }},
        "evidence": [listing_evidence(product)],
        "policy_id": "shopping-default",
        "proposal_source": "luminal_generated" if ranking["ranking_source"] == "luminal" else "deterministic_ranking",
        "agent_reasoning": reason or "",
        "search_id": product.get("search_id"),
    }


async def run_workflow(
    request: AgentRunRequest,
    *,
    evaluate_fn: Callable[[EvaluationRequest], Awaitable[dict[str, Any]]],
    approved_vendors: list[str],
) -> dict[str, Any]:
    """Discover, rank, then evaluate; only the independent gateway may execute later."""
    discovery = await discover(request.intent)
    base = {"discovery": discovery, "ranking": None, "recommendation": None, "alternatives": [],
            "proposal": None, "evaluation": None, "execution": None, "research": None}
    if discovery["status"] == "NO_MATCH":
        # Not a product request the catalog can serve: answer from the web instead, clearly labeled.
        # Nothing is proposed, evaluated or executed on the basis of web results.
        found = None
        if web_search_status()["configured"]:
            try:
                found = await research(request.intent)
            except WebSearchUnavailable as exc:
                found = {"error": str(exc), "sources": [], "answer": None}
        return {"status": "NO_MATCH", "message": discovery["no_match"]["message"], **base, "research": found}

    candidates = discovery["results"]
    by_id = {c["product_id"]: c for c in candidates}
    ranking = await rank_products(request.intent, discovery["query"], candidates, approved_vendors,
                                  use_ai=request.rank_with_ai)
    selected = by_id[ranking["selected_product_id"]]
    # Defense in depth: the selected product must still satisfy the parsed request.
    if exclusion_reason(selected, discovery["query"]) is not None:
        raise ValueError("Selected product does not satisfy the request")
    top = ranking["ranked"][0]
    proposal = build_proposal(request, selected, ranking, top["reason"])

    # Allowlist the proposal fields so model-generated explanations cannot set an
    # evaluation's authorization state or control the gateway.
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
        **base,
        "status": "EVALUATED_NOT_EXECUTED",
        "message": None,
        "ranking": {k: ranking[k] for k in ("ranking_source", "summary")},
        "recommendation": {"product": selected, "rank": 1, "reason": top["reason"], "tradeoffs": top["tradeoffs"]},
        "alternatives": [{"product": by_id[e["product_id"]], "rank": e["rank"], "reason": e["reason"],
                          "tradeoffs": e["tradeoffs"]} for e in ranking["ranked"][1:]],
        "proposal": proposal,
        "evaluation": evaluation,
    }

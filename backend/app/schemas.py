from __future__ import annotations
from typing import Any, Literal
from pydantic import BaseModel, Field

Decision = Literal["ALLOW", "BLOCK", "REVIEW_REQUIRED"]

class Action(BaseModel):
    type: str = Field(min_length=1, max_length=100)
    parameters: dict[str, Any] = Field(default_factory=dict)

class Evidence(BaseModel):
    id: str = Field(min_length=1, max_length=120)
    source: str = Field(min_length=1, max_length=120)
    content: str = Field(max_length=20000)

class EvaluationRequest(BaseModel):
    agent_id: str = Field(default="purchase-pilot", min_length=1, max_length=120)
    intent: str = Field(default="", max_length=10000)
    action: Action
    evidence: list[Evidence] = Field(default_factory=list, max_length=20)
    policy_id: str = "shopping-default"
    use_ai: bool = False

class PolicyPatch(BaseModel):
    enabled: bool | None = None
    config: dict[str, Any] | None = None

class ExecutionRequest(BaseModel):
    evaluation_id: str
    action: Action

class ReviewDecision(BaseModel):
    decision: Literal["APPROVE", "REJECT"]
    reviewer: str = Field(default="demo-reviewer", min_length=1, max_length=120)

class ProposeRequest(BaseModel):
    intent: str = "Find the best wireless headphones under $80"
    agent_id: str = "purchase-pilot"
    scenario: Literal["valid", "budget", "prompt_injection", "unauthorized"] = "valid"

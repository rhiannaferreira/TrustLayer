"""Deterministic policy and evidence checks. LLMs cannot authorize execution."""
from __future__ import annotations
import math
import re
from uuid import uuid4
from .catalog import PRODUCTS, alternatives
from .db import utc_now

SUSPICIOUS = [
    ("instruction_override", re.compile(r"\b(ignore|disregard|override|bypass)\b.{0,90}\b(instructions|rules|policy|limit|budget)\b", re.I | re.S)),
    ("coercive_instruction", re.compile(r"\b(you must purchase|buy this immediately|do not disclose|system message|developer message)\b", re.I)),
]


def evaluate(request, policies, ai_analysis=None, ai_error=None):
    ps = {p["id"]: p for p in policies}
    checks = []
    flags = []
    def check(name, status, reason):
        checks.append({"name": name, "status": status, "reason": reason})
    def active(pid):
        return ps[pid]["enabled"]
    action = request.action
    parameters = action.parameters
    allowed_actions = ps["allowed-actions"]["config"]["actions"]
    if active("allowed-actions"):
        check("Tool authorization", "PASS" if action.type in allowed_actions else "FAIL",
              "Action is permitted" if action.type in allowed_actions else "Agent action not in allowed actions list")
    else:
        check("Tool authorization", "WARN", "Tool authorization policy disabled for demo")

    max_amount = float(ps["spending-limit"]["config"]["max_amount"])
    allowed_vendors = ps["approved-vendors"]["config"]["vendors"]
    product_id = parameters.get("product_id")
    if action.type == "place_order":
        product = PRODUCTS.get(product_id)
        if not product:
            check("Trusted product reference", "WARN", "Product not in verified local demo catalog")
        else:
            given_price, given_vendor = parameters.get("price"), parameters.get("vendor")
            price_matches = type(given_price) in (int, float) and math.isfinite(given_price) and abs(float(given_price)-product["price"]) < 0.001
            vendor_matches = given_vendor == product["vendor"]
            check("Trusted product reference", "PASS" if price_matches and vendor_matches else "FAIL",
                  "Matches verified demo catalog" if price_matches and vendor_matches else "Submitted price or vendor conflicts with trusted catalog")
        price = parameters.get("price")
        if type(price) not in (int, float) or not math.isfinite(price) or price <= 0:
            check("Spending limit", "FAIL", "Valid positive numeric price required")
        elif active("spending-limit"):
            check("Spending limit", "PASS" if price <= max_amount else "FAIL",
                  f"${price:.2f} is within ${max_amount:.2f} limit" if price <= max_amount
                  else f"${price:.2f} exceeds ${max_amount:.2f} spending limit")
        else:
            check("Spending limit", "WARN", "Spending policy disabled for demo")
        vendor = parameters.get("vendor")
        if active("approved-vendors"):
            check("Vendor authorization", "PASS" if vendor in allowed_vendors else "FAIL",
                  "Vendor is approved" if vendor in allowed_vendors else "Vendor is not in the allowlist")
        else:
            check("Vendor authorization", "WARN", "Vendor policy disabled for demo")

    for evidence in request.evidence:
        for rule, pattern in SUSPICIOUS:
            if pattern.search(evidence.content):
                flags.append({"evidence_id": evidence.id, "rule": rule,
                              "reason": "Instruction-like text found inside untrusted evidence"})
                break
    if active("evidence-review") and ps["evidence-review"]["config"]["require_review_for_suspicious"] and flags:
        check("Evidence safety", "WARN", f"{len(flags)} suspicious evidence item(s) need human review")
    else:
        check("Evidence safety", "PASS", "No configured high-risk text patterns found" if not flags
              else "Evidence review policy disabled; flagged evidence did not affect the decision")

    if request.use_ai:
        check("AI evidence analysis", "WARN" if ai_error else "PASS",
              "AI unavailable; review required" if ai_error else "AI advisory response returned (does not grant permissions)")

    failed = any(c["status"] == "FAIL" for c in checks)
    warning = any(c["status"] == "WARN" for c in checks)
    decision = "BLOCK" if failed else "REVIEW_REQUIRED" if warning else "ALLOW"
    risk = "HIGH" if failed else "MEDIUM" if warning else "LOW"
    reason = next((c["reason"] for c in checks if c["status"] == "FAIL"), None) or \
             next((c["reason"] for c in checks if c["status"] == "WARN"), "All active checks passed")
    recommended = alternatives(max_amount, allowed_vendors, product_id) if action.type == "place_order" else []
    return {
        "evaluation_id": f"eval-{uuid4().hex[:12]}",
        "agent_id": request.agent_id,
        "action": action.model_dump(),
        "decision": decision,
        "risk_level": risk,
        "checks": checks,
        "reason": reason,
        "evidence_flags": flags,
        "alternatives": recommended,
        "execution_allowed": decision == "ALLOW",
        "policy_versions": {p["id"]: p["version"] for p in policies},
        "ai_analysis": ai_analysis,
        "ai_status": "error" if ai_error else "completed" if request.use_ai else "not_requested",
        "ai_error": ai_error,
        "created_at": utc_now(),
        "review_status": None,
        "executed": False,
    }

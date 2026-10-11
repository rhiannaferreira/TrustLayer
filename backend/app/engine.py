"""Deterministic policy and evidence checks. LLMs cannot authorize execution."""
from __future__ import annotations
import math
import os
import re
from datetime import datetime, timezone
from uuid import uuid4
from .catalog import alternatives
from .discovery import resolve_product
from .intent import parse_intent
from . import db as _db
from .quality import assess_quality
from .db import utc_now

POLICY_CURRENCY = "USD"

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
    product = None
    verification = {"status": "NOT_APPLICABLE"}
    intent = parse_intent(request.intent)
    if action.type == "place_order":
        product = resolve_product(product_id)
        verification = verify_product(product, parameters)
        if verification["status"] == "UNVERIFIED":
            check("Trusted product reference", "WARN",
                  "Product not found in the demo catalog or in any listing this server retrieved from a provider")
        elif verification["mismatches"]:
            check("Trusted product reference", "FAIL",
                  f"Submitted {', '.join(verification['mismatches'])} conflicts with the trusted "
                  f"{'provider listing' if verification['status'] == 'PROVIDER_VERIFIED' else 'demo catalog record'}")
        elif verification["status"] == "PROVIDER_VERIFIED":
            check("Trusted product reference", "PASS",
                  f"Matches {product['provider']} listing retrieved {product['retrieved_at']} by this server "
                  "(listing price excludes shipping and tax)")
        else:
            check("Trusted product reference", "PASS", "Matches fictional demo catalog record (not live retailer data)")
        if verification["status"] == "PROVIDER_VERIFIED" and listing_is_stale(product):
            check("Listing freshness", "WARN", "Provider listing is older than the allowed age; search again before buying")
        price = parameters.get("price")
        price_currency = (product or {}).get("currency") or parameters.get("currency") or POLICY_CURRENCY
        if type(price) not in (int, float) or not math.isfinite(price) or price <= 0:
            check("Spending limit", "FAIL", "Valid positive numeric price required")
        elif active("spending-limit") and price_currency != POLICY_CURRENCY:
            check("Spending limit", "FAIL",
                  f"Spending limit is set in {POLICY_CURRENCY}; a {price_currency} price cannot be compared")
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
        status, reason = request_constraints(intent, product, parameters)
        check("Request match", status, reason)

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

    quality_policy = ps.get("decision-quality")
    quality_config = quality_policy["config"] if quality_policy else {}
    enforce_quality = bool(quality_policy and quality_policy["enabled"] and
                           quality_config.get("require_review_if_insufficient", False))
    quality = assess_quality(request, quality_config, enforced=enforce_quality)
    if enforce_quality:
        if quality["status"] == "INSUFFICIENT_EVIDENCE":
            check("Decision evidence quality", "WARN",
                  f"{len(quality['missing'])} evidence requirement(s) missing; human review needed")
        else:
            check("Decision evidence quality", "PASS", "Configured demo evidence checks passed")

    if request.use_ai:
        check("AI evidence analysis", "WARN" if ai_error else "PASS",
              "AI unavailable; review required" if ai_error else "AI advisory response returned (does not grant permissions)")

    failed = any(c["status"] == "FAIL" for c in checks)
    warning = any(c["status"] == "WARN" for c in checks)
    decision = "BLOCK" if failed else "REVIEW_REQUIRED" if warning else "ALLOW"
    risk = "HIGH" if failed else "MEDIUM" if warning else "LOW"
    reason = next((c["reason"] for c in checks if c["status"] == "FAIL"), None) or \
             next((c["reason"] for c in checks if c["status"] == "WARN"), "All active checks passed")
    recommended = category_alternatives(product, intent, max_amount, allowed_vendors, product_id) if action.type == "place_order" else []
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
        "decision_quality": quality,
        "product_verification": verification,
        "ai_analysis": ai_analysis,
        "ai_status": "error" if ai_error else "completed" if request.use_ai else "not_requested",
        "ai_error": ai_error,
        "created_at": utc_now(),
        "review_status": None,
        "executed": False,
    }


def listing_is_stale(product) -> bool:
    max_age = float(os.getenv("PRODUCT_LISTING_MAX_AGE_SECONDS", "3600"))
    try:
        retrieved = datetime.fromisoformat(product["retrieved_at"])
    except (KeyError, TypeError, ValueError):
        return True
    return (datetime.now(timezone.utc) - retrieved).total_seconds() > max_age


def verify_product(product, parameters) -> dict:
    """Compare submitted values with the server's authoritative record. Never grants authorization."""
    if product is None:
        return {"status": "UNVERIFIED", "provenance": "unverified", "mismatches": [],
                "explanation": "No server-owned record exists for this product ID; submitted values are unverified."}
    mismatches = []
    given_price = parameters.get("price")
    if not (type(given_price) in (int, float) and math.isfinite(given_price)
            and abs(float(given_price) - product["price"]) < 0.001):
        mismatches.append("price")
    if parameters.get("vendor") != product["seller"]:
        mismatches.append("vendor")
    for key in ("currency", "category"):
        if key in parameters and parameters[key] != product.get(key):
            mismatches.append(key)
    provider = product["provenance"] == "provider_api"
    return {
        "status": "PROVIDER_VERIFIED" if provider else "DEMO_FIXTURE",
        "provenance": product["provenance"],
        "provider": product["provider"],
        "source": product["source"],
        "retrieved_at": product["retrieved_at"] if provider else None,
        "product_url": product.get("product_url"),
        "provider_fields": product.get("provider_fields", []),
        "unverified_fields": product.get("unverified_fields", []),
        "trusted_values": {k: product.get(k) for k in ("title", "category", "price", "currency", "seller", "availability")},
        "mismatches": mismatches,
        "explanation": ("Values match a listing this server retrieved from the provider API. This confirms the listing, "
                        "not product quality, and does not by itself authorize a purchase." if provider else
                        "Values come from the fictional demo catalog. They are not real retailer data."),
    }


def request_constraints(intent, product, parameters) -> tuple[str, str]:
    """Check the proposal against what the user actually asked for, parsed without any model."""
    problems = []
    category = (product or {}).get("category") or parameters.get("category")
    if intent["categories"] and product is not None:
        if category not in intent["categories"]:
            problems.append(f"product category '{category or 'unknown'}' does not match the requested "
                            f"{' or '.join(intent['categories'])}")
    price = parameters.get("price")
    currency = (product or {}).get("currency") or parameters.get("currency")
    if intent["max_price"] is not None or intent["currency_explicit"]:
        if currency and currency != intent["currency"]:
            problems.append(f"price is in {currency} but the request is in {intent['currency']}")
        elif type(price) in (int, float) and intent["max_price"] is not None and price > intent["max_price"] + 1e-9:
            problems.append(f"{price:.2f} exceeds the requested budget of {intent['max_price']:.2f} {intent['currency']}")
    if product is not None and product.get("availability") in ("out_of_stock", "unavailable"):
        problems.append("listing is out of stock")
    if problems:
        return "FAIL", "Request mismatch: " + "; ".join(problems)
    if not intent["categories"] and intent["max_price"] is None:
        return "PASS", "No category or budget stated in the request"
    return "PASS", "Matches the requested category and budget"


def category_alternatives(product, intent, max_amount, allowed_vendors, product_id) -> list[dict]:
    """Same-category alternatives only; never cross-category unless the user asked for several."""
    category = (product or {}).get("category")
    categories = intent["categories"] or ([category] if category else [])
    if not categories:
        return []
    cap = max_amount if intent["max_price"] is None else min(max_amount, intent["max_price"])
    if product is not None and product["provenance"] == "provider_api":
        pool = [r for r in _db.listings_for_search(product.get("search_id"))
                if r["product_id"] != product_id and r.get("category") in categories
                and r["currency"] == POLICY_CURRENCY and r["price"] <= cap and r["seller"] in allowed_vendors]
        pool.sort(key=lambda r: r["price"])
        return [{"product_id": r["product_id"], "name": r["title"], "price": r["price"], "currency": r["currency"],
                 "vendor": r["seller"], "category": r["category"], "rating": r.get("rating"),
                 "provenance": r["provenance"], "product_url": r.get("product_url")} for r in pool[:3]]
    out = []
    for c in categories:
        out.extend(alternatives(cap, allowed_vendors, product_id, c))
    return [{**p, "provenance": p["provenance"]} for p in out[:3]]

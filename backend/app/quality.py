"""Explainable decision-evidence quality checks, independent of LLM text.

No free-form model answer is parsed to authorize actions. Only exact matches to
server-owned *fictional demo fixtures* count toward the demo quality gate.

Server-retrieved provider listings are recognized and labeled as real provider
data, but a listing is neither an independent review nor a checkout total, so it
never satisfies those requirements. Caller-supplied evidence is always treated as
unverified, whatever its ``source`` label says.
"""
from __future__ import annotations
import re
from .evidence_fixtures import FIXTURES
from .discovery import resolve_product
from .providers import listing_evidence

DEFAULT_CONFIG = {
    "require_review_if_insufficient": False,  # OFF to preserve existing demo behavior
    "min_independent_sources": 1,
    "require_comparison_for_best": True,
    "require_cost_quote": True,
}

SUPERLATIVE = re.compile(r"\b(best|top[ -]rated|most reliable|highest rated|lowest price)\b", re.I)


def validate_quality_policy(config: dict) -> None:
    if not isinstance(config, dict):
        raise ValueError("Decision quality config must be an object")
    permitted = set(DEFAULT_CONFIG)
    unexpected = set(config) - permitted
    if unexpected:
        raise ValueError(f"Unknown quality configuration fields: {', '.join(sorted(unexpected))}")
    for key in ("require_review_if_insufficient", "require_comparison_for_best", "require_cost_quote"):
        if type(config.get(key)) is not bool:
            raise ValueError(f"{key} must be true or false")
    value = config.get("min_independent_sources")
    if type(value) is not int or not (0 <= value <= 5):
        raise ValueError("min_independent_sources must be an integer from 0 to 5")


def assess_quality(request, config: dict | None, *, enforced: bool = False) -> dict:
    """Checks evidence adequacy for the configured demo purchasing workflow.

    Does not rate the product, verify external commerce data, or claim that a
    source is independently authentic outside these server-owned fixtures.
    """
    cfg = {**DEFAULT_CONFIG, **(config or {})}
    if request.action.type != "place_order":
        return {
            "status": "NOT_APPLICABLE", "enforced": enforced,
            "missing": [], "matched_evidence_ids": [],
            "unverified_evidence_ids": [], "explanation": "This demo quality gate applies only to purchases.",
            "provenance": "fictional_demo_fixtures_only", "evidence_provenance": [], "product_data_provenance": None,
        }

    product_id = request.action.parameters.get("product_id")
    if not isinstance(product_id, str):
        product_id = ""
    product = resolve_product(product_id)
    trusted_listing = listing_evidence(product) if product else None
    matched: dict[str, dict] = {}
    unverified: list[str] = []
    provenance: list[dict] = []
    for supplied in request.evidence:
        fixture = FIXTURES.get(supplied.id)
        if (fixture is not None and product_id in fixture["product_ids"]
                and supplied.source == fixture["source"]
                and supplied.content == fixture["content"]):
            matched[supplied.id] = fixture  # duplicates never increase the count
            provenance.append({"evidence_id": supplied.id, "provenance": "fictional_demo_fixture", "kind": fixture["kind"]})
        elif trusted_listing and supplied.model_dump() == {**trusted_listing}:
            provenance.append({"evidence_id": supplied.id, "provenance": product["provenance"], "kind": "listing"})
        else:
            unverified.append(supplied.id)
            provenance.append({"evidence_id": supplied.id, "provenance": "unverified_caller_supplied", "kind": None})

    reviews = sum(item["kind"] == "independent_review" for item in matched.values())
    comparison = any(item["kind"] == "comparison" for item in matched.values())
    cost_quote = any(item["kind"] == "cost_quote" for item in matched.values())
    comparative_claim = bool(SUPERLATIVE.search(request.intent))
    missing = []
    provider_product = bool(product and product["provenance"] == "provider_api")
    if reviews < cfg["min_independent_sources"]:
        missing.append({
            "code": "INDEPENDENT_SOURCES",
            "reason": (f"Need {cfg['min_independent_sources']} trusted independent review(s); none is available from an "
                       "authenticated source for this provider listing, and none will be fabricated"
                       if provider_product else
                       f"Need {cfg['min_independent_sources']} trusted demo independent review(s); found {reviews}"),
        })
    if comparative_claim and cfg["require_comparison_for_best"] and not comparison:
        missing.append({
            "code": "COMPARATIVE_EVIDENCE",
            "reason": "Superlative goal requires a matching server-owned comparison fixture",
        })
    if cfg["require_cost_quote"] and not cost_quote:
        missing.append({
            "code": "TOTAL_COST_QUOTE",
            "reason": ("Provider listing price excludes shipping and tax; no verified checkout total is available"
                       if provider_product else "No matching server-owned demo checkout-quote fixture supplied"),
        })

    status = "INSUFFICIENT_EVIDENCE" if missing else "SUFFICIENT_FOR_DEMO"
    return {
        "status": status,
        "enforced": enforced,
        "missing": missing,
        "matched_evidence_ids": sorted(matched),
        "unverified_evidence_ids": unverified,
        "comparative_claim": comparative_claim,
        "verified_demo_independent_review_count": reviews,
        "explanation": (
            "Evidence does not meet the configured demo requirements."
            if missing else "All configured demo evidence-presence checks passed; this is not real-world fact verification."
        ),
        "provenance": "fictional_demo_fixtures_only",
        "evidence_provenance": provenance,
        "product_data_provenance": product["provenance"] if product else "unverified",
    }

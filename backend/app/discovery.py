"""Category-aware product discovery.

Parses the request deterministically, searches the configured provider (or the
labeled demo catalog), and keeps only listings that match the requested category,
budget, currency and availability. Nothing here is decided by a model.
"""
from __future__ import annotations
from typing import Any
from uuid import uuid4

from . import db
from .catalog import DEMO_PROVENANCE, PRODUCTS
from .intent import parse_intent, query_for
from .providers import (DemoCatalogProvider, ProviderUnavailable, demo_record, live_provider,
                        search_config)

SEARCH_LIMIT = 30
EXCLUSION_REASONS = ("wrong_category", "currency_mismatch", "over_budget", "under_minimum", "unavailable")


def resolve_product(product_id: Any) -> dict[str, Any] | None:
    """Authoritative record for a product ID: the demo catalog or a server-retrieved listing."""
    if not isinstance(product_id, str):
        return None
    if product_id in PRODUCTS:
        return demo_record(PRODUCTS[product_id])
    return db.get_listing(product_id)


def exclusion_reason(record: dict[str, Any], parsed: dict[str, Any]) -> str | None:
    if record.get("category") not in parsed["categories"]:
        return "wrong_category"
    if record.get("currency") != parsed["currency"]:
        return "currency_mismatch"
    if parsed["max_price"] is not None and record["price"] > parsed["max_price"] + 1e-9:
        return "over_budget"
    if parsed["min_price"] is not None and record["price"] < parsed["min_price"] - 1e-9:
        return "under_minimum"
    if record.get("availability") in ("out_of_stock", "unavailable"):
        return "unavailable"
    return None


def requirement_matches(record: dict[str, Any], requirements: list[str]) -> tuple[list[str], list[str]]:
    haystack = " ".join([record.get("title") or "", *record.get("features", [])]).lower()
    matched = [r for r in requirements if r.replace("-", " ") in haystack.replace("-", " ")]
    return matched, [r for r in requirements if r not in matched]


def _no_match_message(parsed: dict[str, Any], counts: dict[str, int], mode: str) -> str:
    wanted = " or ".join(parsed["categories"])
    budget = f" at or under {parsed['max_price']:.2f} {parsed['currency']}" if parsed["max_price"] is not None else ""
    where = "the fictional demo catalog" if mode != "live" else "the live provider results"
    details = ", ".join(f"{n} {reason.replace('_', ' ')}" for reason, n in counts.items() if n)
    return f"No {wanted}{budget} found in {where}." + (f" Excluded: {details}." if details else "")


async def discover(intent: str) -> dict[str, Any]:
    parsed = parse_intent(intent)
    search_id = f"search-{uuid4().hex[:12]}"
    config = search_config()
    result: dict[str, Any] = {
        "search_id": search_id,
        "query": parsed,
        "search_terms": query_for(parsed),
        "provider": config["provider"],
        "catalog_mode": "demo" if not config["live"] else "live",
        "provider_error": None,
        "returned_count": 0,
        "matched_count": 0,
        "excluded_counts": {reason: 0 for reason in EXCLUSION_REASONS},
        "excluded": [],
        "results": [],
        "no_match": None,
    }
    if not parsed["categories"]:
        result.update(status="NO_MATCH", no_match={
            "code": "CATEGORY_UNRECOGNIZED",
            "message": "Could not tell which kind of product was requested, so nothing was searched or proposed.",
        })
        db.add_audit("PRODUCT_SEARCH", details=_audit(result))
        return result

    provider = DemoCatalogProvider()
    if config["live"]:
        try:
            if not config["configured"]:
                raise ProviderUnavailable(f"Product search provider '{config['provider']}' is not configured "
                                          f"(missing: {', '.join(config['missing'])})")
            provider = live_provider(config["provider"])
            records = await provider.search(result["search_terms"], parsed, SEARCH_LIMIT)
        except ProviderUnavailable as exc:
            db.add_audit("PRODUCT_SEARCH_FAILED", details={"search_id": search_id, "provider": config["provider"],
                                                           "error": str(exc)})
            if not config["demo_fallback"]:
                raise
            provider = DemoCatalogProvider()
            result.update(catalog_mode="demo_fallback", provider_error=str(exc))
            records = await provider.search(result["search_terms"], parsed, SEARCH_LIMIT)
    else:
        records = await provider.search(result["search_terms"], parsed, SEARCH_LIMIT)

    matches = []
    for record in records:
        reason = exclusion_reason(record, parsed)
        if reason:
            result["excluded_counts"][reason] += 1
            if len(result["excluded"]) < 15:
                result["excluded"].append({"product_id": record["product_id"], "title": record["title"],
                                           "category": record.get("category"), "price": record["price"],
                                           "currency": record["currency"], "reason": reason})
            continue
        matched, unconfirmed = requirement_matches(record, parsed["requirements"])
        matches.append({**record, "search_id": search_id, "requirements_matched": matched,
                        "requirements_unconfirmed": unconfirmed})

    live_matches = [m for m in matches if m["provenance"] != DEMO_PROVENANCE]
    if live_matches:
        db.save_listings(search_id, live_matches)
    result.update(returned_count=len(records), matched_count=len(matches), results=matches)
    if matches:
        result["status"] = "MATCHED"
    else:
        result["status"] = "NO_MATCH"
        result["no_match"] = {"code": "NO_QUALIFYING_PRODUCTS",
                              "message": _no_match_message(parsed, result["excluded_counts"], result["catalog_mode"])}
    db.add_audit("PRODUCT_SEARCH", details=_audit(result))
    return result


def _audit(result: dict[str, Any]) -> dict[str, Any]:
    return {k: result.get(k) for k in ("search_id", "status", "provider", "catalog_mode", "provider_error",
                                       "returned_count", "matched_count", "excluded_counts")} | {
        "categories": result["query"]["categories"], "max_price": result["query"]["max_price"],
        "currency": result["query"]["currency"], "product_ids": [r["product_id"] for r in result["results"]]}

"""Deterministic demo product search constraints; no external retailer queried.

The agent may rank matching choices, but this module is authoritative for
category and budget and never treats a model-generated price as trusted.
"""
from __future__ import annotations
import re

CATEGORY_PATTERNS = {
    "shoes": re.compile(r"\b(shoes?|sneakers?|trainers?|footwear|boots?|running shoes?)\b", re.I),
    "headphones": re.compile(r"\b(headphones?|headsets?|earbuds?|earphones?)\b", re.I),
    "backpacks": re.compile(r"\b(backpacks?|rucksacks?|bookbags?)\b", re.I),
    "laptops": re.compile(r"\b(laptops?|notebooks?|chromebooks?)\b", re.I),
}
BUDGET = re.compile(
    r"\b(less than|under|below|cheaper than|up to|at most|no more than|within|max(?:imum)?)\s*"
    r"(?:about\s*)?(?:US\s*)?(?:\$\s*)?(\d+(?:\.\d{1,2})?)\s*(?:USD|dollars?)?",
    re.I,
)


def category_from_intent(intent: str) -> str | None:
    matches = [key for key, pattern in CATEGORY_PATTERNS.items() if pattern.search(intent)]
    # Ambiguous multi-category requests require clarification, never an arbitrary pick.
    return matches[0] if len(matches) == 1 else None


def budget_from_intent(intent: str) -> tuple[float | None, bool]:
    match = BUDGET.search(intent)
    if not match:
        return None, False
    ceiling = float(match.group(2))
    strict = match.group(1).lower() in ("less than", "under", "below", "cheaper than")
    return ceiling, strict


def search_demo_products(intent: str, products: dict) -> list[dict]:
    category = category_from_intent(intent)
    if category is None:
        return []
    ceiling, strict = budget_from_intent(intent)
    candidates = [p for p in products.values() if p.get("category") == category]
    if ceiling is not None:
        candidates = [p for p in candidates if (p["price"] < ceiling if strict else p["price"] <= ceiling)]
    if re.search(r"\bwireless\b", intent, re.I):
        candidates = [p for p in candidates if "wireless" in p.get("features", [])]
    return sorted(candidates, key=lambda p: (-p["rating"], p["price"]))


def matches_request(intent: str, product: dict) -> bool:
    return product.get("product_id") in {p["product_id"] for p in search_demo_products(intent, {product["product_id"]: product})}

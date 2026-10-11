"""Deterministic parsing of a shopping request: category, requirements, budget, currency.

This runs on the server and never depends on model output, so the constraints it
extracts can be enforced independently of whatever an LLM later proposes.
"""
from __future__ import annotations
import re
from typing import Any

# Order matters: compound phrases are matched (and consumed) before single words,
# so "laptop backpack" is a backpack request, not a laptop request.
CATEGORY_PATTERNS: list[tuple[str, re.Pattern]] = [
    # Accessories for a category are not the category ("shoe laces", "laptop sleeve", "headphone case").
    ("accessories", re.compile(r"\b(head ?phones?|earbuds?|shoes?|sneakers?|boots?|laptops?|computers?|backpacks?)\s+"
                               r"(cases?|covers?|cleaners?|laces?|insoles?|stands?|holders?|chargers?|cables?|pads?|tips|racks?|"
                               r"sleeves?|skins?|protectors?|adapters?|replacements?|bags?|organizers?|accessor(?:y|ies))\b", re.I)),
    ("backpacks", re.compile(r"\b(laptop|hiking|school|travel|camera)\s+(backpacks?|bags?|rucksacks?|daypacks?)\b", re.I)),
    ("shoes", re.compile(r"\b(running|walking|tennis|hiking|basketball|trail)\s+(shoes?|boots?|sneakers?|trainers?)\b", re.I)),
    ("headphones", re.compile(r"\b(head ?phones?|earbuds?|ear ?phones?|headsets?|airpods)\b", re.I)),
    ("shoes", re.compile(r"\b(shoes?|sneakers?|trainers|boots?|sandals?|loafers?|footwear|heels|slippers?)\b", re.I)),
    ("laptops", re.compile(r"\b(laptops?|notebook computers?|chromebooks?|macbooks?|ultrabooks?)\b", re.I)),
    ("backpacks", re.compile(r"\b(backpacks?|rucksacks?|daypacks?|knapsacks?)\b", re.I)),
    ("monitors", re.compile(r"\b(monitors?|displays?)\b", re.I)),
    ("keyboards", re.compile(r"\b(keyboards?)\b", re.I)),
    ("smartwatches", re.compile(r"\b(smart ?watch(es)?|fitness trackers?)\b", re.I)),
    ("jackets", re.compile(r"\b(jackets?|coats?|parkas?)\b", re.I)),
]

# Search query term used for each category with a live provider.
CATEGORY_QUERY = {
    "headphones": "headphones", "shoes": "shoes", "laptops": "laptop", "backpacks": "backpack",
    "monitors": "monitor", "keyboards": "keyboard", "smartwatches": "smartwatch", "jackets": "jacket",
}

REQUIREMENT_TERMS = [
    "wireless", "bluetooth", "noise-cancelling", "noise cancelling", "over-ear", "in-ear", "wired",
    "running", "walking", "hiking", "trail", "waterproof", "water-resistant", "leather", "canvas", "casual",
    "lightweight", "slip-on", "kids", "men's", "women's", "mens", "womens",
    "chromebook", "refurbished", "gaming", "touchscreen", "13-inch", "14-inch", "15-inch", "16-inch",
    "laptop sleeve", "travel", "school", "hydration", "compact",
]

CURRENCY_SYMBOLS = [("C$", "CAD"), ("CA$", "CAD"), ("A$", "AUD"), ("AU$", "AUD"), ("US$", "USD"),
                    ("$", "USD"), ("€", "EUR"), ("£", "GBP"), ("¥", "JPY"), ("₹", "INR")]
CURRENCY_WORDS = {
    "usd": "USD", "dollars": "USD", "dollar": "USD", "bucks": "USD", "eur": "EUR", "euro": "EUR", "euros": "EUR",
    "gbp": "GBP", "pounds": "GBP", "pound": "GBP", "cad": "CAD", "aud": "AUD", "jpy": "JPY", "yen": "JPY", "inr": "INR",
}

_SYM = r"(?:C\$|CA\$|A\$|AU\$|US\$|\$|€|£|¥|₹)"
_NUM = r"(\d{1,3}(?:,\d{3})+|\d+)(?:\.(\d{1,2}))?"
_WORD = r"(?:usd|dollars?|bucks|eur|euros?|gbp|pounds?|cad|aud|jpy|yen|inr)"
_AMOUNT = rf"(?P<sym>{_SYM})?\s?(?P<num>{_NUM})\s?(?P<word>{_WORD})?\b"
_MAX_CUE = r"(?:under|below|less than|cheaper than|no more than|not more than|max(?:imum)?|at most|up to|within|budget(?: of| is)?|<=?|for under|for less than)"
MAX_PATTERNS = [
    re.compile(rf"{_MAX_CUE}\s*:?\s*{_AMOUNT}", re.I),
    re.compile(rf"{_AMOUNT}\s*(?:or less|or under|or cheaper|max(?:imum)?|tops|budget)", re.I),
]
RANGE_PATTERN = re.compile(rf"between\s*{_AMOUNT.replace('?P<sym>', '?P<sym1>').replace('?P<num>', '?P<num1>').replace('?P<word>', '?P<word1>')}\s*(?:and|-|to)\s*{_AMOUNT}", re.I)


def _amount(match: re.Match, suffix: str = "") -> tuple[float, str | None]:
    raw = match.group(f"num{suffix}").replace(",", "")
    value = float(raw)
    sym = match.group(f"sym{suffix}")
    word = match.group(f"word{suffix}")
    currency = None
    if sym:
        currency = dict(CURRENCY_SYMBOLS)[sym.upper() if sym[0].isalpha() else sym]
    elif word:
        currency = CURRENCY_WORDS[word.lower()]
    return value, currency


def parse_budget(text: str) -> dict[str, Any]:
    """Return {max_price, min_price, currency, currency_explicit}; values are None when absent."""
    result: dict[str, Any] = {"max_price": None, "min_price": None, "currency": None}
    ranged = RANGE_PATTERN.search(text)
    if ranged:
        low, c1 = _amount(ranged, "1")
        high, c2 = _amount(ranged)
        result.update(min_price=min(low, high), max_price=max(low, high), currency=c2 or c1)
    else:
        for pattern in MAX_PATTERNS:
            m = pattern.search(text)
            if m:
                result["max_price"], result["currency"] = _amount(m)
                break
    if result["currency"] is None:
        word = re.search(rf"\b{_WORD}\b", text, re.I)
        if word:
            result["currency"] = CURRENCY_WORDS[word.group(0).lower()]
    result["currency_explicit"] = result["currency"] is not None
    if result["currency"] is None:
        result["currency"] = "USD"  # default marketplace currency
    return result


def parse_categories(text: str) -> list[str]:
    remaining = text
    found: list[str] = []
    for category, pattern in CATEGORY_PATTERNS:
        if pattern.search(remaining):
            if category not in found:
                found.append(category)
            remaining = pattern.sub(" ", remaining)
    return found


def parse_requirements(text: str) -> list[str]:
    lowered = text.lower()
    reqs = []
    for term in REQUIREMENT_TERMS:
        if re.search(rf"(?<![\w-]){re.escape(term)}(?![\w-])", lowered):
            reqs.append(term)
    size = re.search(r"\bsize\s*(\d{1,2}(?:\.5)?)\b", lowered)
    if size:
        reqs.append(f"size {size.group(1)}")
    return reqs


def parse_intent(text: str) -> dict[str, Any]:
    """Structured, model-independent reading of a shopping request."""
    text = text or ""
    budget = parse_budget(text)
    categories = parse_categories(text)
    requirements = parse_requirements(text)
    return {
        "raw": text,
        "categories": categories,
        "category": categories[0] if categories else None,
        "requirements": requirements,
        "max_price": budget["max_price"],
        "min_price": budget["min_price"],
        "currency": budget["currency"],
        "currency_explicit": budget["currency_explicit"],
        "parser": "deterministic_rules_v1",
    }


def listing_category(title: str, provider_category: str | None = None) -> tuple[str | None, str]:
    """Assign one of our categories to a listing. Returns (category, how it was determined)."""
    title_found = parse_categories(title or "")
    if "accessories" in title_found:
        return "accessories", "title_inferred"
    if provider_category:
        found = parse_categories(provider_category)
        if found:
            return found[0], "provider_category"
    if title_found:
        return title_found[0], "title_inferred"
    return None, "unknown"


def query_for(parsed: dict[str, Any]) -> str:
    terms = [CATEGORY_QUERY.get(c, c) for c in parsed["categories"][:1]]
    terms = list(parsed["requirements"][:3]) + terms
    return " ".join(terms).strip()

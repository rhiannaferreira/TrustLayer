"""eBay Browse product discovery. Provider data is untrusted until validated and snapshotted.

Never claims listing data is product reviews, total checkout cost, or a purchase.
All credentials remain server-side. No fallback to mock when eBay is selected.
"""
from __future__ import annotations

import base64
import math
import os
import re
import time
from datetime import datetime, timezone
from typing import Any
from urllib.parse import urlsplit
from uuid import uuid4

import httpx
from fastapi import HTTPException

from .discovery import budget_from_intent, category_from_intent

OAUTH_URL = "https://api.ebay.com/identity/v1/oauth2/token"
SEARCH_URL = "https://api.ebay.com/buy/browse/v1/item_summary/search"
SCOPE = "https://api.ebay.com/oauth/api_scope"
_TOKEN: tuple[str, float] | None = None

BUDGET_SOFT = re.compile(r"\b(?:around|about|roughly|approximately|near|budget of)\s*\$?\s*(\d+(?:\.\d{1,2})?)\b", re.I)
CURRENCY = "USD"
LEAD = re.compile(r"^\s*(?:please\s+)?(?:can you\s+)?(?:find|show|get|recommend|search|look for|buy|purchase|i need|i want|i'm looking for)\s+(?:me\s+)?(?:some\s+|a\s+|an\s+|the\s+)?", re.I)
TAIL = re.compile(r"\s+(?:that\s+is\s+|which\s+is\s+)?(?:for\s+)?(?:under|less than|below|up to|around|about|roughly|approximately|near|within|budget of)\s*\$?\s*\d+(?:\.\d{1,2})?.*$", re.I)
STOPWORD = {"a", "an", "the", "me", "for", "with", "that", "is", "i", "need", "want", "find", "something", "good", "best", "worth", "price", "approximately", "around", "under", "below", "about", "usd", "dollars", "from", "please", "some"}
ACCESSORY_TERMS = {
    "desk": ("desk mat", "desk pad", "desk organizer", "desk lamp", "desk clock", "desk accessory", "desk accessories", "desk calendar", "desk chair", "desk riser", "desktop computer", "desk shelf", "desk shelf"),
    "chair": ("chair mat", "chair cover", "chair cushion", "chair leg", "chair wheels", "chair caster"),
}


def price_ceiling(intent: str) -> tuple[float | None, bool]:
    maximum, strict = budget_from_intent(intent)
    if maximum is not None:
        return maximum, strict
    soft = BUDGET_SOFT.search(intent)
    return (float(soft.group(1)), False) if soft else (None, False)


def parse_search(intent: str) -> dict[str, Any]:
    category = category_from_intent(intent)
    cleaned = TAIL.sub("", LEAD.sub("", intent.strip())).strip(" .!?;,")
    cleaned = re.sub(r"\b(?:that is|which is|costing|priced at|at a price of)\b.*$", "", cleaned, flags=re.I).strip()
    cleaned = re.sub(r"\$\s*\d+(?:\.\d{1,2})?", "", cleaned).strip()
    cleaned = " ".join(cleaned.split())
    if len(cleaned) > 100:
        cleaned = cleaned[:100].rsplit(" ", 1)[0]
    if not cleaned or not re.search("[a-zA-Z]", cleaned):
        raise HTTPException(422, detail="Please provide a product to search for.")
    cap, strict = price_ceiling(intent)
    return {
        "raw": intent, "categories": [category] if category else [cleaned],
        "category": category or cleaned, "requirements": [],
        "max_price": cap, "min_price": None, "currency": CURRENCY,
        "currency_explicit": "$" in intent or bool(re.search(r"\bUSD\b", intent, re.I)),
        "parser": "deterministic_terms_v2", "strict_price": strict,
        "search_terms": cleaned,
    }


def query_tokens(terms: str) -> list[str]:
    return [t for t in re.findall(r"[a-z0-9]+", terms.lower()) if t not in STOPWORD and len(t) > 1]


def title_matches(title: str, query: dict) -> bool:
    tokens = query_tokens(query["search_terms"])
    if not tokens:
        return False
    target = title.lower()
    core = tokens[-1] if tokens else ""
    # For simple product names, avoid offering accessories instead of the item itself.
    if len(tokens) == 1 and tokens[0] in ACCESSORY_TERMS:
        if any(term in target for term in ACCESSORY_TERMS[tokens[0]]):
            return False
    return all(re.search(r"\b" + re.escape(w) + r"s?\b", target) for w in tokens)


def _https(url: Any) -> str | None:
    return url if isinstance(url, str) and url.startswith("https://") and len(url) <= 2000 else None


def _normalized(raw: dict, query: dict, search_id: str) -> dict | None:
    if not isinstance(raw, dict):
        return None
    try:
        value = float(raw.get("price", {}).get("value"))
        currency = raw.get("price", {}).get("currency")
    except (ValueError, TypeError, AttributeError):
        return None
    if not math.isfinite(value) or value <= 0 or currency != CURRENCY:
        return None
    raw_id, title = raw.get("itemId"), raw.get("title")
    if not isinstance(raw_id, str) or not raw_id or not isinstance(title, str) or not title:
        return None
    cap = query["max_price"]
    if cap is not None and (value >= cap if query["strict_price"] else value > cap):
        return None
    if not title_matches(title, query):
        return None
    url = _https(raw.get("itemWebUrl"))
    if not url or urlsplit(url).hostname not in {"www.ebay.com", "ebay.com"}:
        # Don't give links to spoofed third-party hosts.
        return None
    options = raw.get("buyingOptions")
    if isinstance(options, list) and "FIXED_PRICE" not in options:
        # Bidding prices are not a reliable fixed purchase amount.
        return None
    image = raw.get("image")
    image_url = _https(image.get("imageUrl")) if isinstance(image, dict) else None
    seller = raw.get("seller")
    seller_name = seller.get("username") if isinstance(seller, dict) else None
    provider_id = "ebay:" + raw_id
    return {
        "product_id": provider_id, "provider": "ebay", "provider_product_id": raw_id,
        "title": title[:300], "name": title[:300], "category": query["category"],
        "category_source": "user_search_terms_not_verified", "provider_category": None,
        "price": round(value, 2), "currency": CURRENCY,
        "seller": seller_name, "vendor": "eBay",
        "product_url": url, "image_url": image_url,
        "availability": "listed", "condition": raw.get("condition") if isinstance(raw.get("condition"), str) else None,
        "rating": None, "features": [], "source": "ebay_browse_api", "provenance": "live_retailer_listing",
        "provider_fields": ["title", "price", "currency", "seller", "product_url", "condition", "image_url"],
        "unverified_fields": ["category", "availability", "shipping", "taxes", "rating", "quality", "reliability"],
        "requirements_matched": [], "requirements_unconfirmed": [],
        "notes": ["Live eBay listing; total cost, quality, seller trust, and reviews not independently verified.",
                  "Live price is a listing snapshot, not a checkout quote."],
        "retrieved_at": datetime.now(timezone.utc).isoformat(), "search_id": search_id,
    }


async def _token() -> str:
    global _TOKEN
    if _TOKEN and time.monotonic() < _TOKEN[1]:
        return _TOKEN[0]
    client_id = os.getenv("EBAY_CLIENT_ID", "").strip()
    client_secret = os.getenv("EBAY_CLIENT_SECRET", "").strip()
    if not client_id or not client_secret:
        raise HTTPException(503, detail={"code": "PRODUCT_SEARCH_UNAVAILABLE", "message": "eBay credentials are not configured on the backend.", "provider": "ebay"})
    basic = base64.b64encode((client_id + ":" + client_secret).encode()).decode("ascii")
    try:
        async with httpx.AsyncClient(timeout=15) as client:
            response = await client.post(OAUTH_URL, headers={"Authorization": "Basic " + basic,
                "Content-Type": "application/x-www-form-urlencoded"},
                data={"grant_type": "client_credentials", "scope": SCOPE})
            response.raise_for_status()
            payload = response.json()
            token = payload["access_token"]
            expires = int(payload.get("expires_in", 7200))
            if not isinstance(token, str) or not token:
                raise ValueError("Missing access token")
            _TOKEN = (token, time.monotonic() + max(30, expires - 120))
            return token
    except (httpx.HTTPError, KeyError, TypeError, ValueError) as exc:
        raise HTTPException(503, detail={"code": "PRODUCT_SEARCH_UNAVAILABLE", "message": "eBay authentication failed. Verify production API permissions and credentials.", "provider": "ebay"}) from exc


async def search_ebay(intent: str) -> tuple[dict, list[dict], int]:
    query = parse_search(intent)
    token = await _token()
    filters = []
    if query["max_price"] is not None:
        filters.extend([f"price:[..{query['max_price']:g}]", "priceCurrency:USD"])
    params: dict[str, Any] = {"q": query["search_terms"], "limit": "50"}
    if filters:
        params["filter"] = ",".join(filters)
    try:
        async with httpx.AsyncClient(timeout=20) as client:
            response = await client.get(SEARCH_URL, params=params, headers={
                "Authorization": "Bearer " + token,
                "X-EBAY-C-MARKETPLACE-ID": "EBAY_US", "Accept": "application/json"})
            response.raise_for_status()
            data = response.json()
        entries = data.get("itemSummaries", [])
        if not isinstance(entries, list):
            raise ValueError("itemSummaries was not a list")
    except (httpx.HTTPError, ValueError, TypeError, AttributeError) as exc:
        raise HTTPException(503, detail={"code": "PRODUCT_SEARCH_UNAVAILABLE", "message": "The eBay product search could not be completed.", "provider": "ebay"}) from exc
    search_id = "search-" + uuid4().hex[:12]
    normalized = [_normalized(p, query, search_id) for p in entries]
    products = list({p["product_id"]: p for p in normalized if p}.values())
    return query, products, len(entries)

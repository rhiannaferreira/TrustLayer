"""Serper.dev Google Shopping search adapter for TrustLayer.

Results are search snippets, NOT verified merchant inventory, reviews, final checkout
quotes or purchases. All requests/keys stay in the backend; never fall back to
fictional products when the live provider is enabled.
"""
from __future__ import annotations

import hashlib
import math
import os
import re
from datetime import datetime, timezone
from ipaddress import ip_address
from urllib.parse import urlsplit
from uuid import uuid4

import httpx
from fastapi import HTTPException

from .retail import parse_search, title_matches

SHOPPING_URL = "https://google.serper.dev/shopping"
PRICE = re.compile(r"(?:US\s*)?\$\s*((?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d{1,2})?)(?!\d)")


def _valid_https(value: object) -> str | None:
    if not isinstance(value, str) or len(value) > 2048 or any(ord(c) < 32 for c in value):
        return None
    try:
        u = urlsplit(value)
        host = u.hostname
        if u.scheme != "https" or not host or u.username or u.password or u.port not in (None, 443):
            return None
        if host == "localhost" or host.endswith(".localhost") or host.endswith(".local"):
            return None
        try:
            ip_address(host)
            return None  # Provider output must link to a named public shop, not IP addresses.
        except ValueError:
            pass
        return value
    except (ValueError, TypeError):
        return None


def _price(raw: object) -> float | None:
    if isinstance(raw, bool):
        return None
    if type(raw) in (int, float):
        amount = float(raw)
    elif isinstance(raw, str):
        # Do not silently treat ranges, alternate currencies or "from" prices as a quote.
        if re.search(r"\b(from|starting at|as low as)\b|\d\s*[-–]\s*\$", raw, re.I):
            return None
        # Google Shopping is requested in US locale; accept only explicit USD amounts.
        m = PRICE.search(raw)
        if not m or "€" in raw or "£" in raw or "R$" in raw or re.search(r"\b(?:EUR|GBP|CAD|AUD)\b", raw, re.I):
            return None
        amount = float(m.group(1).replace(",", ""))
    else:
        return None
    return round(amount, 2) if math.isfinite(amount) and 0 < amount < 1_000_000 else None


def normalize_result(raw: object, query: dict, search_id: str) -> dict | None:
    if not isinstance(raw, dict):
        return None
    title, seller = raw.get("title"), raw.get("source")
    price = _price(raw.get("price"))
    url = _valid_https(raw.get("link"))
    if not isinstance(title, str) or not title.strip() or not url or price is None:
        return None
    if not isinstance(seller, str) or not seller.strip():
        return None  # Do not invent an approved merchant.
    title, seller = title.strip()[:300], seller.strip()[:150]
    if not title_matches(title, query):
        return None
    cap = query["max_price"]
    if cap is not None and (price >= cap if query["strict_price"] else price > cap):
        return None
    # Stable fingerprint of source listing data, not of model-generated text.
    product_id = "serper:" + hashlib.sha256((seller + "\n" + title + "\n" + url).encode()).hexdigest()[:24]
    image = _valid_https(raw.get("imageUrl")) or _valid_https(raw.get("thumbnail"))
    rating = raw.get("rating")
    try:
        rating = float(rating)
        if not math.isfinite(rating) or not (0 <= rating <= 5):
            rating = None
    except (TypeError, ValueError):
        rating = None
    return {
        "product_id": product_id, "provider": "serper", "provider_product_id": product_id.removeprefix("serper:"),
        "title": title, "name": title, "category": query["category"],
        "category_source": "user_search_terms_not_verified", "provider_category": None,
        "price": price, "currency": "USD", "seller": seller, "vendor": seller,
        "product_url": url, "image_url": image,
        "availability": "unknown", "condition": None, "rating": rating, "features": [],
        "source": "serper_google_shopping", "provenance": "live_retailer_listing",
        "provider_fields": ["title", "price", "seller", "product_url"] + (["rating"] if rating is not None else []),
        "unverified_fields": ["category", "availability", "shipping", "taxes", "condition", "quality", "reliability", "rating", "seller_authenticity"],
        "notes": ["Google Shopping search result obtained via Serper. Not a merchant checkout quote.",
                  "Merchant, inventory, shipping, taxes and customer reviews are not independently verified."],
        "retrieved_at": datetime.now(timezone.utc).isoformat(), "search_id": search_id,
        "requirements_matched": [], "requirements_unconfirmed": [],
    }


async def search_serper(intent: str) -> tuple[dict, list[dict], int]:
    query = parse_search(intent)
    api_key = os.getenv("SERPER_API_KEY", "").strip()
    if not api_key:
        raise HTTPException(503, detail={"code": "PRODUCT_SEARCH_UNAVAILABLE", "message": "Serper API key is not configured on the backend.", "provider": "serper"})
    try:
        async with httpx.AsyncClient(timeout=20) as client:
            response = await client.post(
                SHOPPING_URL,
                headers={"X-API-KEY": api_key, "Content-Type": "application/json"},
                json={"q": query["search_terms"], "gl": "us", "hl": "en", "num": 20},
            )
            response.raise_for_status()
            payload = response.json()
        results = payload.get("shopping", [])
        if not isinstance(results, list):
            raise ValueError("Shopping results were not an array")
    except (httpx.HTTPError, ValueError, TypeError, AttributeError) as ex:
        # Never echo API key, merchant snippets or provider response bodies to the browser.
        raise HTTPException(503, detail={"code": "PRODUCT_SEARCH_UNAVAILABLE", "message": "Serper Shopping search failed. Check the key, account credits, and service status.", "provider": "serper"}) from ex
    search_id = "search-" + uuid4().hex[:12]
    normalized = [normalize_result(p, query, search_id) for p in results]
    unique = {p["product_id"]: p for p in normalized if p}
    return query, list(unique.values()), len(results)

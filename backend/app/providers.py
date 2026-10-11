"""Product search providers.

Two sources, never mixed silently:

- ``EbayBrowseProvider``: the authorized eBay Buy Browse API (``item_summary/search``),
  using an OAuth client-credentials application token. Credentials are read from the
  backend environment only (``EBAY_CLIENT_ID`` / ``EBAY_CLIENT_SECRET``) and are never
  returned in responses or errors.
- ``DemoCatalogProvider``: the fictional server-owned demo catalog, labeled as such on
  every record.

No HTML scraping is performed anywhere.
"""
from __future__ import annotations
import base64
import os
import time
from typing import Any, Protocol

import httpx

from .catalog import DEMO_PROVENANCE, DEMO_SOURCE, PRODUCTS
from .db import utc_now
from .intent import listing_category

PROVIDER_PROVENANCE = "provider_api"


class ProviderUnavailable(Exception):
    """The live provider could not be reached or rejected the request. Message is safe to show."""


class ProductSearchProvider(Protocol):
    name: str
    live: bool

    async def search(self, query: str, parsed: dict[str, Any], limit: int) -> list[dict[str, Any]]: ...


def _env_flag(name: str, default: bool = False) -> bool:
    value = os.getenv(name)
    if value is None or value.strip() == "":
        return default
    return value.strip().lower() in ("1", "true", "yes", "on")


def search_config() -> dict[str, Any]:
    """Which provider is configured. Reports missing variable *names* only, never values."""
    provider = (os.getenv("PRODUCT_SEARCH_PROVIDER") or "demo").strip().lower()
    config: dict[str, Any] = {
        "provider": provider,
        "demo_fallback": _env_flag("PRODUCT_SEARCH_DEMO_FALLBACK"),
        "configured": True,
        "missing": [],
        "live": provider != "demo",
    }
    if provider == "ebay":
        config["missing"] = [k for k in ("EBAY_CLIENT_ID", "EBAY_CLIENT_SECRET") if not os.getenv(k)]
        config["configured"] = not config["missing"]
        config["marketplace"] = os.getenv("EBAY_MARKETPLACE_ID", "EBAY_US")
        config["environment"] = os.getenv("EBAY_ENVIRONMENT", "production")
    elif provider != "demo":
        config["configured"] = False
        config["missing"] = [f"unsupported PRODUCT_SEARCH_PROVIDER '{provider}' (supported: ebay, demo)"]
    return config


# ---------------------------------------------------------------------------
# Demo catalog
# ---------------------------------------------------------------------------

def demo_record(product: dict[str, Any], retrieved_at: str | None = None) -> dict[str, Any]:
    return {
        "product_id": product["product_id"],
        "provider": "demo",
        "provider_product_id": product["product_id"],
        "title": product["name"],
        "name": product["name"],
        "category": product["category"],
        "category_source": "demo_fixture",
        "provider_category": None,
        "price": product["price"],
        "currency": product["currency"],
        "seller": product["vendor"],
        "vendor": product["vendor"],
        "product_url": None,
        "image_url": None,
        "availability": product["availability"],
        "condition": "new",
        "rating": product["rating"],
        "features": product["features"],
        "source": DEMO_SOURCE,
        "provenance": DEMO_PROVENANCE,
        "provider_fields": [],
        "unverified_fields": ["title", "price", "currency", "seller", "availability", "rating", "category"],
        "notes": ["Fictional demo catalog record. Not a real listing; there is nothing to buy."],
        "retrieved_at": retrieved_at or utc_now(),
    }


class DemoCatalogProvider:
    name = "demo"
    live = False

    async def search(self, query: str, parsed: dict[str, Any], limit: int) -> list[dict[str, Any]]:
        now = utc_now()
        return [demo_record(p, now) for p in PRODUCTS.values()]


# ---------------------------------------------------------------------------
# eBay Browse API
# ---------------------------------------------------------------------------

_TOKEN_CACHE: dict[str, Any] = {"token": None, "expires_at": 0.0, "key": None}


class EbayBrowseProvider:
    """eBay Buy Browse API adapter (https://developer.ebay.com/api-docs/buy/browse/overview.html)."""

    name = "ebay"
    live = True
    scope = "https://api.ebay.com/oauth/api_scope"

    def __init__(self) -> None:
        sandbox = os.getenv("EBAY_ENVIRONMENT", "production").strip().lower() == "sandbox"
        self.api_base = "https://api.sandbox.ebay.com" if sandbox else "https://api.ebay.com"
        self.marketplace = os.getenv("EBAY_MARKETPLACE_ID", "EBAY_US")
        self.client_id = os.getenv("EBAY_CLIENT_ID", "")
        self.client_secret = os.getenv("EBAY_CLIENT_SECRET", "")
        self.timeout = float(os.getenv("PRODUCT_SEARCH_TIMEOUT_SECONDS", "12"))

    async def _token(self, client: httpx.AsyncClient) -> str:
        key = (self.api_base, self.client_id)
        if _TOKEN_CACHE["token"] and _TOKEN_CACHE["key"] == key and _TOKEN_CACHE["expires_at"] > time.time() + 60:
            return _TOKEN_CACHE["token"]
        basic = base64.b64encode(f"{self.client_id}:{self.client_secret}".encode()).decode()
        response = await client.post(
            f"{self.api_base}/identity/v1/oauth2/token",
            headers={"Authorization": f"Basic {basic}", "Content-Type": "application/x-www-form-urlencoded"},
            data={"grant_type": "client_credentials", "scope": self.scope},
        )
        if response.status_code != 200:
            raise ProviderUnavailable(f"eBay OAuth token request failed (HTTP {response.status_code})")
        body = response.json()
        token = body.get("access_token")
        if not isinstance(token, str) or not token:
            raise ProviderUnavailable("eBay OAuth response had no access token")
        _TOKEN_CACHE.update(token=token, key=key, expires_at=time.time() + float(body.get("expires_in", 3600)))
        return token

    def _filter(self, parsed: dict[str, Any]) -> str:
        parts = ["buyingOptions:{FIXED_PRICE}"]
        low, high = parsed.get("min_price"), parsed.get("max_price")
        if low is not None or high is not None:
            parts.append(f"price:[{'' if low is None else f'{low:g}'}..{'' if high is None else f'{high:g}'}]")
            parts.append(f"priceCurrency:{parsed['currency']}")
        return ",".join(parts)

    async def search(self, query: str, parsed: dict[str, Any], limit: int) -> list[dict[str, Any]]:
        if not (self.client_id and self.client_secret):
            raise ProviderUnavailable("eBay credentials are not configured on the backend")
        try:
            async with httpx.AsyncClient(timeout=self.timeout) as client:
                token = await self._token(client)
                response = await client.get(
                    f"{self.api_base}/buy/browse/v1/item_summary/search",
                    params={"q": query, "limit": str(max(1, min(limit, 50))), "filter": self._filter(parsed)},
                    headers={"Authorization": f"Bearer {token}", "X-EBAY-C-MARKETPLACE-ID": self.marketplace},
                )
                if response.status_code == 401:
                    _TOKEN_CACHE.update(token=None, expires_at=0.0)
                if response.status_code != 200:
                    raise ProviderUnavailable(f"eBay search failed (HTTP {response.status_code})")
                body = response.json()
        except ProviderUnavailable:
            raise
        except (httpx.HTTPError, ValueError) as exc:
            raise ProviderUnavailable(f"eBay search unavailable ({type(exc).__name__})") from exc
        items = body.get("itemSummaries") if isinstance(body, dict) else None
        if items is None:
            return []
        if not isinstance(items, list):
            raise ProviderUnavailable("eBay search returned an unexpected response shape")
        now = utc_now()
        return [record for item in items if (record := self.normalize(item, now)) is not None]

    def normalize(self, item: Any, retrieved_at: str) -> dict[str, Any] | None:
        """Map one itemSummary. Items without an ID, title or numeric price are dropped, never patched."""
        if not isinstance(item, dict):
            return None
        item_id, title = item.get("itemId"), item.get("title")
        price = item.get("price") if isinstance(item.get("price"), dict) else {}
        try:
            value = round(float(price.get("value")), 2)
        except (TypeError, ValueError):
            return None
        currency = price.get("currency")
        if not isinstance(item_id, str) or not isinstance(title, str) or not isinstance(currency, str) or value <= 0:
            return None
        seller = item.get("seller") if isinstance(item.get("seller"), dict) else {}
        seller_name = seller.get("username") if isinstance(seller.get("username"), str) else None
        categories = item.get("categories") if isinstance(item.get("categories"), list) else []
        provider_category = " / ".join(c.get("categoryName") for c in categories
                                       if isinstance(c, dict) and isinstance(c.get("categoryName"), str)) or None
        category, category_source = listing_category(title, provider_category)
        provider_fields = ["provider_product_id", "title", "price", "currency"]
        unverified = []
        if seller_name:
            provider_fields.append("seller")
        else:
            unverified.append("seller")
        url = item.get("itemWebUrl") if isinstance(item.get("itemWebUrl"), str) else None
        if url:
            provider_fields.append("product_url")
        if provider_category:
            provider_fields.append("provider_category")
        if category_source != "provider_category":
            unverified.append("category")
        # Search summaries do not report stock levels; availability needs getItem or checkout.
        unverified.append("availability")
        image = item.get("image") if isinstance(item.get("image"), dict) else {}
        return {
            "product_id": f"ebay:{item_id}",
            "provider": "ebay",
            "provider_product_id": item_id,
            "title": title[:300],
            "name": title[:300],
            "category": category,
            "category_source": category_source,
            "provider_category": provider_category,
            "price": value,
            "currency": currency.upper(),
            "seller": seller_name,
            "vendor": seller_name,
            "product_url": url,
            "image_url": image.get("imageUrl") if isinstance(image.get("imageUrl"), str) else None,
            "availability": "not_provided",
            "condition": item.get("condition") if isinstance(item.get("condition"), str) else None,
            "rating": None,
            "seller_feedback_percentage": seller.get("feedbackPercentage"),
            "features": [],
            "source": "ebay_browse_api",
            "provenance": PROVIDER_PROVENANCE,
            "provider_fields": provider_fields,
            "unverified_fields": unverified,
            "notes": ["Listing price excludes shipping and tax; it is not a checkout total."],
            "retrieved_at": retrieved_at,
        }


def live_provider(name: str) -> ProductSearchProvider:
    if name == "ebay":
        return EbayBrowseProvider()
    raise ProviderUnavailable(f"Unsupported product search provider '{name}'")


def listing_evidence(record: dict[str, Any]) -> dict[str, str]:
    """Server-built evidence item describing a listing. Quality checks only accept exact matches."""
    if record["provenance"] == DEMO_PROVENANCE:
        return {"id": f"catalog-{record['product_id']}", "source": DEMO_SOURCE,
                "content": f"{record['title']}; rating {record['rating']}; listed price ${record['price']}"}
    return {
        "id": f"listing-{record['product_id']}"[:120],
        "source": "provider_listing",
        "content": (f"Provider listing ({record['provider']}, item {record['provider_product_id']}): {record['title']}; "
                    f"price {record['price']:.2f} {record['currency']}; seller {record['seller'] or 'not provided'}; "
                    f"retrieved {record['retrieved_at']}. Listing price excludes shipping and tax."),
    }

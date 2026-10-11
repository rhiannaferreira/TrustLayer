"""Fictional, server-owned evidence fixtures for the TrustLayer hackathon demo.

These records are NOT real customer reviews or live merchant checkout quotes.
They exist to demonstrate provenance checks without accessing retailer APIs.
"""
from __future__ import annotations

from .catalog import PRODUCTS

# These records are controlled by this service; callers cannot create new trusted
# sources just by changing an Evidence.source field in an API request.
FIXTURES: dict[str, dict] = {}
for pid, product in PRODUCTS.items():
    FIXTURES[f"independent-{pid}"] = {
        "id": f"independent-{pid}",
        "source": "independent_review_demo",
        "product_ids": [pid],
        "content": f"FICTIONAL TEST REVIEW: Independent sample test of {product['name']} reports acceptable comfort and battery life; no durability guarantee.",
        "kind": "independent_review",
    }
    FIXTURES[f"quote-{pid}"] = {
        "id": f"quote-{pid}",
        "source": "checkout_quote_demo",
        "product_ids": [pid],
        "content": f"FICTIONAL TEST QUOTE: {product['name']} at catalog item price ${product['price']:.2f}; checkout total requires separate real-world verification.",
        "kind": "cost_quote",
    }

FIXTURES["comparison-hp-002-hp-003"] = {
    "id": "comparison-hp-002-hp-003",
    "source": "comparison_demo",
    "product_ids": ["hp-002", "hp-003"],
    "content": "FICTIONAL TEST COMPARISON: Comparing Everyday Wireless Headphones with Travel Noise-Cancelling Headphones on price and rating only; no independent lab ranking is claimed.",
    "kind": "comparison",
}


def list_demo_fixtures(product_id: str | None = None) -> list[dict]:
    """Return explicitly labeled demo evidence for attack-lab testing."""
    return [{**item, "provenance": "server_owned_fictional_demo_fixture"}
            for item in FIXTURES.values()
            if product_id is None or product_id in item["product_ids"]]

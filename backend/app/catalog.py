"""Trusted local catalog. No real retailer connections, money, or orders."""
PRODUCTS = {
    "hp-001": {"product_id": "hp-001", "name": "Premium Studio Headphones", "price": 129.00, "vendor": "AudioMart", "rating": 4.6},
    "hp-002": {"product_id": "hp-002", "name": "Everyday Wireless Headphones", "price": 64.99, "vendor": "Approved Audio", "rating": 4.5},
    "hp-003": {"product_id": "hp-003", "name": "Travel Noise-Cancelling Headphones", "price": 74.95, "vendor": "AudioMart", "rating": 4.3},
}


def alternatives(max_amount: float, allowed_vendors: list[str], excluded: str | None = None) -> list[dict]:
    return [p for p in sorted(PRODUCTS.values(), key=lambda p: (-p["rating"], p["price"]))
            if p["product_id"] != excluded and p["price"] <= max_amount and p["vendor"] in allowed_vendors][:3]

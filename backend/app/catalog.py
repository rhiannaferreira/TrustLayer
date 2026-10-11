"""Fictional local product catalog for a hackathon demo. NOT live listings."""
PRODUCTS = {
    "hp-001": {"product_id": "hp-001", "name": "Premium Studio Headphones", "category": "headphones", "features": ["studio"], "price": 129.00, "vendor": "AudioMart", "rating": 4.6},
    "hp-002": {"product_id": "hp-002", "name": "Everyday Wireless Headphones", "category": "headphones", "features": ["wireless"], "price": 64.99, "vendor": "Approved Audio", "rating": 4.5},
    "hp-003": {"product_id": "hp-003", "name": "Travel Noise-Cancelling Headphones", "category": "headphones", "features": ["wireless", "noise-cancelling"], "price": 74.95, "vendor": "AudioMart", "rating": 4.3},
    "sh-001": {"product_id": "sh-001", "name": "Everyday Running Shoes", "category": "shoes", "features": ["running"], "price": 44.95, "vendor": "StrideCo Demo", "rating": 4.4},
    "sh-002": {"product_id": "sh-002", "name": "Casual Walking Sneakers", "category": "shoes", "features": ["walking"], "price": 39.99, "vendor": "Everyday Market Demo", "rating": 4.3},
    "sh-003": {"product_id": "sh-003", "name": "Trail Running Shoes", "category": "shoes", "features": ["trail", "running"], "price": 62.00, "vendor": "StrideCo Demo", "rating": 4.6},
    "bk-001": {"product_id": "bk-001", "name": "Campus Day Backpack", "category": "backpacks", "features": ["school"], "price": 34.99, "vendor": "Everyday Market Demo", "rating": 4.2},
    "lt-001": {"product_id": "lt-001", "name": "Budget Student Laptop", "category": "laptops", "features": ["student"], "price": 399.00, "vendor": "Everyday Market Demo", "rating": 4.0},
}


def alternatives(max_amount: float, allowed_vendors: list[str], excluded: str | None = None, *, category: str | None = None, user_budget: float | None = None, strict_budget: bool = False) -> list[dict]:
    """Never cross categories or return an over-budget alternative."""
    return [p for p in sorted(PRODUCTS.values(), key=lambda p: (-p["rating"], p["price"]))
            if p["product_id"] != excluded
            and (category is None or p["category"] == category)
            and p["price"] <= max_amount
            and (user_budget is None or (p["price"] < user_budget if strict_budget else p["price"] <= user_budget))
            and p["vendor"] in allowed_vendors][:3]

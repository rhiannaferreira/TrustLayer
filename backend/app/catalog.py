"""Fictional demo catalog. No real retailer connections, money, or orders.

These records are server-owned fixtures for offline demos. They are labeled
``fictional_demo_catalog`` everywhere they surface and have no product URLs,
because none of them is a real listing.
"""

DEMO_SOURCE = "demo_catalog"
DEMO_PROVENANCE = "fictional_demo_catalog"


def _item(product_id, name, category, price, vendor, rating, availability="in_stock", features=()):
    return {
        "product_id": product_id,
        "name": name,
        "title": name,
        "category": category,
        "price": price,
        "currency": "USD",
        "vendor": vendor,
        "seller": vendor,
        "rating": rating,
        "availability": availability,
        "features": list(features),
        "product_url": None,
        "source": DEMO_SOURCE,
        "provenance": DEMO_PROVENANCE,
    }


PRODUCTS = {p["product_id"]: p for p in [
    # Headphones (original fixtures; prices and vendors unchanged)
    _item("hp-001", "Premium Studio Headphones", "headphones", 129.00, "AudioMart", 4.6, features=["wired", "studio"]),
    _item("hp-002", "Everyday Wireless Headphones", "headphones", 64.99, "Approved Audio", 4.5, features=["wireless", "bluetooth"]),
    _item("hp-003", "Travel Noise-Cancelling Headphones", "headphones", 74.95, "AudioMart", 4.3, features=["wireless", "noise-cancelling"]),
    # Shoes
    _item("sh-001", "Trailrunner Lite Running Shoes", "shoes", 44.99, "StrideMart", 4.4, features=["running", "lightweight"]),
    _item("sh-002", "CourtFlex Canvas Sneakers", "shoes", 34.50, "StrideMart", 4.1, features=["casual", "canvas"]),
    _item("sh-003", "Summit Waterproof Hiking Boots", "shoes", 89.00, "StrideMart", 4.7, features=["hiking", "waterproof"]),
    _item("sh-004", "Everyday Slip-On Shoes", "shoes", 29.99, "BargainBin Outlet", 3.9, features=["casual", "slip-on"]),
    _item("sh-005", "Featherweight Racing Flats", "shoes", 49.00, "StrideMart", 4.6, availability="out_of_stock", features=["running", "racing"]),
    # Laptops
    _item("lt-001", "Student 14-inch Chromebook", "laptops", 229.00, "CompuHub", 4.2, features=["chromebook", "14-inch"]),
    _item("lt-002", "Creator 15 Laptop", "laptops", 899.00, "CompuHub", 4.6, features=["15-inch", "creator"]),
    _item("lt-003", "Refurbished 13-inch Ultrabook", "laptops", 74.00, "CompuHub", 3.8, features=["refurbished", "13-inch"]),
    # Backpacks
    _item("bp-001", "Commuter 20L Laptop Backpack", "backpacks", 49.99, "PackWorks", 4.5, features=["laptop sleeve", "water-resistant"]),
    _item("bp-002", "Trail 30L Hiking Backpack", "backpacks", 72.00, "PackWorks", 4.4, features=["hiking", "hydration"]),
    _item("bp-003", "Mini City Daypack", "backpacks", 24.99, "PackWorks", 4.0, features=["compact"]),
]}


def alternatives(max_amount: float, allowed_vendors: list[str], excluded: str | None = None,
                 category: str | None = None) -> list[dict]:
    """Same-category demo alternatives within the spending limit from approved vendors."""
    return [p for p in sorted(PRODUCTS.values(), key=lambda p: (-p["rating"], p["price"]))
            if p["product_id"] != excluded and p["price"] <= max_amount
            and p["vendor"] in allowed_vendors and p["availability"] != "out_of_stock"
            and (category is None or p["category"] == category)][:3]

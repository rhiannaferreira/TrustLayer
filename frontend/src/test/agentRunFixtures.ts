/** Responses captured from the FastAPI backend's POST /api/v1/agent/run (demo catalog). */
export const SHOES_UNDER_50 = {
  "discovery": {
    "search_id": "search-4a8756df37aa",
    "query": {
      "raw": "Find shoes under $50",
      "categories": [
        "shoes"
      ],
      "category": "shoes",
      "requirements": [],
      "max_price": 50.0,
      "min_price": null,
      "currency": "USD",
      "currency_explicit": true,
      "parser": "deterministic_rules_v1"
    },
    "search_terms": "shoes",
    "provider": "demo",
    "catalog_mode": "demo",
    "provider_error": null,
    "returned_count": 14,
    "matched_count": 3,
    "excluded_counts": {
      "wrong_category": 9,
      "currency_mismatch": 0,
      "over_budget": 1,
      "under_minimum": 0,
      "unavailable": 1
    },
    "excluded": [
      {
        "product_id": "hp-001",
        "title": "Premium Studio Headphones",
        "category": "headphones",
        "price": 129.0,
        "currency": "USD",
        "reason": "wrong_category"
      },
      {
        "product_id": "hp-002",
        "title": "Everyday Wireless Headphones",
        "category": "headphones",
        "price": 64.99,
        "currency": "USD",
        "reason": "wrong_category"
      }
    ],
    "results": [
      {
        "product_id": "sh-001",
        "provider": "demo",
        "provider_product_id": "sh-001",
        "title": "Trailrunner Lite Running Shoes",
        "name": "Trailrunner Lite Running Shoes",
        "category": "shoes",
        "category_source": "demo_fixture",
        "provider_category": null,
        "price": 44.99,
        "currency": "USD",
        "seller": "StrideMart",
        "vendor": "StrideMart",
        "product_url": null,
        "image_url": null,
        "availability": "in_stock",
        "condition": "new",
        "rating": 4.4,
        "features": [
          "running",
          "lightweight"
        ],
        "source": "demo_catalog",
        "provenance": "fictional_demo_catalog",
        "provider_fields": [],
        "unverified_fields": [
          "title",
          "price",
          "currency",
          "seller",
          "availability",
          "rating",
          "category"
        ],
        "notes": [
          "Fictional demo catalog record. Not a real listing; there is nothing to buy."
        ],
        "retrieved_at": "2026-10-11T21:19:51.140806+00:00",
        "search_id": "search-4a8756df37aa",
        "requirements_matched": [],
        "requirements_unconfirmed": []
      },
      {
        "product_id": "sh-002",
        "provider": "demo",
        "provider_product_id": "sh-002",
        "title": "CourtFlex Canvas Sneakers",
        "name": "CourtFlex Canvas Sneakers",
        "category": "shoes",
        "category_source": "demo_fixture",
        "provider_category": null,
        "price": 34.5,
        "currency": "USD",
        "seller": "StrideMart",
        "vendor": "StrideMart",
        "product_url": null,
        "image_url": null,
        "availability": "in_stock",
        "condition": "new",
        "rating": 4.1,
        "features": [
          "casual",
          "canvas"
        ],
        "source": "demo_catalog",
        "provenance": "fictional_demo_catalog",
        "provider_fields": [],
        "unverified_fields": [
          "title",
          "price",
          "currency",
          "seller",
          "availability",
          "rating",
          "category"
        ],
        "notes": [
          "Fictional demo catalog record. Not a real listing; there is nothing to buy."
        ],
        "retrieved_at": "2026-10-11T21:19:51.140806+00:00",
        "search_id": "search-4a8756df37aa",
        "requirements_matched": [],
        "requirements_unconfirmed": []
      },
      {
        "product_id": "sh-004",
        "provider": "demo",
        "provider_product_id": "sh-004",
        "title": "Everyday Slip-On Shoes",
        "name": "Everyday Slip-On Shoes",
        "category": "shoes",
        "category_source": "demo_fixture",
        "provider_category": null,
        "price": 29.99,
        "currency": "USD",
        "seller": "BargainBin Outlet",
        "vendor": "BargainBin Outlet",
        "product_url": null,
        "image_url": null,
        "availability": "in_stock",
        "condition": "new",
        "rating": 3.9,
        "features": [
          "casual",
          "slip-on"
        ],
        "source": "demo_catalog",
        "provenance": "fictional_demo_catalog",
        "provider_fields": [],
        "unverified_fields": [
          "title",
          "price",
          "currency",
          "seller",
          "availability",
          "rating",
          "category"
        ],
        "notes": [
          "Fictional demo catalog record. Not a real listing; there is nothing to buy."
        ],
        "retrieved_at": "2026-10-11T21:19:51.140806+00:00",
        "search_id": "search-4a8756df37aa",
        "requirements_matched": [],
        "requirements_unconfirmed": []
      }
    ],
    "no_match": null,
    "status": "MATCHED"
  },
  "ranking": {
    "ranking_source": "deterministic_fallback",
    "summary": "Ranked by rules (approved seller, stated requirements, rating, then lower price); no AI model was used. Luminal is not configured on the backend."
  },
  "recommendation": {
    "product": {
      "product_id": "sh-001",
      "provider": "demo",
      "provider_product_id": "sh-001",
      "title": "Trailrunner Lite Running Shoes",
      "name": "Trailrunner Lite Running Shoes",
      "category": "shoes",
      "category_source": "demo_fixture",
      "provider_category": null,
      "price": 44.99,
      "currency": "USD",
      "seller": "StrideMart",
      "vendor": "StrideMart",
      "product_url": null,
      "image_url": null,
      "availability": "in_stock",
      "condition": "new",
      "rating": 4.4,
      "features": [
        "running",
        "lightweight"
      ],
      "source": "demo_catalog",
      "provenance": "fictional_demo_catalog",
      "provider_fields": [],
      "unverified_fields": [
        "title",
        "price",
        "currency",
        "seller",
        "availability",
        "rating",
        "category"
      ],
      "notes": [
        "Fictional demo catalog record. Not a real listing; there is nothing to buy."
      ],
      "retrieved_at": "2026-10-11T21:19:51.140806+00:00",
      "search_id": "search-4a8756df37aa",
      "requirements_matched": [],
      "requirements_unconfirmed": []
    },
    "rank": 1,
    "reason": "Trailrunner Lite Running Shoes at 44.99 USD: seller is on the approved-vendor list; rating 4.4.",
    "tradeoffs": null
  },
  "alternatives": [
    {
      "product": {
        "product_id": "sh-002",
        "provider": "demo",
        "provider_product_id": "sh-002",
        "title": "CourtFlex Canvas Sneakers",
        "name": "CourtFlex Canvas Sneakers",
        "category": "shoes",
        "category_source": "demo_fixture",
        "provider_category": null,
        "price": 34.5,
        "currency": "USD",
        "seller": "StrideMart",
        "vendor": "StrideMart",
        "product_url": null,
        "image_url": null,
        "availability": "in_stock",
        "condition": "new",
        "rating": 4.1,
        "features": [
          "casual",
          "canvas"
        ],
        "source": "demo_catalog",
        "provenance": "fictional_demo_catalog",
        "provider_fields": [],
        "unverified_fields": [
          "title",
          "price",
          "currency",
          "seller",
          "availability",
          "rating",
          "category"
        ],
        "notes": [
          "Fictional demo catalog record. Not a real listing; there is nothing to buy."
        ],
        "retrieved_at": "2026-10-11T21:19:51.140806+00:00",
        "search_id": "search-4a8756df37aa",
        "requirements_matched": [],
        "requirements_unconfirmed": []
      },
      "rank": 2,
      "reason": "CourtFlex Canvas Sneakers at 34.50 USD: seller is on the approved-vendor list; rating 4.1.",
      "tradeoffs": null
    },
    {
      "product": {
        "product_id": "sh-004",
        "provider": "demo",
        "provider_product_id": "sh-004",
        "title": "Everyday Slip-On Shoes",
        "name": "Everyday Slip-On Shoes",
        "category": "shoes",
        "category_source": "demo_fixture",
        "provider_category": null,
        "price": 29.99,
        "currency": "USD",
        "seller": "BargainBin Outlet",
        "vendor": "BargainBin Outlet",
        "product_url": null,
        "image_url": null,
        "availability": "in_stock",
        "condition": "new",
        "rating": 3.9,
        "features": [
          "casual",
          "slip-on"
        ],
        "source": "demo_catalog",
        "provenance": "fictional_demo_catalog",
        "provider_fields": [],
        "unverified_fields": [
          "title",
          "price",
          "currency",
          "seller",
          "availability",
          "rating",
          "category"
        ],
        "notes": [
          "Fictional demo catalog record. Not a real listing; there is nothing to buy."
        ],
        "retrieved_at": "2026-10-11T21:19:51.140806+00:00",
        "search_id": "search-4a8756df37aa",
        "requirements_matched": [],
        "requirements_unconfirmed": []
      },
      "rank": 3,
      "reason": "Everyday Slip-On Shoes at 29.99 USD: seller is NOT on the approved-vendor list, so policy will block it; rating 3.9.",
      "tradeoffs": null
    }
  ],
  "proposal": {
    "agent_id": "purchase-pilot",
    "intent": "Find shoes under $50",
    "action": {
      "type": "place_order",
      "parameters": {
        "product_id": "sh-001",
        "price": 44.99,
        "currency": "USD",
        "vendor": "StrideMart",
        "category": "shoes"
      }
    },
    "evidence": [
      {
        "id": "catalog-sh-001",
        "source": "demo_catalog",
        "content": "Trailrunner Lite Running Shoes; rating 4.4; listed price $44.99"
      }
    ],
    "policy_id": "shopping-default",
    "proposal_source": "deterministic_ranking",
    "agent_reasoning": "Trailrunner Lite Running Shoes at 44.99 USD: seller is on the approved-vendor list; rating 4.4.",
    "search_id": "search-4a8756df37aa"
  },
  "evaluation": {
    "evaluation_id": "eval-2737a8041b65",
    "agent_id": "purchase-pilot",
    "action": {
      "type": "place_order",
      "parameters": {
        "product_id": "sh-001",
        "price": 44.99,
        "currency": "USD",
        "vendor": "StrideMart",
        "category": "shoes"
      }
    },
    "decision": "ALLOW",
    "risk_level": "LOW",
    "checks": [
      {
        "name": "Tool authorization",
        "status": "PASS",
        "reason": "Action is permitted"
      },
      {
        "name": "Trusted product reference",
        "status": "PASS",
        "reason": "Matches fictional demo catalog record (not live retailer data)"
      },
      {
        "name": "Spending limit",
        "status": "PASS",
        "reason": "$44.99 is within $80.00 limit"
      },
      {
        "name": "Vendor authorization",
        "status": "PASS",
        "reason": "Vendor is approved"
      },
      {
        "name": "Request match",
        "status": "PASS",
        "reason": "Matches the requested category and budget"
      },
      {
        "name": "Evidence safety",
        "status": "PASS",
        "reason": "No configured high-risk text patterns found"
      }
    ],
    "reason": "All active checks passed",
    "evidence_flags": [],
    "alternatives": [
      {
        "product_id": "sh-002",
        "name": "CourtFlex Canvas Sneakers",
        "title": "CourtFlex Canvas Sneakers",
        "category": "shoes",
        "price": 34.5,
        "currency": "USD",
        "vendor": "StrideMart",
        "seller": "StrideMart",
        "rating": 4.1,
        "availability": "in_stock",
        "features": [
          "casual",
          "canvas"
        ],
        "product_url": null,
        "source": "demo_catalog",
        "provenance": "fictional_demo_catalog"
      }
    ],
    "execution_allowed": true,
    "policy_versions": {
      "allowed-actions": 1,
      "approved-vendors": 1,
      "decision-quality": 1,
      "evidence-review": 1,
      "spending-limit": 1
    },
    "decision_quality": {
      "status": "INSUFFICIENT_EVIDENCE",
      "enforced": false,
      "missing": [
        {
          "code": "INDEPENDENT_SOURCES",
          "reason": "Need 1 trusted demo independent review(s); found 0"
        },
        {
          "code": "TOTAL_COST_QUOTE",
          "reason": "No matching server-owned demo checkout-quote fixture supplied"
        }
      ],
      "matched_evidence_ids": [],
      "unverified_evidence_ids": [],
      "comparative_claim": false,
      "verified_demo_independent_review_count": 0,
      "explanation": "Evidence does not meet the configured demo requirements.",
      "provenance": "fictional_demo_fixtures_only",
      "evidence_provenance": [
        {
          "evidence_id": "catalog-sh-001",
          "provenance": "fictional_demo_catalog",
          "kind": "listing"
        }
      ],
      "product_data_provenance": "fictional_demo_catalog"
    },
    "product_verification": {
      "status": "DEMO_FIXTURE",
      "provenance": "fictional_demo_catalog",
      "provider": "demo",
      "source": "demo_catalog",
      "retrieved_at": null,
      "product_url": null,
      "provider_fields": [],
      "unverified_fields": [
        "title",
        "price",
        "currency",
        "seller",
        "availability",
        "rating",
        "category"
      ],
      "trusted_values": {
        "title": "Trailrunner Lite Running Shoes",
        "category": "shoes",
        "price": 44.99,
        "currency": "USD",
        "seller": "StrideMart",
        "availability": "in_stock"
      },
      "mismatches": [],
      "explanation": "Values come from the fictional demo catalog. They are not real retailer data."
    },
    "ai_analysis": null,
    "ai_status": "not_requested",
    "ai_error": null,
    "created_at": "2026-10-11T21:19:51.145373+00:00",
    "review_status": null,
    "executed": false
  },
  "execution": null,
  "status": "EVALUATED_NOT_EXECUTED",
  "message": null
} as const;

export const LAPTOPS_UNDER_50_NO_MATCH = {
  "status": "NO_MATCH",
  "message": "No laptops at or under 50.00 USD found in the fictional demo catalog. Excluded: 11 wrong category, 3 over budget.",
  "discovery": {
    "search_id": "search-5cd823ea6366",
    "query": {
      "raw": "Find laptops under $50",
      "categories": [
        "laptops"
      ],
      "category": "laptops",
      "requirements": [],
      "max_price": 50.0,
      "min_price": null,
      "currency": "USD",
      "currency_explicit": true,
      "parser": "deterministic_rules_v1"
    },
    "search_terms": "laptop",
    "provider": "demo",
    "catalog_mode": "demo",
    "provider_error": null,
    "returned_count": 14,
    "matched_count": 0,
    "excluded_counts": {
      "wrong_category": 11,
      "currency_mismatch": 0,
      "over_budget": 3,
      "under_minimum": 0,
      "unavailable": 0
    },
    "excluded": [
      {
        "product_id": "hp-001",
        "title": "Premium Studio Headphones",
        "category": "headphones",
        "price": 129.0,
        "currency": "USD",
        "reason": "wrong_category"
      },
      {
        "product_id": "hp-002",
        "title": "Everyday Wireless Headphones",
        "category": "headphones",
        "price": 64.99,
        "currency": "USD",
        "reason": "wrong_category"
      },
      {
        "product_id": "hp-003",
        "title": "Travel Noise-Cancelling Headphones",
        "category": "headphones",
        "price": 74.95,
        "currency": "USD",
        "reason": "wrong_category"
      },
      {
        "product_id": "sh-001",
        "title": "Trailrunner Lite Running Shoes",
        "category": "shoes",
        "price": 44.99,
        "currency": "USD",
        "reason": "wrong_category"
      },
      {
        "product_id": "sh-002",
        "title": "CourtFlex Canvas Sneakers",
        "category": "shoes",
        "price": 34.5,
        "currency": "USD",
        "reason": "wrong_category"
      },
      {
        "product_id": "sh-003",
        "title": "Summit Waterproof Hiking Boots",
        "category": "shoes",
        "price": 89.0,
        "currency": "USD",
        "reason": "wrong_category"
      },
      {
        "product_id": "sh-004",
        "title": "Everyday Slip-On Shoes",
        "category": "shoes",
        "price": 29.99,
        "currency": "USD",
        "reason": "wrong_category"
      },
      {
        "product_id": "sh-005",
        "title": "Featherweight Racing Flats",
        "category": "shoes",
        "price": 49.0,
        "currency": "USD",
        "reason": "wrong_category"
      },
      {
        "product_id": "lt-001",
        "title": "Student 14-inch Chromebook",
        "category": "laptops",
        "price": 229.0,
        "currency": "USD",
        "reason": "over_budget"
      },
      {
        "product_id": "lt-002",
        "title": "Creator 15 Laptop",
        "category": "laptops",
        "price": 899.0,
        "currency": "USD",
        "reason": "over_budget"
      },
      {
        "product_id": "lt-003",
        "title": "Refurbished 13-inch Ultrabook",
        "category": "laptops",
        "price": 74.0,
        "currency": "USD",
        "reason": "over_budget"
      },
      {
        "product_id": "bp-001",
        "title": "Commuter 20L Laptop Backpack",
        "category": "backpacks",
        "price": 49.99,
        "currency": "USD",
        "reason": "wrong_category"
      },
      {
        "product_id": "bp-002",
        "title": "Trail 30L Hiking Backpack",
        "category": "backpacks",
        "price": 72.0,
        "currency": "USD",
        "reason": "wrong_category"
      },
      {
        "product_id": "bp-003",
        "title": "Mini City Daypack",
        "category": "backpacks",
        "price": 24.99,
        "currency": "USD",
        "reason": "wrong_category"
      }
    ],
    "results": [],
    "no_match": {
      "code": "NO_QUALIFYING_PRODUCTS",
      "message": "No laptops at or under 50.00 USD found in the fictional demo catalog. Excluded: 11 wrong category, 3 over budget."
    },
    "status": "NO_MATCH"
  },
  "ranking": null,
  "recommendation": null,
  "alternatives": [],
  "proposal": null,
  "evaluation": null,
  "execution": null
} as const;

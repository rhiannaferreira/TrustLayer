"""Tiny TrustLayer client. Standard library only.

    from trustlayer import TrustLayer
    tl = TrustLayer(base_url="https://trust-layer-gz8n.vercel.app", api_key="tl_...")
    verdict = tl.check("finance.pay_invoice", {"amount": 240, "payee": "CloudHost Inc"}, goal="Pay hosting")
    if verdict["allowed"]:
        ...do the real action...
"""
import json
import time
import urllib.request


class TrustLayer:
    def __init__(self, base_url, api_key, timeout=30):
        self.base, self.key, self.timeout = base_url.rstrip("/"), api_key, timeout

    def _call(self, method, path, body=None):
        req = urllib.request.Request(self.base + path, method=method,
                                     data=json.dumps(body).encode() if body is not None else None,
                                     headers={"Authorization": f"Bearer {self.key}", "Content-Type": "application/json"})
        with urllib.request.urlopen(req, timeout=self.timeout) as r:
            return json.load(r)

    def check(self, action, parameters=None, goal="", reasoning="", evidence=None):
        """Ask before acting. Returns {decision: ALLOW|REVIEW|BLOCK, allowed: bool, reason, decision_id, ...}."""
        return self._call("POST", "/api/v1/gate/check", {"action": action, "parameters": parameters or {},
                                                          "goal": goal, "reasoning": reasoning, "evidence": evidence or []})

    def wait_for_review(self, decision_id, poll=3, timeout=600):
        """Block until a human approves or rejects a REVIEW decision. Returns the final status dict."""
        end = time.time() + timeout
        while time.time() < end:
            s = self._call("GET", f"/api/v1/gate/decisions/{decision_id}")
            if s["review_status"] in ("APPROVED", "REJECTED") or s["decision"] != "REVIEW":
                return s
            time.sleep(poll)
        raise TimeoutError("No human review within the timeout")

"""ShopKart (simulated merchant) - payment gateway callback handler.

Receives signed server-to-server callbacks from the payment gateway and updates
the order state. This file is on FIXCHAIN's repair allowlist.

Order states: PAYMENT_INITIATED -> PAYMENT_PENDING -> PAID | PAYMENT_FAILED
"""
import hashlib
import hmac
import json

FINAL_ORDER_STATES = {"PAID", "PAYMENT_FAILED"}


def canonical_body(payload: dict) -> str:
    """Serialise the callback payload exactly as the gateway signs it."""
    return json.dumps(payload, sort_keys=True, separators=(",", ":"))


def verify_signature(payload: dict, signature: str, secret: str) -> bool:
    expected = hmac.new(secret.encode(), canonical_body(payload).encode(), hashlib.sha256).hexdigest()
    return hmac.compare_digest(expected, signature or "")


def map_gateway_status(gateway_status: str) -> str:
    """Translate a gateway transaction status into our order status."""
    status = (gateway_status or "").strip().upper()
    if status == "SUCCESS":
        return "PAID"
    if status == "PENDING":
        return "PAYMENT_PENDING"
    if status == "FAILED":
        return "PAYMENT_FAILED"
    raise ValueError(f"Unknown gateway status: {gateway_status!r}")


def handle_callback(payload: dict, signature: str, secret: str, store) -> dict:
    """Process one gateway callback. Returns a result dict incl. an HTTP status."""
    if not verify_signature(payload, signature, secret):
        return {"accepted": False, "reason": "invalid_signature", "http_status": 401}

    event_id = payload["event_id"]
    if store.is_event_processed(event_id):
        return {"accepted": True, "reason": "duplicate", "http_status": 200}

    order = store.get_order(payload["order_id"])
    if order is None:
        return {"accepted": False, "reason": "unknown_order", "http_status": 404}

    if int(payload["amount"]) != int(order["amount"]):
        return {"accepted": False, "reason": "amount_mismatch", "http_status": 400}

    new_status = map_gateway_status(payload["status"])

    if order["status"] in FINAL_ORDER_STATES and new_status != order["status"]:
        # Never move an order out of a final state on a late/out-of-order callback.
        store.mark_event_processed(event_id)
        return {"accepted": True, "reason": "ignored_final_state",
                "order_status": order["status"], "http_status": 200}

    store.update_order_status(order["order_id"], new_status, payload["txn_id"])
    store.mark_event_processed(event_id)
    return {"accepted": True, "reason": "applied", "order_status": new_status, "http_status": 200}

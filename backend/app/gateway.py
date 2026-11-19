"""SimPay - mock payment gateway + simulated checkout. No real money, no real network.

The gateway is the authoritative source of a transaction's status. It signs every
callback with HMAC-SHA256 and delivers it to the merchant's webhook logic.
"""
from __future__ import annotations

import hashlib
import hmac
import json
import random
import uuid
from typing import Any

from . import config, db, merchant_runtime

STATUSES = ("SUCCESS", "FAILED", "PENDING")
CUSTOMERS = ["Aarav", "Diya", "Kabir", "Meera", "Rohan", "Ananya", "Vihaan", "Isha", "Arjun", "Sara"]


def _canonical(payload: dict) -> str:
    return json.dumps(payload, sort_keys=True, separators=(",", ":"))


def sign(payload: dict) -> str:
    return hmac.new(config.GATEWAY_WEBHOOK_SECRET.encode(), _canonical(payload).encode(), hashlib.sha256).hexdigest()


def _new_id(prefix: str) -> str:
    return f"{prefix}_{uuid.uuid4().hex[:12].upper()}"


def _build_payload(txn: dict, status: str) -> dict:
    return {
        "event_id": _new_id("EVT"),
        "txn_id": txn["txn_id"],
        "order_id": txn["order_id"],
        "amount": txn["amount"],
        "status": status,
        "timestamp": round(db.now(), 3),
    }


def deliver(payload: dict, signature: str | None = None) -> dict:
    """Deliver a callback to the merchant and record the delivery."""
    signature = sign(payload) if signature is None else signature
    with db.tx() as c:
        c.execute(
            "INSERT INTO payment_events (ts, kind, order_id, txn_id, event_id, gateway_status, detail)"
            " VALUES (?,?,?,?,?,?,?)",
            (db.now(), "callback_delivered", payload["order_id"], payload["txn_id"], payload["event_id"],
             payload["status"], None),
        )
    return merchant_runtime.process_callback(payload, signature)


def checkout(amount: int | None = None, outcome: str = "RANDOM", customer: str | None = None) -> dict[str, Any]:
    """Simulated customer checkout: create order, create gateway txn, deliver callback."""
    outcome = outcome.upper()
    if outcome == "RANDOM":
        outcome = random.choices(STATUSES, weights=[0.6, 0.15, 0.25])[0]
    if outcome not in STATUSES:
        raise ValueError(f"outcome must be one of {STATUSES} or RANDOM")
    amount = int(amount) if amount else random.choice([49900, 129900, 89900, 239900, 34900, 159900])
    order_id = _new_id("ORD")
    txn_id = _new_id("TXN")
    t = db.now()
    with db.tx() as c:
        c.execute("INSERT INTO orders VALUES (?,?,?,?,?,?,?)",
                  (order_id, customer or random.choice(CUSTOMERS), amount, "PAYMENT_INITIATED", txn_id, t, t))
        c.execute("INSERT INTO gateway_txns VALUES (?,?,?,?,?,?)", (txn_id, order_id, amount, outcome, t, t))
        c.execute("INSERT INTO payment_events (ts, kind, order_id, txn_id, gateway_status) VALUES (?,?,?,?,?)",
                  (t, "order_created", order_id, txn_id, outcome))
    txn = {"txn_id": txn_id, "order_id": order_id, "amount": amount}
    payload = _build_payload(txn, outcome)
    result = deliver(payload)
    return {"order_id": order_id, "txn_id": txn_id, "amount": amount, "gateway_status": outcome,
            "event_id": payload["event_id"], "merchant_result": result,
            "order_status": merchant_runtime.SqliteOrderStore().get_order(order_id)["status"]}


def settle_pending(success_ratio: float = 0.8) -> list[dict]:
    """Gateway resolves PENDING transactions and sends the follow-up callback."""
    out = []
    for txn in db.rows("SELECT * FROM gateway_txns WHERE status='PENDING'"):
        final = "SUCCESS" if random.random() < success_ratio else "FAILED"
        with db.tx() as c:
            c.execute("UPDATE gateway_txns SET status=?, updated_at=? WHERE txn_id=?", (final, db.now(), txn["txn_id"]))
        payload = _build_payload(txn, final)
        out.append({"txn_id": txn["txn_id"], "order_id": txn["order_id"], "status": final,
                    "merchant_result": deliver(payload)})
    return out


def replay_last_callback(duplicate: bool = True, tamper: bool = False) -> dict:
    """Edge-case simulation: redeliver the most recent callback, or send a forged one."""
    ev = db.one("SELECT * FROM payment_events WHERE kind='callback_delivered' ORDER BY id DESC LIMIT 1")
    if not ev:
        raise ValueError("No callbacks have been delivered yet")
    txn = db.one("SELECT * FROM gateway_txns WHERE txn_id=?", (ev["txn_id"],))
    payload = {"event_id": ev["event_id"] if duplicate else _new_id("EVT"), "txn_id": txn["txn_id"],
               "order_id": txn["order_id"], "amount": txn["amount"], "status": ev["gateway_status"],
               "timestamp": round(db.now(), 3)}
    signature = None
    if tamper:
        payload["status"] = "SUCCESS"
        signature = "0" * 64  # attacker cannot produce a valid HMAC
    return deliver(payload, signature)


def query_status(txn_id: str) -> dict | None:
    """Gateway status API - the authoritative state used for reconciliation."""
    return db.one("SELECT txn_id, order_id, amount, status FROM gateway_txns WHERE txn_id=?", (txn_id,))


def reconciliation_callback(txn_id: str) -> dict:
    """Gateway re-sends a fresh signed callback carrying the authoritative status."""
    txn = query_status(txn_id)
    if not txn:
        raise ValueError(f"unknown txn {txn_id}")
    return deliver(_build_payload(txn, txn["status"]))

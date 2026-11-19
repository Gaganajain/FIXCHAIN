"""Independent verifier fixtures. Loads the merchant handler under test from FIXCHAIN_TARGET_DIR.

This suite is owned by FIXCHAIN's verifier - the repair agent can neither read nor modify it.
It tests the handler only through its public contract: handle_callback(payload, signature, secret, store).
"""
import hashlib
import hmac
import importlib.util
import json
import os
import uuid
from pathlib import Path

import pytest

SECRET = "verifier-test-secret-not-a-real-key"


def _load_target():
    target_dir = os.environ.get("FIXCHAIN_TARGET_DIR")
    if not target_dir:
        raise RuntimeError("FIXCHAIN_TARGET_DIR is not set")
    path = Path(target_dir) / "payment_handler.py"
    spec = importlib.util.spec_from_file_location(f"handler_under_test_{uuid.uuid4().hex}", path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


class InMemoryStore:
    def __init__(self):
        self.orders = {}
        self.events = set()
        self.updates = []

    def add_order(self, order_id, amount, status="PAYMENT_INITIATED"):
        self.orders[order_id] = {"order_id": order_id, "amount": amount, "status": status, "txn_id": None}

    def get_order(self, order_id):
        o = self.orders.get(order_id)
        return dict(o) if o else None

    def update_order_status(self, order_id, status, txn_id=None):
        self.orders[order_id]["status"] = status
        if txn_id:
            self.orders[order_id]["txn_id"] = txn_id
        self.updates.append((order_id, status))

    def is_event_processed(self, event_id):
        return event_id in self.events

    def mark_event_processed(self, event_id):
        self.events.add(event_id)


def sign(payload, secret=SECRET):
    body = json.dumps(payload, sort_keys=True, separators=(",", ":"))
    return hmac.new(secret.encode(), body.encode(), hashlib.sha256).hexdigest()


def make_payload(order_id="ORD-1", status="SUCCESS", amount=49900, event_id=None, txn_id="TXN-1"):
    return {"event_id": event_id or f"EVT-{uuid.uuid4().hex[:8]}", "txn_id": txn_id, "order_id": order_id,
            "amount": amount, "status": status, "timestamp": 1700000000.0}


@pytest.fixture
def handler():
    return _load_target()


@pytest.fixture
def store():
    s = InMemoryStore()
    s.add_order("ORD-1", 49900)
    return s


@pytest.fixture
def send(handler, store):
    def _send(payload, signature=None):
        return handler.handle_callback(payload, sign(payload) if signature is None else signature, SECRET, store)
    return _send

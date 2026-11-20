"""Connector gateway - MOCK adapters for the demo (no real bank, NPCI, payment or device system is contacted).

State lives in the `mock_world` table, seeded by demo data and simulation scenarios, so results are deterministic
and verifiable. Every call is recorded in `connector_calls` (redacted). Write operations carry an idempotency
key: repeating one returns the recorded response instead of acting twice.
"""
from __future__ import annotations

import time

from .. import db
from . import core


class ConnectorTimeout(Exception):
    pass


class ConnectorError(Exception):
    pass


def world_get(kind: str, entity_id: str) -> dict | None:
    r = db.one("SELECT state FROM mock_world WHERE kind=? AND entity_id=?", (kind, entity_id))
    return core.loads(r["state"]) if r else None


def world_put(kind: str, entity_id: str, state: dict) -> None:
    with db.tx() as c:
        c.execute("INSERT INTO mock_world (kind, entity_id, state, updated_at) VALUES (?,?,?,?) "
                  "ON CONFLICT(kind, entity_id) DO UPDATE SET state=excluded.state, updated_at=excluded.updated_at",
                  (kind, entity_id, core.dumps(state), db.now()))


def world_put_many(items: list[tuple[str, str, dict]]) -> None:
    now = db.now()
    with db.tx() as c:
        c.executemany("INSERT INTO mock_world (kind, entity_id, state, updated_at) VALUES (?,?,?,?) "
                      "ON CONFLICT(kind, entity_id) DO UPDATE SET state=excluded.state, updated_at=excluded.updated_at",
                      [(k, e, core.dumps(s), now) for k, e, s in items])


def _record(connector: str, op: str, request: dict, response: dict | None, status: str, t0: float,
            key: str | None = None, ticket_id: str | None = None, incident_id: str | None = None) -> None:
    with db.tx() as c:
        c.execute("INSERT OR IGNORE INTO connector_calls (connector, operation, idempotency_key, request, response, status,"
                  " latency_ms, ticket_id, incident_id, ts) VALUES (?,?,?,?,?,?,?,?,?,?)",
                  (connector, op, key, core.dumps(request), core.dumps(response), status, int((time.time() - t0) * 1000),
                   ticket_id, incident_id, db.now()))


def _replay(key: str | None) -> dict | None:
    if not key:
        return None
    r = db.one("SELECT response FROM connector_calls WHERE idempotency_key=? AND status='ok'", (key,))
    return core.loads(r["response"]) if r else None


def _call(connector: str, op: str, request: dict, fn, *, key: str | None = None, ticket_id=None, incident_id=None) -> dict:
    prior = _replay(key)
    if prior is not None:
        return {**prior, "idempotent_replay": True}
    t0 = time.time()
    try:
        resp = fn()
    except ConnectorTimeout:
        _record(connector, op, request, {"error": "timeout"}, "timeout", t0, None, ticket_id, incident_id)
        raise
    except ConnectorError as exc:
        _record(connector, op, request, {"error": str(exc)}, "error", t0, None, ticket_id, incident_id)
        raise
    resp = {**resp, "source": f"mock:{connector}", "checked_at": db.now()}
    _record(connector, op, request, resp, "ok", t0, key, ticket_id, incident_id)
    return resp


# ------------------------------------------------------------------ payments
def payment_status(txn_ref: str, **ids) -> dict:
    """Authoritative (mock) status of a payment: bank-side status and merchant-side order status."""
    def fn():
        w = world_get("txn", txn_ref)
        if w is None:
            from .. import gateway  # the engineering demo's SimPay gateway is also a valid source
            g = gateway.query_status(txn_ref)
            if g:
                o = db.one("SELECT status FROM orders WHERE order_id=?", (g["order_id"],))
                return {"txn_ref": txn_ref, "bank_status": g["status"], "merchant_status": o["status"] if o else None,
                        "amount_paise": g["amount"], "found": True}
            return {"txn_ref": txn_ref, "bank_status": "UNKNOWN", "merchant_status": None, "found": False}
        if w.get("partner_timeout"):
            raise ConnectorTimeout("partner bank did not respond")
        return {"txn_ref": txn_ref, "found": True, **{k: w.get(k) for k in ("bank_status", "merchant_status", "amount_paise", "merchant_id")}}
    return _call("payments", "status", {"txn_ref": txn_ref}, fn, **ids)


def request_reconciliation(txn_ref: str, key: str, **ids) -> dict:
    """Tier 2: re-sync the merchant record from the bank's authoritative status (no money moves)."""
    def fn():
        w = world_get("txn", txn_ref) or {}
        if w.get("bank_status") == "SUCCESS":
            w["merchant_status"] = "PAID"
        elif w.get("bank_status") == "FAILED":
            w["reversal_requested"] = True
        world_put("txn", txn_ref, w)
        return {"txn_ref": txn_ref, "accepted": True, "note": "request accepted - completion must be verified"}
    return _call("payments", "reconcile", {"txn_ref": txn_ref}, fn, key=key, **ids)


# ------------------------------------------------------------------ soundbox
def device_telemetry(device_id: str, **ids) -> dict:
    def fn():
        w = world_get("device", device_id)
        if w is None:
            return {"device_id": device_id, "found": False}
        return {"device_id": device_id, "found": True, **w}
    return _call("soundbox", "telemetry", {"device_id": device_id}, fn, **ids)


def device_remote_restart(device_id: str, key: str, **ids) -> dict:
    """Tier 1: reversible, low-risk. Recovery depends on the device's (seeded) condition."""
    def fn():
        w = world_get("device", device_id) or {}
        if w.get("fault") == "network" and w.get("recoverable", True):
            w.update(online=True, network="ok", fault=None, test_announcement_ok=True)
        w["restarts"] = w.get("restarts", 0) + 1
        world_put("device", device_id, w)
        return {"device_id": device_id, "accepted": True}
    return _call("soundbox", "remote_restart", {"device_id": device_id}, fn, key=key, **ids)


def device_test_announcement(device_id: str, **ids) -> dict:
    def fn():
        w = world_get("device", device_id) or {}
        ok = bool(w.get("online")) and w.get("battery", 100) > 10 and w.get("announcements_ok", True)
        return {"device_id": device_id, "played": ok}
    return _call("soundbox", "test_announcement", {"device_id": device_id}, fn, **ids)


# ------------------------------------------------------------------ QR
def qr_config(qr_id: str, **ids) -> dict:
    def fn():
        w = world_get("qr", qr_id)
        if w is None:
            return {"qr_id": qr_id, "found": False}
        return {"qr_id": qr_id, "found": True, **w}
    return _call("qr", "config", {"qr_id": qr_id}, fn, **ids)


def qr_remap(qr_id: str, target_vpa: str, key: str, **ids) -> dict:
    """Tier 2: configuration change on a merchant account."""
    def fn():
        w = world_get("qr", qr_id) or {}
        w.update(mapped_vpa=target_vpa, vpa_active=True, accepting=True)
        world_put("qr", qr_id, w)
        return {"qr_id": qr_id, "accepted": True, "mapped_vpa": target_vpa}
    return _call("qr", "remap", {"qr_id": qr_id, "target_vpa": target_vpa}, fn, key=key, **ids)


# ------------------------------------------------------------------ settlement
def settlement_status(merchant_id: str, **ids) -> dict:
    def fn():
        w = world_get("settlement", merchant_id)
        if w is None:
            return {"merchant_id": merchant_id, "found": False}
        return {"merchant_id": merchant_id, "found": True, **w}
    return _call("settlement", "status", {"merchant_id": merchant_id}, fn, **ids)


def settlement_escalate_partner(batch_id: str, key: str, **ids) -> dict:
    """Tier 2: formal escalation to the partner bank (operational, no money moved by FIXCHAIN)."""
    def fn():
        for r in db.rows("SELECT entity_id, state FROM mock_world WHERE kind='settlement'"):
            s = core.loads(r["state"])
            if s.get("batch_id") == batch_id and s.get("status") == "HELD_AT_PARTNER":
                s.update(status="RELEASED", escalated=True)
                world_put("settlement", r["entity_id"], s)
        return {"batch_id": batch_id, "accepted": True}
    return _call("settlement", "escalate_partner", {"batch_id": batch_id}, fn, key=key, **ids)


# ------------------------------------------------------------------ platform
def gateway_health(**ids) -> dict:
    def fn():
        p = world_get("gateway", "primary") or {"health": "healthy", "error_rate": 0.002}
        s = world_get("gateway", "secondary") or {"health": "healthy", "error_rate": 0.003}
        active = (world_get("gateway", "routing") or {}).get("active", "primary")
        return {"primary": p, "secondary": s, "active": active}
    return _call("platform", "health", {}, fn, **ids)


def gateway_failover(target: str, key: str, **ids) -> dict:
    def fn():
        world_put("gateway", "routing", {"active": target})
        return {"active": target, "accepted": True}
    return _call("platform", "failover", {"target": target}, fn, key=key, **ids)


def publish_status_banner(text: str, key: str, **ids) -> dict:
    def fn():
        world_put("status_page", "banner", {"text": text, "published_at": db.now()})
        return {"published": True}
    return _call("platform", "status_banner", {"text": text}, fn, key=key, **ids)

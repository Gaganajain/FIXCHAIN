"""Detection agent - deterministic monitor over payment events.

Compares each callback's resulting order state with what the gateway contract
requires for the authoritative gateway status. No LLM is involved: an incident is
raised only from observed data.
"""
from __future__ import annotations

import threading

from . import config, db, memory, merchant_runtime

# Reasons where the handler correctly refused to change state.
LEGIT_REJECTIONS = {"duplicate", "invalid_signature", "unknown_order", "amount_mismatch"}

SEVERITY = {
    ("PENDING", "PAYMENT_FAILED"): "high",
    ("SUCCESS", "PAYMENT_FAILED"): "critical",
    ("FAILED", "PAID"): "critical",
    ("PENDING", "PAID"): "critical",
}

_detect_lock = threading.Lock()


def expected_state(gateway_status: str) -> str | None:
    return merchant_runtime.contract()["status_to_order_state"].get((gateway_status or "").upper())


SIGNATURE_BURST = 3          # invalid signatures ...
SIGNATURE_WINDOW_S = 120     # ... within this many seconds


def _external_signature_burst(ev: dict) -> int | None:
    """Repeated invalid signatures are NOT a merchant code defect: the handler is correctly rejecting them.

    They point outside the merchant code (gateway secret rotated / misconfigured, or forged callbacks), so
    FIXCHAIN raises an *external* incident that is never sent to the repair pipeline.
    """
    n = db.one("SELECT COUNT(*) AS n FROM payment_events WHERE kind='callback_result' AND "
               "handler_reason='invalid_signature' AND ts>=?", (ev["ts"] - SIGNATURE_WINDOW_S,))["n"]
    if n < SIGNATURE_BURST:
        return None
    fp = "EXTERNAL:INVALID_SIGNATURE_BURST"
    with _detect_lock:
        inc = db.one("SELECT * FROM incidents WHERE fingerprint=? AND status NOT IN ('resolved','rejected')"
                     " ORDER BY id DESC LIMIT 1", (fp,))
        order = db.one("SELECT amount, status FROM orders WHERE order_id=?", (ev["order_id"],))
        created = False
        with db.tx() as c:
            if inc:
                incident_id = inc["id"]
                c.execute("UPDATE incidents SET occurrences=occurrences+1, last_seen=? WHERE id=?", (ev["ts"], incident_id))
            else:
                created = True
                cur = c.execute(
                    "INSERT INTO incidents (fingerprint, rule, title, severity, status, gateway_status,"
                    " observed_order_status, expected_order_status, first_seen, last_seen, occurrences, category)"
                    " VALUES (?,?,?,?,?,?,?,?,?,?,?,?)",
                    (fp, "SIGNATURE_FAILURES",
                     f"{n} callbacks with invalid signatures in {SIGNATURE_WINDOW_S}s - external: gateway secret "
                     f"mismatch or forged callbacks (merchant code correctly rejected them)",
                     "high", "open", ev["gateway_status"], order["status"] if order else None, None,
                     ev["ts"], ev["ts"], n, "external"))
                incident_id = cur.lastrowid
            if ev["order_id"] and order:
                c.execute("INSERT OR IGNORE INTO incident_orders (incident_id, order_id, txn_id, amount, reconciled)"
                          " VALUES (?,?,?,?,1)", (incident_id, ev["order_id"], ev["txn_id"], order["amount"]))
    if created:  # logged after the transaction commits (db.log opens its own connection)
        db.log("WARN", "detection", f"External incident #{incident_id}: repeated invalid callback signatures",
               fingerprint=fp)
    return incident_id


def on_callback_result(event_row_id: int) -> int | None:
    ev = db.one("SELECT * FROM payment_events WHERE id=?", (event_row_id,))
    if ev and ev["handler_reason"] == "invalid_signature":
        return _external_signature_burst(ev)
    if not ev or ev["handler_reason"] in LEGIT_REJECTIONS:
        return None

    if ev["handler_reason"] == "handler_exception":
        fp, rule = "CALLBACK_EXCEPTION", "CALLBACK_EXCEPTION"
        title = "Merchant callback handler raised an exception"
        severity, expected, observed = "high", expected_state(ev["gateway_status"]), ev["order_status_after"]
    else:
        expected = expected_state(ev["gateway_status"])
        observed = ev["order_status_after"]
        if expected is None or observed == expected:
            return None
        fp = f"STATE_MISMATCH:{ev['gateway_status']}->{observed}"
        rule = "STATE_MISMATCH"
        title = f"Gateway {ev['gateway_status']} recorded as {observed} (expected {expected})"
        severity = SEVERITY.get((ev["gateway_status"], observed), "medium")

    with _detect_lock:
        inc = db.one("SELECT * FROM incidents WHERE fingerprint=? AND status NOT IN ('resolved','rejected')"
                     " ORDER BY id DESC LIMIT 1", (fp,))
        order = db.one("SELECT amount FROM orders WHERE order_id=?", (ev["order_id"],))
        created = False
        with db.tx() as c:
            if inc:
                incident_id = inc["id"]
                c.execute("UPDATE incidents SET occurrences=occurrences+1, last_seen=? WHERE id=?",
                          (ev["ts"], incident_id))
            else:
                similar = memory.find_similar(fp, rule)
                cur = c.execute(
                    "INSERT INTO incidents (fingerprint, rule, title, severity, status, gateway_status,"
                    " observed_order_status, expected_order_status, first_seen, last_seen, occurrences,"
                    " similar_memory_id) VALUES (?,?,?,?,?,?,?,?,?,?,1,?)",
                    (fp, rule, title, severity, "open", ev["gateway_status"], observed, expected, ev["ts"],
                     ev["ts"], similar["id"] if similar else None),
                )
                incident_id = cur.lastrowid
                created = True
            c.execute("INSERT OR IGNORE INTO incident_orders (incident_id, order_id, txn_id, amount)"
                      " VALUES (?,?,?,?)", (incident_id, ev["order_id"], ev["txn_id"], order["amount"] if order else 0))

    if created:
        db.log("WARN", "detection", f"Incident #{incident_id} opened: {title}", severity=severity, fingerprint=fp)
        if config.AUTO_INVESTIGATE:
            from . import orchestrator
            orchestrator.maybe_autostart(incident_id)
    return incident_id

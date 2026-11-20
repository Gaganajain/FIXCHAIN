"""Versioned, approved resolution playbooks. The resolver only runs the latest *approved* version.
The Learning agent may propose a new version (status 'proposed'); only an authorised human can approve it."""
from __future__ import annotations

from .. import db
from . import core

SEED = [
    ("PAYMENT_STATUS_INVESTIGATION", "PAYMENTS_UPI", "Payment status investigation", 2,
     {"steps": ["collect txn_ref + amount", "payment_status_check (T1, read-only)",
                "explain state in customer's language", "bank SUCCESS + merchant not PAID → payment_reconciliation_request (T2)",
                "PENDING → wait for partner", "FAILED → refund_request (T2)", "UNKNOWN / timeout → escalate"],
      "options": {}}),
    ("SOUNDBOX_BASIC_DIAGNOSTIC", "SOUNDBOX", "Soundbox guided diagnostics", 1,
     {"steps": ["device_diagnostics (T1)", "network fault → device_remote_restart (T1) → verify test announcement",
                "low battery → guide charging, await merchant confirmation",
                "online but silent → link to software-defect incident", "unrecovered → device_replacement (T2)"],
      "options": {"restart_attempts": 1}}),
    ("QR_CONFIG_CHECK", "MERCHANT_QR", "QR / VPA configuration check", 2,
     {"steps": ["qr_config_check (T1)", "inactive VPA → qr_remap (T2) → verify accepting",
                "config OK → guide ₹1 test payment"], "options": {}}),
    ("SETTLEMENT_STATUS", "SETTLEMENT", "Settlement status & reconciliation", 2,
     {"steps": ["settlement_status_check (T1)", "SETTLED → show matched entry", "HELD_AT_PARTNER → "
                "settlement_partner_escalation per batch (T2)", "adjustments → human-led"], "options": {}}),
    ("PLATFORM_OUTAGE_RESPONSE", "PLATFORM_OUTAGE", "Platform outage response", 2,
     {"steps": ["gateway_health_check (T1)", "broadcast approved status update (T0)",
                "degraded primary → gateway_failover (T2)", "publish_status_banner (T2, incident manager)",
                "verify health → resolve linked tickets"], "options": {}}),
    ("FRAUD_INTAKE", "FRAUD_SECURITY", "Fraud report intake", 3,
     {"steps": ["urgent safety guidance (T0)", "capture time / instrument / references - never PIN/OTP",
                "fraud_case_handoff (T3, human-led)", "never auto-close"], "options": {}}),
]


def seed() -> None:
    for key, cat, title, tier, body in SEED:
        if db.one("SELECT id FROM playbooks WHERE key=?", (key,)):
            continue
        with db.tx() as c:
            c.execute("INSERT INTO playbooks (key, version, category, title, risk_tier, steps, status, source, approved_by,"
                      " created_at) VALUES (?,?,?,?,?,?,?,?,?,?)",
                      (key, 1, cat, title, tier, core.dumps(body), "approved", "seed", "platform-owner", db.now()))


def active(key: str) -> dict:
    r = db.one("SELECT * FROM playbooks WHERE key=? AND status='approved' ORDER BY version DESC LIMIT 1", (key,))
    if not r:
        raise KeyError(f"No approved playbook {key}")
    r["steps"] = core.loads(r["steps"], {})
    return r


def for_category(category: str) -> dict | None:
    r = db.one("SELECT key FROM playbooks WHERE category=? AND status='approved' ORDER BY version DESC LIMIT 1", (category,))
    return active(r["key"]) if r else None


def propose_version(key: str, options: dict, rationale: str, by: str) -> int:
    cur = active(key)
    body = {**cur["steps"], "options": {**cur["steps"].get("options", {}), **options}, "rationale": rationale}
    nxt = (db.one("SELECT MAX(version) AS v FROM playbooks WHERE key=?", (key,))["v"] or 0) + 1
    with db.tx() as c:
        pid = c.execute("INSERT INTO playbooks (key, version, category, title, risk_tier, steps, status, source, created_at)"
                        " VALUES (?,?,?,?,?,?,?,?,?)", (key, nxt, cur["category"], cur["title"], cur["risk_tier"],
                                                        core.dumps(body), "proposed", by, db.now())).lastrowid
    return pid


def approve_version(playbook_id: int, user) -> dict:
    p = db.one("SELECT * FROM playbooks WHERE id=?", (playbook_id,))
    if not p or p["status"] != "proposed":
        raise ValueError("Only a proposed playbook version can be approved")
    with db.tx() as c:
        c.execute("UPDATE playbooks SET status='retired' WHERE key=? AND status='approved'", (p["key"],))
        c.execute("UPDATE playbooks SET status='approved', approved_by=? WHERE id=?", (user.username, playbook_id))
    core.audit(user.username, "playbook.approved", f"{p['key']} v{p['version']}", role=user.role)
    return active(p["key"])

"""Shared primitives: JSON helpers, ID generation, event publishing, append-only audit and PII masking."""
from __future__ import annotations

import hashlib
import json
import re
import threading
from typing import Any

from .. import db
from ..agents.sanitize import scrub_text

id_lock = threading.RLock()  # hold across next_id() + INSERT to make ID allocation atomic
_id_lock = id_lock


def dumps(v: Any) -> str | None:
    return None if v is None else json.dumps(v, default=str, ensure_ascii=False)


def loads(v: str | None, default: Any = None) -> Any:
    if not v:
        return default
    try:
        return json.loads(v)
    except (TypeError, ValueError):
        return default


def next_id(table: str, prefix: str, width: int = 5) -> str:
    """Human-readable sequential IDs (TKT-00042). Serialised so concurrent workers never collide."""
    with _id_lock:
        r = db.one(f"SELECT id FROM {table} WHERE id LIKE ? ORDER BY length(id) DESC, id DESC LIMIT 1", (f"{prefix}-%",))
        n = int(r["id"].split("-")[-1]) + 1 if r else 1
        return f"{prefix}-{n:0{width}d}"


# ------------------------------------------------------------------ masking
_PII = [
    (re.compile(r"\b[\w.\-]{2,}@(?:ok|ybl|upi|paytm|axl|ibl|sbi|icici|hdfcbank|apl)\b", re.I), "[UPI_ID]"),
    (re.compile(r"[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}"), "[EMAIL]"),
    # Aadhaar: grouped 4-4-4, or 12 digits right after the word. A bare 12-digit run is a UTR and is kept.
    (re.compile(r"\b[2-9]\d{3}[ -]\d{4}[ -]\d{4}\b"), "[AADHAAR]"),
    (re.compile(r"(aadhaa?r\D{0,6})\d{12}\b", re.I), r"\1[AADHAAR]"),
    (re.compile(r"\b(?:\d[ -]?){13,19}\b"), "[CARD]"),
    (re.compile(r"(?<!\d)(?:\+?91[ -]?)?[6-9]\d{9}(?!\d)"), "[PHONE]"),
    (re.compile(r"\b(?:otp|pin|cvv|mpin|password)\s*(?:is|:|=)?\s*\d{3,8}\b", re.I), "[SECRET_REDACTED]"),
]


def mask(text: str | None) -> str | None:
    """Mask PII before it reaches logs, model prompts or operator screens. UTRs (12 digits) are kept:
    they are transaction references, not personal data, and are needed for correlation."""
    if not text:
        return text
    for pat, repl in _PII:
        text = pat.sub(repl, text)
    return scrub_text(text)


def contains_secret(text: str) -> bool:
    return bool(re.search(r"\b(?:otp|pin|cvv|mpin|password)\b", text or "", re.I) and re.search(r"\d{3,8}", text or ""))


# ------------------------------------------------------------------ events
def publish(type_: str, message: str, *, actor: str = "system", actor_type: str = "system",
            ticket_id: str | None = None, incident_id: str | None = None, workflow_id: int | None = None,
            level: str = "info", data: dict | None = None, simulated: bool = False) -> int:
    """Persist an event. Mission Control streams these rows; it never animates anything else."""
    with db.tx() as c:
        cur = c.execute(
            "INSERT INTO ops_events (ts, type, level, actor_type, actor_id, ticket_id, incident_id, workflow_id,"
            " message, data, simulated) VALUES (?,?,?,?,?,?,?,?,?,?,?)",
            (db.now(), type_, level, actor_type, actor, ticket_id, incident_id, workflow_id, mask(message),
             dumps(data), int(simulated)))
        return cur.lastrowid


def handoff(frm: str, to: str, subject_kind: str, subject_id: str, summary: str, workflow_id: int | None = None,
            simulated: bool = False) -> None:
    with db.tx() as c:
        c.execute("INSERT INTO agent_handoffs (workflow_id, from_agent, to_agent, subject_kind, subject_id, summary, ts)"
                  " VALUES (?,?,?,?,?,?,?)", (workflow_id, frm, to, subject_kind, subject_id, summary, db.now()))
    publish("agent.handoff", f"{frm} → {to}: {summary}", actor=frm, actor_type="agent",
            ticket_id=subject_id if subject_kind == "ticket" else None,
            incident_id=subject_id if subject_kind == "incident" else None,
            workflow_id=workflow_id, data={"from": frm, "to": to}, simulated=simulated)


# ------------------------------------------------------------------ audit (hash-chained, append-only)
_audit_lock = threading.Lock()


def audit(actor: str, action: str, target: str | None = None, detail: dict | None = None, role: str | None = None) -> None:
    with _audit_lock:
        prev = db.one("SELECT hash FROM audit_log ORDER BY id DESC LIMIT 1")
        prev_hash = prev["hash"] if prev else "GENESIS"
        ts = db.now()
        body = dumps(detail) or ""
        h = hashlib.sha256(f"{prev_hash}|{ts}|{actor}|{role}|{action}|{target}|{body}".encode()).hexdigest()
        with db.tx() as c:
            c.execute("INSERT INTO audit_log (ts, actor, role, action, target, detail, prev_hash, hash) VALUES (?,?,?,?,?,?,?,?)",
                      (ts, actor, role, action, target, body, prev_hash, h))


def verify_audit_chain() -> dict:
    prev = "GENESIS"
    rows = db.rows("SELECT * FROM audit_log ORDER BY id")
    for r in rows:
        h = hashlib.sha256(f"{prev}|{r['ts']}|{r['actor']}|{r['role']}|{r['action']}|{r['target']}|{r['detail'] or ''}"
                           .encode()).hexdigest()
        if r["prev_hash"] != prev or r["hash"] != h:
            return {"intact": False, "broken_at": r["id"], "entries": len(rows)}
        prev = r["hash"]
    return {"intact": True, "entries": len(rows)}

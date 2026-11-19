"""Incident memory - remembers resolved integration defects to spot recurrences."""
from __future__ import annotations

from . import db


def find_similar(fingerprint: str, rule: str) -> dict | None:
    """Only the same observed defect (same fingerprint, e.g. PENDING->PAYMENT_FAILED) counts as a recurrence.

    A rule-level match (any STATE_MISMATCH) is too broad: a SUCCESS->FAILED incident is a different symptom
    and must not be primed with the PENDING defect's root cause. `rule` is kept for API compatibility.
    """
    return db.one("SELECT * FROM memory WHERE fingerprint=? ORDER BY last_seen DESC LIMIT 1", (fingerprint,))


def compare(hint: dict, investigation: dict) -> dict:
    """Compare a remembered defect with a freshly validated investigation (never trusted blindly)."""
    same_file = (hint.get("file") or "") == investigation.get("file")
    same_fn = (hint.get("function") or "") == investigation.get("function")
    return {"same_root_cause": same_file and same_fn, "remembered": f"{hint.get('file')}::{hint.get('function')}()",
            "investigated": f"{investigation.get('file')}::{investigation.get('function')}()"}


def remember(incident: dict, investigation: dict | None, patch: dict) -> int:
    fp = incident["fingerprint"]
    existing = db.one("SELECT * FROM memory WHERE fingerprint=?", (fp,))
    inv = investigation or {}
    with db.tx() as c:
        if existing:
            c.execute("UPDATE memory SET times_seen=times_seen+1, last_seen=?, incident_id=?, patch_id=?,"
                      " root_cause=?, fix_summary=? WHERE id=?",
                      (db.now(), incident["id"], patch["id"], inv.get("root_cause"), patch.get("explanation"),
                       existing["id"]))
            return existing["id"]
        cur = c.execute(
            "INSERT INTO memory (fingerprint, rule, file, function, root_cause, fix_summary, incident_id, patch_id,"
            " times_seen, created_at, last_seen) VALUES (?,?,?,?,?,?,?,?,1,?,?)",
            (fp, incident["rule"], inv.get("file"), inv.get("function"), inv.get("root_cause"),
             patch.get("explanation"), incident["id"], patch["id"], db.now(), db.now()),
        )
        return cur.lastrowid

"""Agent 5 - Learning & Knowledge (governed).

- Records outcome findings ONLY for incidents whose resolution was verified; they start as `proposed`.
- Detects recurring verified patterns and proposes (never applies) playbook versions / autonomy reviews.
- Nothing is published without an authorised human (knowledge:approve). Policies, prompts and safety rules are
  never modified by this agent.
"""
from __future__ import annotations

from .. import db
from . import core, playbooks

REVIEW_AFTER_S = 90 * 24 * 3600
AUTONOMY_REVIEW_MIN = 30  # demo rule from the PRD: eligible for review after 30 verified low-risk successes


def similar(fingerprint: str, category: str) -> list[dict]:
    return db.rows("SELECT id, title, status, confidence FROM knowledge WHERE status IN ('approved','proposed') AND "
                   "(category=? OR body LIKE ?) ORDER BY status='approved' DESC, id DESC LIMIT 5",
                   (category, f"%{fingerprint}%"))


def _add(kind: str, title: str, body: str, *, category: str | None, evidence: dict, confidence: float,
         source_incident: str | None = None, playbook_key: str | None = None) -> int | None:
    if db.one("SELECT id FROM knowledge WHERE title=? AND status IN ('proposed','approved')", (title,)):
        return None
    with db.tx() as c:
        kid = c.execute("INSERT INTO knowledge (kind, category, title, body, evidence, confidence, status, "
                        "source_incident_id, playbook_key, created_by, created_at, updated_at, review_due) VALUES "
                        "(?,?,?,?,?,?,?,?,?,?,?,?,?)", (kind, category, title, body, core.dumps(evidence), confidence,
                                                       "proposed", source_incident, playbook_key, "learning", db.now(),
                                                       db.now(), db.now() + REVIEW_AFTER_S)).lastrowid
    core.publish("knowledge.proposed", f"Learning agent proposed {kind}: {title}", actor="learning", actor_type="agent",
                 incident_id=source_incident, data={"knowledge_id": kid})
    return kid


def record_outcome(inc: dict) -> None:
    if not inc or inc["state"] != "RESOLVED":
        return
    acts = db.rows("SELECT action_type, status, COUNT(*) AS n FROM resolution_actions WHERE incident_id=? OR ticket_id IN "
                   "(SELECT id FROM tickets WHERE incident_id=?) GROUP BY action_type, status", (inc["id"], inc["id"]))
    verified = {a["action_type"]: a["n"] for a in acts if a["status"] == "verified"}
    eng = db.one("SELECT status, outcome FROM engineering_issues WHERE incident_id=?", (inc["id"],))
    body = (f"Fingerprint {inc['fingerprint']}. {inc['affected_tickets']} tickets. Root cause "
            f"({inc['hypothesis_status'] or 'unconfirmed'}): {inc['hypothesis'] or 'n/a'}. Verified actions: "
            f"{verified or 'none'}." + (f" Engineering: {eng['status']} - {eng['outcome']}." if eng else "") +
            f" Time to resolve: {((inc['resolved_at'] or db.now()) - inc['first_seen']) / 60:.0f} min.")
    _add("finding", f"{inc['title']} - resolved ({inc['id']})", body, category=inc["category"],
         evidence={"incident": inc["id"], "verified_actions": verified},
         confidence=0.9 if inc["hypothesis_status"] == "confirmed" else 0.6, source_incident=inc["id"])
    analyse()


def analyse() -> list[int]:
    """Find recurring verified patterns and propose reviewable changes."""
    out = []
    for r in db.rows("SELECT action_type, tier, SUM(status='verified') AS ok, SUM(status IN ('verify_failed','failed')) AS bad"
                     " FROM resolution_actions WHERE tier=2 GROUP BY action_type, tier"):
        if (r["ok"] or 0) >= AUTONOMY_REVIEW_MIN and not r["bad"]:
            kid = _add("playbook_proposal", f"Autonomy review: {r['action_type']}",
                       f"{r['action_type']} has {r['ok']} verified successes and 0 failures as a Tier 2 action. Demo rule: "
                       f"eligible for an autonomy REVIEW (sample size, cohorts and failure severity must be assessed by a "
                       f"human; policy is not changed automatically).", category=None,
                       evidence={"verified": r["ok"], "failed": 0}, confidence=0.7)
            if kid:
                out.append(kid)
    sb = db.one("SELECT SUM(status='verified') AS ok, SUM(status='verify_failed') AS bad FROM resolution_actions "
                "WHERE action_type='device_remote_restart'")
    total = (sb["ok"] or 0) + (sb["bad"] or 0)
    if total >= 20 and (sb["bad"] or 0) / total >= 0.1:
        cur = playbooks.active("SOUNDBOX_BASIC_DIAGNOSTIC")
        tries = int(cur["steps"].get("options", {}).get("restart_attempts", 1))
        if tries < 2 and not db.one("SELECT id FROM playbooks WHERE key='SOUNDBOX_BASIC_DIAGNOSTIC' AND status='proposed'"):
            rationale = (f"{sb['bad']} of {total} remote restarts failed verification and went to replacement (Tier 2). "
                         f"Proposal: one more automatic restart before proposing a replacement.")
            pid = playbooks.propose_version("SOUNDBOX_BASIC_DIAGNOSTIC", {"restart_attempts": 2}, rationale, "learning")
            kid = _add("playbook_proposal", "SOUNDBOX_BASIC_DIAGNOSTIC: retry restart before replacement", rationale,
                       category="SOUNDBOX", evidence={"restarts_verified": sb["ok"], "restarts_failed": sb["bad"],
                                                      "playbook_id": pid}, confidence=0.65,
                       playbook_key="SOUNDBOX_BASIC_DIAGNOSTIC")
            if kid:
                out.append(kid)
    return out


def decide(knowledge_id: int, approve: bool, user, note: str = "") -> dict:
    k = db.one("SELECT * FROM knowledge WHERE id=?", (knowledge_id,))
    if not k:
        raise KeyError("knowledge item not found")
    if k["status"] != "proposed":
        raise ValueError(f"Item is {k['status']}")
    status = "approved" if approve else "rejected"
    with db.tx() as c:
        c.execute("UPDATE knowledge SET status=?, decided_by=?, updated_at=? WHERE id=?",
                  (status, user.username, db.now(), knowledge_id))
    if approve and k["playbook_key"]:
        pid = (core.loads(k["evidence"], {}) or {}).get("playbook_id")
        if pid:
            playbooks.approve_version(pid, user)
    elif not approve and k["playbook_key"]:
        pid = (core.loads(k["evidence"], {}) or {}).get("playbook_id")
        if pid:
            with db.tx() as c:
                c.execute("UPDATE playbooks SET status='rejected' WHERE id=? AND status='proposed'", (pid,))
    core.audit(user.username, f"knowledge.{status}", f"knowledge:{knowledge_id}", {"note": note}, role=user.role)
    core.publish(f"knowledge.{status}", f"{user.display_name} {status} knowledge #{knowledge_id}: {k['title']}",
                 actor=user.username, actor_type="human", data={"knowledge_id": knowledge_id})
    return db.one("SELECT * FROM knowledge WHERE id=?", (knowledge_id,))


def search(q: str, include_proposed: bool = True) -> list[dict]:
    like = f"%{q}%"
    states = ("approved", "proposed") if include_proposed else ("approved",)
    return db.rows(f"SELECT * FROM knowledge WHERE status IN ({','.join('?' * len(states))}) AND (title LIKE ? OR body LIKE ?"
                   f" OR category LIKE ?) ORDER BY status='approved' DESC, id DESC LIMIT 50", (*states, like, like, like))

"""Ticket service: persistence, server-validated state machine, conversation and customer communication."""
from __future__ import annotations

from .. import db
from . import core, i18n, taxonomy, workers

STATES = ["NEW", "INTAKE", "TRIAGED", "CORRELATED", "INVESTIGATING", "RESOLUTION_PROPOSED", "APPROVAL_REQUIRED",
          "EXECUTING", "VERIFYING", "RESOLVED", "NEEDS_CUSTOMER", "WAITING_PARTNER", "ESCALATED", "REJECTED",
          "FAILED", "REOPENED"]

TRANSITIONS: dict[str, set[str]] = {
    "NEW": {"INTAKE", "FAILED", "ESCALATED"},
    "INTAKE": {"TRIAGED", "FAILED", "ESCALATED"},
    "TRIAGED": {"CORRELATED", "ESCALATED", "FAILED"},
    "CORRELATED": {"INVESTIGATING", "ESCALATED", "NEEDS_CUSTOMER", "FAILED"},
    "INVESTIGATING": {"RESOLUTION_PROPOSED", "APPROVAL_REQUIRED", "EXECUTING", "VERIFYING", "NEEDS_CUSTOMER",
                      "WAITING_PARTNER", "ESCALATED", "RESOLVED", "FAILED"},
    "RESOLUTION_PROPOSED": {"APPROVAL_REQUIRED", "EXECUTING", "ESCALATED", "INVESTIGATING"},
    "APPROVAL_REQUIRED": {"EXECUTING", "VERIFYING", "REJECTED", "ESCALATED", "WAITING_PARTNER", "INVESTIGATING", "RESOLVED"},
    "EXECUTING": {"VERIFYING", "FAILED", "ESCALATED", "WAITING_PARTNER", "RESOLVED"},
    "VERIFYING": {"RESOLVED", "ESCALATED", "WAITING_PARTNER", "FAILED", "APPROVAL_REQUIRED"},
    "NEEDS_CUSTOMER": {"INVESTIGATING", "ESCALATED", "INTAKE", "RESOLVED"},
    "WAITING_PARTNER": {"VERIFYING", "RESOLVED", "ESCALATED", "INVESTIGATING"},
    "ESCALATED": {"INVESTIGATING", "RESOLVED", "APPROVAL_REQUIRED", "WAITING_PARTNER"},
    "REJECTED": {"ESCALATED", "INVESTIGATING"},
    "FAILED": {"INVESTIGATING", "ESCALATED"},
    "RESOLVED": {"REOPENED"},
    "REOPENED": {"INVESTIGATING", "ESCALATED", "INTAKE"},
}

STATUS_OF = {"RESOLVED": "resolved", "ESCALATED": "escalated", "NEEDS_CUSTOMER": "pending_customer",
             "WAITING_PARTNER": "pending_partner", "APPROVAL_REQUIRED": "pending_approval", "REJECTED": "escalated",
             "FAILED": "escalated"}


class TransitionError(Exception):
    pass


def get(ticket_id: str) -> dict | None:
    t = db.one("SELECT * FROM tickets WHERE id=?", (ticket_id,))
    if t:
        for k in ("symptoms", "reason_codes", "missing_fields", "extracted"):
            t[k] = core.loads(t[k], [] if k != "extracted" else {})
    return t


def update(ticket_id: str, **fields) -> None:
    fields["updated_at"] = db.now()
    for k in ("symptoms", "reason_codes", "missing_fields", "extracted"):
        if k in fields and not isinstance(fields[k], str):
            fields[k] = core.dumps(fields[k])
    sets = ", ".join(f"{k}=?" for k in fields)
    with db.tx() as c:
        c.execute(f"UPDATE tickets SET {sets} WHERE id=?", (*fields.values(), ticket_id))


def transition(ticket_id: str, to: str, reason: str, actor: str = "orchestrator", force: bool = False) -> bool:
    t = db.one("SELECT state, simulated, incident_id FROM tickets WHERE id=?", (ticket_id,))
    if not t:
        raise KeyError(ticket_id)
    frm = t["state"]
    if frm == to:
        return False
    if not force and to not in TRANSITIONS.get(frm, set()):
        raise TransitionError(f"Invalid ticket transition {frm} → {to}")
    fields = {"state": to, "status": STATUS_OF.get(to, "open")}
    if to == "RESOLVED":
        fields["resolved_at"] = db.now()
    update(ticket_id, **fields)
    with db.tx() as c:
        c.execute("UPDATE workflow_runs SET state=?, updated_at=?, finished_at=? WHERE kind='ticket' AND subject_id=?",
                  (to, db.now(), db.now() if to == "RESOLVED" else None, ticket_id))
    core.publish("ticket.state_changed", f"{ticket_id}: {frm} → {to} ({reason})", actor=actor,
                 actor_type="agent" if actor != "human" else "human", ticket_id=ticket_id, incident_id=t["incident_id"],
                 data={"from": frm, "to": to, "reason": reason}, simulated=bool(t["simulated"]))
    return True


def safe_transition(ticket_id: str, to: str, reason: str, actor: str = "orchestrator") -> bool:
    """Transition when valid; walk through intermediate states for common fast paths."""
    t = db.one("SELECT state FROM tickets WHERE id=?", (ticket_id,))
    if not t or t["state"] == to:
        return False
    if to in TRANSITIONS.get(t["state"], set()):
        return transition(ticket_id, to, reason, actor)
    for mid in ("INVESTIGATING", "VERIFYING", "ESCALATED"):
        if mid in TRANSITIONS.get(t["state"], set()) and to in TRANSITIONS.get(mid, set()):
            transition(ticket_id, mid, reason, actor)
            return transition(ticket_id, to, reason, actor)
    core.publish("ticket.transition_refused", f"{ticket_id}: {t['state']} → {to} not allowed ({reason})",
                 actor=actor, actor_type="agent", level="warn", ticket_id=ticket_id)
    return False


def add_message(ticket_id: str, role: str, author: str, body: str, locale: str | None = None, kind: str = "message",
                meta: dict | None = None) -> int:
    with db.tx() as c:
        cur = c.execute("INSERT INTO ticket_messages (ticket_id, role, author, locale, body, kind, meta, created_at)"
                        " VALUES (?,?,?,?,?,?,?,?)", (ticket_id, role, author, locale, core.mask(body), kind,
                                                       core.dumps(meta), db.now()))
        if role in ("agent", "operator"):
            c.execute("UPDATE tickets SET first_responded_at=COALESCE(first_responded_at, ?) WHERE id=?",
                      (db.now(), ticket_id))
        return cur.lastrowid


def tell(tk: dict, key: str, kind: str = "message", **kw) -> None:
    """Communication agent: localized, template-based (pre-approved wording) customer update."""
    body = i18n.t(key, tk["locale"], **kw)
    add_message(tk["id"], "agent", "fixchain-assistant", body, tk["locale"], kind, {"template": key})
    core.publish("customer.updated", f"Update sent to customer ({tk['locale']}): {key}", actor="communication",
                 actor_type="agent", ticket_id=tk["id"], incident_id=tk.get("incident_id"),
                 data={"template": key}, simulated=bool(tk.get("simulated")))


def broadcast(incident_id: str, key: str, only_states: tuple[str, ...] | None = None, **kw) -> int:
    """Send the same approved update to every linked ticket, each in its own language, in one transaction."""
    rows = db.rows("SELECT t.id, t.locale, t.state, t.simulated FROM tickets t JOIN incident_tickets it ON it.ticket_id=t.id "
                   "WHERE it.incident_id=? AND t.state!='RESOLVED'", (incident_id,))
    rows = [r for r in rows if not only_states or r["state"] in only_states]
    now = db.now()
    with db.tx() as c:
        c.executemany("INSERT INTO ticket_messages (ticket_id, role, author, locale, body, kind, meta, created_at)"
                      " VALUES (?,?,?,?,?,?,?,?)",
                      [(r["id"], "agent", "fixchain-assistant", r["locale"], i18n.t(key, r["locale"], **kw), "broadcast",
                        core.dumps({"template": key, "incident_id": incident_id}), now) for r in rows])
        c.execute(f"UPDATE tickets SET first_responded_at=COALESCE(first_responded_at, ?) WHERE id IN "
                  f"({','.join('?' * len(rows)) or 'NULL'})", (now, *[r["id"] for r in rows]))
    if rows:
        core.publish("customer.broadcast", f"Approved update '{key}' sent to {len(rows)} linked customer(s)",
                     actor="communication", actor_type="agent", incident_id=incident_id,
                     data={"template": key, "recipients": len(rows)}, simulated=bool(rows[0]["simulated"]))
    return len(rows)


def create(text: str, *, customer_type: str, channel: str, locale: str | None, created_by: int | None = None,
           customer_id: int | None = None, merchant_id: int | None = None, context: dict | None = None,
           simulated: bool = False, simulation_run_id: int | None = None, region: str | None = None,
           created_at: float | None = None, enqueue: bool = True) -> dict:
    """Persist the ticket FIRST (so no report is ever lost), then hand it to the agents asynchronously."""
    text = (text or "").strip()
    if not text:
        raise ValueError("Message is required")
    if len(text) > 4000:
        raise ValueError("Message too long (max 4000 characters)")
    secret = core.contains_secret(text)
    now = created_at or db.now()
    loc = locale if locale in i18n.LOCALES else None
    with core.id_lock, db.tx() as c:
        tid = core.next_id("tickets", "TKT")
        c.execute("INSERT INTO tickets (id, customer_id, merchant_id, created_by, customer_type, channel, locale, problem,"
                  " state, status, extracted, region, device_model, simulated, simulation_run_id, created_at, updated_at)"
                  " VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
                  (tid, customer_id, merchant_id, created_by, customer_type, channel, loc or "en", core.mask(text), "NEW",
                   "open", core.dumps({"context": context or {}, "locale_explicit": bool(loc)}), region,
                   (context or {}).get("device_model"), int(simulated), simulation_run_id, now, now))
        c.execute("INSERT INTO ticket_messages (ticket_id, role, author, locale, body, created_at) VALUES (?,?,?,?,?,?)",
                  (tid, "customer", "customer", loc, core.mask(text), now))
        wf = c.execute("INSERT INTO workflow_runs (kind, subject_id, state, started_at, updated_at) VALUES (?,?,?,?,?)",
                       ("ticket", tid, "NEW", now, now)).lastrowid
    core.publish("ticket.created", f"Ticket {tid} created via {channel} ({customer_type})", actor="intake",
                 actor_type="system", ticket_id=tid, workflow_id=wf,
                 data={"channel": channel, "customer_type": customer_type}, simulated=simulated)
    if secret:
        add_message(tid, "agent", "fixchain-assistant", i18n.t("secret_warning", loc or "en"), loc or "en", "safety")
    if enqueue:
        workers.enqueue("understand", "ticket", tid, workflow_id=wf, payload={"simulated": simulated},
                        priority=4 if simulated else 3)
    return get(tid)


def sla_fields(severity: str, created_at: float) -> dict:
    p = taxonomy.SLA_POLICIES[severity]
    return {"sla_policy": f"{severity} demo policy", "first_response_due": created_at + p["first_response_s"],
            "resolution_due": created_at + p["resolution_s"]}

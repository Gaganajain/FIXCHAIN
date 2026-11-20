"""Operational metrics (PRD §13.2), all computed from persisted records - never estimated by a model."""
from __future__ import annotations

import collections
import statistics

from .. import db
from . import workers

BASELINE_MIN_PER_TICKET = 12  # labelled demo assumption for manual handling time - NOT a measured or Paytm figure


def _avg(xs: list[float]) -> float | None:
    xs = [x for x in xs if x is not None and x >= 0]
    return round(statistics.fmean(xs), 1) if xs else None


def _event_deltas(event_type: str) -> list[float]:
    rows = db.rows("SELECT t.created_at, MIN(e.ts) AS ts FROM tickets t JOIN ops_events e ON e.ticket_id=t.id AND e.type=? "
                   "GROUP BY t.id", (event_type,))
    return [r["ts"] - r["created_at"] for r in rows]


def summary(scope: str = "all") -> dict:
    where = {"all": "1=1", "simulated": "simulated=1", "live": "simulated=0"}.get(scope, "1=1")
    t = db.rows(f"SELECT id, state, status, category, severity, created_at, first_responded_at, resolved_at, incident_id, "
                f"first_response_due, resolution_due, customer_id, merchant_id, locale FROM tickets WHERE {where}")
    n = len(t)
    resolved = [x for x in t if x["state"] == "RESOLVED"]
    escalated = [x for x in t if x["state"] in ("ESCALATED", "FAILED", "REJECTED")]
    linked = [x for x in t if x["incident_id"]]
    human_touched = {r["ticket_id"] for r in db.rows("SELECT DISTINCT ticket_id FROM approvals WHERE status IN "
                                                     "('approved','rejected') AND ticket_id IS NOT NULL")}
    human_touched |= {r["ticket_id"] for r in db.rows("SELECT DISTINCT ticket_id FROM ticket_messages WHERE role='operator'")}
    auto = [x for x in resolved if x["id"] not in human_touched]
    eligible = [x for x in t if x["category"] in ("SOUNDBOX", "PAYMENTS_UPI", "MERCHANT_QR", "SETTLEMENT", "PLATFORM_OUTAGE")]
    reopened = db.one("SELECT COUNT(DISTINCT ticket_id) AS n FROM ops_events WHERE type='ticket.reopened'")["n"]
    inc = db.rows(f"SELECT * FROM ops_incidents WHERE {where}")
    acts = db.one("SELECT COUNT(*) AS n, SUM(status IN ('blocked','rejected','verify_failed')) AS bad FROM resolution_actions")
    unauthorized = db.one("SELECT COUNT(*) AS n FROM resolution_actions a WHERE a.tier>=2 AND a.status IN "
                          "('executed','verified','verify_failed') AND NOT EXISTS (SELECT 1 FROM approvals p WHERE "
                          "p.action_id=a.id AND p.status='approved')")["n"]
    pend = db.one("SELECT COUNT(*) AS n FROM approvals WHERE status='pending'")["n"]
    now = db.now()
    with_due = [x for x in t if x["resolution_due"]]
    within = [x for x in with_due if (x["resolved_at"] or now) <= x["resolution_due"]]
    fr = [x for x in t if x["first_response_due"]]
    fr_ok = [x for x in fr if x["first_responded_at"] and x["first_responded_at"] <= x["first_response_due"]]
    mtta = [e["ts"] - i["created_at"] for i in inc for e in db.rows(
        "SELECT MIN(ts) AS ts FROM ops_events WHERE incident_id=? AND type='incident.state_changed'", (i["id"],)) if e["ts"]]
    mttr = [i["resolved_at"] - i["first_seen"] for i in inc if i["resolved_at"]]
    incident_first = [i["created_at"] - i["first_seen"] for i in inc]
    open_inc = [i for i in inc if i["state"] != "RESOLVED"]
    ws = workers.pool().stats()
    active_agents = db.one("SELECT COUNT(DISTINCT agent) AS n FROM agent_tasks WHERE status='running' OR "
                           "(finished_at>=? AND status='succeeded')", (now - 10,))["n"]
    minutes_saved = len(auto) * BASELINE_MIN_PER_TICKET
    return {
        "scope": scope,
        "tickets": n, "open_tickets": n - len(resolved), "resolved": len(resolved), "escalated": len(escalated),
        "open_incidents": len(open_inc), "critical_incidents": sum(1 for i in open_inc if i["severity"] == "SEV-1"),
        "incidents": len(inc),
        "affected_customers": len({x["customer_id"] for x in t if x["customer_id"] and x["state"] != "RESOLVED"}),
        "affected_merchants": len({x["merchant_id"] for x in t if x["merchant_id"] and x["state"] != "RESOLVED"}),
        "resolution_rate": round(100 * len(resolved) / n, 1) if n else None,
        "avg_resolution_s": _avg([x["resolved_at"] - x["created_at"] for x in resolved]),
        "time_to_first_response_s": _avg([x["first_responded_at"] - x["created_at"] for x in t if x["first_responded_at"]]),
        "time_to_triage_s": _avg(_event_deltas("ticket.triaged")),
        "time_to_correlate_s": _avg(incident_first),
        "mtta_s": _avg(mtta), "mttr_s": _avg(mttr),
        "autonomous_resolution_rate": round(100 * len(auto) / len(eligible), 1) if eligible else None,
        "escalation_rate": round(100 * len(escalated) / n, 1) if n else None,
        "reopen_rate": round(100 * reopened / len(resolved), 1) if resolved else None,
        "duplicate_reduction": round(100 * len(linked) / n, 1) if n else None,
        "safety_exception_rate": round(100 * (acts["bad"] or 0) / acts["n"], 1) if acts["n"] else None,
        "unauthorized_consequential_actions": unauthorized,
        "pending_approvals": pend,
        "sla_resolution_on_track": round(100 * len(within) / len(with_due), 1) if with_due else None,
        "sla_first_response_met": round(100 * len(fr_ok) / len(fr), 1) if fr else None,
        "active_agents": active_agents,
        "processing_rate_per_min": ws["tasks_per_min"],
        "workers": ws,
        "by_state": collections.Counter(x["state"] for x in t),
        "by_category": collections.Counter(x["category"] or "UNCLASSIFIED" for x in t),
        "by_severity": collections.Counter(x["severity"] or "-" for x in t),
        "by_locale": collections.Counter(x["locale"] for x in t),
        "roi": {"tickets_grouped": len(linked), "incidents": len(inc), "verified_autonomous": len(auto),
                "routed_for_review": len(escalated) + pend, "minutes_saved_estimate": minutes_saved,
                "baseline_label": f"Assumed demo baseline of {BASELINE_MIN_PER_TICKET} min manual handling per ticket - "
                                  f"not a measured or Paytm figure",
                "unauthorized_financial_actions": unauthorized},
    }


def series(minutes: int = 30, bucket_s: int = 30) -> list[dict]:
    start = db.now() - minutes * 60
    rows = db.rows("SELECT created_at, category, state, resolved_at FROM tickets WHERE created_at>=? OR resolved_at>=?",
                   (start, start))
    out = []
    for b in range(int(minutes * 60 / bucket_s)):
        lo, hi = start + b * bucket_s, start + (b + 1) * bucket_s
        created = [r for r in rows if lo <= r["created_at"] < hi]
        out.append({"t": hi, "created": len(created), "resolved": sum(1 for r in rows if r["resolved_at"] and lo <= r["resolved_at"] < hi),
                    **{c: sum(1 for r in created if r["category"] == c) for c in
                       ("PAYMENTS_UPI", "SOUNDBOX", "MERCHANT_QR", "SETTLEMENT", "PLATFORM_OUTAGE", "FRAUD_SECURITY")}})
    return out


def agent_board() -> list[dict]:
    from . import AGENTS
    now = db.now()
    out = []
    for a in AGENTS:
        running = db.rows("SELECT id, task_type, subject_id, started_at, worker FROM agent_tasks WHERE agent=? AND "
                          "status='running' ORDER BY started_at", (a["id"],))
        stats = db.one("SELECT COUNT(*) AS n, SUM(status='succeeded') AS ok, SUM(status='dead') AS dead, "
                       "SUM(status='retrying') AS retrying, SUM(status IN ('queued','retrying')) AS queued, "
                       "AVG(CASE WHEN status='succeeded' THEN duration_ms END) AS avg_ms, MAX(finished_at) AS last "
                       "FROM agent_tasks WHERE agent=?", (a["id"],))
        last = db.one("SELECT message, ts, level FROM ops_events WHERE actor_id=? ORDER BY id DESC LIMIT 1", (a["id"],))
        waiting = db.one("SELECT COUNT(*) AS n FROM approvals WHERE status='pending' AND requested_by=?", (a["id"],))["n"]
        if running:
            state = "working"
        elif stats["retrying"]:
            state = "retrying"
        elif waiting and a["id"] in ("resolution", "investigation"):
            state = "waiting"
        elif stats["dead"] and stats["last"] and now - stats["last"] < 60:
            state = "failed"
        elif stats["last"] and now - stats["last"] < 4:
            state = "completed"
        else:
            state = "idle"
        out.append({**a, "state": state, "running": running[:5], "running_count": len(running),
                    "tasks_total": stats["n"], "succeeded": stats["ok"] or 0, "dead": stats["dead"] or 0,
                    "queued": stats["queued"] or 0, "avg_ms": round(stats["avg_ms"] or 0), "waiting_approvals": waiting,
                    "last_event": last})
    return out

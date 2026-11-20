"""FIXCHAIN operations API - /api/v1. Every route is authenticated and permission-checked server-side."""
from __future__ import annotations

import asyncio
import json
from typing import Literal

from fastapi import APIRouter, Depends, File, Form, Header, HTTPException, Query, Request, UploadFile
from fastapi.responses import PlainTextResponse, Response, StreamingResponse
from pydantic import BaseModel, Field

from .. import config, db, orchestrator
from . import (actions, analytics, auth, core, i18n, incidents, knowledge, pipeline, playbooks, schema, simulation,
               taxonomy, tickets, vision, voice, workers)
from . import AGENTS
from .auth import User, require

router = APIRouter(prefix="/api/v1")


def _err(fn, *a, **kw):
    try:
        return fn(*a, **kw)
    except KeyError as e:
        raise HTTPException(404, str(e).strip("'"))
    except PermissionError as e:
        raise HTTPException(403, str(e))
    except (ValueError, RuntimeError, actions.ActionError, tickets.TransitionError) as e:
        raise HTTPException(409, str(e))


# ------------------------------------------------------------------ auth
class LoginIn(BaseModel):
    username: str = Field(min_length=1, max_length=60)
    password: str | None = Field(None, max_length=200)


@router.post("/auth/login", dependencies=[Depends(auth.rate_limit("login", 20))])
def login(body: LoginIn):
    token, user = auth.login(body.username.strip(), body.password)
    return {"token": token, "user": user.public()}


@router.post("/auth/demo-login", dependencies=[Depends(auth.rate_limit("login", 40))])
def demo_login(body: LoginIn):
    token, user = auth.login(body.username.strip(), None)
    return {"token": token, "user": user.public(), "notice": "Demo sign-in - not production authentication"}


@router.get("/auth/demo-users")
def demo_users():
    if not auth.DEMO_MODE:
        return []
    return db.rows("SELECT username, display_name, role, locale FROM users WHERE demo=1 ORDER BY id")


@router.get("/auth/me")
def me(user: User = Depends(auth.current_user)):
    return user.public()


@router.post("/auth/logout")
def logout(authorization: str = Header("")):
    if authorization.lower().startswith("bearer "):
        auth.revoke(authorization[7:].strip())
    return {"ok": True}


# ------------------------------------------------------------------ system
@router.get("/system")
def system():
    return {"mode": "demo" if auth.DEMO_MODE else "production", "agent_mode": config.agent_mode(),
            "llm": config.llm_label() if config.agent_mode() == "llm" else "offline deterministic",
            "voice": voice.info(), "vision": {"provider": "claude" if config.llm_provider() == "anthropic" else "offline heuristic"},
            "workers": workers.pool().stats(), "schema_version": schema.current_version(),
            "locales": i18n.LOCALES, "agents": AGENTS,
            "labels": {"connectors": "Mock connectors - no real bank, NPCI, payment or device system is contacted",
                       "workers": workers.pool().stats()["label"], "sla": "Demo SLA targets - not regulatory deadlines"}}


# ------------------------------------------------------------------ tickets
class TicketIn(BaseModel):
    message: str = Field(min_length=2, max_length=4000)
    locale: Literal["en", "hi", "mr"] | None = None
    channel: Literal["web_chat", "voice", "phone", "email", "operator"] = "web_chat"
    customer_type: Literal["consumer", "merchant"] | None = None
    context: dict | None = None


def _ticket_visible(t: dict, user: User) -> bool:
    if user.can("ticket:read"):
        return True
    return bool(t) and t["created_by"] == user.id


@router.post("/tickets", status_code=201, dependencies=[Depends(auth.rate_limit("tickets", 30))])
def create_ticket(body: TicketIn, user: User = Depends(require("ticket:create"))):
    is_customer = user.role in ("customer", "merchant")
    ctype = "merchant" if user.role == "merchant" else "consumer" if is_customer else (body.customer_type or "consumer")
    ctx = {k: v for k, v in (body.context or {}).items() if k in ("device_type", "device_model", "screen")}
    t = _err(tickets.create, body.message, customer_type=ctype, channel=body.channel, locale=body.locale or user.locale,
             created_by=user.id, customer_id=user.customer_id, merchant_id=user.merchant_id, context=ctx)
    core.audit(user.username, "ticket.created", t["id"], {"channel": body.channel}, role=user.role)
    return t


@router.get("/tickets")
def list_tickets(user: User = Depends(auth.current_user), q: str | None = None, state: str | None = None,
                 category: str | None = None, severity: str | None = None, incident_id: str | None = None,
                 scope: Literal["all", "simulated", "live"] = "all", limit: int = Query(50, le=500), offset: int = 0):
    where, args = [], []
    if not user.can("ticket:read"):
        where.append("created_by=?")
        args.append(user.id)
    for col, val in (("state", state), ("category", category), ("severity", severity), ("incident_id", incident_id)):
        if val:
            where.append(f"{col}=?")
            args.append(val)
    if scope != "all":
        where.append("simulated=?")
        args.append(1 if scope == "simulated" else 0)
    if q:
        where.append("(id LIKE ? OR title LIKE ? OR problem LIKE ? OR txn_ref LIKE ?)")
        args += [f"%{q}%"] * 4
    w = " WHERE " + " AND ".join(where) if where else ""
    total = db.one(f"SELECT COUNT(*) AS n FROM tickets{w}", args)["n"]
    rows = db.rows(f"SELECT id, title, problem, category, subcategory, severity, priority, state, status, locale, channel,"
                   f" customer_type, incident_id, amount, txn_ref, region, confidence, simulated, created_at, updated_at,"
                   f" resolution_due, resolved_at FROM tickets{w} ORDER BY created_at DESC LIMIT ? OFFSET ?",
                   (*args, limit, offset))
    return {"total": total, "items": rows}


@router.get("/tickets/{ticket_id}")
def ticket_detail(ticket_id: str, user: User = Depends(auth.current_user)):
    t = tickets.get(ticket_id)
    if not t or not _ticket_visible(t, user):
        raise HTTPException(404, "ticket not found")
    msgs = db.rows("SELECT * FROM ticket_messages WHERE ticket_id=? ORDER BY id", (ticket_id,))
    out = {"ticket": t, "messages": msgs}
    if user.can("ticket:read"):
        out.update(
            events=db.rows("SELECT * FROM ops_events WHERE ticket_id=? ORDER BY id", (ticket_id,)),
            actions=[actions.get(a["id"]) for a in db.rows("SELECT id FROM resolution_actions WHERE ticket_id=? ORDER BY id",
                                                             (ticket_id,))],
            approvals=db.rows("SELECT * FROM approvals WHERE ticket_id=? ORDER BY id", (ticket_id,)),
            evidence=db.rows("SELECT * FROM evidence WHERE ticket_id=? ORDER BY id", (ticket_id,)),
            verifications=db.rows("SELECT * FROM verifications WHERE ticket_id=? ORDER BY id", (ticket_id,)),
            tasks=db.rows("SELECT id, agent, task_type, status, attempts, duration_ms, error, queued_at, started_at, "
                          "finished_at FROM agent_tasks WHERE subject_kind='ticket' AND subject_id=? ORDER BY id", (ticket_id,)),
            incident=db.one("SELECT id, title, severity, state, affected_tickets FROM ops_incidents WHERE id=?",
                            (t["incident_id"],)) if t["incident_id"] else None)
    else:  # customers see their conversation and a plain status, never internal traces
        out["ticket"] = {k: t[k] for k in ("id", "title", "state", "status", "locale", "created_at", "updated_at",
                                           "category", "subcategory", "incident_id", "resolution_summary")}
    return out


class MessageIn(BaseModel):
    message: str = Field(min_length=1, max_length=4000)


@router.post("/tickets/{ticket_id}/messages")
def post_message(ticket_id: str, body: MessageIn, user: User = Depends(auth.current_user)):
    t = tickets.get(ticket_id)
    if not t or not _ticket_visible(t, user):
        raise HTTPException(404, "ticket not found")
    if user.role in ("customer", "merchant"):
        return _err(pipeline.customer_reply, ticket_id, body.message, user.display_name)
    if not user.can("ticket:reply"):
        raise HTTPException(403, "Your role cannot reply to customers")
    tickets.add_message(ticket_id, "operator", user.display_name, body.message, t["locale"])
    core.audit(user.username, "ticket.operator_reply", ticket_id, role=user.role)
    core.publish("ticket.operator_reply", f"{user.display_name} replied on {ticket_id}", actor=user.username,
                 actor_type="human", ticket_id=ticket_id)
    return tickets.get(ticket_id)


class ResolveIn(BaseModel):
    note: str = Field(min_length=5, max_length=500)


@router.post("/tickets/{ticket_id}/resolve")
def operator_resolve(ticket_id: str, body: ResolveIn, user: User = Depends(require("ticket:reply"))):
    """Explicit human confirmation is a valid verification source (recorded with name and reason)."""
    t = tickets.get(ticket_id)
    if not t:
        raise HTTPException(404, "ticket not found")
    if t["category"] == "FRAUD_SECURITY" and not user.can("approval:decide"):
        raise HTTPException(403, "Fraud cases can only be closed by an authorised approver")
    _err(pipeline.resolve, ticket_id, body.note, f"human confirmation by {user.username}", "human")
    core.audit(user.username, "ticket.resolved_by_human", ticket_id, {"note": body.note}, role=user.role)
    return tickets.get(ticket_id)


@router.post("/tickets/{ticket_id}/escalate")
def operator_escalate(ticket_id: str, body: ResolveIn, user: User = Depends(require("ticket:reply"))):
    t = tickets.get(ticket_id)
    if not t:
        raise HTTPException(404, "ticket not found")
    pipeline.escalate(t, f"Escalated by {user.display_name}: {body.note}")
    core.audit(user.username, "ticket.escalated", ticket_id, {"note": body.note}, role=user.role)
    return tickets.get(ticket_id)


# ------------------------------------------------------------------ incidents & intelligence
@router.get("/incidents")
def list_incidents(user: User = Depends(require("incident:read")), state: str | None = None,
                   scope: Literal["all", "simulated", "live"] = "all"):
    where, args = [], []
    if state == "open":
        where.append("state!='RESOLVED'")
    elif state:
        where.append("state=?")
        args.append(state)
    if scope != "all":
        where.append("simulated=?")
        args.append(1 if scope == "simulated" else 0)
    w = " WHERE " + " AND ".join(where) if where else ""
    rows = db.rows(f"SELECT * FROM ops_incidents{w} ORDER BY CASE severity WHEN 'SEV-1' THEN 1 WHEN 'SEV-2' THEN 2 "
                   f"WHEN 'SEV-3' THEN 3 ELSE 4 END, last_seen DESC", args)
    for r in rows:
        r["regions"] = core.loads(r["regions"], [])
        r["resolved_tickets"] = db.one("SELECT COUNT(*) AS n FROM tickets WHERE incident_id=? AND state='RESOLVED'",
                                       (r["id"],))["n"]
        r["pending_approvals"] = db.one("SELECT COUNT(*) AS n FROM approvals WHERE status='pending' AND (incident_id=? OR "
                                        "ticket_id IN (SELECT id FROM tickets WHERE incident_id=?))", (r["id"], r["id"]))["n"]
    return rows


@router.get("/incidents/{incident_id}")
def incident_detail(incident_id: str, user: User = Depends(require("incident:read"))):
    b = _err(incidents.brief, incident_id)
    states = db.rows("SELECT state, COUNT(*) AS n FROM tickets WHERE incident_id=? GROUP BY state", (incident_id,))
    growth = db.rows("SELECT CAST((created_at - (SELECT MIN(created_at) FROM tickets WHERE incident_id=?)) / 5 AS INT) * 5 "
                     "AS t, COUNT(*) AS n FROM tickets WHERE incident_id=? GROUP BY 1 ORDER BY 1", (incident_id, incident_id))
    return {**b, "ticket_states": states, "growth": growth,
            "tickets": db.rows("SELECT id, title, state, locale, region, severity, created_at FROM tickets WHERE incident_id=? "
                               "ORDER BY created_at DESC LIMIT 100", (incident_id,)),
            "regions": db.rows("SELECT region, COUNT(*) AS n FROM tickets WHERE incident_id=? GROUP BY region ORDER BY n DESC",
                               (incident_id,)),
            "languages": db.rows("SELECT locale, COUNT(*) AS n FROM tickets WHERE incident_id=? GROUP BY locale", (incident_id,)),
            "timeline": db.rows("SELECT id, ts, type, level, actor_id, message FROM ops_events WHERE incident_id=? AND type NOT "
                                "LIKE 'agent.task.%' ORDER BY id DESC LIMIT 200", (incident_id,)),
            "actions": db.rows("SELECT action_type, tier, status, COUNT(*) AS n FROM resolution_actions WHERE incident_id=? OR "
                               "ticket_id IN (SELECT id FROM tickets WHERE incident_id=?) GROUP BY action_type, tier, status",
                               (incident_id, incident_id))}


@router.get("/incidents/{incident_id}/report", response_class=PlainTextResponse)
def incident_report(incident_id: str, user: User = Depends(require("incident:read"))):
    md = _err(incidents.report, incident_id)
    core.audit(user.username, "report.exported", incident_id, role=user.role)
    return md


class StatusUpdateIn(BaseModel):
    template: Literal["linked_incident", "outage", "checking"] = "checking"


@router.post("/incidents/{incident_id}/status-update")
def incident_status_update(incident_id: str, body: StatusUpdateIn, user: User = Depends(require("incident:manage"))):
    if not incidents.get(incident_id):
        raise HTTPException(404, "incident not found")
    n = tickets.broadcast(incident_id, body.template, incident=incident_id)
    core.audit(user.username, "incident.status_update", incident_id, {"template": body.template, "recipients": n},
               role=user.role)
    return {"recipients": n}


@router.post("/incidents/{incident_id}/investigate")
def reinvestigate(incident_id: str, user: User = Depends(require("incident:manage"))):
    if not incidents.get(incident_id):
        raise HTTPException(404, "incident not found")
    n = db.one("SELECT COUNT(*) AS n FROM agent_tasks WHERE task_type='investigate_incident' AND subject_id=?", (incident_id,))["n"]
    workers.enqueue("investigate_incident", "incident", incident_id, key=f"investigate_incident:incident:{incident_id}:{n}",
                    payload={}, priority=1)
    core.audit(user.username, "incident.reinvestigate", incident_id, role=user.role)
    return {"queued": True}


@router.get("/intelligence")
def intelligence(user: User = Depends(require("incident:read"))):
    now = db.now()
    clusters = db.rows("SELECT fingerprint, category, COUNT(*) AS tickets, SUM(incident_id IS NULL) AS unlinked, "
                       "MIN(created_at) AS first, MAX(created_at) AS last FROM tickets WHERE created_at>=? AND fingerprint IS "
                       "NOT NULL GROUP BY fingerprint ORDER BY tickets DESC LIMIT 20", (now - 3 * 3600,))
    recent = db.rows("SELECT fingerprint, COUNT(*) AS n FROM tickets WHERE created_at>=? AND fingerprint IS NOT NULL "
                     "GROUP BY fingerprint", (now - 300,))
    base = {r["fingerprint"]: r["n"] for r in db.rows("SELECT fingerprint, COUNT(*) AS n FROM tickets WHERE created_at "
                                                       "BETWEEN ? AND ? GROUP BY fingerprint", (now - 3600, now - 300))}
    bursts = [{"fingerprint": r["fingerprint"], "last_5m": r["n"], "baseline_per_5m": round(base.get(r["fingerprint"], 0) / 11, 2),
               "spike": r["n"] >= 5 and r["n"] > 3 * (base.get(r["fingerprint"], 0) / 11 + 0.5)} for r in recent]
    review = db.rows("SELECT id, title, category, json_extract(extracted,'$.correlation_review') AS review FROM tickets "
                     "WHERE json_extract(extracted,'$.correlation_review') IS NOT NULL ORDER BY created_at DESC LIMIT 30")
    for r in review:
        r["review"] = core.loads(r["review"], {})
    regions = db.rows("SELECT region, category, COUNT(*) AS n FROM tickets WHERE created_at>=? AND region IS NOT NULL "
                      "GROUP BY region, category ORDER BY n DESC", (now - 3 * 3600,))
    return {"clusters": clusters, "bursts": sorted(bursts, key=lambda b: -b["last_5m"]), "review_queue": review,
            "regions": regions, "thresholds": {"attach": 0.70, "review": 0.50, "burst_min": 3}}


# ------------------------------------------------------------------ approvals & actions
@router.get("/approvals")
def list_approvals(user: User = Depends(require("approval:read")), status: str = "pending", limit: int = Query(200, le=1000)):
    actions.expire_stale()
    rows = db.rows("SELECT a.*, t.locale, t.title AS ticket_title, i.title AS incident_title, i.severity AS incident_severity"
                   " FROM approvals a LEFT JOIN tickets t ON t.id=a.ticket_id LEFT JOIN ops_incidents i ON "
                   "i.id=COALESCE(a.incident_id, t.incident_id) WHERE (?='all' OR a.status=?) ORDER BY a.tier DESC, a.id "
                   "LIMIT ?", (status, status, limit))
    for r in rows:
        r["payload"] = core.loads(r["payload"], {})
        r["can_decide"] = bool(user.can("approval:decide") and actions.policy.can_decide(user.role, r["required_role"]))
    return rows


class DecisionIn(BaseModel):
    note: str = Field("", max_length=500)


@router.post("/approvals/{approval_id}/approve")
def approve(approval_id: int, body: DecisionIn, user: User = Depends(require("approval:decide"))):
    return _err(actions.decide, approval_id, True, user, body.note)


@router.post("/approvals/{approval_id}/reject")
def reject(approval_id: int, body: DecisionIn, user: User = Depends(require("approval:decide"))):
    return _err(actions.decide, approval_id, False, user, body.note)


class BulkIn(BaseModel):
    action_type: str
    incident_id: str
    approve: bool
    note: str = Field("", max_length=500)


@router.post("/approvals/bulk")
def bulk(body: BulkIn, user: User = Depends(require("approval:decide"))):
    """Decide every pending approval of one action type in one incident. Each approval is still checked and
    audited individually (payload hash, role, expiry)."""
    ids = [r["id"] for r in db.rows("SELECT a.id FROM approvals a LEFT JOIN tickets t ON t.id=a.ticket_id WHERE a.status="
                                    "'pending' AND a.action_type=? AND (a.incident_id=? OR t.incident_id=?)",
                                    (body.action_type, body.incident_id, body.incident_id))]
    done, errors = 0, []
    for i in ids:
        try:
            actions.decide(i, body.approve, user, body.note or f"bulk decision for {body.incident_id}")
            done += 1
        except (actions.ActionError, PermissionError) as e:
            errors.append({"approval_id": i, "error": str(e)})
    return {"decided": done, "errors": errors}


@router.get("/actions")
def list_actions(user: User = Depends(require("ticket:read")), ticket_id: str | None = None, incident_id: str | None = None,
                 limit: int = Query(200, le=1000)):
    rows = db.rows("SELECT * FROM resolution_actions WHERE (? IS NULL OR ticket_id=?) AND (? IS NULL OR incident_id=?) "
                   "ORDER BY id DESC LIMIT ?", (ticket_id, ticket_id, incident_id, incident_id, limit))
    for r in rows:
        r["params"] = core.loads(r["params"], {})
        r["result"] = core.loads(r["result"])
    return rows


# ------------------------------------------------------------------ agents & events
@router.get("/agents")
def agents(user: User = Depends(require("agent:read"))):
    return {"agents": analytics.agent_board(), "workers": workers.pool().stats(),
            "handoffs": db.rows("SELECT * FROM agent_handoffs ORDER BY id DESC LIMIT 40")}


@router.get("/agents/tasks")
def agent_tasks(user: User = Depends(require("agent:read")), agent: str | None = None, status: str | None = None,
                limit: int = Query(100, le=500)):
    return db.rows("SELECT id, agent, task_type, subject_kind, subject_id, status, attempts, max_attempts, worker, error, "
                   "queued_at, started_at, finished_at, duration_ms FROM agent_tasks WHERE (? IS NULL OR agent=?) AND "
                   "(? IS NULL OR status=?) ORDER BY id DESC LIMIT ?", (agent, agent, status, status, limit))


@router.post("/agents/tasks/{task_id}/retry")
def retry_task(task_id: int, user: User = Depends(require("incident:manage"))):
    t = db.one("SELECT * FROM agent_tasks WHERE id=?", (task_id,))
    if not t or t["status"] != "dead":
        raise HTTPException(409, "Only dead-lettered tasks can be retried")
    with db.tx() as c:
        c.execute("UPDATE agent_tasks SET status='retrying', attempts=0, not_before=?, error=NULL WHERE id=?", (db.now(), task_id))
    core.audit(user.username, "task.retry", f"task:{task_id}", role=user.role)
    workers.pool().kick()
    return {"ok": True}


def _event_rows(after: int, limit: int, ticket_id: str | None, incident_id: str | None, user: User) -> list[dict]:
    rows = db.rows("SELECT * FROM ops_events WHERE id>? AND (? IS NULL OR ticket_id=?) AND (? IS NULL OR incident_id=?) "
                   "ORDER BY id LIMIT ?", (after, ticket_id, ticket_id, incident_id, incident_id, limit))
    if not user.can("ticket:read"):  # customers only see their own tickets' customer-safe events
        own = {r["id"] for r in db.rows("SELECT id FROM tickets WHERE created_by=?", (user.id,))}
        rows = [r for r in rows if r["ticket_id"] in own and r["type"] in ("ticket.state_changed", "customer.updated",
                                                                            "customer.broadcast", "ticket.created")]
    for r in rows:
        r["data"] = core.loads(r["data"])
    return rows


@router.get("/events")
def events(user: User = Depends(auth.current_user), after: int = 0, ticket_id: str | None = None,
           incident_id: str | None = None, limit: int = Query(200, le=1000), tail: bool = False):
    if tail and not after:
        last = db.one("SELECT MAX(id) AS m FROM ops_events")["m"] or 0
        after = max(0, last - limit)
    return _event_rows(after, limit, ticket_id, incident_id, user)


@router.get("/events/stream")
async def stream(request: Request, user: User = Depends(auth.current_user), after: int | None = None,
                 last_event_id: str | None = Header(None)):
    """Server-Sent Events from the persisted event log. Reconnects resume from Last-Event-ID - nothing is lost."""
    start = int(last_event_id) if (last_event_id or "").isdigit() else after
    if start is None:
        start = (db.one("SELECT MAX(id) AS m FROM ops_events")["m"] or 0)

    async def gen():
        cursor, idle = start, 0.0
        yield "retry: 2000\n\n"
        while not await request.is_disconnected():
            rows = await asyncio.to_thread(_event_rows, cursor, 300, None, None, user)
            for r in rows:
                cursor = r["id"]
                yield f"id: {r['id']}\nevent: ops\ndata: {json.dumps(r, default=str, ensure_ascii=False)}\n\n"
            idle = 0.0 if rows else idle + 0.5
            if idle >= 15:
                yield ": keep-alive\n\n"
                idle = 0.0
            await asyncio.sleep(0.5)

    return StreamingResponse(gen(), media_type="text/event-stream",
                             headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})


# ------------------------------------------------------------------ engineering remediation
@router.get("/engineering")
def engineering(user: User = Depends(require("engineering:read"))):
    incidents.sync_engineering()
    issues = db.rows("SELECT e.*, i.title AS incident_title, i.severity, i.affected_tickets FROM engineering_issues e "
                     "JOIN ops_incidents i ON i.id=e.incident_id ORDER BY e.created_at DESC")
    for i in issues:
        i["evidence"] = core.loads(i["evidence"], [])
        i["run"] = db.one("SELECT id, state, agent_label, started_at, finished_at, error FROM runs WHERE id=?", (i["run_id"],)) \
            if i["run_id"] else None
    return {"issues": issues, "active_run": orchestrator.active_run(),
            "engineering_incidents": db.rows("SELECT id, title, severity, status, category, occurrences FROM incidents "
                                             "ORDER BY id DESC LIMIT 20")}


class EngDecisionIn(BaseModel):
    patch_id: int
    note: str = Field("", max_length=500)


@router.post("/engineering/{issue_id}/approve")
def engineering_approve(issue_id: str, body: EngDecisionIn, user: User = Depends(require("engineering:approve"))):
    issue = db.one("SELECT * FROM engineering_issues WHERE id=?", (issue_id,))
    if not issue:
        raise HTTPException(404, "issue not found")
    r = _err(orchestrator.approve, body.patch_id, body.note, user.username)
    core.audit(user.username, "engineering.patch_approved", issue_id, {"patch_id": body.patch_id, **r}, role=user.role)
    incidents.sync_engineering()
    return r


@router.post("/engineering/{issue_id}/reject")
def engineering_reject(issue_id: str, body: EngDecisionIn, user: User = Depends(require("engineering:approve"))):
    if not db.one("SELECT id FROM engineering_issues WHERE id=?", (issue_id,)):
        raise HTTPException(404, "issue not found")
    _err(orchestrator.reject, body.patch_id, body.note, user.username)
    core.audit(user.username, "engineering.patch_rejected", issue_id, {"patch_id": body.patch_id}, role=user.role)
    incidents.sync_engineering()
    return {"ok": True}


# ------------------------------------------------------------------ knowledge & playbooks
@router.get("/knowledge")
def knowledge_list(user: User = Depends(require("knowledge:read")), q: str = "", status: str | None = None):
    rows = knowledge.search(q) if q else db.rows("SELECT * FROM knowledge WHERE (? IS NULL OR status=?) ORDER BY "
                                                  "status='proposed' DESC, id DESC LIMIT 100", (status, status))
    now = db.now()
    for r in rows:
        r["evidence"] = core.loads(r["evidence"], {})
        r["review_overdue"] = bool(r.get("review_due") and r["review_due"] < now and r["status"] == "approved")
    return rows


@router.post("/knowledge/{kid}/approve")
def knowledge_approve(kid: int, body: DecisionIn, user: User = Depends(require("knowledge:approve"))):
    return _err(knowledge.decide, kid, True, user, body.note)


@router.post("/knowledge/{kid}/reject")
def knowledge_reject(kid: int, body: DecisionIn, user: User = Depends(require("knowledge:approve"))):
    return _err(knowledge.decide, kid, False, user, body.note)


@router.post("/knowledge/analyse")
def knowledge_analyse(user: User = Depends(require("knowledge:propose"))):
    return {"proposed": knowledge.analyse()}


@router.get("/playbooks")
def playbook_list(user: User = Depends(require("knowledge:read"))):
    rows = db.rows("SELECT * FROM playbooks ORDER BY key, version DESC")
    for r in rows:
        r["steps"] = core.loads(r["steps"], {})
    return rows


# ------------------------------------------------------------------ simulation
class SimIn(BaseModel):
    scenario: Literal["A", "B", "C", "D", "E"]
    size: Literal[50, 100, 300] = 100
    seed: int = Field(42, ge=0, le=10_000_000)
    speed: float = Field(15.0, ge=1, le=100)


@router.get("/simulation")
def sim_status(user: User = Depends(auth.current_user)):
    return simulation.status()


@router.post("/simulation/start")
def sim_start(body: SimIn, user: User = Depends(require("simulation:run"))):
    r = _err(simulation.start, body.scenario, body.size, body.seed, body.speed, user.username)
    core.audit(user.username, "simulation.start", f"run:{r['id']}", body.model_dump(), role=user.role)
    return r


class PauseIn(BaseModel):
    paused: bool


@router.post("/simulation/pause")
def sim_pause(body: PauseIn, user: User = Depends(require("simulation:run"))):
    return simulation.pause(body.paused)


@router.post("/simulation/reset")
def sim_reset(user: User = Depends(require("simulation:run"))):
    return _err(simulation.reset, user.username)


# ------------------------------------------------------------------ analytics
@router.get("/analytics/summary")
def analytics_summary(user: User = Depends(require("analytics:read")), scope: Literal["all", "simulated", "live"] = "all"):
    return analytics.summary(scope)


@router.get("/analytics/series")
def analytics_series(user: User = Depends(require("analytics:read")), minutes: int = Query(30, le=24 * 60),
                     bucket_s: int = Query(30, ge=5, le=3600)):
    return analytics.series(minutes, bucket_s)


# ------------------------------------------------------------------ voice & vision
@router.get("/voice")
def voice_info():
    return voice.info()


@router.post("/voice/transcribe", dependencies=[Depends(auth.rate_limit("voice", 30))])
async def voice_transcribe(audio: UploadFile = File(...), locale: str | None = Form(None),
                           user: User = Depends(auth.current_user)):
    data = await audio.read()
    try:
        return await asyncio.to_thread(voice.transcribe, data, audio.filename or "audio.webm",
                                       audio.content_type or "audio/webm", locale)
    except voice.VoiceUnavailable as e:
        raise HTTPException(503, {"error": str(e), "fallback": "text"})
    except ValueError as e:
        raise HTTPException(413, str(e))


class SpeakIn(BaseModel):
    text: str = Field(min_length=1, max_length=1500)
    locale: Literal["en", "hi", "mr"] = "en"


@router.post("/voice/speak", dependencies=[Depends(auth.rate_limit("voice", 30))])
async def voice_speak(body: SpeakIn, user: User = Depends(auth.current_user)):
    try:
        return await asyncio.to_thread(voice.speak, body.text, body.locale)
    except voice.VoiceUnavailable as e:
        raise HTTPException(503, {"error": str(e), "fallback": "text"})


@router.post("/vision/diagnose", dependencies=[Depends(auth.rate_limit("vision", 20))])
async def vision_diagnose(image: UploadFile = File(...), ticket_id: str | None = Form(None),
                          user: User = Depends(auth.current_user)):
    data = await image.read()
    try:
        r = await asyncio.to_thread(vision.classify, data, image.content_type or "")
    except ValueError as e:
        raise HTTPException(422, str(e))
    except Exception:  # noqa: BLE001 - corrupt image etc.
        raise HTTPException(422, "Could not read that image")
    locale = user.locale
    if ticket_id:
        t = tickets.get(ticket_id)
        if not t or not _ticket_visible(t, user):
            raise HTTPException(404, "ticket not found")
        locale = t["locale"]
        pipeline.evidence("observation", f"Image diagnosis: {r['label']} (confidence {r['confidence']:.2f}, {r['method']})",
                          "vision", "customer_agent", ticket_id=ticket_id, incident_id=t["incident_id"],
                          data={k: r[k] for k in ("state", "confidence", "method", "sha256")})
        tickets.add_message(ticket_id, "agent", "fixchain-assistant", i18n.t(r["guidance_key"], locale), locale, "vision",
                            {"state": r["state"], "confidence": r["confidence"]})
        core.publish("vision.diagnosed", f"{ticket_id}: image → {r['state']} ({r['confidence']:.2f})", actor="customer_agent",
                     actor_type="agent", ticket_id=ticket_id, data={"state": r["state"], "confidence": r["confidence"]})
        if r["escalate"] and t["state"] not in ("RESOLVED", "ESCALATED"):
            pipeline.escalate(tickets.get(ticket_id), "Image inconclusive (UNKNOWN) - human review", tell=False)
    r["guidance"] = i18n.t(r["guidance_key"], locale)
    return r


@router.get("/vision/samples/{state}.png")
def vision_sample(state: Literal["NORMAL", "LOW_BATTERY", "NETWORK_PROBLEM", "BLANK"]):
    return Response(vision.sample_png(state), media_type="image/png", headers={"Cache-Control": "public, max-age=3600"})


# ------------------------------------------------------------------ settings & audit
@router.get("/settings")
def settings(user: User = Depends(auth.current_user)):
    return {"autonomy_enabled": actions.policy.autonomy_enabled(), "policy_catalog": {
        k: {"tier": v[0], "approver": v[1], "reversible": v[2], "description": v[3]} for k, v in actions.policy.CATALOG.items()},
        "demo_mode": auth.DEMO_MODE, "workers": {"min": workers.MIN_WORKERS, "max": workers.MAX_WORKERS},
        "sla_policies": taxonomy.SLA_POLICIES,
        "sla_label": "Demo SLA targets (configurable) - not regulatory or network deadlines",
        "llm": config.llm_label() if config.agent_mode() == "llm" else "offline deterministic"}


class AutonomyIn(BaseModel):
    enabled: bool


@router.post("/settings/autonomy")
def set_autonomy(body: AutonomyIn, user: User = Depends(require("admin"))):
    from .connectors import world_put
    world_put("config", "autonomy", {"enabled": body.enabled})
    core.audit(user.username, "settings.autonomy", "policy", {"enabled": body.enabled}, role=user.role)
    core.publish("settings.changed", f"{user.display_name} {'enabled' if body.enabled else 'disabled'} autonomous Tier 1 "
                 f"write actions", actor=user.username, actor_type="human", level="warn")
    return {"autonomy_enabled": body.enabled}


@router.get("/audit")
def audit_log(user: User = Depends(require("audit:read")), limit: int = Query(200, le=1000)):
    return {"entries": db.rows("SELECT * FROM audit_log ORDER BY id DESC LIMIT ?", (limit,)),
            "chain": core.verify_audit_chain()}

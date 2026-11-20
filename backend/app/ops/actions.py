"""Resolution actions, approvals and verification.

propose() -> policy.decide()
  tier 0/1  -> execute now -> verify
  tier 2    -> approval request bound to a SHA-256 of the exact action payload -> (human) -> execute -> verify
  tier 3    -> human-led queue item; FIXCHAIN never executes it
A connector answering "accepted" is not "completed": only verify() can move an action to `verified`.
"""
from __future__ import annotations

import hashlib
import json
from typing import Callable

from .. import db
from . import connectors as cx
from . import core, policy, workers

APPROVAL_TTL_S = 24 * 3600
_outcome_hooks: list[Callable[[dict], None]] = []


class ActionError(Exception):
    pass


def on_outcome(fn: Callable[[dict], None]) -> None:
    _outcome_hooks.append(fn)


def payload_hash(action: dict) -> str:
    body = {"action_type": action["action_type"], "params": core.loads(action["params"]) if isinstance(action["params"], str)
            else action["params"], "ticket_id": action.get("ticket_id"), "incident_id": action.get("incident_id")}
    return hashlib.sha256(json.dumps(body, sort_keys=True, default=str).encode()).hexdigest()


def get(action_id: int) -> dict | None:
    a = db.one("SELECT * FROM resolution_actions WHERE id=?", (action_id,))
    if a:
        a["params"] = core.loads(a["params"], {})
        a["result"] = core.loads(a["result"])
    return a


def _set(action_id: int, **fields) -> None:
    sets = ", ".join(f"{k}=?" for k in fields)
    with db.tx() as c:
        c.execute(f"UPDATE resolution_actions SET {sets} WHERE id=?", (*fields.values(), action_id))


def _ids(a: dict) -> dict:
    return {"ticket_id": a.get("ticket_id"), "incident_id": a.get("incident_id")}


def _sim(a: dict) -> bool:
    return bool(a["params"].get("_simulated"))


# ------------------------------------------------------------------ executors / verifiers
def _exec(a: dict) -> dict:
    p, ids, key = a["params"], _ids(a), f"action:{a['id']}"
    t = a["action_type"]
    if t == "payment_status_check":
        return cx.payment_status(p["txn_ref"], **ids)
    if t == "device_diagnostics":
        tel = cx.device_telemetry(p["device_id"], **ids)
        test = cx.device_test_announcement(p["device_id"], **ids) if tel.get("found") else {"played": False}
        return {"telemetry": tel, "test_announcement": test}
    if t == "device_remote_restart":
        return cx.device_remote_restart(p["device_id"], key, **ids)
    if t == "qr_config_check":
        return cx.qr_config(p["qr_id"], **ids)
    if t == "settlement_status_check":
        return cx.settlement_status(p["merchant_id"], **ids)
    if t == "gateway_health_check":
        return cx.gateway_health(**ids)
    if t == "payment_reconciliation_request":
        return cx.request_reconciliation(p["txn_ref"], key, **ids)
    if t == "qr_remap":
        return cx.qr_remap(p["qr_id"], p["target_vpa"], key, **ids)
    if t == "settlement_partner_escalation":
        return cx.settlement_escalate_partner(p["batch_id"], key, **ids)
    if t == "gateway_failover":
        return cx.gateway_failover(p["target"], key, **ids)
    if t == "publish_status_banner":
        return cx.publish_status_banner(p["text"], key, **ids)
    if t in ("refund_request", "device_replacement"):
        return {"accepted": True, "reference": f"REQ-{a['id']:06d}", "note": "request accepted by partner (mock) - "
                "completion pending partner confirmation", "source": "mock:partner"}
    if t == "customer_update":
        return {"sent": True}
    raise ActionError(f"No executor for {t}")


def _verify(a: dict) -> tuple[bool | None, str, dict]:
    """(passed | None=pending external confirmation, source, detail)"""
    p, ids, t = a["params"], _ids(a), a["action_type"]
    if t in ("payment_status_check", "device_diagnostics", "qr_config_check", "settlement_status_check",
             "gateway_health_check", "customer_update"):
        return True, "read-only", {"note": "read-only check - result recorded as evidence"}
    if t == "payment_reconciliation_request":
        s = cx.payment_status(p["txn_ref"], **ids)
        ok = s.get("bank_status") == "SUCCESS" and s.get("merchant_status") == "PAID"
        return ok, s["source"], s
    if t == "device_remote_restart":
        tel = cx.device_telemetry(p["device_id"], **ids)
        test = cx.device_test_announcement(p["device_id"], **ids)
        return bool(tel.get("online") and test.get("played")), "mock:soundbox telemetry + test announcement", \
            {"telemetry": tel, "test": test}
    if t == "qr_remap":
        q = cx.qr_config(p["qr_id"], **ids)
        return bool(q.get("vpa_active") and q.get("accepting")), q["source"], q
    if t == "settlement_partner_escalation":
        s = cx.settlement_status(p["merchant_id"], **ids) if p.get("merchant_id") else {}
        return (s.get("status") == "RELEASED") if s else None, "mock:settlement", s
    if t == "gateway_failover":
        h = cx.gateway_health(**ids)
        active = h[h["active"]]
        return active.get("health") == "healthy", h["source"], h
    if t == "publish_status_banner":
        return bool(cx.world_get("status_page", "banner")), "mock:status_page", {}
    if t in ("refund_request", "device_replacement"):
        return None, "mock:partner", {"note": "accepted is not completed - awaiting partner confirmation"}
    return None, "none", {}


# ------------------------------------------------------------------ lifecycle
def propose(action_type: str, params: dict, *, requested_by: str, key: str, ticket_id: str | None = None,
            incident_id: str | None = None, rationale: str = "", playbook: tuple[str, int] | None = None,
            severity: str | None = None, simulated: bool = False, summary: str | None = None,
            evidence_summary: str | None = None, expected_effect: str | None = None) -> dict:
    existing = db.one("SELECT id, status, tier FROM resolution_actions WHERE idempotency_key=?", (key,))
    if existing:
        if existing["status"] == "failed" and existing["tier"] <= 1:  # retry of a timed-out autonomous step
            return execute(existing["id"], actor=requested_by)
        return get(existing["id"])
    d = policy.decide(action_type, severity=severity)
    if not d.allowed:
        raise ActionError(d.reason)
    params = {**params, "_simulated": simulated}
    status = "proposed" if d.autonomous else "awaiting_approval" if d.requires_approval else "human_led"
    with db.tx() as c:
        cur = c.execute(
            "INSERT OR IGNORE INTO resolution_actions (incident_id, ticket_id, playbook_key, playbook_version, action_type,"
            " tier, params, rationale, status, idempotency_key, requested_by, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)",
            (incident_id, ticket_id, playbook[0] if playbook else None, playbook[1] if playbook else None, action_type,
             d.tier, core.dumps(params), rationale, status, key, requested_by, db.now()))
        action_id = cur.lastrowid
    a = get(action_id)
    ids = _ids(a)
    core.publish("action.proposed", f"{requested_by} proposed {action_type} ({policy.TIER_LABEL[d.tier]}) - {d.reason}",
                 actor=requested_by, actor_type="agent", data={"action_id": action_id, "tier": d.tier,
                                                                 "decision": d.__dict__}, simulated=simulated, **ids)
    if d.autonomous:
        return execute(action_id, actor=requested_by)
    _create_approval(a, d, requested_by, summary or policy.CATALOG[action_type][3], evidence_summary, expected_effect)
    return get(action_id)


def _create_approval(a: dict, d: policy.Decision, requested_by: str, summary: str, evidence_summary: str | None,
                     expected_effect: str | None) -> int:
    with db.tx() as c:
        cur = c.execute(
            "INSERT INTO approvals (action_id, incident_id, ticket_id, action_type, tier, payload, payload_hash, summary,"
            " evidence_summary, expected_effect, reversible, policy_reason, requested_by, required_role, status,"
            " expires_at, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
            (a["id"], a["incident_id"], a["ticket_id"], a["action_type"], d.tier, core.dumps(a["params"]),
             payload_hash(a), summary, evidence_summary, expected_effect, int(d.reversible), d.reason, requested_by,
             d.required_role or "approver", "pending", db.now() + APPROVAL_TTL_S, db.now()))
        apr_id = cur.lastrowid
    core.publish("approval.requested", f"{'Human-led review' if d.human_led else 'Approval'} requested: {summary}",
                 actor=requested_by, actor_type="agent", level="warn",
                 data={"approval_id": apr_id, "action_id": a["id"], "tier": d.tier, "required_role": d.required_role},
                 simulated=_sim(a), **_ids(a))
    return apr_id


def execute(action_id: int, actor: str = "resolution") -> dict:
    a = get(action_id)
    if a is None:
        raise ActionError("action not found")
    if a["status"] in ("executed", "verified", "verify_failed", "executing"):
        return a  # idempotent
    if a["tier"] >= 2:
        apr = db.one("SELECT * FROM approvals WHERE action_id=?", (action_id,))
        if a["tier"] == 3:
            raise ActionError("Tier 3 actions are human-led and are never executed by FIXCHAIN")
        if not apr or apr["status"] != "approved":
            raise ActionError("Tier 2 action cannot execute without an approved, unexpired approval")
        if apr["payload_hash"] != payload_hash(a):
            raise ActionError("Action payload changed after approval - the approval is no longer valid")
    _set(action_id, status="executing")
    try:
        result = _exec(a)
    except cx.ConnectorTimeout as exc:
        _set(action_id, status="failed", result=core.dumps({"error": f"timeout: {exc}"}))
        core.publish("action.failed", f"{a['action_type']} timed out - no success claimed, case stays open",
                     actor=actor, actor_type="agent", level="error", data={"action_id": action_id},
                     simulated=_sim(a), **_ids(a))
        _notify(get(action_id))
        raise workers.Retryable(str(exc)) from exc
    _set(action_id, status="executed", result=core.dumps(result), executed_at=db.now())
    core.publish("action.executed", f"{a['action_type']} executed via {result.get('source', 'connector')}",
                 actor=actor, actor_type="agent", data={"action_id": action_id, "result": result},
                 simulated=_sim(a), **_ids(a))
    return verify(action_id)


def verify(action_id: int) -> dict:
    a = get(action_id)
    passed, source, detail = _verify(a)
    with db.tx() as c:
        c.execute("INSERT INTO verifications (action_id, incident_id, ticket_id, method, source, passed, detail, ts)"
                  " VALUES (?,?,?,?,?,?,?,?)", (action_id, a["incident_id"], a["ticket_id"], a["action_type"], source,
                                                -1 if passed is None else int(passed), core.dumps(detail), db.now()))
    status = "verified" if passed else "executed" if passed is None else "verify_failed"
    _set(action_id, status=status, verified_at=db.now() if passed else None)
    msg = {"verified": "verified against", "executed": "accepted - awaiting external confirmation from",
           "verify_failed": "NOT verified by"}[status]
    core.publish("action.verified" if passed else "action.pending" if passed is None else "action.verify_failed",
                 f"{a['action_type']} {msg} {source}", actor="verifier", actor_type="agent",
                 level="info" if passed else "warn", data={"action_id": action_id, "passed": passed},
                 simulated=_sim(a), **_ids(a))
    a = get(action_id)
    _notify(a)
    return a


def _notify(a: dict) -> None:
    for hook in _outcome_hooks:
        hook(a)


# ------------------------------------------------------------------ approvals
def expire_stale() -> int:
    with db.tx() as c:
        rows = c.execute("SELECT id, action_id FROM approvals WHERE status='pending' AND expires_at<?", (db.now(),)).fetchall()
        for r in rows:
            c.execute("UPDATE approvals SET status='expired' WHERE id=?", (r["id"],))
            c.execute("UPDATE resolution_actions SET status='cancelled' WHERE id=?", (r["action_id"],))
    return len(rows)


def decide(approval_id: int, approve: bool, user, note: str = "") -> dict:
    apr = db.one("SELECT * FROM approvals WHERE id=?", (approval_id,))
    if not apr:
        raise KeyError("approval not found")
    if apr["status"] != "pending":
        raise ActionError(f"Approval is {apr['status']}, not pending")
    if apr["expires_at"] < db.now():
        expire_stale()
        raise ActionError("Approval expired - the agent must request it again")
    if not policy.can_decide(user.role, apr["required_role"]):
        raise PermissionError(f"Role {user.role} cannot decide a {apr['required_role']} approval")
    a = get(apr["action_id"])
    if payload_hash(a) != apr["payload_hash"]:
        with db.tx() as c:
            c.execute("UPDATE approvals SET status='cancelled', note=? WHERE id=?", ("payload changed", approval_id))
        raise ActionError("The action changed after this approval was requested - approval invalidated")
    status = "approved" if approve else "rejected"
    with db.tx() as c:
        c.execute("UPDATE approvals SET status=?, decided_by=?, decided_role=?, decided_at=?, note=? WHERE id=?",
                  (status, user.username, user.role, db.now(), note, approval_id))
        if not approve:
            c.execute("UPDATE resolution_actions SET status='rejected' WHERE id=?", (apr["action_id"],))
        elif apr["tier"] == 3:
            c.execute("UPDATE resolution_actions SET status='human_led' WHERE id=?", (apr["action_id"],))
    core.audit(user.username, f"approval.{status}", f"approval:{approval_id}",
               {"action_id": apr["action_id"], "action_type": apr["action_type"], "tier": apr["tier"], "note": note,
                "payload_hash": apr["payload_hash"]}, role=user.role)
    verb = ("took ownership of" if apr["tier"] == 3 else "approved") if approve else "rejected"
    core.publish(f"approval.{status}", f"{user.display_name} ({user.role}) {verb} {apr['action_type']}",
                 actor=user.username, actor_type="human", data={"approval_id": approval_id, "action_id": apr["action_id"]},
                 ticket_id=apr["ticket_id"], incident_id=apr["incident_id"], simulated=_sim(a))
    if approve and apr["tier"] == 2:
        workers.enqueue("execute_action", "ticket" if apr["ticket_id"] else "incident",
                        apr["ticket_id"] or apr["incident_id"], key=f"execute_action:{apr['action_id']}",
                        payload={"action_id": apr["action_id"], "simulated": _sim(a)}, priority=2)
    else:
        _notify(get(apr["action_id"]))
    return db.one("SELECT * FROM approvals WHERE id=?", (approval_id,))


def amend(action_id: int, params: dict, by: str) -> dict:
    """Change an action's parameters. Any pending or approved approval for it becomes invalid."""
    a = get(action_id)
    if a["status"] not in ("awaiting_approval", "approved"):
        raise ActionError("Only actions awaiting execution can be amended")
    with db.tx() as c:
        c.execute("UPDATE resolution_actions SET params=?, status='awaiting_approval' WHERE id=?",
                  (core.dumps({**a["params"], **params}), action_id))
        c.execute("UPDATE approvals SET status='cancelled', note='payload amended' WHERE action_id=? AND status IN "
                  "('pending','approved')", (action_id,))
    core.audit(by, "action.amended", f"action:{action_id}", {"params": params})
    a = get(action_id)
    old = db.one("SELECT * FROM approvals WHERE action_id=?", (action_id,))
    with db.tx() as c:  # re-request: same row is UNIQUE per action, so refresh it
        c.execute("UPDATE approvals SET payload=?, payload_hash=?, status='pending', decided_by=NULL, decided_at=NULL,"
                  " note='re-requested after amendment', expires_at=?, created_at=? WHERE id=?",
                  (core.dumps(a["params"]), payload_hash(a), db.now() + APPROVAL_TTL_S, db.now(), old["id"]))
    return a


@workers.handler("execute_action", "resolution")
def _task_execute(task: dict) -> dict:
    try:
        a = execute(task["payload"]["action_id"], actor="resolution")
    except ActionError as exc:  # policy refusal is final, not a transient failure: record it, don't retry
        _set(task["payload"]["action_id"], status="blocked", result=core.dumps({"error": str(exc)}))
        a = get(task["payload"]["action_id"])
        core.publish("action.blocked", f"Execution blocked by policy: {exc}", actor="policy", actor_type="agent",
                     level="warn", data={"action_id": a["id"]}, simulated=_sim(a), **_ids(a))
        _notify(a)
    return {"status": a["status"]}

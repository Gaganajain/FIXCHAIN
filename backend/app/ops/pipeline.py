"""Ticket workflow: Customer Understanding → Triage → Incident Intelligence → Resolution (+ outcome handling).

Each step is a durable task; agents hand off through the queue with typed payloads. Every state change is
validated by tickets.transition() and published as an event.
"""
from __future__ import annotations

from .. import db
from . import actions, core, correlation, i18n, playbooks, taxonomy, tickets, understanding, workers
from .connectors import world_get


def _sim(t: dict) -> bool:
    return bool(t.get("simulated"))


def evidence(kind: str, summary: str, source: str, by: str, *, ticket_id=None, incident_id=None, data=None) -> None:
    with db.tx() as c:
        c.execute("INSERT INTO evidence (incident_id, ticket_id, source, kind, summary, data, collected_by, collected_at)"
                  " VALUES (?,?,?,?,?,?,?,?)", (incident_id, ticket_id, source, kind, core.mask(summary), core.dumps(data),
                                                by, db.now()))


def resolve(ticket_id: str, summary: str, verification: str, actor: str = "verifier") -> None:
    """A ticket is RESOLVED only with a named verification source (connector / telemetry / test / human)."""
    if not verification:
        raise ValueError("Refusing to resolve without a verification source")
    tickets.update(ticket_id, resolution_summary=f"{summary} [verified: {verification}]")
    tickets.safe_transition(ticket_id, "RESOLVED", f"verified via {verification}", actor)
    from . import incidents
    incidents.check_completion(tickets.get(ticket_id).get("incident_id"))


def escalate(t: dict, reason: str, tell: bool = True) -> None:
    cur = tickets.get(t["id"])  # re-read: never overwrite fields another step wrote in the meantime
    tickets.merge_extracted(t["id"], escalation_reason=reason)
    tickets.safe_transition(t["id"], "ESCALATED", reason, "resolution")
    if tell:
        tickets.tell(t, "escalated")


# ------------------------------------------------------------------ Agent 1: Customer Understanding
@workers.handler("understand", "customer_agent")
def task_understand(task: dict) -> dict:
    t = tickets.get(task["subject_id"])
    ctx = (t["extracted"] or {}).get("context", {})
    merch = db.one("SELECT * FROM merchants WHERE id=?", (t["merchant_id"],)) if t["merchant_id"] else None
    cust = db.one("SELECT * FROM customers WHERE id=?", (t["customer_id"],)) if t["customer_id"] else None
    if merch and merch["device_model"] and not ctx.get("device_model") and t["customer_type"] == "merchant":
        ctx = {**ctx, "device_model": merch["device_model"]}
    explicit = (t["extracted"] or {}).get("locale_explicit")
    u = understanding.understand(t["problem"], t["locale"] if explicit else None, ctx, use_llm=not _sim(t))
    facts = u["facts"]
    if not facts.get("device_model") and merch and u["category"] == "SOUNDBOX":
        facts["device_model"] = merch["device_model"]
    locale = t["locale"] if explicit else u["locale"]
    missing = understanding.missing_fields(u["category"], facts)
    title = understanding.summary_en(u)
    tickets.update(t["id"], title=title, category=u["category"], subcategory=u["subcategory"],
                   service=taxonomy.CATEGORIES[u["category"]]["service"], symptoms=u["symptoms"],
                   confidence=u["confidence"], amount=facts.get("amount_paise"), txn_ref=facts.get("txn_ref"),
                   device_model=facts.get("device_model") or t["device_model"], locale=locale,
                   region=t["region"] or (merch or {}).get("region") or (cust or {}).get("region"),
                   missing_fields=missing, extraction_method=u["method"],
                   extracted={**t["extracted"], "context": ctx, "facts": facts, "understanding": {k: v for k, v in u.items()
                              if k not in ("facts",)}, "qr_id": (merch or {}).get("qr_id"),
                              "device_id": (merch or {}).get("device_id")})
    tickets.transition(t["id"], "INTAKE", "understood", "customer_agent")
    t = tickets.get(t["id"])
    core.publish("ticket.understood", f"{t['id']}: {title} [{u['category']}] conf {u['confidence']:.2f} via {u['method']}",
                 actor="customer_agent", actor_type="agent", ticket_id=t["id"], simulated=_sim(t),
                 data={"category": u["category"], "symptoms": u["symptoms"], "facts": facts, "missing": missing,
                       "locale": locale, "method": u["method"]})
    label = i18n.symptom_label(u.get("primary_symptom"), locale, u["subcategory"])
    if not _sim(t) or len(missing) == 0:
        tickets.tell(t, "ack", summary=label, ticket=t["id"])
    if u["category"] == "FRAUD_SECURITY":
        tickets.tell(t, "fraud_urgent", kind="safety")
    elif u.get("secret_detected"):
        tickets.tell(t, "never_share", kind="safety")
    if missing:
        tickets.tell(t, f"ask_{missing[0]}", kind="question")
    core.handoff("customer_agent", "triage", "ticket", t["id"], f"{u['category']} · {len(u['symptoms'])} symptom(s) · "
                 f"missing {missing or 'nothing'}", task["workflow_id"], _sim(t))
    workers.enqueue("triage", "ticket", t["id"], workflow_id=task["workflow_id"], payload={"simulated": _sim(t)},
                    priority=task["priority"])
    return {"category": u["category"], "confidence": u["confidence"], "_model": u.get("_model")}


# ------------------------------------------------------------------ Agent 2: Triage
@workers.handler("triage", "triage")
def task_triage(task: dict) -> dict:
    t = tickets.get(task["subject_id"])
    syms = t["symptoms"] or []
    sev, reasons, factors = taxonomy.severity(t["category"], syms, t["amount"],
                                              repeat_contact="REPEAT_COMPLAINT" in syms)
    primary = syms[0] if syms else "GENERIC"
    fp = f"{t['category']}:{primary}"
    pb = playbooks.for_category(t["category"])
    human_review = (t["confidence"] or 0) < 0.5 or t["category"] in ("GRIEVANCE", "ACCOUNT_KYC", "PRIVACY_COMPLIANCE")
    tickets.update(t["id"], severity=sev, priority=taxonomy.priority(sev), reason_codes=reasons, fingerprint=fp,
                   **tickets.sla_fields(sev, t["created_at"]),
                   extracted={**t["extracted"], "triage": {"severity_factors": factors, "suggested_playbook":
                              pb["key"] if pb else None, "human_review_required": human_review}})
    tickets.transition(t["id"], "TRIAGED", f"{sev}, fingerprint {fp}", "triage")
    core.publish("ticket.triaged", f"{t['id']} → {taxonomy.CATEGORIES[t['category']]['label']} / {t['subcategory']}, "
                 f"{sev}, conf {t['confidence']:.2f}", actor="triage", actor_type="agent", ticket_id=t["id"],
                 simulated=_sim(t), data={"category": t["category"], "subcategory": t["subcategory"],
                                           "severity_recommendation": sev, "confidence": t["confidence"],
                                           "fingerprint": fp, "suggested_playbook": pb["key"] if pb else None,
                                           "human_review_required": human_review, "reason_codes": reasons})
    core.handoff("triage", "incident_intel", "ticket", t["id"], f"{sev} · fingerprint {fp}", task["workflow_id"], _sim(t))
    workers.enqueue("correlate", "ticket", t["id"], workflow_id=task["workflow_id"], payload={"simulated": _sim(t)},
                    priority=task["priority"])
    return {"severity": sev, "fingerprint": fp}


# ------------------------------------------------------------------ Agent 2b: Incident Intelligence
@workers.handler("correlate", "incident_intel")
def task_correlate(task: dict) -> dict:
    t = tickets.get(task["subject_id"])
    r = correlation.correlate(t["id"])
    tickets.transition(t["id"], "CORRELATED", r["method"], "incident_intel")
    t = tickets.get(t["id"])
    if r["incident_id"]:
        inc = db.one("SELECT * FROM ops_incidents WHERE id=?", (r["incident_id"],))
        if taxonomy.SEV_ORDER.index(inc["severity"]) > taxonomy.SEV_ORDER.index(t["severity"]):
            tickets.update(t["id"], severity=inc["severity"], priority=taxonomy.priority(inc["severity"]))
        key = "outage" if inc["kind"] == "platform" else "linked_incident"
        if r["created"]:
            tickets.broadcast(inc["id"], key, incident=inc["id"])
            from . import incidents
            incidents.start(inc["id"], bool(inc["simulated"]))
        else:
            tickets.tell(t, key, incident=inc["id"])
    if r.get("review"):
        tickets.merge_extracted(t["id"], correlation_review=r["review"])
    t = tickets.get(t["id"])
    if t["extracted"].get("triage", {}).get("human_review_required") and t["category"] != "FRAUD_SECURITY":
        escalate(t, "Low confidence or human-only category - routed to support with a copilot brief")
        return r
    core.handoff("incident_intel", "resolution", "ticket", t["id"],
                 f"{'linked to ' + r['incident_id'] if r['incident_id'] else 'standalone'} ({r['method']})",
                 task["workflow_id"], _sim(t))
    workers.enqueue("resolve_ticket", "ticket", t["id"], key=f"resolve_ticket:{t['id']}:0",
                    workflow_id=task["workflow_id"], payload={"simulated": _sim(t)}, priority=task["priority"])
    return r


# ------------------------------------------------------------------ Agent 4: Resolution (ticket playbooks)
@workers.handler("resolve_ticket", "resolution")
def task_resolve(task: dict) -> dict:
    t = tickets.get(task["subject_id"])
    if t["state"] in ("RESOLVED", "ESCALATED", "APPROVAL_REQUIRED", "WAITING_PARTNER"):
        return {"skipped": t["state"]}
    if t["missing_fields"] and t["category"] != "FRAUD_SECURITY":  # fraud is routed to humans at once; details can follow
        tickets.safe_transition(t["id"], "NEEDS_CUSTOMER", f"waiting for {', '.join(t['missing_fields'])}", "resolution")
        return {"waiting_for": t["missing_fields"]}
    tickets.safe_transition(t["id"], "INVESTIGATING", "running approved playbook", "resolution")
    t = tickets.get(t["id"])
    pb = playbooks.for_category(t["category"])
    if not pb:
        escalate(t, f"No approved playbook for {t['category']} - human handling")
        return {"escalated": True}
    run = {"PAYMENT_STATUS_INVESTIGATION": _pb_payment, "SOUNDBOX_BASIC_DIAGNOSTIC": _pb_soundbox,
           "QR_CONFIG_CHECK": _pb_qr, "SETTLEMENT_STATUS": _pb_settlement, "PLATFORM_OUTAGE_RESPONSE": _pb_platform,
           "FRAUD_INTAKE": _pb_fraud}[pb["key"]]
    core.publish("playbook.started", f"{t['id']}: playbook {pb['key']} v{pb['version']}", actor="resolution",
                 actor_type="agent", ticket_id=t["id"], incident_id=t["incident_id"], simulated=_sim(t),
                 data={"playbook": pb["key"], "version": pb["version"]})
    outcome = run(t, pb, task["payload"].get("attempt", 0))
    return {"playbook": pb["key"], "version": pb["version"], "outcome": outcome}


def _propose(t: dict, pb: dict, action_type: str, params: dict, key: str, rationale: str, **kw) -> dict:
    return actions.propose(action_type, params, requested_by="resolution", key=key, ticket_id=t["id"],
                           incident_id=t["incident_id"], rationale=rationale, playbook=(pb["key"], pb["version"]),
                           severity=t["severity"], simulated=_sim(t), **kw)


def _pb_payment(t: dict, pb: dict, attempt: int) -> str:
    a = _propose(t, pb, "payment_status_check", {"txn_ref": t["txn_ref"]}, f"pay_check:{t['id']}:{attempt}",
                 "Read the authoritative payment status before saying anything about the money")
    s = a["result"] or {}
    amount = (s.get("amount_paise") or t["amount"] or 0) / 100
    amt = f"{amount:,.0f}"
    bank, merchant = s.get("bank_status"), s.get("merchant_status")
    evidence("fact", f"Payment {t['txn_ref']}: bank={bank}, merchant order={merchant}", s.get("source", "mock:payments"),
             "resolution", ticket_id=t["id"], incident_id=t["incident_id"], data=s)
    if bank == "SUCCESS" and merchant == "PAID":
        tickets.tell(t, "pay_status_SUCCESS", amount=amt)
        resolve(t["id"], "Payment successful and credited to merchant", f"{s['source']} @ status check")
        return "verified_success"
    if bank == "SUCCESS":
        tickets.tell(t, "pay_status_SUCCESS_MERCHANT_FAILED", amount=amt)
        _propose(t, pb, "payment_reconciliation_request", {"txn_ref": t["txn_ref"], "amount_paise": s.get("amount_paise")},
                 f"recon:{t['txn_ref']}", "Bank shows SUCCESS but the merchant record is not PAID - re-sync it",
                 summary=f"Re-sync merchant record for ₹{amt} payment {t['txn_ref']} from bank status",
                 evidence_summary=f"Bank status SUCCESS, merchant order {merchant} ({s['source']})",
                 expected_effect="Merchant order marked PAID; no money is moved")
        tickets.safe_transition(t["id"], "APPROVAL_REQUIRED", "reconciliation needs approval", "resolution")
        return "approval_required"
    if bank == "PENDING":
        tickets.tell(t, "pay_status_PENDING", amount=amt)
        tickets.safe_transition(t["id"], "WAITING_PARTNER", "bank status pending", "resolution")
        return "pending_at_bank"
    if bank == "FAILED":
        tickets.tell(t, "pay_status_FAILED", amount=amt)
        _propose(t, pb, "refund_request", {"txn_ref": t["txn_ref"], "amount_paise": s.get("amount_paise")},
                 f"refund:{t['txn_ref']}", "Bank shows FAILED; customer reports a debit - request confirmation of reversal",
                 summary=f"Raise refund/reversal confirmation request for ₹{amt} ({t['txn_ref']})",
                 evidence_summary=f"Bank status FAILED ({s['source']})", expected_effect="Partner confirms reversal")
        tickets.safe_transition(t["id"], "APPROVAL_REQUIRED", "refund request needs approval", "resolution")
        return "approval_required"
    tickets.tell(t, "pay_status_UNKNOWN")
    escalate(t, "Payment not found / status unknown - no guess made", tell=False)
    return "unknown"


def _pb_soundbox(t: dict, pb: dict, attempt: int) -> str:
    device = t["extracted"].get("device_id")
    if not device:
        escalate(t, "No Soundbox registered to this merchant")
        return "no_device"
    a = _propose(t, pb, "device_diagnostics", {"device_id": device}, f"diag:{t['id']}:{attempt}",
                 "Read telemetry and play a test announcement")
    tel, test = a["result"]["telemetry"], a["result"]["test_announcement"]
    evidence("fact", f"Device {device}: online={tel.get('online')}, network={tel.get('network')}, battery="
             f"{tel.get('battery')}%, firmware {tel.get('firmware')}, test announcement played={test.get('played')}",
             "mock:soundbox", "resolution", ticket_id=t["id"], incident_id=t["incident_id"], data=a["result"])
    if not tel.get("found"):
        escalate(t, "Device not found in telemetry")
        return "not_found"
    if not tel.get("online") or tel.get("fault") == "network":
        tries = int(pb["steps"].get("options", {}).get("restart_attempts", 1))
        for i in range(tries):
            r = _propose(t, pb, "device_remote_restart", {"device_id": device}, f"restart:{t['id']}:{attempt}:{i}",
                         "Network fault - a remote restart is safe and reversible")
            if r["status"] == "verified":
                tickets.tell(t, "soundbox_fixed")
                resolve(t["id"], "Soundbox restarted remotely; back online, test announcement played",
                        "mock:soundbox telemetry + test announcement")
                return "verified_restart"
        tickets.tell(t, "approval_pending")
        _propose(t, pb, "device_replacement", {"device_id": device, "merchant_id": t["merchant_id"]},
                 f"replace:{device}", "Restart did not recover the device",
                 summary=f"Order a replacement Soundbox for merchant #{t['merchant_id']} ({device})",
                 evidence_summary=f"{tries} remote restart(s) failed verification", expected_effect="Replacement shipped")
        tickets.safe_transition(t["id"], "APPROVAL_REQUIRED", "replacement needs approval", "resolution")
        return "replacement_proposed"
    if (tel.get("battery") or 100) < 15:
        tickets.tell(t, "soundbox_battery")
        tickets.safe_transition(t["id"], "NEEDS_CUSTOMER", "low battery - merchant to charge and confirm", "resolution")
        return "low_battery"
    if tel.get("payment_announcements_missing"):
        tickets.tell(t, "soundbox_online_defect")
        tickets.merge_extracted(t["id"], awaiting_engineering=True)
        evidence("observation", "Device healthy; announcements are triggered when the order reaches PAID - points to "
                 "the payment-status path, not hardware", "resolution", "resolution", ticket_id=t["id"],
                 incident_id=t["incident_id"])
        core.publish("ticket.awaiting_engineering", f"{t['id']}: device healthy, payment-status path suspected - waiting "
                     f"for incident/engineering", actor="resolution", actor_type="agent", ticket_id=t["id"],
                     incident_id=t["incident_id"], simulated=_sim(t))
        return "awaiting_engineering"
    tickets.tell(t, "soundbox_ok")
    tickets.safe_transition(t["id"], "NEEDS_CUSTOMER", "device healthy - asking merchant to confirm", "resolution")
    return "healthy_confirm"


def _pb_qr(t: dict, pb: dict, attempt: int) -> str:
    qr = t["extracted"].get("qr_id")
    if not qr:
        escalate(t, "No QR registered to this merchant")
        return "no_qr"
    a = _propose(t, pb, "qr_config_check", {"qr_id": qr}, f"qr_check:{t['id']}:{attempt}", "Read QR / VPA configuration")
    q = a["result"]
    evidence("fact", f"QR {qr}: mapped VPA active={q.get('vpa_active')}, accepting={q.get('accepting')}, config push "
             f"{q.get('config_push')}", q.get("source", "mock:qr"), "resolution", ticket_id=t["id"],
             incident_id=t["incident_id"], data=q)
    if q.get("found") and not q.get("vpa_active"):
        tickets.tell(t, "qr_config")
        key = f"qr_remap:{qr}"
        _propose(t, pb, "qr_remap", {"qr_id": qr, "target_vpa": q.get("active_vpa")}, key,
                 "QR mapped to a deactivated VPA after a config push",
                 summary=f"Re-link QR {qr} to its active VPA", evidence_summary=f"Mapped VPA inactive since push "
                 f"{q.get('config_push')}", expected_effect="QR accepts payments again (reversible)")
        tickets.merge_extracted(t["id"], action_key=key)
        tickets.safe_transition(t["id"], "APPROVAL_REQUIRED", "QR re-link needs approval", "resolution")
        return "approval_required"
    if not q.get("found"):
        escalate(t, "QR not found")
        return "not_found"
    tickets.tell(t, "qr_ok")
    tickets.safe_transition(t["id"], "NEEDS_CUSTOMER", "config OK - asking for a ₹1 test payment", "resolution")
    return "config_ok"


def _pb_settlement(t: dict, pb: dict, attempt: int) -> str:
    mid = str(t["merchant_id"] or "")
    a = _propose(t, pb, "settlement_status_check", {"merchant_id": mid}, f"settle_check:{t['id']}:{attempt}",
                 "Read settlement batch status")
    s = a["result"]
    evidence("fact", f"Settlement for merchant #{mid}: {s.get('status')} batch {s.get('batch_id')} ₹"
             f"{(s.get('amount_paise') or 0) / 100:,.0f} via {s.get('partner')}", s.get("source", "mock:settlement"),
             "resolution", ticket_id=t["id"], incident_id=t["incident_id"], data=s)
    amt = f"{(s.get('amount_paise') or 0) / 100:,.0f}"
    if s.get("status") == "SETTLED":
        tickets.tell(t, "resolved", detail=i18n.t("detail_settled", t["locale"], batch=s.get("batch_id"), amount=amt, utr=s.get("utr")))
        resolve(t["id"], f"Settlement {s.get('batch_id')} already credited", s["source"])
        return "settled"
    if s.get("status") == "HELD_AT_PARTNER":
        tickets.tell(t, "settlement_partner", amount=amt)
        key = f"settle_escalate:{s['batch_id']}"
        _propose(t, pb, "settlement_partner_escalation", {"batch_id": s["batch_id"], "merchant_id": mid}, key,
                 f"Batch {s['batch_id']} held at {s.get('partner')}",
                 summary=f"Escalate settlement batch {s['batch_id']} to {s.get('partner')}",
                 evidence_summary=f"Batch held at partner since {s.get('held_since', 'today')}",
                 expected_effect="Partner releases the batch; FIXCHAIN moves no money")
        tickets.merge_extracted(t["id"], action_key=key, batch_id=s["batch_id"])
        tickets.safe_transition(t["id"], "APPROVAL_REQUIRED", "partner escalation needs approval", "resolution")
        return "approval_required"
    if not s.get("found"):
        escalate(t, "No settlement record found")
        return "not_found"
    tickets.safe_transition(t["id"], "WAITING_PARTNER", f"settlement {s.get('status')}", "resolution")
    return "processing"


def _pb_platform(t: dict, pb: dict, attempt: int) -> str:
    if t["incident_id"]:
        tickets.merge_extracted(t["id"], awaiting_incident=True)
        return "awaiting_incident_mitigation"
    a = _propose(t, pb, "gateway_health_check", {}, f"gw_check:{t['id']}:{attempt}", "Read gateway health")
    h = a["result"]
    if h[h["active"]].get("health") == "healthy":
        tickets.tell(t, "resolved", detail=i18n.t("detail_retry", t["locale"]))
        tickets.safe_transition(t["id"], "NEEDS_CUSTOMER", "service healthy - asking customer to retry", "resolution")
        return "healthy"
    escalate(t, "Gateway degraded - incident response required")
    return "degraded"


def _pb_fraud(t: dict, pb: dict, attempt: int) -> str:
    _propose(t, pb, "fraud_case_handoff", {"ticket_id": t["id"], "approx_time": t["extracted"].get("facts", {}).get("approx_time")},
             f"fraud:{t['id']}", "Fraud reports are human-led; FIXCHAIN preserved evidence and routed urgently",
             summary=f"Urgent fraud review for {t['id']}", evidence_summary=core.mask(t["problem"])[:200],
             expected_effect="Fraud team owns the case; no automatic liability decision")
    escalate(t, "Fraud report - human-led (Tier 3); never auto-closed", tell=False)
    return "human_led"


# ------------------------------------------------------------------ outcomes of actions → ticket state
def _tickets_for(a: dict) -> list[dict]:
    key = a["idempotency_key"]
    ids = {a["ticket_id"]} if a["ticket_id"] else set()
    for r in db.rows("SELECT id FROM tickets WHERE json_extract(extracted, '$.action_key')=?", (key,)):
        ids.add(r["id"])
    return [tickets.get(i) for i in ids if i]


@actions.on_outcome
def _on_action(a: dict) -> None:
    t_type, status = a["action_type"], a["status"]
    if a["tier"] <= 1:
        return  # tier 0/1 results are consumed synchronously by the playbook that proposed them
    if t_type in ("gateway_failover", "publish_status_banner"):
        from . import incidents
        incidents.on_incident_action(a)
        return
    for t in _tickets_for(a):
        if not t or t["state"] == "RESOLVED":
            continue
        if status == "verified":
            if t_type == "payment_reconciliation_request":
                tickets.tell(t, "resolved", detail=i18n.t("detail_recon", t["locale"]))
                resolve(t["id"], "Merchant record re-synced to PAID", "mock:payments status re-check")
            elif t_type == "qr_remap":
                tickets.tell(t, "resolved", detail=i18n.t("detail_qr", t["locale"]))
                resolve(t["id"], "QR re-linked to active VPA", "mock:qr config re-check")
            elif t_type == "settlement_partner_escalation":
                tickets.tell(t, "resolved", detail=i18n.t("detail_settlement", t["locale"]))
                resolve(t["id"], "Settlement batch released by partner", "mock:settlement status re-check")
        elif status == "executed" and a["tier"] == 2:  # accepted, awaiting external confirmation
            tickets.safe_transition(t["id"], "WAITING_PARTNER", f"{t_type} accepted - awaiting partner confirmation",
                                    "resolution")
        elif status == "verify_failed":
            escalate(t, f"{t_type} executed but verification failed")
        elif status in ("rejected", "blocked", "cancelled"):
            escalate(t, f"{t_type} {status} by human/policy")
        elif status == "human_led":
            tickets.merge_extracted(t["id"], owner="human (Tier 3)")


@workers.on_dead_letter
def _dead(task: dict, err: str) -> None:
    if task["subject_kind"] != "ticket":
        return
    t = tickets.get(task["subject_id"])
    if t and t["state"] not in ("RESOLVED", "ESCALATED"):
        tickets.safe_transition(t["id"], "ESCALATED", f"{task['task_type']} failed after {task['attempts']} attempts", "orchestrator")
        tickets.tell(t, "pay_status_UNKNOWN" if t["category"] == "PAYMENTS_UPI" else "escalated")


# ------------------------------------------------------------------ customer replies
def customer_reply(ticket_id: str, text: str, author: str) -> dict:
    t = tickets.get(ticket_id)
    if not t:
        raise KeyError("ticket not found")
    tickets.add_message(ticket_id, "customer", author, text, t["locale"])
    core.publish("ticket.customer_reply", f"{ticket_id}: customer replied", actor="customer", actor_type="human",
                 ticket_id=ticket_id, simulated=_sim(t))
    if core.contains_secret(text):
        tickets.tell(t, "secret_warning", kind="safety")
    if t["state"] == "RESOLVED":
        tickets.transition(ticket_id, "REOPENED", "customer replied after resolution", "customer_agent")
        tickets.transition(ticket_id, "INVESTIGATING", "reopened", "customer_agent")
        core.publish("ticket.reopened", f"{ticket_id} reopened by customer", actor="customer_agent", actor_type="agent",
                     ticket_id=ticket_id, level="warn")
        return tickets.get(ticket_id)
    if t["state"] != "NEEDS_CUSTOMER":
        return t
    u = understanding.understand(text, t["locale"], (t["extracted"] or {}).get("context"), use_llm=not _sim(t))
    facts = {**t["extracted"].get("facts", {})}
    for k, v in u["facts"].items():
        if v and not facts.get(k):
            facts[k] = v
    missing = understanding.missing_fields(t["category"], facts)
    tickets.update(ticket_id, amount=facts.get("amount_paise") or t["amount"], txn_ref=facts.get("txn_ref") or t["txn_ref"],
                   missing_fields=missing)
    tickets.merge_extracted(ticket_id, facts=facts)
    t = tickets.get(ticket_id)
    if missing:
        tickets.tell(t, f"ask_{missing[0]}", kind="question")
        return t
    tickets.tell(t, "thanks_field")
    tickets.tell(t, "checking")
    n = db.one("SELECT COUNT(*) AS n FROM agent_tasks WHERE task_type='resolve_ticket' AND subject_id=?", (ticket_id,))["n"]
    workers.enqueue("resolve_ticket", "ticket", ticket_id, key=f"resolve_ticket:{ticket_id}:{n}",
                    payload={"simulated": _sim(t), "attempt": n}, priority=2)
    return t

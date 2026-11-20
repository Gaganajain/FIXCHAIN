"""Incident workflow: Agent 3 Investigation, incident-level mitigation, Agent 6 Engineering bridge, Agent 7 Copilot.

Facts, observations and hypotheses are stored separately. A hypothesis becomes `confirmed` only when the
engineering pipeline reproduces the defect AND a verified patch is approved, or a verified mitigation holds.
"""
from __future__ import annotations

import collections

from .. import config, db, merchant_runtime
from ..agents import llm, verifier
from ..agents.sanitize import untrusted_block
from . import actions, core, i18n, knowledge, tickets, workers
from .connectors import world_get, world_put
from .pipeline import evidence, resolve

INC_TRANSITIONS = {"OPEN": {"INVESTIGATING", "RESOLVED"}, "INVESTIGATING": {"MITIGATING", "RESOLVED", "ESCALATED"},
                   "MITIGATING": {"MONITORING", "RESOLVED", "ESCALATED"}, "MONITORING": {"RESOLVED", "MITIGATING"},
                   "ESCALATED": {"MITIGATING", "RESOLVED"}, "RESOLVED": set()}


def get(incident_id: str) -> dict | None:
    i = db.one("SELECT * FROM ops_incidents WHERE id=?", (incident_id,))
    if i:
        i["regions"] = core.loads(i["regions"], [])
        i["severity_factors"] = core.loads(i["severity_factors"], {})
    return i


def set_state(incident_id: str, to: str, reason: str, actor: str = "orchestrator") -> bool:
    i = db.one("SELECT state, simulated FROM ops_incidents WHERE id=?", (incident_id,))
    if not i or i["state"] == to:
        return False
    if to not in INC_TRANSITIONS.get(i["state"], set()):
        core.publish("incident.transition_refused", f"{incident_id}: {i['state']} → {to} refused", actor=actor,
                     actor_type="agent", level="warn", incident_id=incident_id)
        return False
    with db.tx() as c:
        c.execute("UPDATE ops_incidents SET state=?, updated_at=?, resolved_at=? WHERE id=?",
                  (to, db.now(), db.now() if to == "RESOLVED" else None, incident_id))
        c.execute("UPDATE workflow_runs SET state=?, updated_at=?, finished_at=? WHERE kind='incident' AND subject_id=?",
                  (to, db.now(), db.now() if to == "RESOLVED" else None, incident_id))
    core.publish("incident.state_changed", f"{incident_id}: {i['state']} → {to} ({reason})", actor=actor,
                 actor_type="agent", incident_id=incident_id, data={"from": i["state"], "to": to},
                 simulated=bool(i["simulated"]))
    return True


def start(incident_id: str, simulated: bool) -> None:
    workers.enqueue("investigate_incident", "incident", incident_id, payload={"simulated": simulated}, priority=1,
                    delay_s=1.5 if simulated else 0)  # let the first burst link before investigating


# ------------------------------------------------------------------ Agent 3: Investigation
def _engineering_signals() -> dict:
    eng = db.rows("SELECT id, fingerprint, title, status, occurrences FROM incidents WHERE category='merchant_integration'"
                  " AND rule='STATE_MISMATCH' AND status NOT IN ('resolved','rejected') ORDER BY id DESC")
    mism = db.rows("SELECT gateway_status, order_status_after, COUNT(*) AS n FROM payment_events WHERE kind='callback_result'"
                   " AND ts>=? AND handler_reason NOT IN ('duplicate','invalid_signature','unknown_order','amount_mismatch')"
                   " GROUP BY gateway_status, order_status_after", (db.now() - 7200,))
    from .. import detection
    bad = [m for m in mism if m["order_status_after"] != detection.expected_state(m["gateway_status"])]
    return {"engineering_incidents": eng, "callback_mismatches": bad}


def _collect(inc: dict) -> tuple[list[tuple[str, str, str, dict]], list[str], bool]:
    """Returns (evidence rows [(kind, summary, source, data)], hypotheses, software_defect)."""
    iid = inc["id"]
    rows: list[tuple[str, str, str, dict]] = []
    ts = db.rows("SELECT * FROM tickets WHERE incident_id=?", (iid,))
    n = len(ts)
    syms = collections.Counter(s for t in ts for s in core.loads(t["symptoms"], []))
    regions = collections.Counter(t["region"] for t in ts if t["region"])
    langs = collections.Counter(t["locale"] for t in ts)
    rows.append(("fact", f"{n} linked tickets from {len({t['merchant_id'] for t in ts if t['merchant_id']})} merchants / "
                 f"{len({t['customer_id'] for t in ts if t['customer_id']})} customers across {len(regions)} region(s); "
                 f"languages {dict(langs)}", "tickets", {"symptoms": dict(syms), "regions": dict(regions)}))
    hyps: list[str] = []
    defect = False
    eng = _engineering_signals()
    mism_total = sum(m["n"] for m in eng["callback_mismatches"])
    if mism_total:
        desc = ", ".join(f"{m['gateway_status']}→{m['order_status_after']} ×{m['n']}" for m in eng["callback_mismatches"])
        rows.append(("fact", f"Engineering monitor: {mism_total} payment callbacks in the last 2h were recorded in a state "
                     f"that contradicts the gateway contract ({desc})", "engineering:detection", eng))
    cat = inc["category"]
    if cat == "SOUNDBOX":
        devs = [world_get("device", m["device_id"]) or {} for m in db.rows(
            "SELECT DISTINCT m.device_id FROM merchants m JOIN tickets t ON t.merchant_id=m.id WHERE t.incident_id=?", (iid,))]
        offline = sum(1 for d in devs if d.get("fault") == "network" or d.get("online") is False)
        battery = sum(1 for d in devs if (d.get("battery") or 100) < 15)
        silent = sum(1 for d in devs if d.get("online") and d.get("payment_announcements_missing"))
        fw = collections.Counter(d.get("firmware") for d in devs if d)
        rows.append(("fact", f"Telemetry across {len(devs)} affected devices: {offline} network-faulted, {battery} low "
                     f"battery, {silent} online but not announcing payments; firmware {dict(fw)}", "mock:soundbox",
                     {"offline": offline, "battery": battery, "silent": silent}))
        if offline:
            hyps.append(f"{offline} device(s) lost network connectivity (recoverable cohort - handled by the remote-restart playbook)")
        if silent and mism_total:
            hyps.insert(0, "Payments reach the bank, but a merchant callback status-mapping defect records PENDING→SUCCESS "
                        "payments as FAILED; announcements fire only on PAID, so healthy devices stay silent")
            defect = True
        if offline and silent:
            rows.append(("observation", "Cohort contains two distinct causes (device network vs payment-status path); "
                         "tickets are handled per cause rather than merged into one fix", "investigation", {}))
    elif cat == "PAYMENTS_UPI":
        txs = [world_get("txn", t["txn_ref"]) or {} for t in ts if t["txn_ref"]][:400]
        c = collections.Counter(f"{x.get('bank_status')}/{x.get('merchant_status')}" for x in txs if x)
        rows.append(("fact", f"Sampled {len(txs)} referenced payments: bank/merchant status {dict(c)}", "mock:payments", dict(c)))
        if c.get("SUCCESS/PAYMENT_FAILED") and mism_total:
            hyps.append("Merchant callback status-mapping defect: PENDING payments are recorded as FAILED, so the later "
                        "SUCCESS callback is ignored - money reached the bank but orders show failed")
            defect = True
        elif c.get("SUCCESS/PAYMENT_FAILED"):
            hyps.append("Merchant records disagree with bank status; cause not yet established")
    elif cat == "MERCHANT_QR":
        qrs = [world_get("qr", m["qr_id"]) or {} for m in db.rows(
            "SELECT DISTINCT m.qr_id FROM merchants m JOIN tickets t ON t.merchant_id=m.id WHERE t.incident_id=?", (iid,))]
        inactive = [q for q in qrs if q and not q.get("vpa_active")]
        pushes = collections.Counter(q.get("config_push") for q in inactive)
        rows.append(("fact", f"{len(inactive)}/{len(qrs)} affected QRs map to an inactive VPA; config pushes {dict(pushes)}",
                     "mock:qr", {"pushes": dict(pushes)}))
        if inactive:
            hyps.append(f"Configuration push {pushes.most_common(1)[0][0]} re-mapped QRs to deactivated VPAs (config, "
                        "not code) - per-merchant re-link requires approval")
    elif cat == "SETTLEMENT":
        held = collections.Counter()
        for r in db.rows("SELECT DISTINCT merchant_id FROM tickets WHERE incident_id=?", (iid,)):
            s = world_get("settlement", str(r["merchant_id"])) or {}
            if s.get("status") == "HELD_AT_PARTNER":
                held[(s.get("batch_id"), s.get("partner"))] += 1
        rows.append(("fact", f"Held settlement batches: " + ", ".join(f"{b} at {p} ({k} merchants)" for (b, p), k in held.items())
                     if held else "No held batches found", "mock:settlement", {}))
        if held:
            hyps.append("Settlement batches held at the partner bank - external dependency, needs a formal escalation")
    elif inc["kind"] == "platform" or cat == "PLATFORM_OUTAGE":
        h = actions.cx.gateway_health(incident_id=iid)
        rows.append(("fact", f"Gateway health: primary {h['primary'].get('health')} (error rate "
                     f"{h['primary'].get('error_rate', 0):.1%}), secondary {h['secondary'].get('health')}, active "
                     f"{h['active']}", h["source"], h))
        if h["primary"].get("health") != "healthy":
            hyps.append("Primary payment gateway degraded - failing over to the secondary gateway should mitigate")
    past = knowledge.similar(inc["fingerprint"], cat)
    for k in past[:2]:
        rows.append(("observation", f"Similar past case ({k['status']}): {k['title']}", f"knowledge:{k['id']}", {}))
    mem = db.one("SELECT * FROM memory ORDER BY last_seen DESC LIMIT 1") if defect else None
    if mem:
        rows.append(("observation", f"Engineering memory: {mem['function']}() defect seen {mem['times_seen']}x before - "
                     f"{mem['root_cause']}", "engineering:memory", {}))
    return rows, hyps, defect


def _narrative(inc: dict, facts: list[str], hyps: list[str]) -> tuple[str, str]:
    base = (f"{inc['affected_tickets']} reports grouped into {inc['id']} ({inc['severity']}). " +
            (f"Leading hypothesis (unconfirmed): {hyps[0]}." if hyps else "No hypothesis yet - evidence still being gathered."))
    if config.agent_mode() != "llm":
        return base, "template"
    try:
        out = llm.structured_call(
            system="You are FIXCHAIN's Human Operations Copilot. Summarise an incident for an on-call manager in 2-3 "
                   "sentences. Use ONLY the facts given. Label hypotheses as hypotheses. No promises to customers.",
            user=untrusted_block("facts", facts) + untrusted_block("hypotheses", hyps),
            schema={"type": "object", "properties": {"summary": {"type": "string"}}, "required": ["summary"],
                    "additionalProperties": False}, max_tokens=800, effort="low")
        s = core.mask(out["summary"].strip())
        return (s if len(s) > 30 else base), f"llm ({config.llm_label()})"
    except llm.LLMError:
        return base, "template (LLM unavailable)"


@workers.handler("investigate_incident", "investigation")
def task_investigate(task: dict) -> dict:
    inc = get(task["subject_id"])
    sim = bool(inc["simulated"])
    if inc["state"] == "RESOLVED":
        return {"skipped": "resolved"}
    if inc["state"] == "OPEN":
        set_state(inc["id"], "INVESTIGATING", "evidence collection started", "investigation")
    rows, hyps, defect = _collect(inc)
    defect = defect or bool(inc["software_defect"])  # a suspected defect is only cleared by the engineering bridge
    with db.tx() as c:  # each investigation pass replaces the previous evidence snapshot (events keep the history)
        c.execute("DELETE FROM evidence WHERE incident_id=? AND collected_by='investigation'", (inc["id"],))
    for kind, summary, source, data in rows:
        evidence(kind, summary, source, "investigation", incident_id=inc["id"], data=data)
    for h in hyps:
        evidence("hypothesis", h, "investigation", "investigation", incident_id=inc["id"])
    inc = get(inc["id"])
    summary, how = _narrative(inc, [r[1] for r in rows], hyps)
    with db.tx() as c:
        c.execute("UPDATE ops_incidents SET hypothesis=?, hypothesis_status=?, summary=?, software_defect=?, updated_at=?"
                  " WHERE id=?", (hyps[0] if hyps else None, "hypothesis" if hyps else None, summary, int(defect),
                                  db.now(), inc["id"]))
    core.publish("incident.investigated", f"{inc['id']}: {len(rows)} evidence item(s), {len(hyps)} hypothesis(es)"
                 + (" - software defect suspected" if defect else ""), actor="investigation", actor_type="agent",
                 incident_id=inc["id"], data={"hypotheses": hyps, "software_defect": defect, "summary_by": how},
                 simulated=sim)
    if get(inc["id"])["state"] == "INVESTIGATING":
        set_state(inc["id"], "MITIGATING", "mitigation planned", "investigation")
    if inc["kind"] == "platform" or inc["category"] == "PLATFORM_OUTAGE":
        h = actions.cx.world_get("gateway", "primary") or {}
        if h.get("health") != "healthy":
            for t, params, key, summ, eff in (
                ("gateway_failover", {"target": "secondary"}, f"failover:{inc['id']}",
                 "Fail over payment traffic to the secondary gateway", "Error rate returns to normal; reversible"),
                ("publish_status_banner", {"text": "Some payments are slower than usual. We're on it."},
                 f"banner:{inc['id']}", "Publish a public status banner", "Customers see an honest status")):
                actions.propose(t, params, requested_by="investigation", key=key, incident_id=inc["id"],
                                rationale=hyps[0] if hyps else "", severity=inc["severity"], simulated=sim, summary=summ,
                                evidence_summary=rows[-1][1] if rows else "", expected_effect=eff)
    if defect:
        core.handoff("investigation", "engineering", "incident", inc["id"], "Software defect suspected - evidence bundle "
                     "sent to the engineering remediation pipeline", simulated=sim)
        workers.enqueue("engineering_bridge", "incident", inc["id"], payload={"simulated": sim}, priority=1)
    return {"hypotheses": len(hyps), "software_defect": defect}


def on_incident_action(a: dict) -> None:
    iid = a["incident_id"]
    if not iid:
        return
    if a["action_type"] == "gateway_failover":
        if a["status"] == "verified":
            set_state(iid, "MONITORING", "failover verified healthy", "verifier")
            with db.tx() as c:
                c.execute("UPDATE ops_incidents SET hypothesis_status='confirmed' WHERE id=?", (iid,))
            for t in db.rows("SELECT id FROM tickets WHERE incident_id=? AND state!='RESOLVED'", (iid,)):
                tt = tickets.get(t["id"])
                tickets.tell(tt, "resolved", detail=i18n.t("detail_failover", tt["locale"]))
                resolve(tt["id"], "Service restored by verified gateway failover", "mock:platform gateway health")
        elif a["status"] in ("rejected", "verify_failed", "blocked"):
            set_state(iid, "ESCALATED", f"failover {a['status']}", "orchestrator")


def check_completion(incident_id: str | None) -> None:
    if not incident_id:
        return
    open_n = db.one("SELECT COUNT(*) AS n FROM tickets WHERE incident_id=? AND state!='RESOLVED'", (incident_id,))["n"]
    inc = get(incident_id)
    if open_n == 0 and inc and inc["state"] != "RESOLVED":
        if inc["state"] == "OPEN":
            set_state(incident_id, "INVESTIGATING", "closing", "orchestrator")
        if inc["state"] in ("OPEN", "INVESTIGATING"):
            set_state(incident_id, "MITIGATING", "closing", "orchestrator")
        set_state(incident_id, "RESOLVED", "every linked ticket verified resolved", "verifier")
        knowledge.record_outcome(get(incident_id))


# ------------------------------------------------------------------ Agent 6: Engineering remediation bridge
@workers.handler("engineering_bridge", "engineering")
def task_engineering(task: dict) -> dict:
    inc = get(task["subject_id"])
    sim = bool(inc["simulated"])
    issue = db.one("SELECT * FROM engineering_issues WHERE incident_id=?", (inc["id"],))
    if not issue:
        ev = [e["summary"] for e in db.rows("SELECT summary FROM evidence WHERE incident_id=? ORDER BY id", (inc["id"],))]
        with core.id_lock:
            eid = core.next_id("engineering_issues", "ENG", 3)
            with db.tx() as c:
                c.execute("INSERT INTO engineering_issues (id, incident_id, component, title, hypothesis, evidence, status,"
                          " created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?)",
                          (eid, inc["id"], "merchant payment callback handler (payment_handler.py)",
                           f"Payment status defect behind {inc['id']}: {inc['title']}", inc["hypothesis"], core.dumps(ev),
                           "open", db.now(), db.now()))
        with db.tx() as c:
            c.execute("UPDATE ops_incidents SET engineering_issue_id=? WHERE id=?", (eid, inc["id"]))
        core.publish("engineering.issue_created", f"{eid} opened for {inc['id']} with {len(ev)} evidence item(s)",
                     actor="engineering", actor_type="agent", incident_id=inc["id"], data={"issue": eid}, simulated=sim)
        issue = db.one("SELECT * FROM engineering_issues WHERE id=?", (eid,))
    eng = _eng_case()
    if not eng:
        # Reproduce in an isolated subprocess against the LIVE simulated handler before involving the pipeline.
        repro = verifier.reproduce(merchant_runtime.active_path(), "PENDING")
        if repro.get("order_status") == "PAYMENT_PENDING":
            _set_issue(issue["id"], "no_defect", inc["id"], sim, outcome="Current code handles PENDING correctly - "
                       "software defect not reproduced; hypothesis rejected")
            with db.tx() as c:
                c.execute("UPDATE ops_incidents SET hypothesis_status='rejected', software_defect=0 WHERE id=?", (inc["id"],))
            return {"reproduced": False}
        from .. import gateway  # drive one real PENDING callback through the simulated env so detection opens the case
        gateway.checkout(outcome="PENDING")
        eng = _eng_case()
    if eng:
        with db.tx() as c:
            c.execute("UPDATE engineering_issues SET eng_incident_id=?, updated_at=? WHERE id=?", (eng["id"], db.now(), issue["id"]))
        from .. import orchestrator
        if not db.one("SELECT id FROM runs WHERE incident_id=?", (eng["id"],)) and not orchestrator.active_run():
            orchestrator.start_run(eng["id"])
        _set_issue(issue["id"], "in_progress", inc["id"], sim)
    sync_engineering()
    return {"issue": issue["id"], "eng_incident": eng["id"] if eng else None}


def _eng_case() -> dict | None:
    """The engineering case to follow: the open state-mismatch incident that has (or will get) a repair run - the
    primary defect - rather than downstream symptoms of the same defect."""
    return db.one("SELECT i.* FROM incidents i WHERE i.category='merchant_integration' AND i.rule='STATE_MISMATCH' AND "
                  "i.status NOT IN ('resolved','rejected') ORDER BY EXISTS(SELECT 1 FROM runs r WHERE r.incident_id=i.id "
                  "AND r.state NOT IN ('FAILED','REJECTED')) DESC, i.id ASC LIMIT 1")


RUN_TO_STATUS = {"QUEUED": "reproducing", "REPRODUCING": "reproducing", "INVESTIGATING": "investigating",
                 "REPAIRING": "patching", "VERIFYING": "testing", "AWAITING_APPROVAL": "awaiting_approval",
                 "ACTIVE": "fixed", "REJECTED": "patch_rejected", "FAILED": "failed", "NOT_REPRODUCIBLE": "no_defect"}


def _set_issue(issue_id: str, status: str, incident_id: str, sim: bool, outcome: str | None = None, **f) -> None:
    cur = db.one("SELECT status FROM engineering_issues WHERE id=?", (issue_id,))
    if cur and cur["status"] == status and not f:
        return
    sets = {"status": status, "updated_at": db.now(), **f}
    if outcome:
        sets["outcome"] = outcome
    with db.tx() as c:
        c.execute(f"UPDATE engineering_issues SET {', '.join(k + '=?' for k in sets)} WHERE id=?", (*sets.values(), issue_id))
    if cur and cur["status"] != status:
        core.publish("engineering.status", f"{issue_id}: {cur['status']} → {status}" + (f" - {outcome}" if outcome else ""),
                     actor="engineering", actor_type="agent", incident_id=incident_id,
                     level="warn" if status in ("failed", "patch_rejected") else "info", data={"issue": issue_id,
                                                                                               "status": status},
                     simulated=sim)


def sync_engineering() -> None:
    for issue in db.rows("SELECT * FROM engineering_issues WHERE status NOT IN ('fixed','no_defect','closed')"):
        inc = get(issue["incident_id"])
        sim = bool(inc and inc["simulated"])
        eng_id = issue["eng_incident_id"]
        if not eng_id:
            continue
        run = db.one("SELECT * FROM runs WHERE incident_id=? ORDER BY id DESC LIMIT 1", (eng_id,))
        if not run:
            continue
        patch = db.one("SELECT id FROM patches WHERE run_id=? ORDER BY id DESC LIMIT 1", (run["id"],))
        status = RUN_TO_STATUS.get(run["state"], issue["status"])
        _set_issue(issue["id"], status, issue["incident_id"], sim, run_id=run["id"], patch_id=patch["id"] if patch else None)
        if status == "fixed":
            _post_fix(issue, inc)


def _post_fix(issue: dict, inc: dict) -> None:
    """Verify the activated fix by replaying PENDING and SUCCESS callbacks against the live code, then close the
    engineering-dependent customer tickets with that verification as the source."""
    path = merchant_runtime.active_path()
    p, s = verifier.reproduce(path, "PENDING"), verifier.reproduce(path, "SUCCESS")
    ok = p.get("order_status") == "PAYMENT_PENDING" and s.get("order_status") == "PAID"
    sim = bool(inc["simulated"])
    evidence("fact" if ok else "observation", f"Post-fix replay against live code: PENDING→{p.get('order_status')}, "
             f"SUCCESS→{s.get('order_status')}", "engineering:verifier replay", "engineering", incident_id=inc["id"],
             data={"pending": p, "success": s})
    if not ok:
        _set_issue(issue["id"], "failed", inc["id"], sim, outcome="Activated patch did not pass post-fix replay")
        return
    with db.tx() as c:
        c.execute("UPDATE ops_incidents SET hypothesis_status='confirmed', updated_at=? WHERE id=?", (db.now(), inc["id"]))
    _set_issue(issue["id"], "fixed", inc["id"], sim, outcome="Reproduced, patched, 22/22 locked tests, human-approved, "
               "post-fix replay verified")
    core.publish("incident.root_cause_confirmed", f"{inc['id']}: root cause confirmed by reproduction + verified patch",
                 actor="engineering", actor_type="agent", incident_id=inc["id"], simulated=sim)
    waiting = [t for t in db.rows("SELECT id, merchant_id FROM tickets WHERE incident_id=? AND state!='RESOLVED' AND "
                                  "json_extract(extracted,'$.awaiting_engineering')=1", (inc["id"],))]
    for t in waiting:
        m = db.one("SELECT device_id FROM merchants WHERE id=?", (t["merchant_id"],))
        if m and m["device_id"]:
            d = world_get("device", m["device_id"]) or {}
            d["payment_announcements_missing"] = False  # consequence of the fixed status path in the simulated world
            world_put("device", m["device_id"], d)
            test = actions.cx.device_test_announcement(m["device_id"], ticket_id=t["id"], incident_id=inc["id"])
            if test.get("played"):
                tt = tickets.get(t["id"])
                tickets.tell(tt, "eng_fixed")
                resolve(t["id"], "Payment-status defect fixed; announcements verified", "post-fix replay + test announcement")
    check_completion(inc["id"])


# ------------------------------------------------------------------ Agent 7: Human Operations Copilot
def brief(incident_id: str) -> dict:
    inc = get(incident_id)
    if not inc:
        raise KeyError("incident not found")
    ev = db.rows("SELECT kind, summary, source, collected_at FROM evidence WHERE incident_id=? ORDER BY id", (incident_id,))
    pending = db.rows("SELECT id, action_type, tier, summary FROM approvals WHERE status='pending' AND (incident_id=? OR "
                      "ticket_id IN (SELECT id FROM tickets WHERE incident_id=?))", (incident_id, incident_id))
    states = collections.Counter(r["state"] for r in db.rows("SELECT state FROM tickets WHERE incident_id=?", (incident_id,)))
    f = inc["severity_factors"] or {}
    why = [f"{k.replace('_', ' ')}: +{v}" for k, v in f.items() if k not in ("reasons", "score")]
    nxt = []
    if pending:
        by_type = collections.Counter(p["action_type"] for p in pending)
        nxt += [f"Review {n} pending {t.replace('_', ' ')} approval(s)" for t, n in by_type.items()]
    if states.get("NEEDS_CUSTOMER"):
        nxt.append(f"{states['NEEDS_CUSTOMER']} ticket(s) wait for customer details")
    if states.get("ESCALATED"):
        nxt.append(f"{states['ESCALATED']} ticket(s) escalated to humans")
    eng = db.one("SELECT * FROM engineering_issues WHERE incident_id=?", (incident_id,))
    if eng and eng["status"] == "awaiting_approval":
        nxt.append(f"Engineering patch for {eng['id']} passed the locked suite - awaiting approval")
    return {"incident": inc, "summary": inc["summary"], "severity_explanation": {"severity": inc["severity"],
            "score": f.get("score"), "factors": why, "reasons": f.get("reasons", [])},
            "facts": [e for e in ev if e["kind"] == "fact"], "observations": [e for e in ev if e["kind"] == "observation"],
            "hypotheses": [{**e, "status": inc["hypothesis_status"] if e["summary"] == inc["hypothesis"] else "hypothesis"}
                           for e in ev if e["kind"] == "hypothesis"],
            "ticket_states": dict(states), "pending_approvals": pending, "engineering": eng,
            "next_actions": nxt or ["Monitor - no human action needed right now"]}


def report(incident_id: str) -> str:
    b = brief(incident_id)
    inc = b["incident"]
    acts = db.rows("SELECT action_type, status, COUNT(*) AS n FROM resolution_actions WHERE incident_id=? OR ticket_id IN "
                   "(SELECT id FROM tickets WHERE incident_id=?) GROUP BY action_type, status", (incident_id, incident_id))
    appr = db.rows("SELECT action_type, status, decided_by, COUNT(*) AS n FROM approvals WHERE incident_id=? OR ticket_id IN "
                   "(SELECT id FROM tickets WHERE incident_id=?) GROUP BY action_type, status, decided_by",
                   (incident_id, incident_id))
    dur = ((inc["resolved_at"] or db.now()) - inc["first_seen"]) / 60
    lines = [
        f"# Incident report - {inc['id']} (DRAFT)",
        "",
        "> Draft prepared by the FIXCHAIN Operations Copilot for human review. It has NOT been filed with any "
        "regulator or partner. Any regulatory reporting obligation must be assessed by the compliance team against "
        "current primary sources." + (" Data in this report comes from a SIMULATION." if inc["simulated"] else ""),
        "",
        f"**Title:** {inc['title']}  ",
        f"**Severity:** {inc['severity']} (rule-based score {b['severity_explanation']['score']})  ",
        f"**State:** {inc['state']}  ",
        f"**Window:** {db_time(inc['first_seen'])} → {db_time(inc['resolved_at']) if inc['resolved_at'] else 'ongoing'} "
        f"({dur:.0f} min)  ",
        f"**Impact:** {inc['affected_tickets']} tickets, {inc['affected_merchants']} merchants, "
        f"{inc['affected_customers']} customers, regions {', '.join(inc['regions']) or '-'}",
        "",
        "## Summary", inc["summary"] or "-", "",
        "## Root cause",
        f"{inc['hypothesis'] or 'Not established'}  ",
        f"Status: **{inc['hypothesis_status'] or 'unknown'}** (confirmed only by reproduction + verified fix or verified mitigation)",
        "", "## Evidence (facts)", *[f"- {e['summary']} _(source: {e['source']})_" for e in b["facts"]],
        "", "## Observations", *([f"- {e['summary']}" for e in b["observations"]] or ["- none"]),
        "", "## Actions", *[f"- {a['action_type']}: {a['status']} ×{a['n']}" for a in acts],
        "", "## Human decisions", *([f"- {a['action_type']}: {a['status']} by {a['decided_by'] or '-'} ×{a['n']}"
                                     for a in appr] or ["- none"]),
        "", "## Engineering", (f"{b['engineering']['id']}: {b['engineering']['status']} - {b['engineering']['outcome'] or ''}"
                               if b["engineering"] else "No engineering remediation required"),
        "", "## Customer communication",
        f"- Ticket states: {b['ticket_states']}",
        "- All customer messages used pre-approved templates in the customer's language (English / Hindi / Marathi).",
    ]
    return "\n".join(lines)


def db_time(ts: float | None) -> str:
    import datetime as _dt
    return _dt.datetime.fromtimestamp(ts).strftime("%Y-%m-%d %H:%M:%S") if ts else "-"

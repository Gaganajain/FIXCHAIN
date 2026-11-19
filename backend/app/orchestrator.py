"""Deterministic orchestrator - a explicit state machine controlling agent execution.

QUEUED -> REPRODUCING -> INVESTIGATING -> REPAIRING -> VERIFYING
       -> (VERIFY_FAILED -> REPAIRING, bounded by MAX_REPAIR_ATTEMPTS)
       -> AWAITING_APPROVAL -> APPROVED/ACTIVE | REJECTED
       -> FAILED on any unrecoverable error

Agents never transition state themselves; only this module does, based on validated
results. A patch can be activated only if the independent verifier passed every test
AND a human approved it.
"""
from __future__ import annotations

import json
import shutil
import threading
import traceback
from pathlib import Path

from . import config, db, memory, merchant_runtime
from .agents import investigator, repairer, verifier
from .agents.llm import LLMError

ACTIVE_STATES = ("QUEUED", "REPRODUCING", "INVESTIGATING", "REPAIRING", "VERIFYING", "AWAITING_APPROVAL")
_start_lock = threading.Lock()


def step(run_id: int, agent: str, status: str, message: str, data: dict | None = None) -> None:
    with db.tx() as c:
        c.execute("INSERT INTO run_steps (run_id, ts, agent, status, message, data) VALUES (?,?,?,?,?,?)",
                  (run_id, db.now(), agent, status, message, json.dumps(data, default=str) if data else None))


def handoff(run_id: int, frm: str, to: str, message: str, data: dict | None = None) -> None:
    """Explicit agent-to-agent handoff event, shown in the control room as `frm -> to`."""
    step(run_id, frm, "handoff", message, {"to": to, **(data or {})})


def set_state(run_id: int, state: str, **fields) -> None:
    sets = ["state=?"] + [f"{k}=?" for k in fields]
    with db.tx() as c:
        c.execute(f"UPDATE runs SET {', '.join(sets)} WHERE id=?", (state, *fields.values(), run_id))
    step(run_id, "orchestrator", "info", f"State -> {state}")


def active_run() -> dict | None:
    q = ",".join("?" * len(ACTIVE_STATES))
    return db.one(f"SELECT * FROM runs WHERE state IN ({q}) ORDER BY id DESC LIMIT 1", ACTIVE_STATES)


def recover_orphaned_runs() -> int:
    """On startup: runs left mid-pipeline by a crash/restart can never finish - fail them visibly.

    AWAITING_APPROVAL runs are kept: their verified patch and test record are persisted.
    """
    orphans = db.rows("SELECT id, incident_id FROM runs WHERE state IN "
                      "('QUEUED','REPRODUCING','INVESTIGATING','REPAIRING','VERIFYING')")
    for r in orphans:
        _fail(r["id"], r["incident_id"], "orchestrator",
              "Pipeline interrupted (server restarted mid-run). Nothing was activated; re-run FIXCHAIN.")

    # Patches awaiting approval that were verified against a different suite are no longer proven.
    for r in db.rows("SELECT id, incident_id FROM runs WHERE state='AWAITING_APPROVAL'"):
        t = db.one("SELECT suite_sha256 FROM test_runs WHERE run_id=? AND target='patched' ORDER BY id DESC LIMIT 1",
                   (r["id"],))
        if t and t["suite_sha256"] != verifier.PINNED_SUITE_SHA:
            with db.tx() as c:
                c.execute("UPDATE patches SET status='stale' WHERE run_id=? AND status='verified'", (r["id"],))
            _fail(r["id"], r["incident_id"], "orchestrator",
                  "Verifier suite changed since this patch was verified; its result is stale and it can no longer be "
                  "approved. Nothing was activated; re-run FIXCHAIN.")
    return len(orphans)


def maybe_autostart(incident_id: int) -> int | None:
    if active_run():
        db.log("INFO", "orchestrator", f"Incident #{incident_id} queued: another repair pipeline is in progress")
        return None
    return start_run(incident_id)


def start_run(incident_id: int) -> int:
    with _start_lock:
        existing = active_run()
        if existing:
            raise RuntimeError(f"Run #{existing['id']} for incident #{existing['incident_id']} is still in progress "
                               f"({existing['state']}). Approve or reject it first.")
        inc = db.one("SELECT category FROM incidents WHERE id=?", (incident_id,))
        if inc and inc["category"] == "external":
            raise ValueError("External incident: the merchant code behaved correctly, so there is nothing to repair. "
                             "Check the gateway configuration, then close the incident.")
        mode = config.agent_mode()
        label = config.llm_label() if mode == "llm" else "offline deterministic"
        with db.tx() as c:
            cur = c.execute("INSERT INTO runs (incident_id, state, agent_mode, agent_label, started_at)"
                            " VALUES (?,?,?,?,?)", (incident_id, "QUEUED", mode, label, db.now()))
            run_id = cur.lastrowid
            c.execute("UPDATE incidents SET status='investigating' WHERE id=?", (incident_id,))
    step(run_id, "orchestrator", "started", f"Repair pipeline started for incident #{incident_id}",
         {"agent_mode": mode, "provider": config.llm_provider() if mode == "llm" else None,
          "model": config.llm_model() if mode == "llm" else None})
    threading.Thread(target=_execute, args=(run_id,), daemon=True, name=f"fixchain-run-{run_id}").start()
    return run_id


def _save_tests(run_id: int, patch_id: int | None, target: str, res: dict) -> int:
    with db.tx() as c:
        cur = c.execute(
            "INSERT INTO test_runs (run_id, patch_id, target, passed, failed, errors, total, duration_s, suite_sha256,"
            " results, raw_output, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)",
            (run_id, patch_id, target, res["passed"], res["failed"], res["errors"], res["total"], res["duration_s"],
             res["suite_sha256"], json.dumps(res["results"]), res["raw_output"], db.now()))
        return cur.lastrowid


def _fail(run_id: int, incident_id: int, agent: str, message: str) -> None:
    step(run_id, agent, "failed", message)
    set_state(run_id, "FAILED", finished_at=db.now(), error=message)
    with db.tx() as c:
        c.execute("UPDATE incidents SET status='open' WHERE id=?", (incident_id,))


def _execute(run_id: int) -> None:
    run = db.one("SELECT * FROM runs WHERE id=?", (run_id,))
    incident = db.one("SELECT * FROM incidents WHERE id=?", (run["incident_id"],))
    mode = run["agent_mode"]
    try:
        n_orders = db.one("SELECT COUNT(*) AS n FROM incident_orders WHERE incident_id=?", (incident["id"],))["n"]
        step(run_id, "detection", "succeeded",
             f"Detected {incident['fingerprint']}: gateway {incident['gateway_status']} recorded as "
             f"{incident['observed_order_status']} (contract requires {incident['expected_order_status']}); "
             f"{incident['occurrences']} occurrence(s) across {n_orders} order(s), severity {incident['severity']}",
             {"fingerprint": incident["fingerprint"], "orders": n_orders})
        handoff(run_id, "detection", "verifier", "Incident handed to the verifier to reproduce against the live code")
        # ---- isolated sandbox: a copy of the live simulated merchant code
        sandbox = config.SANDBOX_ROOT / f"run_{run_id}"
        if sandbox.exists():
            shutil.rmtree(sandbox)
        merchant_dir = sandbox / "merchant"
        baseline_dir = sandbox / "baseline"
        merchant_dir.mkdir(parents=True)
        baseline_dir.mkdir(parents=True)
        for f in config.APPROVED_FILES + config.READ_ONLY_CONTEXT:
            shutil.copyfile(config.MERCHANT_ACTIVE_DIR / f, merchant_dir / f)
            shutil.copyfile(config.MERCHANT_ACTIVE_DIR / f, baseline_dir / f)
        with db.tx() as c:
            c.execute("UPDATE runs SET sandbox_path=? WHERE id=?", (str(sandbox), run_id))
        step(run_id, "orchestrator", "info", "Isolated sandbox created from the live simulated merchant code",
             {"files": config.APPROVED_FILES, "verifier_suite_sha256": verifier.PINNED_SUITE_SHA[:16]})

        # ---- 1. reproduce
        set_state(run_id, "REPRODUCING")
        step(run_id, "verifier", "started", "Reproducing: replaying the incident callback and running the "
                                            "independent suite against the CURRENT code")
        repro = verifier.reproduce(baseline_dir / merchant_runtime.HANDLER_FILE, incident["gateway_status"] or "PENDING")
        base = verifier.run_suite(baseline_dir, sandbox / "reports")
        _save_tests(run_id, None, "baseline", base)
        reproduced = repro.get("order_status") != incident["expected_order_status"] or not base["all_passed"]
        step(run_id, "verifier", "succeeded" if reproduced else "info",
             f"Baseline: {base['passed']}/{base['total']} tests passed. Replayed {repro.get('gateway_status')} "
             f"callback -> order {repro.get('order_status')} (expected {incident['expected_order_status']}).",
             {"reproduction": repro, "failed_tests": [r["name"] for r in base["results"] if r["outcome"] != "passed"]})
        if not reproduced:
            _not_reproducible(run_id, incident, base)
            return
        with db.tx() as c:
            c.execute("UPDATE runs SET classification='merchant_code_defect' WHERE id=?", (run_id,))
        handoff(run_id, "verifier", "investigator",
                f"Reproduced. Handing over the incident, {base['failed'] + base['errors']} failing test(s) and the "
                f"sandboxed source", {"failing_tests": [r["name"] for r in base["results"] if r["outcome"] != "passed"]})

        # ---- 2. investigate
        set_state(run_id, "INVESTIGATING")
        hint = db.one("SELECT * FROM memory WHERE id=?", (incident["similar_memory_id"],)) \
            if incident["similar_memory_id"] else None
        if hint:
            step(run_id, "memory", "info", f"Similar resolved defect found in incident memory "
                                           f"(seen {hint['times_seen']}x): {hint['root_cause']}", {"memory_id": hint["id"]})
        step(run_id, "investigator", "started",
             f"Reading approved files {config.APPROVED_FILES} and sanitised logs"
             + (f" with {run['agent_label']}" if mode == "llm" else " (offline AST analysis)"))
        inv = investigator.investigate(
            incident, merchant_dir, mode, hint,
            on_event=lambda status, msg, data=None: step(run_id, "investigator", status, msg, data))
        with db.tx() as c:
            c.execute("UPDATE runs SET investigation=? WHERE id=?", (json.dumps(inv), run_id))
        step(run_id, "investigator", "succeeded",
             f"Root cause in {inv['file']}::{inv['function']}() lines {inv['line_start']}-{inv['line_end']} "
             f"[{inv.get('analysis_method', mode)}]: {inv['root_cause']}", inv)
        if hint:
            cmp = memory.compare(hint, inv)
            step(run_id, "memory", "info",
                 (f"Same root cause as remembered defect #{hint['id']} ({cmp['investigated']}). The fix is regenerated "
                  f"and must pass the independent suite again - the old patch is never reapplied.")
                 if cmp["same_root_cause"] else
                 (f"Different root cause from remembered defect #{hint['id']}: memory pointed at {cmp['remembered']}, "
                  f"investigation found {cmp['investigated']}. Memory hint not used."), cmp)
        if inv.get("evidence_unverified"):
            step(run_id, "investigator", "info",
                 f"{inv['evidence_unverified']} evidence line(s) cite order IDs that are not in this incident - "
                 f"flagged as unverified for the reviewer")

        handoff(run_id, "investigator", "repairer",
                f"Validated root cause handed over: {inv['file']}::{inv['function']}() lines "
                f"{inv['line_start']}-{inv['line_end']}", {"fix_strategy": inv.get("fix_strategy")})

        # ---- 3/4. repair + verify loop
        feedback = None
        for attempt in range(1, config.MAX_REPAIR_ATTEMPTS + 1):
            set_state(run_id, "REPAIRING")
            # reset sandbox file to baseline for each attempt
            for f in config.APPROVED_FILES:
                shutil.copyfile(baseline_dir / f, merchant_dir / f)
            step(run_id, "repairer", "started", f"Attempt {attempt}: generating a patch in the sandbox"
                                                 + (" using verifier feedback" if feedback else ""))
            try:
                proposal = repairer.propose(inv, merchant_dir, mode, feedback)
            except LLMError as exc:  # provider outage must not end the run: use the labelled offline repair
                step(run_id, "repairer", "blocked",
                     f"LLM repair unavailable ({exc}) - using the offline contract-based repair for this attempt")
                proposal = repairer.propose(inv, merchant_dir, "offline", feedback)
            try:
                changed = repairer.apply_edits(merchant_dir, proposal["edits"])
            except repairer.RepairError as exc:
                step(run_id, "repairer", "blocked", str(exc))
                feedback = f"Your previous edits could not be applied: {exc}"
                continue
            file, (orig, patched) = next(iter(changed.items()))
            diff = repairer.unified_diff(file, orig, patched)
            problems = repairer.policy_check(patched)
            with db.tx() as c:
                cur = c.execute(
                    "INSERT INTO patches (run_id, incident_id, attempt, file, original_code, patched_code, diff,"
                    " explanation, status, created_at) VALUES (?,?,?,?,?,?,?,?,?,?)",
                    (run_id, incident["id"], attempt, file, orig, patched, diff,
                     proposal.get("explanation", "") + (f"\n\nRisk notes: {proposal['risk_notes']}"
                                                        if proposal.get("risk_notes") else ""),
                     "policy_rejected" if problems else "generated", db.now()))
                patch_id = cur.lastrowid
            if problems:
                step(run_id, "policy", "blocked", "Patch rejected by the safety policy", {"problems": problems})
                handoff(run_id, "policy", "repairer", f"Patch #{patch_id} sent back with {len(problems)} policy violation(s)")
                feedback = "Policy violations: " + "; ".join(problems)
                continue
            step(run_id, "repairer", "succeeded",
                 f"Patch #{patch_id} generated for {file} (+{diff.count(chr(10) + '+') - 1}/-{diff.count(chr(10) + '-') - 1} lines)",
                 {"patch_id": patch_id, "explanation": proposal.get("explanation")})
            step(run_id, "policy", "succeeded", f"Patch #{patch_id} passed the safety policy (compiles, allowed imports "
                                                f"only, no undefined names, public interface intact)")
            handoff(run_id, "repairer", "verifier", f"Patch #{patch_id} handed to the independent verifier",
                    {"patch_id": patch_id})

            set_state(run_id, "VERIFYING")
            step(run_id, "verifier", "started", "Running the independent payment-correctness suite on the patched sandbox")
            res = verifier.run_suite(merchant_dir, sandbox / "reports")
            _save_tests(run_id, patch_id, "patched", res)
            repro_after = verifier.reproduce(merchant_dir / merchant_runtime.HANDLER_FILE,
                                             incident["gateway_status"] or "PENDING")
            if res["all_passed"]:
                with db.tx() as c:
                    c.execute("UPDATE patches SET status='verified' WHERE id=?", (patch_id,))
                    c.execute("UPDATE runs SET verified_at=? WHERE id=?", (db.now(), run_id))
                    c.execute("UPDATE incidents SET status='awaiting_approval' WHERE id=?", (incident["id"],))
                step(run_id, "verifier", "succeeded",
                     f"All {res['total']} independent tests passed. Replayed {repro_after.get('gateway_status')} "
                     f"callback -> order {repro_after.get('order_status')}.", {"reproduction_after": repro_after})
                set_state(run_id, "AWAITING_APPROVAL")
                handoff(run_id, "verifier", "human", f"Verified patch #{patch_id} handed to a developer for approval. "
                                                     f"Nothing has been activated.", {"patch_id": patch_id})
                return
            failed = [r for r in res["results"] if r["outcome"] != "passed"]
            with db.tx() as c:
                c.execute("UPDATE patches SET status='verify_failed' WHERE id=?", (patch_id,))
            step(run_id, "verifier", "failed", f"{len(failed)} of {res['total']} tests failed on patch #{patch_id}",
                 {"failed_tests": [r["name"] for r in failed]})
            feedback = "Failing independent tests:\n" + "\n".join(f"- {r['name']}: {r['message'][:300]}" for r in failed)
            if attempt < config.MAX_REPAIR_ATTEMPTS:
                handoff(run_id, "verifier", "repairer", f"{len(failed)} failing test(s) and their assertion messages "
                                                        f"sent back to the repairer")
        _fail(run_id, incident["id"], "orchestrator",
              f"No verified patch after {config.MAX_REPAIR_ATTEMPTS} attempt(s). Escalating to a human engineer.")
    except (LLMError, investigator.InvestigationError, repairer.RepairError, verifier.SuiteTamperedError) as exc:
        _fail(run_id, incident["id"], "orchestrator", str(exc))
    except Exception as exc:  # pragma: no cover
        _fail(run_id, incident["id"], "orchestrator", f"Unexpected error: {exc}")
        db.log("ERROR", "orchestrator", traceback.format_exc())
    finally:
        after_run()


def _orders_match_gateway(incident_id: int) -> tuple[bool, int]:
    from . import detection

    orders = db.rows("SELECT o.status, g.status AS gw FROM incident_orders io JOIN orders o ON o.order_id=io.order_id"
                     " JOIN gateway_txns g ON g.txn_id=io.txn_id WHERE io.incident_id=?", (incident_id,))
    bad = [o for o in orders if o["status"] != detection.expected_state(o["gw"])]
    return bool(orders) and not bad, len(bad)


def _not_reproducible(run_id: int, incident: dict, base: dict) -> None:
    """The current code handles this callback correctly: there is no code defect to repair.

    Typical case: orders were wrongly finalised by an earlier, already-fixed defect, so a later
    settlement was (correctly) ignored. Those orders need reconciliation, not a patch.
    """
    version = merchant_runtime.active_version_id()
    step(run_id, "verifier", "succeeded",
         f"No code defect: the current code (version {version}) passes {base['passed']}/{base['total']} independent "
         f"tests and handles a {incident['gateway_status']} callback correctly. No patch is needed.")
    consistent, bad = _orders_match_gateway(incident["id"])
    if consistent:
        with db.tx() as c:
            c.execute("UPDATE incidents SET status='resolved', resolved_at=? WHERE id=?", (db.now(), incident["id"]))
            c.execute("UPDATE incident_orders SET reconciled=1 WHERE incident_id=?", (incident["id"],))
        step(run_id, "orchestrator", "succeeded", "All affected orders already match the gateway - incident resolved")
    else:
        with db.tx() as c:
            c.execute("UPDATE incidents SET status='needs_reconciliation' WHERE id=?", (incident["id"],))
        step(run_id, "orchestrator", "info",
             f"{bad} affected order(s) still disagree with the gateway because an earlier defect finalised them. "
             f"Reconcile them from the gateway's authoritative status.")
    set_state(run_id, "NOT_REPRODUCIBLE", finished_at=db.now(), classification="no_code_defect")


def after_run() -> None:
    """Housekeeping whenever a run ends or a decision is made: close incidents that observed order
    state proves are fixed, then start the next incident that never got a run (it was queued)."""
    try:
        _close_downstream_incidents()
        if active_run():
            return
        nxt = db.one("SELECT i.id FROM incidents i WHERE i.status='open' AND i.category='merchant_integration'"
                     " AND NOT EXISTS "
                     "(SELECT 1 FROM runs r WHERE r.incident_id=i.id) ORDER BY i.id LIMIT 1")
        if nxt and config.AUTO_INVESTIGATE:
            db.log("INFO", "orchestrator", f"Starting queued incident #{nxt['id']}")
            start_run(nxt["id"])
    except Exception:  # housekeeping must never break the caller
        db.log("ERROR", "orchestrator", traceback.format_exc())


# ------------------------------------------------------------------ human decisions
def approve(patch_id: int, note: str = "", who: str = "developer") -> dict:
    patch = db.one("SELECT * FROM patches WHERE id=?", (patch_id,))
    if not patch:
        raise KeyError("patch not found")
    run = db.one("SELECT * FROM runs WHERE id=?", (patch["run_id"],))
    if patch["status"] != "verified" or run["state"] != "AWAITING_APPROVAL":
        raise ValueError("Only a verified patch awaiting approval can be activated")
    latest = db.one("SELECT * FROM test_runs WHERE patch_id=? ORDER BY id DESC LIMIT 1", (patch_id,))
    if not latest or latest["passed"] != latest["total"] or latest["total"] == 0:
        raise ValueError("Patch has no passing verification record")
    if latest["suite_sha256"] != verifier.suite_sha256():
        raise ValueError("The verifier suite changed after this patch was verified - its passing record is stale. "
                         "Re-run FIXCHAIN to verify against the current suite.")
    if merchant_runtime.read_active(patch["file"]) != patch["original_code"]:
        raise ValueError("Live simulated code changed since this patch was generated - re-run the pipeline")
    vid = merchant_runtime.activate_code(patch["patched_code"], "patch", f"Patch #{patch_id} approved: {note}",
                                         patch_id=patch_id, file=patch["file"])
    with db.tx() as c:
        c.execute("UPDATE patches SET status='approved', decided_at=?, decided_by=?, decision_note=? WHERE id=?",
                  (db.now(), who, note, patch_id))
        c.execute("UPDATE incidents SET status='resolved', resolved_at=? WHERE id=?", (db.now(), patch["incident_id"]))
    set_state(run["id"], "ACTIVE", finished_at=db.now())
    step(run["id"], "human", "succeeded", f"Patch #{patch_id} approved by {who} and activated in the SIMULATED "
                                          f"environment as code version {vid}", {"note": note})
    incident = db.one("SELECT * FROM incidents WHERE id=?", (patch["incident_id"],))
    inv = json.loads(run["investigation"]) if run["investigation"] else None
    handoff(run["id"], "human", "memory", "Approved defect and fix handed to incident memory")
    mem_id = memory.remember(incident, inv, patch)
    step(run["id"], "memory", "succeeded", f"Defect stored in incident memory (#{mem_id})")
    after_run()
    return {"version_id": vid, "memory_id": mem_id}


def reject(patch_id: int, note: str = "", who: str = "developer") -> None:
    patch = db.one("SELECT * FROM patches WHERE id=?", (patch_id,))
    if not patch:
        raise KeyError("patch not found")
    run = db.one("SELECT * FROM runs WHERE id=?", (patch["run_id"],))
    if run["state"] != "AWAITING_APPROVAL":
        raise ValueError("Patch is not awaiting a decision")
    with db.tx() as c:
        c.execute("UPDATE patches SET status='rejected', decided_at=?, decided_by=?, decision_note=? WHERE id=?",
                  (db.now(), who, note, patch_id))
        c.execute("UPDATE incidents SET status='open' WHERE id=?", (patch["incident_id"],))
    set_state(run["id"], "REJECTED", finished_at=db.now())
    step(run["id"], "human", "info", f"Patch #{patch_id} rejected by {who}. Live code unchanged.", {"note": note})
    after_run()


def rollback(version_id: int, who: str = "developer") -> int:
    ver = db.one("SELECT * FROM code_versions WHERE id=?", (version_id,))
    if not ver:
        raise KeyError("version not found")
    current = db.one("SELECT * FROM code_versions WHERE file=? AND active=1", (ver["file"],))
    vid = merchant_runtime.activate_code(ver["code"], "rollback", f"Restored version {version_id} by {who}",
                                         file=ver["file"])
    if current and current["patch_id"]:
        with db.tx() as c:
            c.execute("UPDATE patches SET status='rolled_back' WHERE id=?", (current["patch_id"],))
    return vid


def reconcile(incident_id: int, who: str = "developer") -> list[dict]:
    """After an approved fix: re-sync affected orders with the gateway's authoritative status.

    Uses the gateway status API (not an AI prediction) and pushes a fresh signed callback
    through the now-patched handler.
    """
    from . import gateway

    incident = db.one("SELECT * FROM incidents WHERE id=?", (incident_id,))
    if not incident:
        raise KeyError("incident not found")
    latest = db.one("SELECT state FROM runs WHERE incident_id=? ORDER BY id DESC LIMIT 1", (incident_id,))
    proven_ok = latest and latest["state"] == "NOT_REPRODUCIBLE"  # current code verified correct for this case
    if incident["status"] != "resolved" and not (incident["status"] == "needs_reconciliation" and proven_ok):
        raise ValueError("Reconciliation is only allowed after an approved, activated fix, or when the current "
                         "code was verified to handle this case correctly")
    out = []
    for io in db.rows("SELECT * FROM incident_orders WHERE incident_id=? AND reconciled=0", (incident_id,)):
        g = gateway.query_status(io["txn_id"])
        if not g:
            continue
        before = db.one("SELECT status FROM orders WHERE order_id=?", (io["order_id"],))["status"]
        with db.tx() as c:  # merchant ops action, human-triggered, fully logged
            c.execute("UPDATE orders SET status='PAYMENT_INITIATED', updated_at=? WHERE order_id=?",
                      (db.now(), io["order_id"]))
        db.log("WARN", "reconciliation", f"Order {io['order_id']} reset from {before} for re-sync with gateway "
                                         f"status {g['status']} (requested by {who})", incident_id=incident_id,
               reviewer=who)
        result = gateway.reconciliation_callback(io["txn_id"])
        after = db.one("SELECT status FROM orders WHERE order_id=?", (io["order_id"],))["status"]
        with db.tx() as c:
            c.execute("UPDATE incident_orders SET reconciled=1 WHERE incident_id=? AND order_id=?",
                      (incident_id, io["order_id"]))
        out.append({"order_id": io["order_id"], "gateway_status": g["status"], "before": before, "after": after,
                    "result": result.get("reason")})
    run = db.one("SELECT id FROM runs WHERE incident_id=? ORDER BY id DESC LIMIT 1", (incident_id,))
    if run and out:
        step(run["id"], "human", "succeeded", f"{who} reconciled {len(out)} order(s) from the gateway's authoritative "
                                               f"status", {"orders": out})
    _close_downstream_incidents()
    return out


def _close_downstream_incidents() -> None:
    """Close open incidents whose every affected order now matches the gateway's authoritative status.

    Example: SUCCESS settlements ignored because the bug had already (wrongly) finalised the order.
    Closed only from observed order state - never from a prediction.
    """
    from . import detection

    if active_run():
        return
    for inc in db.rows("SELECT * FROM incidents WHERE status IN ('open','needs_reconciliation')"
                       " AND category='merchant_integration'"):
        orders = db.rows("SELECT io.order_id, o.status, g.status AS gw FROM incident_orders io "
                         "JOIN orders o ON o.order_id=io.order_id JOIN gateway_txns g ON g.txn_id=io.txn_id "
                         "WHERE io.incident_id=?", (inc["id"],))
        if orders and all(o["status"] == detection.expected_state(o["gw"]) for o in orders):
            with db.tx() as c:
                c.execute("UPDATE incidents SET status='resolved', resolved_at=? WHERE id=?", (db.now(), inc["id"]))
                c.execute("UPDATE incident_orders SET reconciled=1 WHERE incident_id=?", (inc["id"],))
            db.log("INFO", "reconciliation", f"Incident #{inc['id']} closed: all {len(orders)} affected orders now "
                                             f"match the gateway's authoritative status")


def close_external(incident_id: int, note: str, who: str) -> None:
    """A reviewer closes an external incident after checking the gateway side (no code was changed)."""
    inc = db.one("SELECT * FROM incidents WHERE id=?", (incident_id,))
    if not inc:
        raise KeyError("incident not found")
    if inc["category"] != "external":
        raise ValueError("Only external incidents can be closed manually; merchant defects close from observed state")
    if inc["status"] == "resolved":
        raise ValueError("Incident is already resolved")
    with db.tx() as c:
        c.execute("UPDATE incidents SET status='resolved', resolved_at=? WHERE id=?", (db.now(), incident_id))
    db.log("INFO", "human", f"External incident #{incident_id} closed by {who}: {note or 'no note'}",
           incident_id=incident_id, reviewer=who)

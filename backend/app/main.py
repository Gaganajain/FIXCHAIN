"""FIXCHAIN API."""
from __future__ import annotations

import json
import shutil
from contextlib import asynccontextmanager
from typing import Literal

from fastapi import Depends, FastAPI, Header, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from . import config, db, detection, gateway, merchant_runtime, orchestrator
from .agents import verifier

@asynccontextmanager
async def lifespan(_app: FastAPI):
    db.init_db()
    merchant_runtime.ensure_workspace()
    orchestrator.recover_orphaned_runs()
    yield


app = FastAPI(title="FIXCHAIN", version="0.1.0", lifespan=lifespan,
              description="Autonomous payment-integration reliability engineer (simulated environment)")
app.add_middleware(CORSMiddleware, allow_origins=config.CORS_ORIGINS, allow_methods=["*"], allow_headers=["*"])


# ------------------------------------------------------------------ models
class CheckoutIn(BaseModel):
    outcome: Literal["SUCCESS", "FAILED", "PENDING", "RANDOM"] = "RANDOM"
    amount: int | None = Field(None, ge=100, le=10_000_000)


class BatchIn(BaseModel):
    count: int = Field(10, ge=1, le=200)
    outcome: Literal["SUCCESS", "FAILED", "PENDING", "RANDOM"] = "RANDOM"


class ReplayIn(BaseModel):
    duplicate: bool = True
    tamper: bool = False


class DecisionIn(BaseModel):
    note: str = ""


class ResetIn(BaseModel):
    inject_bug: bool = False


def reviewer(x_reviewer: str = Header(""), x_reviewer_token: str = Header("")) -> str:
    """Who is making a decision that changes the simulated live environment.

    A reviewer name is always required (recorded in the audit trail). If FIXCHAIN_REVIEWER_TOKEN is set,
    the matching X-Reviewer-Token header is required too.
    """
    import hmac

    name = " ".join(x_reviewer.split())[:60]
    if not name:
        raise HTTPException(401, "Reviewer name required: enter your name in the top bar before deciding")
    if config.REVIEWER_TOKEN and not hmac.compare_digest(x_reviewer_token, config.REVIEWER_TOKEN):
        raise HTTPException(401, "Invalid or missing reviewer token")
    return name


def _http(fn, *a, **kw):
    try:
        return fn(*a, **kw)
    except KeyError as e:
        raise HTTPException(404, str(e))
    except (ValueError, RuntimeError, PermissionError) as e:
        raise HTTPException(409, str(e))


# ------------------------------------------------------------------ status / demo control
@app.get("/api/status")
def status():
    ver = db.one("SELECT id, source, note, created_at FROM code_versions WHERE active=1")
    code = merchant_runtime.read_active()
    return {
        "environment": "SIMULATED", "agent_mode": config.agent_mode(),
        "model": config.llm_model() if config.agent_mode() == "llm" else None,
        "provider": config.llm_provider() if config.agent_mode() == "llm" else None,
        "agent_label": config.llm_label() if config.agent_mode() == "llm" else "offline",
        "active_version": ver,
        "bug_present": {k: b["replace"] in code for k, b in merchant_runtime.BUGS.items()},
        "verifier_suite_sha256": verifier.PINNED_SUITE_SHA,
        "verifier_suite_intact": verifier.suite_sha256() == verifier.PINNED_SUITE_SHA,
        "approved_files": config.APPROVED_FILES, "auto_investigate": config.AUTO_INVESTIGATE,
        "reviewer_token_required": bool(config.REVIEWER_TOKEN),
        "active_run": orchestrator.active_run(),
    }


@app.post("/api/demo/reset")
def reset(body: ResetIn):
    if orchestrator.active_run() and orchestrator.active_run()["state"] not in ("AWAITING_APPROVAL",):
        raise HTTPException(409, "A pipeline is running; wait for it to finish")
    with db.tx() as c:
        for t in ("orders", "gateway_txns", "processed_events", "payment_events", "app_logs", "incidents",
                  "incident_orders", "runs", "run_steps", "patches", "test_runs", "code_versions"):
            c.execute(f"DELETE FROM {t}")
    shutil.rmtree(config.SANDBOX_ROOT, ignore_errors=True)
    merchant_runtime.ensure_workspace()
    if body.inject_bug:
        merchant_runtime.inject_bug("pending_as_failed")
    return {"ok": True, "note": "Incident memory is kept across resets"}


@app.get("/api/bugs")
def bugs():
    code = merchant_runtime.read_active()
    return [{"id": k, "title": b["title"], "description": b["description"], "present": b["replace"] in code}
            for k, b in merchant_runtime.BUGS.items()]


@app.post("/api/bugs/{bug_id}/inject")
def inject(bug_id: str):
    return {"version_id": _http(merchant_runtime.inject_bug, bug_id)}


# ------------------------------------------------------------------ simulation
@app.post("/api/checkout")
def checkout(body: CheckoutIn):
    return gateway.checkout(body.amount, body.outcome)


@app.post("/api/simulate/batch")
def batch(body: BatchIn):
    res = [gateway.checkout(None, body.outcome) for _ in range(body.count)]
    return {"count": len(res), "by_order_status": _count(r["order_status"] for r in res),
            "by_gateway_status": _count(r["gateway_status"] for r in res)}


@app.post("/api/gateway/settle")
def settle():
    res = gateway.settle_pending()
    return {"settled": len(res), "results": res}


@app.post("/api/gateway/replay")
def replay(body: ReplayIn):
    return _http(gateway.replay_last_callback, body.duplicate, body.tamper)


@app.post("/api/merchant/webhook")
async def merchant_webhook(request: Request, x_simpay_signature: str = Header("")):
    """Real HTTP webhook endpoint (used by the HTTP integration tests / curl)."""
    payload = await request.json()
    result = merchant_runtime.process_callback(payload, x_simpay_signature)
    if result.get("http_status", 200) >= 400:
        raise HTTPException(result["http_status"], result.get("reason"))
    return result


def _count(it):
    d: dict[str, int] = {}
    for x in it:
        d[x] = d.get(x, 0) + 1
    return d


# ------------------------------------------------------------------ read models
@app.get("/api/orders")
def orders(limit: int = 50):
    return db.rows("SELECT o.*, g.status AS gateway_status FROM orders o LEFT JOIN gateway_txns g ON g.txn_id=o.txn_id"
                   " ORDER BY o.created_at DESC LIMIT ?", (limit,))


@app.get("/api/events")
def events(limit: int = 60):
    return db.rows("SELECT * FROM payment_events ORDER BY id DESC LIMIT ?", (limit,))


@app.get("/api/logs")
def logs(limit: int = 60):
    return db.rows("SELECT * FROM app_logs ORDER BY id DESC LIMIT ?", (limit,))


def _impact(incident_id: int) -> dict:
    rows = db.rows("SELECT io.*, o.status AS order_status, g.status AS gateway_status FROM incident_orders io"
                   " LEFT JOIN orders o ON o.order_id=io.order_id LEFT JOIN gateway_txns g ON g.txn_id=io.txn_id"
                   " WHERE io.incident_id=?", (incident_id,))
    paid_but_failed = [r for r in rows if r["gateway_status"] == "SUCCESS" and r["order_status"] == "PAYMENT_FAILED"]
    pending = [r for r in rows if r["gateway_status"] == "PENDING"]
    at_risk = sum(r["amount"] or 0 for r in rows if r["gateway_status"] in ("SUCCESS", "PENDING")
                  and r["order_status"] != detection.expected_state(r["gateway_status"]))
    inc = db.one("SELECT category FROM incidents WHERE id=?", (incident_id,))
    if inc and inc["category"] == "external":
        # The handler rejected these callbacks, so they changed no order: nothing is at risk from THIS incident.
        return {"affected_orders": len(rows), "affected_amount": 0, "still_pending_at_gateway": 0,
                "paid_but_marked_failed": 0, "revenue_at_risk": 0, "reconciled": len(rows),
                "label": "No order was changed by this incident: every forged/invalid callback was rejected",
                "orders": rows}
    return {"affected_orders": len(rows), "affected_amount": sum(r["amount"] or 0 for r in rows),
            "still_pending_at_gateway": len(pending), "paid_but_marked_failed": len(paid_but_failed),
            "revenue_at_risk": at_risk, "reconciled": sum(r["reconciled"] for r in rows),
            "label": "Simulated estimate - based only on simulated orders", "orders": rows}


@app.get("/api/incidents")
def incidents():
    out = []
    for inc in db.rows("SELECT * FROM incidents ORDER BY id DESC"):
        run = db.one("SELECT id, state, agent_mode FROM runs WHERE incident_id=? ORDER BY id DESC LIMIT 1", (inc["id"],))
        imp = _impact(inc["id"])
        imp.pop("orders")
        out.append({**inc, "latest_run": run, "impact": imp})
    return out


@app.get("/api/incidents/{incident_id}")
def incident_detail(incident_id: int):
    inc = db.one("SELECT * FROM incidents WHERE id=?", (incident_id,))
    if not inc:
        raise HTTPException(404, "incident not found")
    runs = []
    for r in db.rows("SELECT * FROM runs WHERE incident_id=? ORDER BY id DESC", (incident_id,)):
        r["investigation"] = json.loads(r["investigation"]) if r["investigation"] else None
        r["steps"] = [{**s, "data": json.loads(s["data"]) if s["data"] else None}
                      for s in db.rows("SELECT * FROM run_steps WHERE run_id=? ORDER BY id", (r["id"],))]
        r["patches"] = db.rows("SELECT * FROM patches WHERE run_id=? ORDER BY id", (r["id"],))
        r["tests"] = [{**t, "results": json.loads(t["results"])}
                      for t in db.rows("SELECT * FROM test_runs WHERE run_id=? ORDER BY id", (r["id"],))]
        r["time_to_verified_s"] = round(r["verified_at"] - inc["first_seen"], 1) if r["verified_at"] else None
        r["pipeline_duration_s"] = round(r["verified_at"] - r["started_at"], 1) if r["verified_at"] else None
        runs.append(r)
    similar = db.one("SELECT * FROM memory WHERE id=?", (inc["similar_memory_id"],)) if inc["similar_memory_id"] else None
    return {**inc, "impact": _impact(incident_id), "runs": runs, "similar_memory": similar}


@app.post("/api/incidents/{incident_id}/run")
def run_incident(incident_id: int):
    if not db.one("SELECT id FROM incidents WHERE id=?", (incident_id,)):
        raise HTTPException(404, "incident not found")
    return {"run_id": _http(orchestrator.start_run, incident_id)}


@app.post("/api/incidents/{incident_id}/reconcile")
def reconcile(incident_id: int, who: str = Depends(reviewer)):
    return {"reconciled": _http(orchestrator.reconcile, incident_id, who)}


@app.post("/api/incidents/{incident_id}/close")
def close_incident(incident_id: int, body: DecisionIn, who: str = Depends(reviewer)):
    _http(orchestrator.close_external, incident_id, body.note, who)
    return {"ok": True}


@app.post("/api/patches/{patch_id}/approve")
def approve(patch_id: int, body: DecisionIn, who: str = Depends(reviewer)):
    return _http(orchestrator.approve, patch_id, body.note, who)


@app.post("/api/patches/{patch_id}/reject")
def reject_patch(patch_id: int, body: DecisionIn, who: str = Depends(reviewer)):
    _http(orchestrator.reject, patch_id, body.note, who)
    return {"ok": True}


@app.get("/api/patches")
def patches():
    return db.rows("SELECT p.id, p.run_id, p.incident_id, p.attempt, p.file, p.status, p.created_at, p.decided_at,"
                   " p.decided_by, p.decision_note, p.explanation, i.title AS incident_title FROM patches p"
                   " JOIN incidents i ON i.id=p.incident_id ORDER BY p.id DESC")


@app.get("/api/versions")
def versions():
    return db.rows("SELECT id, file, source, patch_id, note, created_at, active, code FROM code_versions ORDER BY id DESC")


@app.post("/api/versions/{version_id}/rollback")
def rollback(version_id: int, who: str = Depends(reviewer)):
    return {"version_id": _http(orchestrator.rollback, version_id, who)}


@app.get("/api/memory")
def memory_list():
    return db.rows("SELECT * FROM memory ORDER BY last_seen DESC")


@app.get("/api/metrics")
def metrics(buckets: int = 24):
    cb = db.rows("SELECT ts, gateway_status, order_status_after, handler_reason, code_version FROM payment_events"
                 " WHERE kind='callback_result' ORDER BY ts")
    counted = [e for e in cb if e["handler_reason"] not in detection.LEGIT_REJECTIONS]
    mism = [e for e in counted if e["order_status_after"] != detection.expected_state(e["gateway_status"])]
    series = []
    if cb:
        t0, t1 = cb[0]["ts"], max(cb[-1]["ts"], cb[0]["ts"] + 1)
        width = (t1 - t0) / buckets
        for i in range(buckets):
            lo, hi = t0 + i * width, t0 + (i + 1) * width
            seg = [e for e in cb if lo <= e["ts"] < hi or (i == buckets - 1 and e["ts"] == t1)]
            series.append({
                "t": hi,
                "SUCCESS": sum(e["gateway_status"] == "SUCCESS" for e in seg),
                "FAILED": sum(e["gateway_status"] == "FAILED" for e in seg),
                "PENDING": sum(e["gateway_status"] == "PENDING" for e in seg),
                "mismatches": sum(1 for e in seg if e["handler_reason"] not in detection.LEGIT_REJECTIONS
                                  and e["order_status_after"] != detection.expected_state(e["gateway_status"])),
            })
    order_status = _count(o["status"] for o in db.rows("SELECT status FROM orders"))
    gw_status = _count(g["status"] for g in db.rows("SELECT status FROM gateway_txns"))
    rejections = _count(e["handler_reason"] for e in cb if e["handler_reason"] in detection.LEGIT_REJECTIONS)
    # Integration health judges the CURRENT code only: callbacks handled by the active code version where the
    # handler made a state decision. "ignored_final_state" is excluded: the code correctly refused to move an
    # order that an earlier version had already finalised (that damage is tracked as an incident instead).
    active = db.one("SELECT id, source FROM code_versions WHERE active=1")
    judged = [e for e in counted if active and e["code_version"] == active["id"]
              and e["handler_reason"] != "ignored_final_state"][-30:]
    judged_mism = sum(1 for e in judged if e["order_status_after"] != detection.expected_state(e["gateway_status"]))
    return {
        "callbacks": len(cb), "state_checked": len(counted), "mismatches": len(mism),
        "health_score": round(100 * (1 - judged_mism / len(judged)), 1) if judged else 100.0,
        "health_window": len(judged),
        "health_scope": (f"current code v{active['id']} ({active['source'].replace('_', ' ')})" if active else "no code"),
        "open_incidents": db.one("SELECT COUNT(*) AS n FROM incidents WHERE status NOT IN ('resolved')")["n"],
        "resolved_incidents": db.one("SELECT COUNT(*) AS n FROM incidents WHERE status='resolved'")["n"],
        "orders": sum(order_status.values()), "order_status": order_status, "gateway_status": gw_status,
        "rejections": rejections, "series": series,
        "mismatch_types": _count(f"{e['gateway_status']} -> {e['order_status_after']}" for e in mism),
    }

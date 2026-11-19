"""FIXCHAIN end-to-end tests (offline agent mode, isolated data dir).

Covers the first milestone: inject PENDING->FAILED bug, reproduce, detect, investigate,
patch, verify independently, approve, activate, reconcile, rollback.
"""
import time

import pytest
from fastapi.testclient import TestClient

from app.main import app  # env isolation happens in conftest.py


@pytest.fixture(scope="module")
def client():
    with TestClient(app, headers={"X-Reviewer": "pytest-reviewer"}) as c:
        yield c


def wait_for_run(client, incident_id, states, timeout=90):
    end = time.time() + timeout
    while time.time() < end:
        d = client.get(f"/api/incidents/{incident_id}").json()
        if d["runs"] and d["runs"][0]["state"] in states:
            return d
        time.sleep(0.3)
    raise AssertionError(f"run did not reach {states}: {d['runs'][0]['state'] if d['runs'] else 'no run'}")


def test_healthy_baseline_raises_no_incident(client):
    client.post("/api/demo/reset", json={"inject_bug": False})
    for outcome in ("SUCCESS", "FAILED", "PENDING"):
        r = client.post("/api/checkout", json={"outcome": outcome}).json()
        assert r["order_status"] == {"SUCCESS": "PAID", "FAILED": "PAYMENT_FAILED", "PENDING": "PAYMENT_PENDING"}[outcome]
    assert client.get("/api/incidents").json() == []


def test_webhook_rejects_bad_signature(client):
    r = client.post("/api/checkout", json={"outcome": "PENDING"}).json()
    payload = {"event_id": "EVT-X", "txn_id": r["txn_id"], "order_id": r["order_id"], "amount": r["amount"],
               "status": "SUCCESS", "timestamp": 1.0}
    resp = client.post("/api/merchant/webhook", json=payload, headers={"X-SimPay-Signature": "0" * 64})
    assert resp.status_code == 401


def test_full_milestone_pending_as_failed(client):
    client.post("/api/demo/reset", json={"inject_bug": True})
    assert client.get("/api/status").json()["bug_present"]["pending_as_failed"] is True

    # 1. reproduce in the simulated checkout
    r = client.post("/api/checkout", json={"outcome": "PENDING"}).json()
    assert r["order_status"] == "PAYMENT_FAILED"  # the bug

    # 2. detection
    incs = client.get("/api/incidents").json()
    assert len(incs) == 1 and incs[0]["fingerprint"] == "STATE_MISMATCH:PENDING->PAYMENT_FAILED"
    inc_id = incs[0]["id"]

    # 3-5. investigation, repair, independent verification (auto-started)
    d = wait_for_run(client, inc_id, ("AWAITING_APPROVAL", "FAILED"))
    run = d["runs"][0]
    assert run["state"] == "AWAITING_APPROVAL", run.get("error")
    assert run["investigation"]["function"] == "map_gateway_status"
    baseline = next(t for t in run["tests"] if t["target"] == "baseline")
    patched = next(t for t in run["tests"] if t["target"] == "patched")
    assert baseline["failed"] > 0
    assert patched["passed"] == patched["total"] > 0
    patch = next(p for p in run["patches"] if p["status"] == "verified")
    assert "PAYMENT_PENDING" in patch["patched_code"]

    # nothing activated before approval
    r2 = client.post("/api/checkout", json={"outcome": "PENDING"}).json()
    assert r2["order_status"] == "PAYMENT_FAILED"

    # 6-8. approve -> activate in simulated env
    resp = client.post(f"/api/patches/{patch['id']}/approve", json={"note": "LGTM"})
    assert resp.status_code == 200, resp.text
    r3 = client.post("/api/checkout", json={"outcome": "PENDING"}).json()
    assert r3["order_status"] == "PAYMENT_PENDING"

    # reconciliation re-syncs affected orders from the gateway's authoritative status
    rec = client.post(f"/api/incidents/{inc_id}/reconcile").json()["reconciled"]
    assert rec and all(x["after"] == "PAYMENT_PENDING" for x in rec)

    # memory remembered the defect
    assert client.get("/api/memory").json()[0]["function"] == "map_gateway_status"

    # rollback restores the original (buggy) simulated version
    versions = client.get("/api/versions").json()
    buggy = next(v for v in versions if v["source"] == "bug_injection")
    assert client.post(f"/api/versions/{buggy['id']}/rollback").status_code == 200
    r4 = client.post("/api/checkout", json={"outcome": "PENDING"}).json()
    assert r4["order_status"] == "PAYMENT_FAILED"
    # recurrence is linked to memory
    newest = client.get("/api/incidents").json()[0]
    assert newest["similar_memory_id"] is not None


def test_cannot_approve_unverified_patch(client):
    assert client.post("/api/patches/99999/approve", json={}).status_code == 404


def test_stale_verification_cannot_be_approved(client, monkeypatch):
    """A patch verified against an older suite must be re-verified before activation."""
    from app.agents import verifier
    client.post("/api/demo/reset", json={"inject_bug": True})
    client.post("/api/checkout", json={"outcome": "PENDING"})
    inc_id = client.get("/api/incidents").json()[0]["id"]
    run = wait_for_run(client, inc_id, ("AWAITING_APPROVAL", "FAILED"))["runs"][0]
    patch = next(p for p in run["patches"] if p["status"] == "verified")
    monkeypatch.setattr(verifier, "suite_sha256", lambda: "0" * 64)  # suite changed after verification
    resp = client.post(f"/api/patches/{patch['id']}/approve", json={})
    assert resp.status_code == 409 and "stale" in resp.json()["detail"]
    monkeypatch.undo()
    client.post(f"/api/patches/{patch['id']}/reject", json={"note": "cleanup"})

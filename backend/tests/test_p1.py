"""P1 tests: memory matching, persistent webhook secret, reviewer identity, control-room events,
post-fix health, and external-vs-merchant classification."""
import time

import pytest
from fastapi.testclient import TestClient

from app import config, gateway
from app.main import app

REV = {"X-Reviewer": "Asha (pytest)"}


@pytest.fixture(scope="module")
def client():
    with TestClient(app, headers=REV) as c:
        yield c


def wait_state(client, incident_id, states, timeout=90):
    end = time.time() + timeout
    while time.time() < end:
        d = client.get(f"/api/incidents/{incident_id}").json()
        if d["runs"] and d["runs"][0]["state"] in states:
            return d
        time.sleep(0.3)
    raise AssertionError(f"incident {incident_id} never reached {states}")


def reset(client, inject_bug):
    """Reset is (correctly) refused while a pipeline runs - wait for background runs from earlier steps."""
    end = time.time() + 90
    while time.time() < end:
        r = client.post("/api/demo/reset", json={"inject_bug": inject_bug})
        if r.status_code == 200:
            return
        time.sleep(0.3)
    raise AssertionError("pipeline never became idle")


def _awaiting(client):
    reset(client, True)
    client.post("/api/checkout", json={"outcome": "PENDING"})
    inc = client.get("/api/incidents").json()[0]["id"]
    run = wait_state(client, inc, ("AWAITING_APPROVAL",))["runs"][0]
    return inc, run, next(p for p in run["patches"] if p["status"] == "verified")


# ---------------------------------------------------------------- reviewer identity
def test_decisions_require_a_reviewer_name(client):
    inc, run, patch = _awaiting(client)
    anon = {"X-Reviewer": ""}
    assert client.post(f"/api/patches/{patch['id']}/approve", json={}, headers=anon).status_code == 401
    assert client.post(f"/api/patches/{patch['id']}/reject", json={}, headers=anon).status_code == 401
    assert client.post("/api/versions/1/rollback", headers=anon).status_code == 401
    assert client.post(f"/api/incidents/{inc}/reconcile", headers=anon).status_code == 401
    r = client.post(f"/api/patches/{patch['id']}/approve", json={"note": "reviewed diff"})
    assert r.status_code == 200
    rec = next(p for p in client.get("/api/patches").json() if p["id"] == patch["id"])
    assert rec["decided_by"] == "Asha (pytest)" and rec["status"] == "approved"


def test_reviewer_token_enforced_when_configured(client, monkeypatch):
    inc, run, patch = _awaiting(client)
    monkeypatch.setattr(config, "REVIEWER_TOKEN", "s3cret-token")
    assert client.get("/api/status").json()["reviewer_token_required"] is True
    bad = client.post(f"/api/patches/{patch['id']}/reject", json={}, headers={**REV, "X-Reviewer-Token": "nope"})
    assert bad.status_code == 401
    ok = client.post(f"/api/patches/{patch['id']}/reject", json={}, headers={**REV, "X-Reviewer-Token": "s3cret-token"})
    assert ok.status_code == 200


# ---------------------------------------------------------------- control room events
def test_handoffs_and_agent_events_are_recorded(client):
    inc, run, patch = _awaiting(client)
    hand = [(s["agent"], s["data"]["to"]) for s in run["steps"] if s["status"] == "handoff"]
    for pair in [("detection", "verifier"), ("verifier", "investigator"), ("investigator", "repairer"),
                 ("repairer", "verifier"), ("verifier", "human")]:
        assert pair in hand, (pair, hand)
    agents = {s["agent"] for s in run["steps"]}
    assert {"detection", "verifier", "investigator", "repairer", "policy"} <= agents
    assert run["classification"] == "merchant_code_defect"
    client.post(f"/api/patches/{patch['id']}/approve", json={})
    steps = client.get(f"/api/incidents/{inc}").json()["runs"][0]["steps"]
    assert any(s["status"] == "handoff" and s["agent"] == "human" and s["data"]["to"] == "memory" for s in steps)
    assert all(isinstance(s["ts"], float) for s in steps)


def test_health_reflects_current_code_only(client):
    inc, run, patch = _awaiting(client)
    client.post("/api/checkout", json={"outcome": "PENDING"})
    m = client.get("/api/metrics").json()
    assert m["health_score"] < 100 and "bug injection" in m["health_scope"]
    client.post(f"/api/patches/{patch['id']}/approve", json={})
    for _ in range(3):
        client.post("/api/checkout", json={"outcome": "PENDING"})
    gateway.settle_pending(success_ratio=1.0)  # creates ignored_final_state mismatches on old damaged orders
    m = client.get("/api/metrics").json()
    assert m["health_score"] == 100.0 and "patch" in m["health_scope"] and m["health_window"] >= 3
    assert m["mismatches"] > 0  # historical mismatches are still reported separately


# ---------------------------------------------------------------- memory
def test_memory_hints_only_for_the_same_defect(client):
    inc, run, patch = _awaiting(client)
    client.post(f"/api/patches/{patch['id']}/approve", json={})
    gateway.settle_pending(success_ratio=1.0)
    downstream = next(i for i in client.get("/api/incidents").json() if i["id"] != inc)
    assert downstream["fingerprint"].startswith("STATE_MISMATCH:SUCCESS")
    assert downstream["similar_memory_id"] is None  # different symptom: no misleading "recurring defect" banner
    # same defect again (after rolling back to the buggy version) -> hint + explicit root-cause comparison
    wait_state(client, downstream["id"], ("NOT_REPRODUCIBLE", "FAILED"))
    client.post(f"/api/incidents/{inc}/reconcile")
    buggy = next(v for v in client.get("/api/versions").json() if v["source"] == "bug_injection")
    client.post(f"/api/versions/{buggy['id']}/rollback")
    client.post("/api/checkout", json={"outcome": "PENDING"})
    again = client.get("/api/incidents").json()[0]
    assert again["similar_memory_id"] is not None
    d = wait_state(client, again["id"], ("AWAITING_APPROVAL", "FAILED"))
    mem_steps = [s["message"] for s in d["runs"][0]["steps"] if s["agent"] == "memory"]
    assert any("Same root cause as remembered defect" in m for m in mem_steps)
    client.post(f"/api/patches/{d['runs'][0]['patches'][-1]['id']}/reject", json={"note": "cleanup"})


# ---------------------------------------------------------------- external vs merchant
def test_signature_burst_is_external_and_never_repaired(client):
    reset(client, False)
    client.post("/api/checkout", json={"outcome": "SUCCESS"})
    for _ in range(3):
        r = client.post("/api/gateway/replay", json={"duplicate": False, "tamper": True}).json()
        assert r["reason"] == "invalid_signature"
    incs = client.get("/api/incidents").json()
    assert len(incs) == 1 and incs[0]["category"] == "external" and incs[0]["latest_run"] is None
    inc = incs[0]["id"]
    assert client.post(f"/api/incidents/{inc}/run").status_code == 409
    assert client.post(f"/api/incidents/{inc}/close", json={}, headers={"X-Reviewer": ""}).status_code == 401
    # a normal checkout + housekeeping must not auto-close it
    client.post("/api/checkout", json={"outcome": "SUCCESS"})
    assert client.get(f"/api/incidents/{inc}").json()["status"] == "open"
    assert client.post(f"/api/incidents/{inc}/close", json={"note": "rotated secret back"}).status_code == 200
    assert client.get(f"/api/incidents/{inc}").json()["status"] == "resolved"


def test_single_bad_signature_is_not_an_incident(client):
    reset(client, False)
    client.post("/api/checkout", json={"outcome": "SUCCESS"})
    client.post("/api/gateway/replay", json={"duplicate": False, "tamper": True})
    assert client.get("/api/incidents").json() == []


def test_merchant_incident_cannot_be_closed_manually(client):
    inc, run, patch = _awaiting(client)
    assert client.post(f"/api/incidents/{inc}/close", json={}).status_code == 409
    client.post(f"/api/patches/{patch['id']}/reject", json={"note": "cleanup"})


# ---------------------------------------------------------------- webhook secret
def test_webhook_secret_persists_across_restarts(tmp_path, monkeypatch):
    monkeypatch.delenv("GATEWAY_WEBHOOK_SECRET", raising=False)
    monkeypatch.setattr(config, "DATA_DIR", tmp_path)
    first = config._webhook_secret()
    second = config._webhook_secret()
    assert first == second and len(first) == 64
    assert (tmp_path / ".webhook_secret").read_text().strip() == first
    monkeypatch.setenv("GATEWAY_WEBHOOK_SECRET", "from-env")
    assert config._webhook_secret() == "from-env"

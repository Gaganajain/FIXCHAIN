"""Regression tests for the audit's P0 fixes:
1. hollow / ungrounded LLM investigations are rejected, retried, then fall back to offline analysis;
2. downstream incidents close once observed order state matches the gateway ("no code defect" path);
3. patches referencing undefined names are blocked by the policy gate.
"""
import time

import pytest
from fastapi.testclient import TestClient

from app import config, db, gateway, merchant_runtime
from app.agents import investigator, llm, repairer
from app.main import app


@pytest.fixture(scope="module")
def client():
    with TestClient(app, headers={"X-Reviewer": "pytest-reviewer"}) as c:
        yield c


def wait_state(client, incident_id, states, timeout=90):
    end = time.time() + timeout
    while time.time() < end:
        d = client.get(f"/api/incidents/{incident_id}").json()
        if d["runs"] and d["runs"][0]["state"] in states:
            return d
        time.sleep(0.3)
    raise AssertionError(f"incident {incident_id} run never reached {states}")


def _buggy_incident(client):
    client.post("/api/demo/reset", json={"inject_bug": True})
    client.post("/api/checkout", json={"outcome": "PENDING"})
    inc = client.get("/api/incidents").json()[0]
    wait_state(client, inc["id"], ("AWAITING_APPROVAL", "FAILED"))
    return db.one("SELECT * FROM incidents WHERE id=?", (inc["id"],))


GOOD = {"file": "payment_handler.py", "function": "map_gateway_status", "line_start": 25, "line_end": 31,
        "root_cause": "map_gateway_status() returns PAYMENT_FAILED for every non-SUCCESS status, including PENDING.",
        "explanation": "The contract maps PENDING to PAYMENT_PENDING, but the function has no PENDING branch so the "
                       "callback falls through to the catch-all failure return.",
        "evidence": ["payment_events: PENDING callback moved the order PAYMENT_INITIATED -> PAYMENT_FAILED",
                     "payment_handler.py:30 returns \"PAYMENT_FAILED\" unconditionally"],
        "confidence": 0.9, "fix_strategy": "Add explicit PENDING and FAILED branches and raise on unknown statuses."}


# ---------------------------------------------------------------- 1. investigation quality gate
def test_quality_check_rejects_placeholders_and_wrong_function(client):
    incident = _buggy_incident(client)
    sources = {"payment_handler.py": merchant_runtime.read_active()}
    assert investigator.quality_check(dict(GOOD), incident, sources) == []
    hollow = {**GOOD, "root_cause": "...", "evidence": ["...", "..."]}
    problems = investigator.quality_check(hollow, incident, sources)
    assert any("root_cause" in p for p in problems) and any("evidence" in p for p in problems)
    wrong_fn = {**GOOD, "function": "handle_callback"}
    assert any("never produces the observed state" in p
               for p in investigator.quality_check(wrong_fn, incident, sources))


def test_placeholder_llm_output_is_retried_then_falls_back(client, monkeypatch):
    incident = _buggy_incident(client)
    replies = iter([{**GOOD, "file": "..."}, {**GOOD, "root_cause": "...", "evidence": ["..."]}])
    monkeypatch.setattr(llm, "structured_call", lambda **kw: next(replies))
    events = []
    result = investigator.investigate(incident, config.MERCHANT_ACTIVE_DIR, "llm", None,
                                      on_event=lambda s, m, d=None: events.append((s, m)))
    assert [s for s, _ in events].count("blocked") == 2
    assert result["analysis_method"].startswith("offline-ast (fallback")
    assert result["function"] == "map_gateway_status"


def test_retry_feedback_reaches_the_llm_and_good_answer_is_used(client, monkeypatch):
    incident = _buggy_incident(client)
    prompts = []

    def fake(**kw):
        prompts.append(kw["user"])
        return {**GOOD, "function": "handle_callback"} if len(prompts) == 1 else dict(GOOD)

    monkeypatch.setattr(llm, "structured_call", fake)
    result = investigator.investigate(incident, config.MERCHANT_ACTIVE_DIR, "llm", None)
    assert result["analysis_method"] == "llm" and result["llm_attempts"] == 2
    assert "rejected by FIXCHAIN's validator" in prompts[1]


def test_llm_outage_falls_back_to_offline(client, monkeypatch):
    incident = _buggy_incident(client)

    def down(**kw):
        raise llm.LLMError("Sarvam API error 402: credits exhausted")

    monkeypatch.setattr(llm, "structured_call", down)
    result = investigator.investigate(incident, config.MERCHANT_ACTIVE_DIR, "llm", None)
    assert result["analysis_method"].startswith("offline-ast (fallback")


def test_full_pipeline_survives_llm_outage(client, monkeypatch):
    """LLM mode with the provider down: investigation and repair fall back (labelled); the patch is still
    independently verified before it can be approved."""
    from app import config as cfg

    def down(**kw):
        raise llm.LLMError("Sarvam API error 503: unavailable")

    monkeypatch.setattr(llm, "structured_call", down)
    monkeypatch.setattr(cfg, "agent_mode", lambda: "llm")
    monkeypatch.setattr(cfg, "llm_label", lambda: "Sarvam · test")
    client.post("/api/demo/reset", json={"inject_bug": True})
    client.post("/api/checkout", json={"outcome": "PENDING"})
    inc = client.get("/api/incidents").json()[0]["id"]
    run = wait_state(client, inc, ("AWAITING_APPROVAL", "FAILED"))["runs"][0]
    assert run["state"] == "AWAITING_APPROVAL", run["error"]
    assert run["investigation"]["analysis_method"].startswith("offline-ast (fallback")
    assert any(s["agent"] == "repairer" and s["status"] == "blocked" for s in run["steps"])
    patched = [t for t in run["tests"] if t["target"] == "patched"][-1]
    assert patched["passed"] == patched["total"] > 0
    client.post(f"/api/patches/{run['patches'][-1]['id']}/reject", json={"note": "cleanup"})


# ---------------------------------------------------------------- 2. downstream incidents
def _fix_then_settle(client):
    client.post("/api/demo/reset", json={"inject_bug": True})
    client.post("/api/checkout", json={"outcome": "PENDING"})
    client.post("/api/checkout", json={"outcome": "PENDING"})
    inc1 = client.get("/api/incidents").json()[0]["id"]
    run = wait_state(client, inc1, ("AWAITING_APPROVAL",))["runs"][0]
    patch = next(p for p in run["patches"] if p["status"] == "verified")
    assert client.post(f"/api/patches/{patch['id']}/approve", json={"note": "ok"}).status_code == 200
    gateway.settle_pending(success_ratio=1.0)  # customers did pay - but their orders were already 'failed'
    inc2 = next(i for i in client.get("/api/incidents").json() if i["id"] != inc1)
    assert inc2["severity"] == "critical"
    d = wait_state(client, inc2["id"], ("NOT_REPRODUCIBLE", "FAILED"))
    return inc1, inc2["id"], d


def test_downstream_incident_is_no_code_defect_and_closes_after_reconcile(client):
    inc1, inc2, d = _fix_then_settle(client)
    assert d["runs"][0]["state"] == "NOT_REPRODUCIBLE"
    assert d["status"] == "needs_reconciliation"
    assert not d["runs"][0]["patches"]  # no pointless patch generated
    client.post(f"/api/incidents/{inc1}/reconcile")
    statuses = {i["id"]: i["status"] for i in client.get("/api/incidents").json()}
    assert statuses == {inc1: "resolved", inc2: "resolved"}
    orders = client.get("/api/orders?limit=500").json()
    expected = {"SUCCESS": "PAID", "FAILED": "PAYMENT_FAILED", "PENDING": "PAYMENT_PENDING"}
    assert all(expected[o["gateway_status"]] == o["status"] for o in orders)


def test_no_code_defect_incident_can_be_reconciled_directly(client):
    inc1, inc2, _ = _fix_then_settle(client)
    r = client.post(f"/api/incidents/{inc2}/reconcile")
    assert r.status_code == 200 and all(x["after"] == "PAID" for x in r.json()["reconciled"])
    assert client.get(f"/api/incidents/{inc2}").json()["status"] == "resolved"


def test_reconcile_still_refused_for_unfixed_incident(client):
    client.post("/api/demo/reset", json={"inject_bug": True})
    client.post("/api/checkout", json={"outcome": "PENDING"})
    inc = client.get("/api/incidents").json()[0]["id"]
    wait_state(client, inc, ("AWAITING_APPROVAL",))
    assert client.post(f"/api/incidents/{inc}/reconcile").status_code == 409


# ---------------------------------------------------------------- 3. repair policy
def test_policy_blocks_undefined_names():
    template =(config.MERCHANT_TEMPLATE_DIR / "payment_handler.py").read_text(encoding="utf-8")
    assert repairer.policy_check(template) == []
    bad = template.replace("    new_status = map_gateway_status(payload[\"status\"])",
                           "    new_status = map_gateway_status(payload[\"status\"])\n"
                           "    if new_status not in status_to_order_state:\n        return {}")
    assert any("Undefined name: status_to_order_state" in p for p in repairer.policy_check(bad))


def test_default_repair_attempts_is_three():
    assert config.MAX_REPAIR_ATTEMPTS >= 3

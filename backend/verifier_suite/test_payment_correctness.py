"""Payment-correctness tests: success, failed, pending, duplicates, signatures, unknown statuses, HTTP."""
import pytest
from fastapi import FastAPI, Header, Request
from fastapi.testclient import TestClient

from conftest import SECRET, InMemoryStore, make_payload, sign


# ---------------------------------------------------------------- terminal outcomes
def test_successful_payment_marks_order_paid(send, store):
    r = send(make_payload(status="SUCCESS"))
    assert r["accepted"] is True
    assert store.orders["ORD-1"]["status"] == "PAID"


def test_failed_payment_marks_order_failed(send, store):
    send(make_payload(status="FAILED"))
    assert store.orders["ORD-1"]["status"] == "PAYMENT_FAILED"


# ---------------------------------------------------------------- pending handling
def test_pending_payment_is_not_marked_failed(send, store):
    send(make_payload(status="PENDING"))
    assert store.orders["ORD-1"]["status"] != "PAYMENT_FAILED", "PENDING must never be treated as a failure"


def test_pending_payment_marks_order_pending(send, store):
    send(make_payload(status="PENDING"))
    assert store.orders["ORD-1"]["status"] == "PAYMENT_PENDING"


def test_pending_then_success_ends_paid(send, store):
    send(make_payload(status="PENDING"))
    send(make_payload(status="SUCCESS"))
    assert store.orders["ORD-1"]["status"] == "PAID"


def test_pending_then_failed_ends_failed(send, store):
    send(make_payload(status="PENDING"))
    send(make_payload(status="FAILED"))
    assert store.orders["ORD-1"]["status"] == "PAYMENT_FAILED"


def test_status_matching_is_case_insensitive(send, store):
    send(make_payload(status="pending"))
    assert store.orders["ORD-1"]["status"] == "PAYMENT_PENDING"


# ---------------------------------------------------------------- idempotency & ordering
def test_duplicate_callback_is_processed_once(send, store):
    p = make_payload(status="SUCCESS", event_id="EVT-DUP")
    first, second = send(p), send(p)
    assert first["accepted"] and second["accepted"]
    assert second.get("reason") == "duplicate"
    assert store.updates == [("ORD-1", "PAID")]


def test_late_failure_does_not_override_paid_order(send, store):
    send(make_payload(status="SUCCESS"))
    send(make_payload(status="FAILED"))
    assert store.orders["ORD-1"]["status"] == "PAID"


# ---------------------------------------------------------------- authenticity
def test_invalid_signature_is_rejected(send, store):
    r = send(make_payload(status="SUCCESS"), signature="0" * 64)
    assert r["accepted"] is False and r["http_status"] == 401
    assert store.orders["ORD-1"]["status"] == "PAYMENT_INITIATED"


def test_signature_from_wrong_secret_is_rejected(send, store):
    p = make_payload(status="SUCCESS")
    r = send(p, signature=sign(p, secret="attacker-secret"))
    assert r["accepted"] is False
    assert store.orders["ORD-1"]["status"] == "PAYMENT_INITIATED"


def test_amount_mismatch_is_rejected(send, store):
    r = send(make_payload(status="SUCCESS", amount=1))
    assert r["accepted"] is False
    assert store.orders["ORD-1"]["status"] == "PAYMENT_INITIATED"


def test_unknown_order_is_rejected(send, store):
    r = send(make_payload(order_id="ORD-NOPE", status="SUCCESS"))
    assert r["accepted"] is False and r["http_status"] == 404


# ---------------------------------------------------------------- unknown statuses (contract rule)
def _send_unknown(send, payload):
    """An unknown status may be signalled by raising or by an explicit rejection - both are fine."""
    try:
        return send(payload)
    except Exception:
        return {"accepted": False, "reason": "raised"}


@pytest.mark.parametrize("status", ["REFUNDED", "AUTHORIZED", "CHARGEBACK", ""])
def test_unknown_status_does_not_change_order(send, store, status):
    r = _send_unknown(send, make_payload(status=status))
    assert store.orders["ORD-1"]["status"] == "PAYMENT_INITIATED", f"unknown status {status!r} must not change the order"
    assert r.get("accepted") is not True or r.get("reason") == "raised"


def test_unknown_status_does_not_fail_a_pending_order(send, store):
    send(make_payload(status="PENDING"))
    _send_unknown(send, make_payload(status="REVERSED"))
    assert store.orders["ORD-1"]["status"] == "PAYMENT_PENDING"


def test_unknown_status_event_can_be_retried(send, store):
    p = make_payload(status="REFUNDED", event_id="EVT-RETRY")
    _send_unknown(send, p)
    assert not store.is_event_processed("EVT-RETRY"), "unknown-status events must stay retryable"


def test_http_webhook_unknown_status_is_not_2xx(handler):
    store = InMemoryStore()
    store.add_order("ORD-H", 99900)
    client = _http_app(handler, store)
    p = make_payload(order_id="ORD-H", status="REFUNDED", amount=99900)
    resp = client.post("/webhook", json=p, headers={"X-SimPay-Signature": sign(p)})
    assert resp.status_code >= 400, "gateway must be told to retry, not that the callback succeeded"
    assert store.orders["ORD-H"]["status"] == "PAYMENT_INITIATED"


# ---------------------------------------------------------------- HTTP integration
def _http_app(handler, store):
    app = FastAPI()

    @app.post("/webhook")
    async def webhook(request: Request, x_simpay_signature: str = Header("")):
        from fastapi import HTTPException
        result = handler.handle_callback(await request.json(), x_simpay_signature, SECRET, store)
        if result.get("http_status", 200) >= 400:
            raise HTTPException(result["http_status"], result.get("reason"))
        return result

    return TestClient(app, raise_server_exceptions=False)  # a handler crash must surface as HTTP 500


def test_http_webhook_pending_flow(handler):
    store = InMemoryStore()
    store.add_order("ORD-H", 99900)
    client = _http_app(handler, store)
    p = make_payload(order_id="ORD-H", status="PENDING", amount=99900)
    resp = client.post("/webhook", json=p, headers={"X-SimPay-Signature": sign(p)})
    assert resp.status_code == 200
    assert store.orders["ORD-H"]["status"] == "PAYMENT_PENDING"


def test_http_webhook_rejects_forged_callback(handler):
    store = InMemoryStore()
    store.add_order("ORD-H", 99900)
    client = _http_app(handler, store)
    p = make_payload(order_id="ORD-H", status="SUCCESS", amount=99900)
    resp = client.post("/webhook", json=p, headers={"X-SimPay-Signature": "f" * 64})
    assert resp.status_code == 401
    assert store.orders["ORD-H"]["status"] == "PAYMENT_INITIATED"

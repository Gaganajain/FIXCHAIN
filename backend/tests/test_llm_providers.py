"""Provider plumbing tests. HTTP is stubbed - these check request shape, validation and
error handling, not model quality (that needs a live key)."""
import json

import httpx
import pytest

from app import config
from app.agents import llm
from app.agents.investigator import SCHEMA as INV_SCHEMA

GOOD = {"file": "payment_handler.py", "function": "map_gateway_status", "line_start": 31, "line_end": 31,
        "root_cause": "PENDING falls through", "explanation": "x", "evidence": ["e1"], "confidence": 0.9,
        "fix_strategy": "map explicitly"}


class FakeResp:
    def __init__(self, status, payload):
        self.status_code, self._p = status, payload
        self.text = json.dumps(payload)

    def json(self):
        return self._p


def _chat(content, finish="stop"):
    return {"choices": [{"message": {"role": "assistant", "content": content}, "finish_reason": finish}]}


@pytest.fixture
def sarvam(monkeypatch):
    monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)
    monkeypatch.delenv("ANTHROPIC_AUTH_TOKEN", raising=False)
    monkeypatch.setenv("SARVAM_API_KEY", "sk_test_dummy_key_123456")
    monkeypatch.setattr(config, "_provider", "auto")
    calls = []

    def install(*responses):
        it = iter(responses)

        def fake_post(url, json=None, headers=None, timeout=None):
            calls.append({"url": url, "json": json, "headers": headers})
            return next(it)
        monkeypatch.setattr(httpx, "post", fake_post)
        return calls
    return install


def test_provider_selection(monkeypatch):
    monkeypatch.setattr(config, "_provider", "auto")
    monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)
    monkeypatch.delenv("ANTHROPIC_AUTH_TOKEN", raising=False)
    monkeypatch.delenv("SARVAM_API_KEY", raising=False)
    assert config.llm_provider() is None
    monkeypatch.setenv("SARVAM_API_KEY", "sk_x")
    assert config.llm_provider() == "sarvam" and config.llm_model() == config.SARVAM_MODEL
    monkeypatch.setenv("ANTHROPIC_API_KEY", "sk-ant-x")
    assert config.llm_provider() == "anthropic"
    monkeypatch.setattr(config, "_provider", "sarvam")
    assert config.llm_provider() == "sarvam"


def test_sarvam_request_shape_and_success(sarvam):
    calls = sarvam(FakeResp(200, _chat(json.dumps(GOOD))))
    out = llm.structured_call("sys", "user", INV_SCHEMA)
    assert out == GOOD
    c = calls[0]
    assert c["url"] == "https://api.sarvam.ai/v2/chat/completions"
    assert c["headers"]["api-subscription-key"] == "sk_test_dummy_key_123456"
    assert c["json"]["model"] == config.SARVAM_MODEL
    assert c["json"]["response_format"]["type"] == "json_schema"
    assert c["json"]["response_format"]["json_schema"]["schema"] == INV_SCHEMA
    assert "untrusted_data" in c["json"]["messages"][0]["content"]  # safety preamble present


def test_sarvam_schema_violation_retries_then_succeeds(sarvam):
    bad = dict(GOOD)
    del bad["function"]
    calls = sarvam(FakeResp(200, _chat(json.dumps(bad))), FakeResp(200, _chat("```json\n" + json.dumps(GOOD) + "\n```")))
    assert llm.structured_call("sys", "user", INV_SCHEMA) == GOOD
    assert "missing" in calls[1]["json"]["messages"][1]["content"]


def test_sarvam_garbage_twice_raises(sarvam):
    sarvam(FakeResp(200, _chat("not json")), FakeResp(200, _chat("still not json")))
    with pytest.raises(llm.LLMError, match="unusable output"):
        llm.structured_call("sys", "user", INV_SCHEMA)


@pytest.mark.parametrize("status,needle", [(403, "SARVAM_API_KEY"), (402, "credits"), (429, "rate limited")])
def test_sarvam_http_errors(sarvam, status, needle):
    sarvam(FakeResp(status, {"error": {"message": "nope"}}))
    with pytest.raises(llm.LLMError, match=needle):
        llm.structured_call("sys", "user", INV_SCHEMA)


def test_sarvam_truncation_retries_with_more_room(sarvam):
    calls = sarvam(FakeResp(200, _chat('{"file": "pay', finish="length")), FakeResp(200, _chat(json.dumps(GOOD))))
    assert llm.structured_call("sys", "user", INV_SCHEMA) == GOOD
    assert calls[0]["json"]["max_tokens"] == config.SARVAM_MAX_TOKENS
    assert calls[1]["json"]["max_tokens"] == min(config.SARVAM_MAX_TOKENS * 2, 64000)
    assert calls[1]["json"]["reasoning_effort"] == "low"


def test_sarvam_truncation_twice_is_an_error(sarvam):
    sarvam(FakeResp(200, _chat('{"f', finish="length")), FakeResp(200, _chat('{"f', finish="length")))
    with pytest.raises(llm.LLMError, match="truncated"):
        llm.structured_call("sys", "user", INV_SCHEMA)


def test_evidence_with_unknown_order_id_is_flagged(monkeypatch):
    from app.agents import investigator
    monkeypatch.setattr(investigator.db, "rows", lambda *a, **k: [{"order_id": "ORD_E378B6606220"}])
    res = investigator.check_evidence(
        {"evidence": ["order ORD_E378B6606220 failed", "order ORD_E379B6606220 failed", "code line 31"]}, {"id": 1})
    assert [c["status"] for c in res["evidence_checks"]] == ["verified", "unverified", "unchecked"]
    assert res["evidence_checks"][1]["unknown_ids"] == ["ORD_E379B6606220"]
    assert res["evidence_unverified"] == 1


def test_sanitizer_redacts_sarvam_key(monkeypatch):
    from app.agents.sanitize import scrub_text
    monkeypatch.setenv("SARVAM_API_KEY", "sk_live_abcdefghijklmnop")
    assert "abcdefghijklmnop" not in scrub_text("key=sk_live_abcdefghijklmnop in log")

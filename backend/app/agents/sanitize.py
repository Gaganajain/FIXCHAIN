"""Sanitise logs/events before they reach an LLM. Logs and code are untrusted input."""
from __future__ import annotations

import json
import os
import re
from typing import Any

from .. import config

_PATTERNS = [
    (re.compile(r"sk-ant-[A-Za-z0-9_\-]+"), "[REDACTED_API_KEY]"),
    (re.compile(r"\bsk_[A-Za-z0-9_\-]{12,}"), "[REDACTED_API_KEY]"),         # Sarvam-style keys
    (re.compile(r"\b[0-9a-fA-F]{64}\b"), "[REDACTED_HEX64]"),          # HMAC signatures / secrets
    (re.compile(r"\b(?:\d[ -]?){13,19}\b"), "[REDACTED_PAN]"),          # card-number-like digit runs
    (re.compile(r"[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}"), "[REDACTED_EMAIL]"),
]
_SENSITIVE_KEYS = {"signature", "secret", "api_key", "authorization", "password", "token", "card", "cvv"}


def scrub_text(text: str) -> str:
    if not text:
        return text
    text = text.replace(config.GATEWAY_WEBHOOK_SECRET, "[REDACTED_SECRET]")
    for var in ("ANTHROPIC_API_KEY", "SARVAM_API_KEY"):
        val = os.getenv(var)
        if val and len(val) >= 8:
            text = text.replace(val, "[REDACTED_API_KEY]")
    for pat, repl in _PATTERNS:
        text = pat.sub(repl, text)
    return text


def scrub(obj: Any) -> Any:
    if isinstance(obj, dict):
        return {k: ("[REDACTED]" if k.lower() in _SENSITIVE_KEYS else scrub(v)) for k, v in obj.items()}
    if isinstance(obj, list):
        return [scrub(v) for v in obj]
    if isinstance(obj, str):
        return scrub_text(obj)
    return obj


def untrusted_block(label: str, content: Any) -> str:
    """Wrap untrusted data so the model treats it as data, never as instructions."""
    body = content if isinstance(content, str) else json.dumps(content, indent=1, default=str)
    body = body.replace("</untrusted", "<\\/untrusted")
    return f'<untrusted_data source="{label}">\n{body}\n</untrusted_data>'


def numbered(code: str) -> str:
    return "\n".join(f"{i:>4} | {line}" for i, line in enumerate(code.splitlines(), 1))

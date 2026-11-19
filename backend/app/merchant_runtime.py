"""Simulated merchant application runtime.

The merchant's callback handler is a real Python file in MERCHANT_ACTIVE_DIR. It is
loaded dynamically so FIXCHAIN can inject bugs, activate approved patches and roll
back - all inside the simulated demo environment only.
"""
from __future__ import annotations

import importlib.util
import json
import shutil
import uuid
from pathlib import Path
from types import ModuleType
from typing import Any

from . import config, db

HANDLER_FILE = "payment_handler.py"

# Known, deliberately injectable integration bugs: (search, replace) on the handler.
BUGS: dict[str, dict[str, str]] = {
    "pending_as_failed": {
        "title": "PENDING treated as FAILED",
        "description": "A refactor collapses every non-SUCCESS status into PAYMENT_FAILED.",
        "search": (
            '    if status == "PENDING":\n'
            '        return "PAYMENT_PENDING"\n'
            '    if status == "FAILED":\n'
            '        return "PAYMENT_FAILED"\n'
            '    raise ValueError(f"Unknown gateway status: {gateway_status!r}")\n'
        ),
        "replace": (
            "    # Simplified: anything that is not a success is a failed payment.\n"
            '    return "PAYMENT_FAILED"\n'
        ),
    },
}


# ---------------------------------------------------------------- code versions
def active_path(file: str = HANDLER_FILE) -> Path:
    return config.MERCHANT_ACTIVE_DIR / file


def read_active(file: str = HANDLER_FILE) -> str:
    return active_path(file).read_text(encoding="utf-8")


def activate_code(code: str, source: str, note: str = "", patch_id: int | None = None,
                  file: str = HANDLER_FILE) -> int:
    """Write code into the simulated live environment and record a version."""
    if file not in config.APPROVED_FILES:
        raise PermissionError(f"{file} is not on the approved-file allowlist")
    config.MERCHANT_ACTIVE_DIR.mkdir(parents=True, exist_ok=True)
    active_path(file).write_text(code, encoding="utf-8")
    with db.tx() as c:
        c.execute("UPDATE code_versions SET active=0 WHERE file=?", (file,))
        cur = c.execute(
            "INSERT INTO code_versions (file, code, source, patch_id, note, created_at, active)"
            " VALUES (?,?,?,?,?,?,1)",
            (file, code, source, patch_id, note, db.now()),
        )
        vid = cur.lastrowid
    _module_cache.clear()
    db.log("INFO", "merchant", f"Activated {file} version {vid} ({source})", note=note)
    return vid


def active_version_id(file: str = HANDLER_FILE) -> int | None:
    r = db.one("SELECT id FROM code_versions WHERE file=? AND active=1", (file,))
    return r["id"] if r else None


def ensure_workspace() -> None:
    config.MERCHANT_ACTIVE_DIR.mkdir(parents=True, exist_ok=True)
    config.SANDBOX_ROOT.mkdir(parents=True, exist_ok=True)
    for name in config.READ_ONLY_CONTEXT:
        shutil.copyfile(config.MERCHANT_TEMPLATE_DIR / name, config.MERCHANT_ACTIVE_DIR / name)
    if active_version_id() is None or not active_path().exists():
        baseline = (config.MERCHANT_TEMPLATE_DIR / HANDLER_FILE).read_text(encoding="utf-8")
        activate_code(baseline, "baseline", "Original merchant integration")


def inject_bug(bug_id: str) -> int:
    bug = BUGS.get(bug_id)
    if not bug:
        raise KeyError(bug_id)
    code = read_active()
    if bug["search"] not in code:
        raise ValueError("Bug cannot be injected: the target code is not in its expected form "
                         "(already injected, or code changed).")
    return activate_code(code.replace(bug["search"], bug["replace"], 1), "bug_injection",
                         f"Injected bug: {bug['title']}")


def contract() -> dict[str, Any]:
    return json.loads((config.MERCHANT_TEMPLATE_DIR / "gateway_contract.json").read_text(encoding="utf-8"))


# ---------------------------------------------------------------- module loading
_module_cache: dict[int, ModuleType] = {}


def load_module_from(path: Path, name: str | None = None) -> ModuleType:
    spec = importlib.util.spec_from_file_location(name or f"fixchain_merchant_{uuid.uuid4().hex}", path)
    assert spec and spec.loader
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def load_active_handler() -> ModuleType:
    vid = active_version_id() or 0
    if vid not in _module_cache:
        _module_cache.clear()
        _module_cache[vid] = load_module_from(active_path())
    return _module_cache[vid]


# ---------------------------------------------------------------- order store
class SqliteOrderStore:
    """Store protocol the handler uses. Same interface as the verifier's in-memory store."""

    def get_order(self, order_id: str) -> dict | None:
        return db.one("SELECT order_id, amount, status, txn_id FROM orders WHERE order_id=?", (order_id,))

    def update_order_status(self, order_id: str, status: str, txn_id: str | None = None) -> None:
        with db.tx() as c:
            c.execute("UPDATE orders SET status=?, txn_id=COALESCE(?, txn_id), updated_at=? WHERE order_id=?",
                      (status, txn_id, db.now(), order_id))

    def is_event_processed(self, event_id: str) -> bool:
        return db.one("SELECT 1 AS x FROM processed_events WHERE event_id=?", (event_id,)) is not None

    def mark_event_processed(self, event_id: str) -> None:
        with db.tx() as c:
            c.execute("INSERT OR IGNORE INTO processed_events (event_id, processed_at) VALUES (?,?)",
                      (event_id, db.now()))


# ---------------------------------------------------------------- webhook entry point
def process_callback(payload: dict, signature: str) -> dict:
    """The merchant's webhook endpoint logic. Records events for the monitor."""
    from . import detection  # local import to avoid a cycle

    store = SqliteOrderStore()
    order_before = store.get_order(str(payload.get("order_id", "")))
    version = active_version_id()
    try:
        handler = load_active_handler()
        result = handler.handle_callback(payload, signature, config.GATEWAY_WEBHOOK_SECRET, store)
    except Exception as exc:  # the merchant code itself crashed
        result = {"accepted": False, "reason": "handler_exception", "error": f"{type(exc).__name__}: {exc}",
                  "http_status": 500}
    order_after = store.get_order(str(payload.get("order_id", "")))

    before = order_before["status"] if order_before else None
    after = order_after["status"] if order_after else None
    with db.tx() as c:
        cur = c.execute(
            "INSERT INTO payment_events (ts, kind, order_id, txn_id, event_id, gateway_status,"
            " order_status_before, order_status_after, handler_reason, http_status, code_version, detail)"
            " VALUES (?,?,?,?,?,?,?,?,?,?,?,?)",
            (db.now(), "callback_result", payload.get("order_id"), payload.get("txn_id"), payload.get("event_id"),
             payload.get("status"), before, after, result.get("reason"), result.get("http_status"), version,
             json.dumps({k: v for k, v in result.items() if k != "http_status"})),
        )
        event_row_id = cur.lastrowid

    level = "ERROR" if result.get("http_status", 200) >= 500 else "INFO"
    db.log(level, "merchant.webhook",
           f"callback {result.get('reason')} order={payload.get('order_id')} gateway_status={payload.get('status')}"
           f" order_status {before} -> {after}",
           event_id=payload.get("event_id"), txn_id=payload.get("txn_id"), http_status=result.get("http_status"),
           code_version=version, signature=signature)

    detection.on_callback_result(event_row_id)
    return result

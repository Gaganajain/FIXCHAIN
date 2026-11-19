"""Independent verification agent.

Runs the locked payment-correctness suite (backend/verifier_suite) with pytest in a
separate process against a target merchant directory. The suite lives outside every
sandbox, its SHA-256 is pinned at server start and re-checked before each run, and
results are parsed from pytest's JUnit XML - never inferred.
"""
from __future__ import annotations

import hashlib
import json
import os
import subprocess
import sys
import time
import xml.etree.ElementTree as ET
from pathlib import Path

from .. import config


def suite_sha256() -> str:
    h = hashlib.sha256()
    for p in sorted(config.VERIFIER_SUITE_DIR.rglob("*.py")):
        h.update(p.relative_to(config.VERIFIER_SUITE_DIR).as_posix().encode())
        h.update(p.read_bytes())
    return h.hexdigest()


PINNED_SUITE_SHA = suite_sha256()


class SuiteTamperedError(RuntimeError):
    pass


def _clean_env(target_dir: Path) -> dict[str, str]:
    keep = {"PATH", "SYSTEMROOT", "SYSTEMDRIVE", "TEMP", "TMP", "WINDIR", "COMSPEC", "PATHEXT", "HOME",
            "USERPROFILE", "LANG", "VIRTUAL_ENV"}
    env = {k: v for k, v in os.environ.items() if k.upper() in keep}
    env.update({"FIXCHAIN_TARGET_DIR": str(target_dir), "PYTHONDONTWRITEBYTECODE": "1", "PYTHONHASHSEED": "0"})
    return env  # no API keys, no gateway secret


def run_suite(target_dir: Path, report_dir: Path) -> dict:
    current = suite_sha256()
    if current != PINNED_SUITE_SHA:
        raise SuiteTamperedError("Verifier suite hash changed since server start - refusing to run")
    report_dir.mkdir(parents=True, exist_ok=True)
    xml_path = report_dir / f"junit_{int(time.time() * 1000)}.xml"
    cmd = [sys.executable, "-m", "pytest", str(config.VERIFIER_SUITE_DIR), "-q", "-p", "no:cacheprovider",
           "--rootdir", str(config.VERIFIER_SUITE_DIR), f"--junitxml={xml_path}", "-o", "junit_family=xunit2"]
    t0 = time.time()
    try:
        proc = subprocess.run(cmd, cwd=report_dir, env=_clean_env(target_dir), capture_output=True, text=True,
                              timeout=config.VERIFIER_TIMEOUT_S)
        raw = (proc.stdout or "") + (proc.stderr or "")
    except subprocess.TimeoutExpired as exc:
        raw = f"TIMEOUT after {config.VERIFIER_TIMEOUT_S}s\n{exc.stdout or ''}"
    duration = round(time.time() - t0, 2)

    results: list[dict] = []
    if xml_path.exists():
        root = ET.parse(xml_path).getroot()
        for case in root.iter("testcase"):
            outcome, message = "passed", ""
            for tag in ("failure", "error", "skipped"):
                el = case.find(tag)
                if el is not None:
                    outcome = {"failure": "failed", "error": "error", "skipped": "skipped"}[tag]
                    message = (el.get("message") or el.text or "")[:600]
                    break
            results.append({"name": case.get("name"), "classname": case.get("classname"),
                            "outcome": outcome, "message": message, "time": float(case.get("time") or 0)})
    passed = sum(r["outcome"] == "passed" for r in results)
    failed = sum(r["outcome"] == "failed" for r in results)
    errors = sum(r["outcome"] == "error" for r in results)
    if not results:
        errors = max(errors, 1)  # nothing ran = not a pass
    return {"passed": passed, "failed": failed, "errors": errors, "total": len(results),
            "duration_s": duration, "suite_sha256": current, "results": results,
            "raw_output": raw[-6000:], "all_passed": bool(results) and passed == len(results)}


REPRO_SNIPPET = r"""
import importlib.util, json, sys, hmac, hashlib
target, status = sys.argv[1], sys.argv[2]
spec = importlib.util.spec_from_file_location("target_handler", target)
m = importlib.util.module_from_spec(spec); spec.loader.exec_module(m)
class S:
    def __init__(self): self.o = {"order_id": "REPRO-1", "amount": 49900, "status": "PAYMENT_INITIATED", "txn_id": None}; self.ev=set()
    def get_order(self, i): return dict(self.o) if i == "REPRO-1" else None
    def update_order_status(self, i, s, t=None): self.o["status"] = s
    def is_event_processed(self, e): return e in self.ev
    def mark_event_processed(self, e): self.ev.add(e)
secret = "repro-secret"
p = {"event_id": "EVT-REPRO", "txn_id": "TXN-REPRO", "order_id": "REPRO-1", "amount": 49900, "status": status, "timestamp": 0}
sig = hmac.new(secret.encode(), json.dumps(p, sort_keys=True, separators=(",", ":")).encode(), hashlib.sha256).hexdigest()
s = S()
try:
    r = m.handle_callback(p, sig, secret, s)
except Exception as e:
    r = {"error": type(e).__name__ + ": " + str(e)}
print(json.dumps({"gateway_status": status, "order_status": s.o["status"], "handler_result": r}))
"""


def reproduce(handler_file: Path, gateway_status: str) -> dict:
    """Replay one incident-shaped callback against a handler file in a separate process."""
    proc = subprocess.run([sys.executable, "-I", "-c", REPRO_SNIPPET, str(handler_file), gateway_status],
                          capture_output=True, text=True, timeout=20, env=_clean_env(handler_file.parent))
    try:
        return json.loads(proc.stdout.strip().splitlines()[-1])
    except Exception:
        return {"gateway_status": gateway_status, "error": (proc.stderr or proc.stdout)[-500:]}

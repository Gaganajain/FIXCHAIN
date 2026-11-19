"""Investigation agent - locates the root cause in approved source files.

LLM mode: Claude analyses sanitised evidence + source and returns structured JSON.
Offline mode: deterministic AST analysis of the approved files against the gateway contract.
Either way, the result is validated against the real file (file allowlisted, function
exists, lines inside that function) before the pipeline continues.
"""
from __future__ import annotations

import ast
import json
import re
from pathlib import Path
from typing import Any

from .. import config, db, merchant_runtime
from . import llm
from .sanitize import numbered, scrub, untrusted_block

SCHEMA = {
    "type": "object",
    "properties": {
        "file": {"type": "string", "description": "Approved file containing the defect"},
        "function": {"type": "string", "description": "Name of the faulty function"},
        "line_start": {"type": "integer"},
        "line_end": {"type": "integer"},
        "root_cause": {"type": "string", "description": "One-sentence root cause"},
        "explanation": {"type": "string", "description": "Why the incorrect state transition happens"},
        "evidence": {"type": "array", "items": {"type": "string"}},
        "confidence": {"type": "number"},
        "fix_strategy": {"type": "string"},
    },
    "required": ["file", "function", "line_start", "line_end", "root_cause", "explanation", "evidence",
                 "confidence", "fix_strategy"],
    "additionalProperties": False,
}


class InvestigationError(RuntimeError):
    pass


def gather_evidence(incident: dict, limit: int = 12) -> dict[str, Any]:
    orders = db.rows("SELECT order_id FROM incident_orders WHERE incident_id=? LIMIT ?", (incident["id"], limit))
    ids = [o["order_id"] for o in orders]
    events: list[dict] = []
    logs: list[dict] = []
    if ids:
        q = ",".join("?" * len(ids))
        events = db.rows(
            f"SELECT kind, order_id, gateway_status, order_status_before, order_status_after, handler_reason,"
            f" http_status, code_version FROM payment_events WHERE order_id IN ({q}) ORDER BY id", ids)
        logs = db.rows(
            "SELECT level, source, message, context FROM app_logs WHERE source='merchant.webhook' ORDER BY id DESC LIMIT 25")
    return scrub({"incident": {k: incident[k] for k in ("fingerprint", "title", "severity", "gateway_status",
                                                       "observed_order_status", "expected_order_status",
                                                       "occurrences")},
                  "payment_events": events, "application_logs": logs})


def read_sources(merchant_dir: Path) -> dict[str, str]:
    return {f: (merchant_dir / f).read_text(encoding="utf-8") for f in config.APPROVED_FILES}


def function_bounds(code: str, name: str) -> tuple[int, int] | None:
    for node in ast.walk(ast.parse(code)):
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)) and node.name == name:
            start = min([node.lineno] + [d.lineno for d in node.decorator_list])
            return start, node.end_lineno or node.lineno
    return None


def validate(result: dict, sources: dict[str, str]) -> dict:
    file = result.get("file", "").replace("\\", "/").split("/")[-1]
    if file not in sources:
        raise InvestigationError(f"Investigator pointed at {result.get('file')!r}, which is not an approved file")
    bounds = function_bounds(sources[file], result.get("function", ""))
    if not bounds:
        raise InvestigationError(f"Function {result.get('function')!r} does not exist in {file}")
    lo, hi = bounds
    result["file"] = file
    result["line_start"] = max(lo, min(int(result.get("line_start") or lo), hi))
    result["line_end"] = max(result["line_start"], min(int(result.get("line_end") or hi), hi))
    result["function_bounds"] = [lo, hi]
    result["confidence"] = max(0.0, min(1.0, float(result.get("confidence", 0))))
    return result


# ------------------------------------------------------------------ quality gate
_PLACEHOLDER = re.compile(r"^[\s.…\-_*#?]*$|^(n/?a|none|null|todo|tbd|unknown|placeholder|string|text)\.?$", re.I)
MIN_TEXT = {"root_cause": 25, "explanation": 40, "fix_strategy": 20}


def is_placeholder(text: Any, min_len: int = 15) -> bool:
    s = str(text or "").strip()
    return len(s) < min_len or bool(_PLACEHOLDER.match(s)) or s.count("...") * 3 >= len(s) / 2


def _string_constants(node: ast.AST) -> set[str]:
    return {n.value for n in ast.walk(node) if isinstance(n, ast.Constant) and isinstance(n.value, str)}


def quality_check(result: dict, incident: dict, sources: dict[str, str]) -> list[str]:
    """Reject investigations that are hollow or not grounded in the code. Returns problems (empty = OK).

    Deterministic checks only - an LLM's confident tone is never accepted as evidence.
    """
    problems = []
    for field, n in MIN_TEXT.items():
        if is_placeholder(result.get(field), n):
            problems.append(f"'{field}' is empty or a placeholder ({str(result.get(field))[:40]!r}); write it in full")
    real_evidence = [e for e in result.get("evidence", []) if not is_placeholder(e, 15)]
    if not real_evidence:
        problems.append("'evidence' contains no concrete lines; cite actual events, log lines or code lines")
    # Grounding: for a state mismatch, the named function must be able to produce the observed order state.
    observed = incident.get("observed_order_status")
    file, fn_name = result.get("file"), result.get("function")
    if incident.get("rule") == "STATE_MISMATCH" and observed and file in sources:
        tree = ast.parse(sources[file])
        fns = {n.name: n for n in ast.walk(tree) if isinstance(n, ast.FunctionDef)}
        producers = [n for n, f in fns.items() if any(isinstance(r, ast.Return) and isinstance(r.value, ast.Constant)
                                                      and r.value.value == observed for r in ast.walk(f))]
        named = fns.get(fn_name)
        if named is not None and producers and fn_name not in producers and observed not in _string_constants(named):
            lines = ", ".join(f"{p}() line {fns[p].lineno}" for p in producers)
            problems.append(f"{fn_name}() never produces the observed state {observed}; it is returned by {lines}")
    return problems


# ------------------------------------------------------------------ LLM mode
def investigate_llm(incident: dict, merchant_dir: Path, memory_hint: dict | None,
                    feedback: str | None = None) -> dict:
    sources = read_sources(merchant_dir)
    evidence = gather_evidence(incident)
    contract = merchant_runtime.contract()
    parts = [
        "Investigate this payment integration incident and locate the root cause in the approved source files.",
        untrusted_block("incident_and_sanitised_logs", evidence),
        untrusted_block("gateway_contract.json (read-only spec)", contract),
    ]
    for f, code in sources.items():
        parts.append(untrusted_block(f"{f} (approved file, line-numbered)", numbered(code)))
    if memory_hint:
        parts.append(untrusted_block("incident_memory (a previously resolved similar defect)",
                                     {k: memory_hint.get(k) for k in ("fingerprint", "function", "root_cause",
                                                                      "fix_summary", "times_seen")}))
    if feedback:
        parts.append("Your previous answer was rejected by FIXCHAIN's validator for these reasons:\n" + feedback)
    parts.append("Return the file, the exact function, the line range of the defect, the root cause, an "
                 "explanation, concrete evidence (cite events/log lines and code lines), a confidence 0-1 and a fix "
                 "strategy. Write every field out in full sentences - never use placeholders such as '...'. "
                 "Only name files from the approved list: " + ", ".join(config.APPROVED_FILES))
    result = llm.structured_call(
        system="You are the FIXCHAIN Investigation Agent, a senior payments reliability engineer.",
        user="\n\n".join(parts), schema=SCHEMA, effort="high")
    return validate(result, sources)


# ------------------------------------------------------------------ offline mode
def _returned_literals(fn: ast.FunctionDef) -> list[tuple[str, int]]:
    out = []
    for node in ast.walk(fn):
        if isinstance(node, ast.Return) and isinstance(node.value, ast.Constant) and isinstance(node.value.value, str):
            out.append((node.value.value, node.lineno))
    return out


def _compared_literals(fn: ast.FunctionDef) -> set[str]:
    lits: set[str] = set()
    for node in ast.walk(fn):
        if isinstance(node, ast.Compare):
            for side in [node.left, *node.comparators]:
                if isinstance(side, ast.Constant) and isinstance(side.value, str):
                    lits.add(side.value.upper())
        if isinstance(node, ast.Dict):
            for k in node.keys:
                if isinstance(k, ast.Constant) and isinstance(k.value, str):
                    lits.add(k.value.upper())
    return lits


def investigate_offline(incident: dict, merchant_dir: Path, memory_hint: dict | None) -> dict:
    sources = read_sources(merchant_dir)
    contract = merchant_runtime.contract()
    order_states = set(contract["status_to_order_state"].values())
    gw = (incident.get("gateway_status") or "").upper()
    observed = incident.get("observed_order_status")
    expected = incident.get("expected_order_status")
    ev = gather_evidence(incident)
    applied = [e for e in ev["payment_events"] if e["kind"] == "callback_result" and e["gateway_status"] == gw]
    runtime_evidence = (f"{len(applied)} callback(s) with gateway status {gw} produced order status {observed}; "
                        f"the gateway contract requires {expected}.")

    for file, code in sources.items():
        tree = ast.parse(code)
        for fn in [n for n in ast.walk(tree) if isinstance(n, ast.FunctionDef)]:
            returns = _returned_literals(fn)
            if not returns or not {v for v, _ in returns} & order_states:
                continue  # not a status-mapping function
            compared = _compared_literals(fn)
            wrong_returns = [ln for v, ln in returns if v == observed]
            if gw not in compared and wrong_returns:
                line = wrong_returns[-1]
                return validate({
                    "file": file, "function": fn.name, "line_start": line, "line_end": line,
                    "root_cause": f"{fn.name}() has no branch for gateway status {gw}; it falls through to "
                                  f"`return \"{observed}\"` at line {line}.",
                    "explanation": (f"The gateway contract defines {gw} as a non-final state that must map to "
                                    f"{expected}. {fn.name}() only checks {sorted(compared) or 'no statuses'} "
                                    f"explicitly, so a {gw} callback reaches the catch-all return and the order is "
                                    f"moved to {observed}. Because {observed} is final, the later settlement "
                                    f"callback is ignored too."),
                    "evidence": [runtime_evidence,
                                 f"{file}:{line} returns \"{observed}\" for every status not matched earlier.",
                                 f"Statuses compared in {fn.name}(): {sorted(compared)}; contract statuses: "
                                 f"{sorted(contract['status_to_order_state'])}."],
                    "confidence": 0.9,
                    "fix_strategy": f"Restore an explicit, contract-complete mapping in {fn.name}() so {gw} maps to "
                                    f"{expected} and unknown statuses raise instead of defaulting to failure.",
                    "analysis_method": "offline-ast",
                }, sources)
            # explicit but wrong branch: status compared, yet only the wrong state is returned near it
            if gw in compared and wrong_returns and expected not in {v for v, _ in returns}:
                line = wrong_returns[0]
                return validate({
                    "file": file, "function": fn.name, "line_start": line, "line_end": line,
                    "root_cause": f"{fn.name}() never returns {expected}; {gw} is mapped to {observed}.",
                    "explanation": f"The contract requires {gw} -> {expected}, but {fn.name}() has no path that "
                                   f"returns {expected}.",
                    "evidence": [runtime_evidence, f"{file}:{line} returns \"{observed}\"."],
                    "confidence": 0.75,
                    "fix_strategy": f"Rebuild {fn.name}() from the gateway contract mapping.",
                    "analysis_method": "offline-ast",
                }, sources)
    raise InvestigationError("Offline analysis could not attribute the incident to a status-mapping function. "
                             "Configure ANTHROPIC_API_KEY to use the LLM investigator.")


ORDER_ID = re.compile(r"\bORD_[A-Z0-9]{12}\b")


def check_evidence(result: dict, incident: dict) -> dict:
    """Cross-check every order ID cited in the evidence against the incident's real orders.

    LLM evidence is untrusted: a mistyped or invented ID is flagged, never silently shown as fact.
    """
    real = {r["order_id"] for r in db.rows("SELECT order_id FROM incident_orders WHERE incident_id=?",
                                           (incident["id"],))}
    checks = []
    for line in result.get("evidence", []):
        cited = set(ORDER_ID.findall(line))
        unknown = sorted(cited - real)
        checks.append({"status": "unverified" if unknown else ("verified" if cited else "unchecked"),
                       "unknown_ids": unknown})
    result["evidence_checks"] = checks
    result["evidence_unverified"] = sum(c["status"] == "unverified" for c in checks)
    return result


LLM_ATTEMPTS = 2


def investigate(incident: dict, merchant_dir: Path, mode: str, memory_hint: dict | None,
                on_event=None) -> dict:
    """Run the investigation. In LLM mode every answer must pass validate() + quality_check();
    a rejected answer is retried with the reasons, then the labelled offline analysis is used."""
    emit = on_event or (lambda *a, **k: None)
    sources = read_sources(merchant_dir)
    if mode == "llm":
        feedback = None
        for attempt in range(1, LLM_ATTEMPTS + 1):
            try:
                result = investigate_llm(incident, merchant_dir, memory_hint, feedback)
                problems = quality_check(result, incident, sources)
            except InvestigationError as exc:
                problems = [str(exc)]
            except llm.LLMError as exc:  # provider down / credits / malformed twice: no point retrying here
                emit("blocked", f"LLM investigation unavailable: {exc}")
                break
            if not problems:
                result["analysis_method"] = result.get("analysis_method") or "llm"
                result["llm_attempts"] = attempt
                return check_evidence(result, incident)
            feedback = "\n".join(f"- {p}" for p in problems)
            emit("blocked", f"LLM investigation attempt {attempt} rejected by the validator: " + "; ".join(problems),
                 {"problems": problems})
        emit("info", "No validated LLM investigation - falling back to the offline AST analysis")
        result = investigate_offline(incident, merchant_dir, memory_hint)
        result["analysis_method"] = "offline-ast (fallback: LLM output rejected)"
    else:
        result = investigate_offline(incident, merchant_dir, memory_hint)
    problems = quality_check(result, incident, sources)
    if problems:
        raise InvestigationError("Investigation failed validation: " + "; ".join(problems))
    return check_evidence(result, incident)


def to_json(result: dict) -> str:
    return json.dumps(result)

"""Repair agent - produces a real code patch inside an isolated sandbox copy.

Edits are search/replace operations restricted to approved files. Every patch passes a
static policy gate (compiles, no dangerous imports/calls, public interface preserved)
before it may be verified. The repair agent cannot see or touch the verifier suite.
"""
from __future__ import annotations

import ast
import difflib
from pathlib import Path

from .. import config, merchant_runtime
from . import llm
from .investigator import function_bounds
from .sanitize import numbered, untrusted_block

SCHEMA = {
    "type": "object",
    "properties": {
        "edits": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "file": {"type": "string"},
                    "search": {"type": "string", "description": "Exact existing text to replace (must be unique)"},
                    "replace": {"type": "string"},
                },
                "required": ["file", "search", "replace"],
                "additionalProperties": False,
            },
        },
        "explanation": {"type": "string"},
        "risk_notes": {"type": "string"},
    },
    "required": ["edits", "explanation", "risk_notes"],
    "additionalProperties": False,
}

ALLOWED_IMPORTS = {"hashlib", "hmac", "json", "typing", "dataclasses", "enum", "re", "logging", "decimal",
                   "datetime", "__future__"}
FORBIDDEN_CALLS = {"eval", "exec", "compile", "open", "__import__", "getattr", "setattr", "globals", "locals",
                   "input", "breakpoint"}
REQUIRED_FUNCTIONS = {"handle_callback": ["payload", "signature", "secret", "store"],
                      "map_gateway_status": None, "verify_signature": None}


class RepairError(RuntimeError):
    pass


def undefined_names(tree: ast.Module) -> list[str]:
    """Names that are read but never defined anywhere in the module (catches patches that reference
    helpers or constants that do not exist - they would only fail at runtime)."""
    import builtins

    defined = set(dir(builtins))
    for node in ast.walk(tree):
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef)):
            defined.add(node.name)
        elif isinstance(node, ast.arg):
            defined.add(node.arg)
        elif isinstance(node, ast.Name) and isinstance(node.ctx, (ast.Store, ast.Del)):
            defined.add(node.id)
        elif isinstance(node, (ast.Import, ast.ImportFrom)):
            defined.update((a.asname or a.name).split(".")[0] for a in node.names)
        elif isinstance(node, ast.ExceptHandler) and node.name:
            defined.add(node.name)
    missing = sorted({n.id for n in ast.walk(tree)
                      if isinstance(n, ast.Name) and isinstance(n.ctx, ast.Load) and n.id not in defined})
    return [f"Undefined name: {m} (it is not defined anywhere in the file)" for m in missing]


def policy_check(code: str) -> list[str]:
    problems: list[str] = []
    try:
        tree = ast.parse(code)
        compile(code, "<patch>", "exec")
    except SyntaxError as exc:
        return [f"Patched code does not compile: {exc}"]
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            for a in node.names:
                if a.name.split(".")[0] not in ALLOWED_IMPORTS:
                    problems.append(f"Forbidden import: {a.name}")
        elif isinstance(node, ast.ImportFrom):
            if (node.module or "").split(".")[0] not in ALLOWED_IMPORTS:
                problems.append(f"Forbidden import: from {node.module}")
        elif isinstance(node, ast.Call) and isinstance(node.func, ast.Name) and node.func.id in FORBIDDEN_CALLS:
            problems.append(f"Forbidden call: {node.func.id}()")
        elif isinstance(node, ast.Attribute) and node.attr.startswith("__") and node.attr != "__init__":
            problems.append(f"Forbidden dunder access: {node.attr}")
    problems += undefined_names(tree)
    defs = {n.name: n for n in tree.body if isinstance(n, ast.FunctionDef)}
    for name, args in REQUIRED_FUNCTIONS.items():
        if name not in defs:
            problems.append(f"Public function {name}() was removed")
        elif args and [a.arg for a in defs[name].args.args] != args:
            problems.append(f"Signature of {name}() changed")
    return problems


def apply_edits(sandbox_merchant: Path, edits: list[dict]) -> dict[str, tuple[str, str]]:
    """Apply edits in the sandbox. Returns {file: (original, patched)}."""
    if not edits:
        raise RepairError("Repair agent proposed no edits")
    changed: dict[str, tuple[str, str]] = {}
    for e in edits:
        file = e["file"].replace("\\", "/").split("/")[-1]
        if file not in config.APPROVED_FILES:
            raise RepairError(f"Blocked: {e['file']!r} is not on the approved-file allowlist")
        target = (sandbox_merchant / file).resolve()
        if target.parent != sandbox_merchant.resolve():
            raise RepairError("Blocked: path escapes the sandbox")
        original = changed.get(file, (target.read_text(encoding="utf-8"),) * 2)[1]
        count = original.count(e["search"])
        if count != 1:
            raise RepairError(f"Edit search text matched {count} times in {file} (must be exactly 1)")
        patched = original.replace(e["search"], e["replace"], 1)
        base = changed[file][0] if file in changed else original
        changed[file] = (base, patched)
        target.write_text(patched, encoding="utf-8")
    return changed


def unified_diff(file: str, before: str, after: str) -> str:
    return "".join(difflib.unified_diff(before.splitlines(True), after.splitlines(True),
                                        fromfile=f"a/{file}", tofile=f"b/{file}", n=3))


# ------------------------------------------------------------------ LLM mode
def propose_llm(investigation: dict, sandbox_merchant: Path, feedback: str | None) -> dict:
    sources = {f: (sandbox_merchant / f).read_text(encoding="utf-8") for f in config.APPROVED_FILES}
    parts = [
        "Produce a minimal, correct code patch for the diagnosed defect.",
        untrusted_block("investigation_result", investigation),
        untrusted_block("gateway_contract.json (read-only spec)", merchant_runtime.contract()),
    ]
    for f, code in sources.items():
        parts.append(untrusted_block(f"{f} (approved file, line-numbered for reference only)", numbered(code)))
    if feedback:
        parts.append(untrusted_block("independent_verifier_feedback_from_previous_attempt", feedback))
    fn = investigation.get("function")
    if fn:
        parts.append(
            f"Scope: the validated defect is in {investigation.get('file')}::{fn}() (lines "
            f"{investigation.get('line_start')}-{investigation.get('line_end')}). Make the smallest change inside "
            f"{fn}() that implements the gateway contract mapping exactly "
            f"({', '.join(f'{k} -> {v}' for k, v in merchant_runtime.contract()['status_to_order_state'].items())}); "
            "unknown statuses must raise so the order is untouched and the gateway retries. Do not edit other "
            "functions unless the verifier feedback proves it is necessary.")
    parts.append(
        "Rules: only reference names that already exist in the file. "
        "Express the patch as search/replace edits whose `search` is copied EXACTLY (without line numbers) "
        "from the current file and occurs exactly once. Edit only: " + ", ".join(config.APPROVED_FILES) + ". "
        "Keep handle_callback(payload, signature, secret, store), map_gateway_status and verify_signature. Do not "
        "add imports beyond the standard hashing/json modules. Preserve signature verification, idempotency and "
        "final-state protection. Explain the change for a human reviewer.")
    return llm.structured_call(
        system="You are the FIXCHAIN Repair Agent. You write minimal, production-quality fixes.",
        user="\n\n".join(parts), schema=SCHEMA, effort="high")


# ------------------------------------------------------------------ offline mode
def propose_offline(investigation: dict, sandbox_merchant: Path, feedback: str | None) -> dict:
    """Deterministic repair: rebuild the faulty status-mapping function from the gateway contract."""
    file, fn_name = investigation["file"], investigation["function"]
    code = (sandbox_merchant / file).read_text(encoding="utf-8")
    bounds = function_bounds(code, fn_name)
    if not bounds:
        raise RepairError(f"{fn_name} not found in {file}")
    fn_node = next(n for n in ast.parse(code).body if isinstance(n, ast.FunctionDef) and n.name == fn_name)
    order_states = set(merchant_runtime.contract()["status_to_order_state"].values())
    if not ({v for v, _ in [(r.value.value, 0) for r in ast.walk(fn_node)
                            if isinstance(r, ast.Return) and isinstance(r.value, ast.Constant)]} & order_states):
        raise RepairError("Offline repair only supports status-mapping functions. Configure ANTHROPIC_API_KEY "
                          "for the LLM repair agent.")
    if len(fn_node.args.args) != 1:
        raise RepairError("Offline repair expects a single-argument mapping function")
    arg = fn_node.args.args[0].arg
    lines = code.splitlines(True)
    original_fn = "".join(lines[bounds[0] - 1:bounds[1]])
    mapping = merchant_runtime.contract()["status_to_order_state"]
    doc = ast.get_docstring(fn_node) or "Translate a gateway transaction status into our order status."
    body = [f"def {fn_name}({arg}: str) -> str:\n",
            f'    """{doc}\n\n    Explicit mapping per the gateway callback contract; unknown statuses are\n'
            f'    rejected instead of silently defaulting to a final state.\n    """\n',
            f'    status = ({arg} or "").strip().upper()\n']
    for gw_status, order_state in mapping.items():
        body.append(f'    if status == "{gw_status}":\n        return "{order_state}"\n')
    body.append(f'    raise ValueError(f"Unknown gateway status: {{{arg}!r}}")\n')
    new_fn = "".join(body)
    return {
        "edits": [{"file": file, "search": original_fn, "replace": new_fn}],
        "explanation": (f"Rebuilt {fn_name}() from the gateway contract: every contract status "
                        f"({', '.join(f'{k}->{v}' for k, v in mapping.items())}) now has an explicit branch and "
                        f"unknown statuses raise ValueError instead of being treated as a failed payment."),
        "risk_notes": "Unknown gateway statuses now raise; the webhook returns HTTP 500 so the gateway retries "
                      "instead of the order being wrongly failed.",
        "generator": "offline-contract-template",
    }


def propose(investigation: dict, sandbox_merchant: Path, mode: str, feedback: str | None) -> dict:
    if mode == "llm":
        return propose_llm(investigation, sandbox_merchant, feedback)
    return propose_offline(investigation, sandbox_merchant, feedback)

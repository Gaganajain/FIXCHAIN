"""Central configuration. Secrets come only from environment variables (.env)."""
from __future__ import annotations

import os
import secrets
from pathlib import Path

try:
    from dotenv import load_dotenv

    if os.getenv("FIXCHAIN_NO_DOTENV") != "1":  # tests opt out so real keys are never loaded
        load_dotenv(Path(__file__).resolve().parents[1] / ".env")
        load_dotenv(Path(__file__).resolve().parents[2] / ".env")
except ImportError:  # pragma: no cover
    pass

BACKEND_DIR = Path(__file__).resolve().parents[1]
DATA_DIR = Path(os.getenv("FIXCHAIN_DATA_DIR", BACKEND_DIR / "workspace"))
DB_PATH = DATA_DIR / "fixchain.db"

# Merchant (simulated) code: the live "demo environment" copy and the pristine template.
MERCHANT_TEMPLATE_DIR = BACKEND_DIR / "merchant_templates"
MERCHANT_ACTIVE_DIR = DATA_DIR / "merchant_active"
SANDBOX_ROOT = DATA_DIR / "sandboxes"

# The independent verifier suite. Never copied into a sandbox, never writable by agents.
VERIFIER_SUITE_DIR = BACKEND_DIR / "verifier_suite"

# Files the agents may read and the repair agent may modify (relative to merchant dir).
APPROVED_FILES = ["payment_handler.py"]
# Read-only context the investigator may also see.
READ_ONLY_CONTEXT = ["gateway_contract.json"]

# Gateway webhook secret: used for HMAC signing. NEVER sent to an LLM.
def _webhook_secret() -> str:
    """Env wins. Otherwise generate once and keep it in the (git-ignored) data dir, so signatures stay
    valid across restarts instead of silently changing on every start."""
    env = os.getenv("GATEWAY_WEBHOOK_SECRET")
    if env:
        return env
    path = DATA_DIR / ".webhook_secret"
    try:
        if path.exists() and len(path.read_text().strip()) >= 32:
            return path.read_text().strip()
        DATA_DIR.mkdir(parents=True, exist_ok=True)
        value = secrets.token_hex(32)
        path.write_text(value)
        try:
            os.chmod(path, 0o600)
        except OSError:  # pragma: no cover - best effort on Windows
            pass
        return value
    except OSError:  # read-only data dir: fall back to a per-process secret
        return secrets.token_hex(32)


GATEWAY_WEBHOOK_SECRET = _webhook_secret()

# Reviewer authentication for decisions that change the simulated live environment
# (approve / reject / rollback / reconcile). If set, requests must send X-Reviewer-Token.
REVIEWER_TOKEN = os.getenv("FIXCHAIN_REVIEWER_TOKEN", "")

ANTHROPIC_MODEL = os.getenv("FIXCHAIN_MODEL", "claude-opus-5-5")
SARVAM_MODEL = os.getenv("SARVAM_MODEL", "sarvam-105b")
SARVAM_BASE_URL = os.getenv("SARVAM_BASE_URL", "https://api.sarvam.ai/v2").rstrip("/")
SARVAM_REASONING_EFFORT = os.getenv("SARVAM_REASONING_EFFORT", "medium")
SARVAM_MAX_TOKENS = int(os.getenv("SARVAM_MAX_TOKENS", "32000"))
_mode = os.getenv("FIXCHAIN_AGENT_MODE", "auto").lower()
_provider = os.getenv("FIXCHAIN_LLM_PROVIDER", "auto").lower()


def _has_anthropic() -> bool:
    return bool(os.getenv("ANTHROPIC_API_KEY") or os.getenv("ANTHROPIC_AUTH_TOKEN"))


def _has_sarvam() -> bool:
    return bool(os.getenv("SARVAM_API_KEY"))


def llm_provider() -> str | None:
    """'anthropic' | 'sarvam' | None. Explicit FIXCHAIN_LLM_PROVIDER wins; else whichever key exists."""
    if _provider == "anthropic":
        return "anthropic" if _has_anthropic() else None
    if _provider == "sarvam":
        return "sarvam" if _has_sarvam() else None
    if _has_anthropic():
        return "anthropic"
    if _has_sarvam():
        return "sarvam"
    return None


def llm_model() -> str | None:
    return {"anthropic": ANTHROPIC_MODEL, "sarvam": SARVAM_MODEL}.get(llm_provider() or "")


def llm_label() -> str:
    p = llm_provider()
    return f"{'Claude' if p == 'anthropic' else 'Sarvam'} · {llm_model()}" if p else "offline"


def agent_mode() -> str:
    """'llm' when an LLM provider key is configured (or forced), else 'offline'."""
    if _mode == "offline":
        return "offline"
    if _mode == "llm":
        return "llm"
    return "llm" if llm_provider() else "offline"


# Browser origins allowed to call the API directly. The hosted dashboard normally proxies /api through
# Vercel (same origin), so this is only needed if the frontend calls the backend URL directly.
CORS_ORIGINS = ["http://localhost:5173", "http://127.0.0.1:5173"] + [
    o.strip().rstrip("/") for o in os.getenv("FIXCHAIN_CORS_ORIGINS", "").split(",") if o.strip()]

# Cost guard for public deployments: at most this many LLM-mode pipeline runs per rolling hour; further runs
# use the labelled offline agents. 0 disables the cap.
MAX_LLM_RUNS_PER_HOUR = int(os.getenv("FIXCHAIN_MAX_LLM_RUNS_PER_HOUR", "0"))

AUTO_INVESTIGATE =os.getenv("FIXCHAIN_AUTO_INVESTIGATE", "true").lower() == "true"
MAX_REPAIR_ATTEMPTS = int(os.getenv("FIXCHAIN_MAX_REPAIR_ATTEMPTS", "3"))
VERIFIER_TIMEOUT_S = int(os.getenv("FIXCHAIN_VERIFIER_TIMEOUT", "60"))

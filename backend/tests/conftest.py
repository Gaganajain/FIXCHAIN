"""Test isolation: runs before any test module imports the app.

Points FIXCHAIN at a throwaway data dir and forces offline agents with no provider keys,
so tests never touch the live demo database or call a paid API.
"""
import os
import tempfile

os.environ["FIXCHAIN_NO_DOTENV"] = "1"
os.environ["FIXCHAIN_DATA_DIR"] = tempfile.mkdtemp(prefix="fixchain_test_")
os.environ["FIXCHAIN_AGENT_MODE"] = "offline"
os.environ["GATEWAY_WEBHOOK_SECRET"] = "test-secret-for-pytest-only"
for _k in ("ANTHROPIC_API_KEY", "ANTHROPIC_AUTH_TOKEN", "SARVAM_API_KEY"):
    os.environ.pop(_k, None)

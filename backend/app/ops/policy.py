"""Deterministic policy engine. The LLM never grants itself permission: every action an agent wants to take is
looked up here by type, and the tier decides whether it may run autonomously, needs an authorised human
approval, or stays human-led. Unknown actions are denied.
"""
from __future__ import annotations

from dataclasses import dataclass

from . import connectors

TIER_LABEL = {0: "Tier 0 · informational", 1: "Tier 1 · low-risk / read-only", 2: "Tier 2 · consequential (approval)",
              3: "Tier 3 · sensitive (human-led)"}

# action_type -> (tier, required approver role, reversible, description)
CATALOG: dict[str, tuple[int, str | None, bool, str]] = {
    "customer_update": (0, None, True, "Send an approved-template update to the customer"),
    "payment_status_check": (1, None, True, "Read authoritative payment status"),
    "device_diagnostics": (1, None, True, "Read Soundbox telemetry and run a test announcement"),
    "device_remote_restart": (1, None, True, "Safe remote restart of a Soundbox"),
    "qr_config_check": (1, None, True, "Read QR / VPA configuration"),
    "settlement_status_check": (1, None, True, "Read settlement batch status"),
    "gateway_health_check": (1, None, True, "Read gateway health"),
    "payment_reconciliation_request": (2, "approver", False, "Ask the payment system to re-sync the merchant record "
                                                              "from the bank's status (no money is moved)"),
    "refund_request": (2, "approver", False, "Raise a refund request with the payment partner"),
    "qr_remap": (2, "approver", True, "Re-link a merchant QR code to its active VPA"),
    "settlement_partner_escalation": (2, "approver", False, "Formal escalation of a held settlement batch to the partner bank"),
    "gateway_failover": (2, "approver", True, "Route payment traffic to the secondary gateway"),
    "publish_status_banner": (2, "incident_manager", True, "Publish a public service-status banner"),
    "device_replacement": (2, "approver", False, "Order a replacement Soundbox"),
    "fraud_case_handoff": (3, "approver", False, "Fraud investigation and liability decision (human-led)"),
    "account_freeze": (3, "approver", False, "Freeze an account or merchant (human-led)"),
    "regulatory_filing": (3, "approver", False, "Regulatory / legal filing (human-led; FIXCHAIN only drafts)"),
}

ROLE_RANK = {"approver": 1, "admin": 2}


@dataclass
class Decision:
    action_type: str
    tier: int
    allowed: bool
    autonomous: bool
    requires_approval: bool
    human_led: bool
    required_role: str | None
    reversible: bool
    reason: str


def autonomy_enabled() -> bool:
    cfg = connectors.world_get("config", "autonomy") or {}
    return cfg.get("enabled", True)


def decide(action_type: str, *, severity: str | None = None) -> Decision:
    if action_type not in CATALOG:
        return Decision(action_type, 3, False, False, False, False, None, False,
                        f"Unknown action '{action_type}' - denied by default")
    tier, role, reversible, desc = CATALOG[action_type]
    if tier <= 1 and not autonomy_enabled() and tier == 1 and action_type not in {
            "payment_status_check", "device_diagnostics", "qr_config_check", "settlement_status_check",
            "gateway_health_check"}:
        return Decision(action_type, tier, True, False, True, False, "approver", reversible,
                        "Autonomous write actions are switched off in Settings - approval required")
    if tier <= 1:
        return Decision(action_type, tier, True, True, False, False, None, reversible,
                        f"{TIER_LABEL[tier]}: allow-listed, may run autonomously and is fully logged")
    if tier == 2:
        why = f"{TIER_LABEL[tier]}: consequential - needs an authorised {role} before execution"
        if severity == "SEV-1":
            why += " (SEV-1: risky automation suppressed)"
        return Decision(action_type, tier, True, False, True, False, role, reversible, why)
    return Decision(action_type, tier, True, False, False, True, role, reversible,
                    f"{TIER_LABEL[tier]}: human-led - FIXCHAIN only gathers evidence, drafts and routes")


def can_decide(role: str, required_role: str | None) -> bool:
    if role == "admin":
        return True
    if required_role == "incident_manager":
        return role in ("incident_manager", "approver")
    return role == (required_role or "approver")

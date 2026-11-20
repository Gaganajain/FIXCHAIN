"""FIXCHAIN operations platform: customer tickets, incident intelligence, safe resolution and the
bridge to the engineering remediation pipeline (app.orchestrator)."""

AGENTS = [
    {"id": "customer_agent", "name": "Customer Understanding", "role": "Multilingual intake, facts, follow-ups",
     "tier": "language"},
    {"id": "triage", "name": "Triage", "role": "Category, rule-based severity, SLA", "tier": "rules"},
    {"id": "incident_intel", "name": "Incident Intelligence", "role": "Clustering, bursts, impact", "tier": "rules"},
    {"id": "investigation", "name": "Investigation", "role": "Evidence, facts vs hypotheses", "tier": "evidence"},
    {"id": "resolution", "name": "Resolution", "role": "Approved playbooks, policy-gated actions", "tier": "policy"},
    {"id": "verifier", "name": "Verification", "role": "Authoritative re-checks before closure", "tier": "evidence"},
    {"id": "communication", "name": "Customer Communication", "role": "Approved updates in en / hi / mr",
     "tier": "language"},
    {"id": "engineering", "name": "Engineering Remediation", "role": "Reproduce, patch, locked tests, approval",
     "tier": "engineering"},
    {"id": "learning", "name": "Learning & Knowledge", "role": "Verified outcomes → proposals for review",
     "tier": "governed"},
    {"id": "copilot", "name": "Operations Copilot", "role": "Briefs, severity rationale, reports", "tier": "language"},
    {"id": "orchestrator", "name": "Orchestrator", "role": "Queue, workers, retries, recovery", "tier": "rules"},
]

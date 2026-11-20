"""Versioned, forward-only migrations for the operations platform.

Each migration runs once inside a transaction and is recorded in `schema_migrations`. The engineering
pipeline's original tables are created by db.init_db() and are left untouched.
"""
from __future__ import annotations

from .. import db

MIGRATIONS: list[tuple[int, str, str]] = [
    (1, "ops core", """
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE,
    display_name TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('customer','merchant','support','incident_manager','engineer','approver','admin')),
    password_hash TEXT,
    locale TEXT NOT NULL DEFAULT 'en',
    customer_id INTEGER,
    merchant_id INTEGER,
    demo INTEGER NOT NULL DEFAULT 0,
    created_at REAL NOT NULL
);
CREATE TABLE IF NOT EXISTS sessions (
    token_hash TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id),
    created_at REAL NOT NULL,
    expires_at REAL NOT NULL
);
CREATE TABLE IF NOT EXISTS customers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    phone_masked TEXT,
    locale TEXT NOT NULL DEFAULT 'en',
    region TEXT,
    simulated INTEGER NOT NULL DEFAULT 0,
    created_at REAL NOT NULL
);
CREATE TABLE IF NOT EXISTS merchants (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    region TEXT,
    city TEXT,
    device_id TEXT,
    device_model TEXT,
    qr_id TEXT,
    locale TEXT NOT NULL DEFAULT 'en',
    simulated INTEGER NOT NULL DEFAULT 0,
    created_at REAL NOT NULL
);
CREATE TABLE IF NOT EXISTS tickets (
    id TEXT PRIMARY KEY,
    customer_id INTEGER REFERENCES customers(id),
    merchant_id INTEGER REFERENCES merchants(id),
    created_by INTEGER REFERENCES users(id),
    customer_type TEXT NOT NULL CHECK (customer_type IN ('consumer','merchant')),
    channel TEXT NOT NULL,
    locale TEXT NOT NULL,
    title TEXT,
    problem TEXT,
    category TEXT,
    subcategory TEXT,
    service TEXT,
    symptoms TEXT,
    severity TEXT,
    priority INTEGER,
    confidence REAL,
    reason_codes TEXT,
    state TEXT NOT NULL,
    status TEXT NOT NULL,
    fingerprint TEXT,
    incident_id TEXT,
    amount INTEGER,
    txn_ref TEXT,
    device_model TEXT,
    region TEXT,
    missing_fields TEXT,
    extracted TEXT,
    extraction_method TEXT,
    sla_policy TEXT,
    first_response_due REAL,
    resolution_due REAL,
    first_responded_at REAL,
    resolved_at REAL,
    resolution_summary TEXT,
    simulated INTEGER NOT NULL DEFAULT 0,
    simulation_run_id INTEGER,
    created_at REAL NOT NULL,
    updated_at REAL NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_tickets_state ON tickets(state);
CREATE INDEX IF NOT EXISTS ix_tickets_incident ON tickets(incident_id);
CREATE INDEX IF NOT EXISTS ix_tickets_fp ON tickets(fingerprint, created_at);
CREATE INDEX IF NOT EXISTS ix_tickets_created ON tickets(created_at);
CREATE TABLE IF NOT EXISTS ticket_messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ticket_id TEXT NOT NULL REFERENCES tickets(id),
    role TEXT NOT NULL CHECK (role IN ('customer','agent','operator','system')),
    author TEXT NOT NULL,
    locale TEXT,
    body TEXT NOT NULL,
    kind TEXT NOT NULL DEFAULT 'message',
    meta TEXT,
    created_at REAL NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_msgs_ticket ON ticket_messages(ticket_id, id);
CREATE TABLE IF NOT EXISTS ops_incidents (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    category TEXT NOT NULL,
    subcategory TEXT,
    service TEXT,
    fingerprint TEXT NOT NULL,
    severity TEXT NOT NULL,
    severity_factors TEXT,
    state TEXT NOT NULL,
    confidence REAL,
    kind TEXT NOT NULL DEFAULT 'cluster',
    affected_tickets INTEGER NOT NULL DEFAULT 0,
    affected_customers INTEGER NOT NULL DEFAULT 0,
    affected_merchants INTEGER NOT NULL DEFAULT 0,
    regions TEXT,
    first_seen REAL NOT NULL,
    last_seen REAL NOT NULL,
    hypothesis TEXT,
    hypothesis_status TEXT,
    summary TEXT,
    software_defect INTEGER NOT NULL DEFAULT 0,
    engineering_issue_id TEXT,
    simulated INTEGER NOT NULL DEFAULT 0,
    simulation_run_id INTEGER,
    created_at REAL NOT NULL,
    updated_at REAL NOT NULL,
    resolved_at REAL
);
CREATE INDEX IF NOT EXISTS ix_inc_fp ON ops_incidents(fingerprint, state);
CREATE TABLE IF NOT EXISTS incident_tickets (
    incident_id TEXT NOT NULL REFERENCES ops_incidents(id),
    ticket_id TEXT NOT NULL REFERENCES tickets(id),
    similarity REAL NOT NULL,
    method TEXT NOT NULL,
    linked_at REAL NOT NULL,
    PRIMARY KEY (incident_id, ticket_id)
);
CREATE TABLE IF NOT EXISTS workflow_runs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    kind TEXT NOT NULL CHECK (kind IN ('ticket','incident')),
    subject_id TEXT NOT NULL,
    state TEXT NOT NULL,
    started_at REAL NOT NULL,
    updated_at REAL NOT NULL,
    finished_at REAL,
    error TEXT,
    UNIQUE (kind, subject_id)
);
CREATE TABLE IF NOT EXISTS agent_tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    workflow_id INTEGER,
    agent TEXT NOT NULL,
    task_type TEXT NOT NULL,
    subject_kind TEXT NOT NULL,
    subject_id TEXT NOT NULL,
    priority INTEGER NOT NULL DEFAULT 5,
    status TEXT NOT NULL CHECK (status IN ('queued','running','succeeded','failed','retrying','dead','cancelled')),
    attempts INTEGER NOT NULL DEFAULT 0,
    max_attempts INTEGER NOT NULL DEFAULT 3,
    idempotency_key TEXT NOT NULL UNIQUE,
    payload TEXT,
    result TEXT,
    error TEXT,
    worker TEXT,
    model TEXT,
    queued_at REAL NOT NULL,
    not_before REAL NOT NULL DEFAULT 0,
    started_at REAL,
    finished_at REAL,
    duration_ms INTEGER
);
CREATE INDEX IF NOT EXISTS ix_tasks_queue ON agent_tasks(status, priority, id);
CREATE INDEX IF NOT EXISTS ix_tasks_subject ON agent_tasks(subject_kind, subject_id);
CREATE TABLE IF NOT EXISTS agent_handoffs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    workflow_id INTEGER,
    from_agent TEXT NOT NULL,
    to_agent TEXT NOT NULL,
    subject_kind TEXT NOT NULL,
    subject_id TEXT NOT NULL,
    summary TEXT NOT NULL,
    ts REAL NOT NULL
);
CREATE TABLE IF NOT EXISTS ops_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ts REAL NOT NULL,
    type TEXT NOT NULL,
    level TEXT NOT NULL DEFAULT 'info',
    actor_type TEXT NOT NULL,
    actor_id TEXT NOT NULL,
    ticket_id TEXT,
    incident_id TEXT,
    workflow_id INTEGER,
    message TEXT NOT NULL,
    data TEXT,
    simulated INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS ix_events_ticket ON ops_events(ticket_id, id);
CREATE INDEX IF NOT EXISTS ix_events_incident ON ops_events(incident_id, id);
CREATE TABLE IF NOT EXISTS evidence (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    incident_id TEXT,
    ticket_id TEXT,
    source TEXT NOT NULL,
    kind TEXT NOT NULL CHECK (kind IN ('fact','observation','hypothesis')),
    summary TEXT NOT NULL,
    data TEXT,
    collected_by TEXT NOT NULL,
    collected_at REAL NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_evidence_inc ON evidence(incident_id);
CREATE INDEX IF NOT EXISTS ix_evidence_tkt ON evidence(ticket_id);
CREATE TABLE IF NOT EXISTS resolution_actions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    incident_id TEXT,
    ticket_id TEXT,
    playbook_key TEXT,
    playbook_version INTEGER,
    action_type TEXT NOT NULL,
    tier INTEGER NOT NULL,
    params TEXT NOT NULL,
    rationale TEXT,
    status TEXT NOT NULL CHECK (status IN ('proposed','awaiting_approval','approved','executing','executed','verified','verify_failed','failed','blocked','rejected','human_led','cancelled')),
    idempotency_key TEXT NOT NULL UNIQUE,
    requested_by TEXT NOT NULL,
    result TEXT,
    created_at REAL NOT NULL,
    executed_at REAL,
    verified_at REAL
);
CREATE INDEX IF NOT EXISTS ix_actions_inc ON resolution_actions(incident_id);
CREATE INDEX IF NOT EXISTS ix_actions_tkt ON resolution_actions(ticket_id);
CREATE TABLE IF NOT EXISTS approvals (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    action_id INTEGER NOT NULL UNIQUE REFERENCES resolution_actions(id),
    incident_id TEXT,
    ticket_id TEXT,
    action_type TEXT NOT NULL,
    tier INTEGER NOT NULL,
    payload TEXT NOT NULL,
    payload_hash TEXT NOT NULL,
    summary TEXT NOT NULL,
    evidence_summary TEXT,
    expected_effect TEXT,
    reversible INTEGER NOT NULL,
    policy_reason TEXT NOT NULL,
    requested_by TEXT NOT NULL,
    required_role TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('pending','approved','rejected','expired','cancelled')),
    decided_by TEXT,
    decided_role TEXT,
    decided_at REAL,
    note TEXT,
    expires_at REAL NOT NULL,
    created_at REAL NOT NULL
);
CREATE TABLE IF NOT EXISTS verifications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    action_id INTEGER,
    incident_id TEXT,
    ticket_id TEXT,
    method TEXT NOT NULL,
    source TEXT NOT NULL,
    passed INTEGER NOT NULL,
    detail TEXT,
    ts REAL NOT NULL
);
CREATE TABLE IF NOT EXISTS connector_calls (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    connector TEXT NOT NULL,
    operation TEXT NOT NULL,
    idempotency_key TEXT,
    request TEXT,
    response TEXT,
    status TEXT NOT NULL,
    latency_ms INTEGER,
    ticket_id TEXT,
    incident_id TEXT,
    ts REAL NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_connector_idem ON connector_calls(idempotency_key) WHERE idempotency_key IS NOT NULL;
CREATE TABLE IF NOT EXISTS mock_world (
    kind TEXT NOT NULL,
    entity_id TEXT NOT NULL,
    state TEXT NOT NULL,
    updated_at REAL NOT NULL,
    PRIMARY KEY (kind, entity_id)
);
CREATE TABLE IF NOT EXISTS playbooks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    key TEXT NOT NULL,
    version INTEGER NOT NULL,
    category TEXT NOT NULL,
    title TEXT NOT NULL,
    risk_tier INTEGER NOT NULL,
    steps TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('draft','proposed','approved','retired','rejected')),
    source TEXT NOT NULL,
    approved_by TEXT,
    created_at REAL NOT NULL,
    UNIQUE (key, version)
);
CREATE TABLE IF NOT EXISTS engineering_issues (
    id TEXT PRIMARY KEY,
    incident_id TEXT NOT NULL REFERENCES ops_incidents(id),
    component TEXT NOT NULL,
    title TEXT NOT NULL,
    hypothesis TEXT,
    evidence TEXT,
    status TEXT NOT NULL,
    eng_incident_id INTEGER,
    run_id INTEGER,
    patch_id INTEGER,
    outcome TEXT,
    created_at REAL NOT NULL,
    updated_at REAL NOT NULL
);
CREATE TABLE IF NOT EXISTS knowledge (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    kind TEXT NOT NULL CHECK (kind IN ('finding','article','playbook_proposal')),
    category TEXT,
    title TEXT NOT NULL,
    body TEXT NOT NULL,
    evidence TEXT,
    confidence REAL,
    status TEXT NOT NULL CHECK (status IN ('proposed','approved','rejected','retired')),
    source_incident_id TEXT,
    playbook_key TEXT,
    created_by TEXT NOT NULL,
    decided_by TEXT,
    created_at REAL NOT NULL,
    updated_at REAL NOT NULL,
    review_due REAL
);
CREATE TABLE IF NOT EXISTS simulation_runs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    scenario TEXT NOT NULL,
    size INTEGER NOT NULL,
    seed INTEGER NOT NULL,
    status TEXT NOT NULL,
    created INTEGER NOT NULL DEFAULT 0,
    params TEXT,
    started_by TEXT,
    started_at REAL NOT NULL,
    finished_at REAL
);
CREATE TABLE IF NOT EXISTS audit_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ts REAL NOT NULL,
    actor TEXT NOT NULL,
    role TEXT,
    action TEXT NOT NULL,
    target TEXT,
    detail TEXT,
    prev_hash TEXT,
    hash TEXT NOT NULL
);
CREATE TRIGGER IF NOT EXISTS audit_no_update BEFORE UPDATE ON audit_log
BEGIN SELECT RAISE(ABORT, 'audit_log is append-only'); END;
CREATE TRIGGER IF NOT EXISTS audit_no_delete BEFORE DELETE ON audit_log
BEGIN SELECT RAISE(ABORT, 'audit_log is append-only'); END;
"""),
]


def migrate() -> list[int]:
    applied: list[int] = []
    with db.tx() as c:
        c.execute("CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, name TEXT, applied_at REAL)")
        done = {r["version"] for r in c.execute("SELECT version FROM schema_migrations").fetchall()}
    for version, name, sql in MIGRATIONS:
        if version in done:
            continue
        with db.tx() as c:
            c.executescript(sql)
            c.execute("INSERT INTO schema_migrations (version, name, applied_at) VALUES (?,?,?)",
                      (version, name, db.now()))
        applied.append(version)
    return applied


def current_version() -> int:
    r = db.one("SELECT MAX(version) AS v FROM schema_migrations")
    return (r or {}).get("v") or 0

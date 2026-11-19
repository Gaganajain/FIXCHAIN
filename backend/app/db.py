"""SQLite persistence. One connection per call; WAL for concurrent reads from the API."""
from __future__ import annotations

import json
import sqlite3
import threading
import time
from contextlib import contextmanager
from typing import Any, Iterator

from . import config

_lock = threading.RLock()

SCHEMA = """
CREATE TABLE IF NOT EXISTS orders (
    order_id TEXT PRIMARY KEY,
    customer TEXT NOT NULL,
    amount INTEGER NOT NULL,          -- paise
    status TEXT NOT NULL,
    txn_id TEXT,
    created_at REAL NOT NULL,
    updated_at REAL NOT NULL
);
CREATE TABLE IF NOT EXISTS gateway_txns (
    txn_id TEXT PRIMARY KEY,
    order_id TEXT NOT NULL,
    amount INTEGER NOT NULL,
    status TEXT NOT NULL,             -- authoritative gateway status
    created_at REAL NOT NULL,
    updated_at REAL NOT NULL
);
CREATE TABLE IF NOT EXISTS processed_events (
    event_id TEXT PRIMARY KEY,
    processed_at REAL NOT NULL
);
CREATE TABLE IF NOT EXISTS payment_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ts REAL NOT NULL,
    kind TEXT NOT NULL,               -- callback_delivered | callback_result | order_created | ...
    order_id TEXT,
    txn_id TEXT,
    event_id TEXT,
    gateway_status TEXT,
    order_status_before TEXT,
    order_status_after TEXT,
    handler_reason TEXT,
    http_status INTEGER,
    code_version INTEGER,
    detail TEXT
);
CREATE TABLE IF NOT EXISTS app_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ts REAL NOT NULL,
    level TEXT NOT NULL,
    source TEXT NOT NULL,
    message TEXT NOT NULL,
    context TEXT
);
CREATE TABLE IF NOT EXISTS incidents (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    fingerprint TEXT NOT NULL,
    rule TEXT NOT NULL,
    title TEXT NOT NULL,
    severity TEXT NOT NULL,
    status TEXT NOT NULL,             -- open | investigating | awaiting_approval | resolved | rejected
    gateway_status TEXT,
    observed_order_status TEXT,
    expected_order_status TEXT,
    first_seen REAL NOT NULL,
    last_seen REAL NOT NULL,
    occurrences INTEGER NOT NULL DEFAULT 0,
    similar_memory_id INTEGER,
    resolved_at REAL,
    category TEXT NOT NULL DEFAULT 'merchant_integration'   -- merchant_integration | external
);
CREATE TABLE IF NOT EXISTS incident_orders (
    incident_id INTEGER NOT NULL,
    order_id TEXT NOT NULL,
    txn_id TEXT,
    amount INTEGER,
    reconciled INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (incident_id, order_id)
);
CREATE TABLE IF NOT EXISTS runs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    incident_id INTEGER NOT NULL,
    state TEXT NOT NULL,
    agent_mode TEXT NOT NULL,
    agent_label TEXT,
    started_at REAL NOT NULL,
    finished_at REAL,
    verified_at REAL,
    sandbox_path TEXT,
    investigation TEXT,               -- JSON
    error TEXT,
    classification TEXT               -- merchant_code_defect | no_code_defect
);
CREATE TABLE IF NOT EXISTS run_steps (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    run_id INTEGER NOT NULL,
    ts REAL NOT NULL,
    agent TEXT NOT NULL,
    status TEXT NOT NULL,             -- started | info | succeeded | failed | blocked
    message TEXT NOT NULL,
    data TEXT
);
CREATE TABLE IF NOT EXISTS patches (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    run_id INTEGER NOT NULL,
    incident_id INTEGER NOT NULL,
    attempt INTEGER NOT NULL,
    file TEXT NOT NULL,
    original_code TEXT NOT NULL,
    patched_code TEXT NOT NULL,
    diff TEXT NOT NULL,
    explanation TEXT,
    status TEXT NOT NULL,             -- generated | policy_rejected | verified | verify_failed | approved | rejected | rolled_back
    created_at REAL NOT NULL,
    decided_at REAL,
    decided_by TEXT,
    decision_note TEXT
);
CREATE TABLE IF NOT EXISTS test_runs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    run_id INTEGER NOT NULL,
    patch_id INTEGER,
    target TEXT NOT NULL,             -- baseline | patched
    passed INTEGER NOT NULL,
    failed INTEGER NOT NULL,
    errors INTEGER NOT NULL,
    total INTEGER NOT NULL,
    duration_s REAL NOT NULL,
    suite_sha256 TEXT NOT NULL,
    results TEXT NOT NULL,            -- JSON list of {name, outcome, message}
    raw_output TEXT,
    created_at REAL NOT NULL
);
CREATE TABLE IF NOT EXISTS code_versions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    file TEXT NOT NULL,
    code TEXT NOT NULL,
    source TEXT NOT NULL,             -- baseline | bug_injection | patch | rollback | reset
    patch_id INTEGER,
    note TEXT,
    created_at REAL NOT NULL,
    active INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS memory (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    fingerprint TEXT NOT NULL,
    rule TEXT NOT NULL,
    file TEXT,
    function TEXT,
    root_cause TEXT,
    fix_summary TEXT,
    incident_id INTEGER,
    patch_id INTEGER,
    times_seen INTEGER NOT NULL DEFAULT 1,
    created_at REAL NOT NULL,
    last_seen REAL NOT NULL
);
"""


def connect() -> sqlite3.Connection:
    config.DATA_DIR.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(config.DB_PATH, timeout=30, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA foreign_keys=ON")
    return conn


@contextmanager
def tx() -> Iterator[sqlite3.Connection]:
    with _lock:
        conn = connect()
        try:
            yield conn
            conn.commit()
        except Exception:
            conn.rollback()
            raise
        finally:
            conn.close()


def init_db() -> None:
    with tx() as c:
        c.executescript(SCHEMA)
        cols = {r["name"] for r in c.execute("PRAGMA table_info(runs)").fetchall()}
        if "agent_label" not in cols:  # migration for databases created before multi-provider support
            c.execute("ALTER TABLE runs ADD COLUMN agent_label TEXT")
        if "classification" not in cols:
            c.execute("ALTER TABLE runs ADD COLUMN classification TEXT")
        icols = {r["name"] for r in c.execute("PRAGMA table_info(incidents)").fetchall()}
        if "category" not in icols:
            c.execute("ALTER TABLE incidents ADD COLUMN category TEXT NOT NULL DEFAULT 'merchant_integration'")


def rows(sql: str, params: tuple | list = ()) -> list[dict[str, Any]]:
    conn = connect()
    try:
        return [dict(r) for r in conn.execute(sql, params).fetchall()]
    finally:
        conn.close()


def one(sql: str, params: tuple | list = ()) -> dict[str, Any] | None:
    r = rows(sql, params)
    return r[0] if r else None


def now() -> float:
    return time.time()


def log(level: str, source: str, message: str, **context: Any) -> None:
    with tx() as c:
        c.execute(
            "INSERT INTO app_logs (ts, level, source, message, context) VALUES (?,?,?,?,?)",
            (now(), level, source, message, json.dumps(context, default=str) if context else None),
        )

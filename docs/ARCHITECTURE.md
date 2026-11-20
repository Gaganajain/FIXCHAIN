# Architecture

## Decisions and why

| Decision | Why |
|---|---|
| Keep **FastAPI + Python** | The engineering pipeline, verifier suite, LLM adapters and tests are Python; the agents are I/O-bound. |
| Keep **SQLite (WAL)**, behind `app/db.py` | One process on Render's free tier; zero-ops; durable across restarts on the same disk. Thread-local connections + `synchronous=NORMAL` made ticket creation ~30× faster (18 ms → 0.6 ms). Moving to Postgres means swapping `db.py` + the SQL dialect in `ops/schema.py` - no business logic depends on SQLite beyond `json_extract/json_set`. |
| **Keep the engineering pipeline** (`orchestrator.py`, `agents/`) | It is the best-tested part (locked suite, safety gate, approval). Replacing it had no technical justification; the new Engineering Remediation agent bridges into it. |
| **Durable task queue in SQLite + elastic in-process worker pool** (`ops/workers.py`) | Redis/Celery would add infrastructure without benefit for one process. Tasks survive restarts, enqueue is idempotent, failures retry with backoff and dead-letter. Scaling 1→12 threads by queue depth is real but labelled as *not* cloud autoscaling. |
| **Persisted event log + SSE** | Mission Control animates only from `ops_events` rows. `Last-Event-ID` resume means a reconnect never loses events; the client falls back to polling the same log if a proxy buffers the stream. |
| **Deterministic policy engine** | Permissions are data (`ops/policy.py`), never model output. |
| **Vite + React + Tailwind** (kept), plus `lucide-react` and `framer-motion` | The PRD asks to keep the existing framework. No component library was needed; the UI concept's look was rebuilt on the existing tokens. |
| **Versioned migrations** (`ops/schema.py`) | Forward-only, transactional, recorded in `schema_migrations`; the original tables are untouched. |

## Runtime view

```
                        ┌──────────── Vite / React (Mission Control, customer app) ────────────┐
                        │  REST /api/v1 (bearer session)        SSE /api/v1/events/stream       │
                        └───────────────┬──────────────────────────────────▲───────────────────┘
                                        │                                  │ ops_events
┌────────────────────────── FastAPI process ─────────────────────────────────────────────────────┐
│ api.py ─ auth (sessions, RBAC, rate limits) ─ tickets.create() → persist → enqueue("understand") │
│                                                                                                  │
│ agent_tasks (durable queue) ──► worker pool (1..12 threads, sized by queue depth)                │
│   understand → triage → correlate → resolve_ticket        investigate_incident → engineering_bridge│
│        │           │          │            │                       │                     │       │
│   understanding taxonomy correlation  playbooks + actions     incidents.py          orchestrator  │
│   (lexicon/LLM) (severity)(clusters)  policy → approvals →     (evidence,           (engineering  │
│                                        execute → verify        hypotheses)           pipeline)    │
│                                              │                                                     │
│                         connectors.py (MOCK: payments, QR, Soundbox, settlement, gateway)         │
│ tick thread: approval expiry · engineering sync + post-fix verification · SLA breach events       │
│ simulation.py: seeded scenarios A-E (50/100/300) · knowledge.py: governed learning               │
└──────────────────────────────── SQLite (WAL): ops tables + engineering tables ──────────────────┘
```

## Ticket state machine (validated server-side, `ops/tickets.py`)

`NEW → INTAKE → TRIAGED → CORRELATED → INVESTIGATING → (RESOLUTION_PROPOSED) → APPROVAL_REQUIRED → EXECUTING → VERIFYING → RESOLVED`
with holding/terminal states `NEEDS_CUSTOMER, WAITING_PARTNER, ESCALATED, REJECTED, FAILED, REOPENED`.
Every transition is checked against an allow-list and published as `ticket.state_changed`.

Incidents: `OPEN → INVESTIGATING → MITIGATING → MONITORING → RESOLVED` (+ `ESCALATED`).
Engineering issues: `open → reproducing → investigating → patching → testing → awaiting_approval → activated → fixed`
(`fixed` only after the post-fix replay passes), or `no_defect / failed / patch_rejected`.

## Reliability

- Ticket is committed before any agent runs; agent work is asynchronous; APIs return immediately.
- Idempotency: task keys, action keys (`resolution_actions.idempotency_key`), connector write keys.
- Retries: exponential backoff (0.5 s → 30 s), `max_attempts` per task, then dead-letter + human escalation.
- Recovery: tasks left `running` by a crash are re-queued at start-up; engineering runs left mid-pipeline are failed visibly (original behaviour).
- Timeouts: connector timeouts never produce success; provider failures fall back to offline paths with labels.
- Concurrency: correlation is serialised (no duplicate incidents); ID allocation holds a lock across read+insert; `tickets.merge_extracted` uses atomic `json_set`.

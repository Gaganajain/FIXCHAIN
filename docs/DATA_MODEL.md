# Data model

SQLite (WAL). Operations tables are created by versioned migrations in `backend/app/ops/schema.py`
(`schema_migrations`); the original engineering tables are created by `backend/app/db.py`.

## Operations platform

| Table | Purpose | Key columns / constraints |
|---|---|---|
| `users` | operators, approvers, customers, merchants | `role` CHECK in 7 roles; `password_hash` (PBKDF2); `demo` flag |
| `sessions` | bearer sessions | token stored only as SHA-256; `expires_at` |
| `customers`, `merchants` | parties; merchants carry `device_id`, `device_model`, `qr_id`, region | `simulated` flag |
| `tickets` | one customer report | text `id` (TKT-00001); category/subcategory/service/symptoms; severity, priority, confidence, reason codes; `state` + coarse `status`; `fingerprint`; `incident_id`; amount (paise), `txn_ref`; SLA due times; `extracted` JSON (facts, triage, flags); `simulated`; indexes on state, incident, fingerprint+time |
| `ticket_messages` | conversation | role CHECK (customer/agent/operator/system); masked `body`; `kind` (message/question/safety/broadcast/vision) |
| `ops_incidents` | shared underlying event | `kind` (cluster/platform/single); severity + `severity_factors`; impact counts; regions; `hypothesis` + `hypothesis_status`; `software_defect`; `engineering_issue_id` |
| `incident_tickets` | ticket ↔ incident links | PK (incident, ticket); `similarity`, `method` |
| `workflow_runs` | durable workflow state per ticket / incident | UNIQUE (kind, subject_id) |
| `agent_tasks` | durable queue + execution record | status CHECK; `idempotency_key` UNIQUE; attempts/max_attempts; `not_before` backoff; worker; duration; model |
| `agent_handoffs` | typed agent-to-agent handoffs | from, to, subject, summary |
| `ops_events` | chronological source of truth for the UI | type, level, actor, ticket/incident/workflow ids, masked message, JSON data, `simulated` |
| `evidence` | facts / observations / hypotheses | `kind` CHECK; source; collected_by |
| `resolution_actions` | every proposed / executed action | tier; status CHECK; `idempotency_key` UNIQUE; playbook key + version; result |
| `approvals` | human authorisation | one per action (UNIQUE); `payload_hash` (SHA-256); required role; `expires_at`; decided_by/role/at; note |
| `verifications` | outcome checks | method, source, passed (1 / 0 / -1 = pending external) |
| `connector_calls` | mock integration evidence | redacted request/response; status; latency; partial UNIQUE on idempotency key |
| `mock_world` | state behind the mock connectors | PK (kind, entity_id) - txn, device, qr, settlement, gateway, config |
| `playbooks` | versioned resolution playbooks | UNIQUE (key, version); status (draft/proposed/approved/retired/rejected) |
| `engineering_issues` | ops incident ↔ engineering pipeline | links `eng_incident_id`, `run_id`, `patch_id`; status; outcome |
| `knowledge` | findings, articles, proposals | status (proposed/approved/rejected/retired); evidence; `review_due` |
| `simulation_runs` | Simulation Lab runs | scenario, size, seed, status, progress |
| `audit_log` | privileged actions | hash chain (`prev_hash`, `hash`); triggers make it append-only |

## Engineering pipeline (original)

`orders`, `gateway_txns`, `processed_events`, `payment_events`, `app_logs`, `incidents` (engineering monitor),
`incident_orders`, `runs`, `run_steps`, `patches`, `test_runs`, `code_versions`, `memory`.

## Data handling

Masking before storage (`ops/core.mask`): phone, email, UPI ID, Aadhaar-like, card numbers, OTP/PIN values;
UTRs are kept. Images are never stored (checksum + result only). Simulated rows are flagged and never correlated
with live rows. Retention should be configured per data class and verified legal obligation (no universal rule is
encoded).

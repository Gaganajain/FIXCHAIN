# API (`/api/v1`)

Interactive reference: `http://localhost:8000/docs`. All routes require `Authorization: Bearer <token>` unless
noted; permissions are checked server-side (`ops/auth.py`).

| Area | Method & path | Permission |
|---|---|---|
| Auth | `POST /auth/login` {username, password} · `POST /auth/demo-login` {username} (demo mode only) · `GET /auth/me` · `POST /auth/logout` · `GET /auth/demo-users` (public, demo mode) | - |
| System | `GET /system` (mode, LLM label, voice, workers, labels) · `GET /settings` · `POST /settings/autonomy` | any · any · admin |
| Tickets | `POST /tickets` {message, locale, channel, customer_type, context} → 201 (persisted, agents async) | ticket:create |
| | `GET /tickets?q&state&category&severity&incident_id&scope&limit&offset` | own tickets, or ticket:read |
| | `GET /tickets/{id}` (customers get conversation + plain status only) | owner or ticket:read |
| | `POST /tickets/{id}/messages` (customer reply resumes the workflow; operator reply) | owner / ticket:reply |
| | `POST /tickets/{id}/resolve` {note} (human confirmation as verification; fraud needs approver) · `POST /tickets/{id}/escalate` | ticket:reply |
| Incidents | `GET /incidents?state=open&scope` · `GET /incidents/{id}` (brief, evidence, growth, regions, timeline) · `GET /incidents/{id}/report` (markdown draft) | incident:read |
| | `POST /incidents/{id}/status-update` {template} · `POST /incidents/{id}/investigate` | incident:manage |
| Intelligence | `GET /intelligence` (clusters, burst detector, review queue, region × category) | incident:read |
| Approvals | `GET /approvals?status=pending\|all` · `POST /approvals/{id}/approve\|reject` {note} · `POST /approvals/bulk` {incident_id, action_type, approve} | approval:read / approval:decide (+ required role) |
| Actions | `GET /actions?ticket_id&incident_id` | ticket:read |
| Agents | `GET /agents` (board, workers, handoffs) · `GET /agents/tasks?agent&status` · `POST /agents/tasks/{id}/retry` (dead-letter) | agent:read / incident:manage |
| Events | `GET /events?after&ticket_id&incident_id&limit&tail&important` · `GET /events/stream` (SSE; `Last-Event-ID` or `?after=`; `?token=` because EventSource cannot set headers) | signed in (customers see only their own customer-safe events) |
| Engineering | `GET /engineering` · `POST /engineering/{id}/approve\|reject` {patch_id, note} | engineering:read / engineering:approve |
| Knowledge | `GET /knowledge?q&status` · `POST /knowledge/{id}/approve\|reject` · `POST /knowledge/analyse` · `GET /playbooks` | knowledge:read / approve / propose |
| Simulation | `GET /simulation` · `POST /simulation/start` {scenario A-E, size 50\|100\|300, seed, speed} · `POST /simulation/pause` {paused} · `POST /simulation/reset` | signed in / simulation:run |
| Analytics | `GET /analytics/summary?scope` · `GET /analytics/series?minutes&bucket_s` | analytics:read |
| Voice | `GET /voice` (public) · `POST /voice/transcribe` (multipart audio, locale) · `POST /voice/speak` {text, locale} - 503 + `fallback: "text"` when not configured | signed in |
| Vision | `POST /vision/diagnose` (multipart image, optional ticket_id) · `GET /vision/samples/{NORMAL\|LOW_BATTERY\|NETWORK_PROBLEM\|BLANK}.png` (public) | signed in |
| Audit | `GET /audit` (entries + hash-chain verification) | audit:read |

Errors: 401 unauthenticated, 403 forbidden (role), 404 not found, 409 conflict (policy refusal, invalid
transition, stale approval), 422 validation, 429 rate limited, 503 provider unavailable (with fallback hint).

The original engineering API (`/api/*`, e.g. `/api/incidents`, `/api/patches/{id}/approve`) is unchanged. It is
open in demo mode and requires an engineering-capable session when `FIXCHAIN_DEMO_MODE=false`.

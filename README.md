# FIXCHAIN

AI incident intelligence, customer support, autonomous operations and engineering remediation for payment
ecosystems - in a **simulated** environment. No real money moves and nothing connects to a real bank, NPCI,
payment gateway or device fleet: every external system is a clearly labelled mock connector.

```
Customer complaint (en / hi / mr, text · voice · photo)
  → Customer Understanding → ticket persisted → Triage (rule-based severity, SLA)
  → Incident Intelligence (clustering, bursts) → parent incident
  → Investigation (facts vs hypotheses) → Resolution (approved playbooks, policy tiers)
  → Human approval (Tier 2) / human-led (Tier 3) → execution → verification
  → Customer communication → Engineering remediation (reproduce · patch · locked tests · approval)
  → Learning (verified outcomes → proposals a human approves) → Mission Control (live event stream)
```

| What | Where |
|---|---|
| Operations platform (tickets, incidents, agents, policy, approvals, events, simulation) | `backend/app/ops/` |
| Engineering remediation pipeline (original FIXCHAIN, kept intact) | `backend/app/orchestrator.py`, `backend/app/agents/` |
| Locked verifier suite (22 payment-correctness tests) | `backend/verifier_suite/` |
| Mission Control dashboard + customer app | `frontend/` |
| Docs | [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md), [`docs/AGENTS.md`](docs/AGENTS.md), [`docs/DATA_MODEL.md`](docs/DATA_MODEL.md), [`docs/API.md`](docs/API.md), [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md), [`docs/DEMO.md`](docs/DEMO.md) |

## Quick start (Windows, PowerShell or Git Bash; macOS/Linux use `.venv/bin/python`)

```bash
cd backend
python -m venv .venv
.venv/Scripts/python -m pip install -r requirements.txt
copy .env.example .env          # optional - every key may stay empty (offline demo mode)
.venv/Scripts/python -m uvicorn app.main:app --port 8000
```

```bash
cd frontend
npm install
npm run dev                     # http://localhost:5173 (proxies /api to :8000)
```

Open http://localhost:5173, pick a demo role (demo sign-in is labelled and is **not** production
authentication), then follow [`docs/DEMO.md`](docs/DEMO.md). API reference: http://localhost:8000/docs.

### Runs without any credentials
With no keys set, everything works in **offline deterministic mode**: multilingual understanding uses a
lexicon, replies use pre-approved templates, the engineering agents use AST analysis and a contract-based
repair, image diagnosis uses a labelled colour heuristic, and voice falls back to typed text (or the browser's
own speech engine, labelled). Add `SARVAM_API_KEY` (language + voice) and/or `ANTHROPIC_API_KEY` (reasoning +
vision) to enable model-backed paths; every model output is schema-validated and grounded before use.

## Tests

```bash
cd backend && .venv/Scripts/python -m pytest -q          # original engineering suite + operations platform
cd frontend && npm test && npm run build                  # unit tests, type-check and production build
```

## Safety model (enforced in code)

- **The model never grants itself permission.** `ops/policy.py` maps every action to a tier: 0 informational,
  1 low-risk / read-only (autonomous, logged), 2 consequential (authorised human approval bound to a SHA-256 of
  the exact payload, with expiry), 3 sensitive (human-led; FIXCHAIN only gathers evidence and routes). Unknown
  actions are denied.
- **Evidence before claims.** A ticket is resolved only with a named verification source (connector re-check,
  telemetry + test announcement, post-fix replay, or an explicit human confirmation). "Accepted" ≠ "completed".
- **Facts vs hypotheses.** A root cause is `confirmed` only by reproduction + verified approved fix, or a
  verified mitigation.
- **Grounding.** An LLM-extracted amount or transaction reference is kept only if it literally appears in the
  customer's text. Customer text, logs and images are untrusted data, wrapped and never treated as instructions.
- **Privacy.** Phone numbers, emails, UPI IDs, Aadhaar-like numbers, card numbers and OTP/PIN values are masked
  before storage, model calls and display. Images are processed in memory and not stored.
- **Fraud** is always Tier 3, routed to humans immediately and never auto-closed.
- **Audit.** Hash-chained, append-only audit log (database triggers reject updates/deletes).
- **Simulation is labelled everywhere** and simulated tickets never correlate with live ones.

## Honest limits

- Mock connectors only; SLA values are configurable demo targets, not regulatory or network deadlines.
- Worker scaling is real but **in-process** (threads in one server). It is not cloud autoscaling.
- SQLite (WAL) is the store: right for a single-process demo; see `docs/DEPLOYMENT.md` for the Postgres path.
- Hindi and Marathi templates should be reviewed by native speakers before production use.
- Regulatory obligations (RBI, NPCI, CERT-In, DPDP) must be validated by compliance counsel; incident reports are
  drafts and are never filed automatically.

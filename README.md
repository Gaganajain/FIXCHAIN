# FIXCHAIN — Autonomous Payment Integration Reliability Engineer

FIXCHAIN detects, investigates, repairs and verifies payment-integration bugs in a **simulated**
merchant environment, then asks a human to approve the fix. No real money moves and nothing
connects to a real gateway.

## Architecture

```
 Simulator (checkout) ──► SimPay mock gateway ──HMAC-signed callback──► Merchant runtime
                                   ▲                                    (live payment_handler.py)
                     authoritative │                                          │ payment_events / app_logs
                       status API  │                                          ▼
                                   │                              Detection monitor (deterministic,
                                   │                              contract-based) ──► Incident
                                   │                                          │
                                   │                     Orchestrator (explicit state machine)
                                   │      ┌──────────────┬──────────────┬─────┴────────┬──────────────┐
                                   │   REPRODUCE     INVESTIGATE       REPAIR         VERIFY        APPROVAL
                                   │   (verifier)   (Claude / AST)  (Claude/contract) (locked pytest  (human)
                                   │                                  in sandbox +    suite, subprocess)
                                   │                                  policy gate)          │
                                   └──────── reconcile affected orders ◄── activate in simulated env
```

| Layer | Tech | Where |
|---|---|---|
| API + orchestration | FastAPI, SQLite, threads | `backend/app/` |
| Agents | Claude (`claude-opus-5-5`, JSON-schema structured outputs) or offline deterministic mode | `backend/app/agents/` |
| Independent verifier suite | pytest (22 tests: success/failed/pending, duplicates, signatures, unknown statuses, HTTP) | `backend/verifier_suite/` |
| Simulated merchant code | the file FIXCHAIN repairs | `backend/merchant_templates/` → live copy in `backend/workspace/merchant_active/` |
| Dashboard | React + TypeScript + Tailwind + Recharts (Vite) | `frontend/` |

**Agent modes.** With `ANTHROPIC_API_KEY` set, the investigator and repairer call Claude. Without one,
they run in a clearly labelled *offline deterministic* mode (AST analysis + a contract-based repair). In
both modes the detection and verification are deterministic and the results are real: patches are
real code, tests really run, and the UI shows which mode produced each result.

## Safety guarantees (enforced in code)

- Simulated gateway only; HMAC secret comes from env and is **never** sent to the LLM (logs are sanitised:
  signatures, keys, card-like numbers and emails are redacted).
- Logs and source are wrapped as `<untrusted_data>`; the model is told to treat them as data.
- The repair agent edits only allowlisted files (`payment_handler.py`) inside `workspace/sandboxes/run_N/`.
- Static policy gate: must compile, no imports beyond hashing/json, no `eval/exec/open/...`, no undefined names,
  public interface intact.
- Investigation quality gate: an LLM investigation is rejected if any field is a placeholder (e.g. `"..."`), it has
  no concrete evidence, or it names a function that cannot produce the observed order state. Rejected answers are
  retried once with the reasons; after that (or if the provider is down) the labelled offline AST analysis is used.
- "No code defect" path: if the current code passes every independent test for an incident, the run ends as
  `NOT_REPRODUCIBLE` (no patch). The incident resolves itself if orders already match the gateway, otherwise it is
  marked `needs_reconciliation`. Incidents are re-checked after every run and decision.
- Verifier suite lives outside every sandbox; its SHA-256 is pinned at startup and re-checked before each run.
  Tests run in a subprocess with secrets stripped from the environment; results are parsed from JUnit XML.
- Activation requires: patch status `verified`, a passing test record, unchanged live code, **and** human approval.
- Order states are only ever changed by the merchant handler processing signed gateway callbacks — never by AI.
- Every decision that changes the simulated live environment (approve, reject, rollback, reconcile, close) needs a
  reviewer name, entered in the top bar and sent as `X-Reviewer`, which is recorded in the audit trail. Set
  `FIXCHAIN_REVIEWER_TOKEN` to also require a token.
- External incidents (e.g. 3+ invalid callback signatures within 120 s) are classified as *not a merchant code defect*:
  no patch is generated, and a reviewer closes them after checking the gateway side.
- With `GATEWAY_WEBHOOK_SECRET` empty, a secret is generated once and kept in `workspace/.webhook_secret`.

## Setup (Windows, PowerShell or Git Bash)

```bash
cd fixchain/backend
python -m venv .venv
.venv/Scripts/python -m pip install -r requirements.txt
copy .env.example .env        # then edit .env (optional: add ANTHROPIC_API_KEY)
```

```bash
cd fixchain/frontend
npm install
```

### Configuring an LLM provider (Claude or Sarvam AI)
Put ONE key in `fixchain/backend/.env` (git-ignored) — never in source code:

```
# Claude
ANTHROPIC_API_KEY=sk-ant-...
# or Sarvam AI (https://dashboard.sarvam.ai)
SARVAM_API_KEY=sk_...
SARVAM_MODEL=sarvam-105b          # any model on Sarvam /v2/chat/completions
```

Restart the backend. The dashboard header shows the active provider, e.g. **Agents: Sarvam · sarvam-105b**.
If both keys are set, Claude is used unless `FIXCHAIN_LLM_PROVIDER=sarvam`.
Sarvam is called via its OpenAI-compatible `POST https://api.sarvam.ai/v2/chat/completions` with
`response_format: json_schema`; every reply is also validated locally against the schema (one retry on
malformed output) before an agent may use it.

## Run

Terminal 1 (API on :8000):
```bash
cd fixchain/backend
.venv/Scripts/python -m uvicorn app.main:app --port 8000
```

Terminal 2 (dashboard on :5173):
```bash
cd fixchain/frontend
npm run dev
```

Open http://localhost:5173. API docs: http://localhost:8000/docs

## Demo script (first milestone)

1. **Simulator** → *Run 20 random checkouts* (healthy baseline, no incidents).
2. *Inject PENDING→FAILED bug*.
3. Click **PENDING** (or run 20 more random checkouts) → order wrongly becomes `PAYMENT_FAILED`.
4. FIXCHAIN opens an incident and auto-starts the pipeline: reproduce → investigate → patch → verify.
5. *Settle pending payments* → customers who paid stay "failed" → a **critical** downstream incident appears.
6. **Incidents** → review root cause, side-by-side diff, original-vs-patched test matrix → **Approve & activate**.
7. **Reconcile** affected orders from the gateway's authoritative status. The critical downstream incident is
   diagnosed as "no code defect" (the fixed code handles SUCCESS correctly) and closes once its orders match.
8. **Code & history** → roll back to any version; incident memory flags the recurrence.
9. *Send forged callback* three times → an **external** incident appears (no repair pipeline); close it with a note.

## Tests

```bash
cd fixchain/backend
.venv/Scripts/python -m pytest -q
```

Runs the whole milestone end to end (offline mode, isolated temp data dir).
To run the verifier suite directly against any handler directory:

```bash
FIXCHAIN_TARGET_DIR=merchant_templates .venv/Scripts/python -m pytest verifier_suite -q
```

## Deploy (Render backend + Vercel dashboard)

The API needs a long-running process: background pipeline threads, a SQLite file and pytest subprocesses.
Serverless functions don't support those, so the backend runs on **Render** and the static dashboard on **Vercel**.
Vercel proxies `/api/*` to Render (`frontend/vercel.json`), so the browser only talks to one origin.

### 1. Backend on Render
1. Render dashboard → **New + → Blueprint** → connect this GitHub repo. Render reads `render.yaml`.
2. When prompted, enter `SARVAM_API_KEY` (or `ANTHROPIC_API_KEY`). Leave both empty to run the labelled offline agents.
3. Deploy, then open `https://<service>.onrender.com/api/status`. It should return `"environment": "SIMULATED"`.
4. Copy the generated **`FIXCHAIN_REVIEWER_TOKEN`** from the service's *Environment* tab. Reviewers paste it into the
   dashboard's top bar to approve, reject, roll back, reconcile or close.

Free-tier notes:
- The service sleeps when idle; the first request can take about 50 s, and the dashboard retries on its own.
- Its disk is temporary, so demo data resets on restart. Incident memory is kept only while the instance lives.
- `FIXCHAIN_MAX_LLM_RUNS_PER_HOUR` (default 20 in `render.yaml`) caps paid LLM runs. Extra runs use the offline agents
  and are labelled as such.

### 2. Dashboard on Vercel
1. Vercel → **Add New → Project** → import this repo → set **Root Directory** to `frontend`.
   Framework, build command and output come from `frontend/vercel.json`.
2. If your Render URL isn't `https://fixchain-api.onrender.com`, edit the `/api` rewrite in `frontend/vercel.json`
   and push.
3. Deploy, open the Vercel URL, enter a reviewer name and the token, and run the demo script.

# Agents

Agents are bounded workers. Each receives a typed task from the durable queue, may call only allow-listed
tools, and returns a result the orchestrator validates. No agent changes state on its own authority.

| Agent | Module | Input → output | May | Must not | On failure |
|---|---|---|---|---|---|
| Customer Understanding | `ops/understanding.py`, `pipeline.task_understand` | raw complaint → category, symptoms, facts (amount, UTR, time, device), locale, missing fields, ack + one follow-up question | multilingual extraction (lexicon; LLM with grounding), ask for missing info | invent transaction details, request secrets, promise refunds | LLM down → offline lexicon (labelled); task retry → dead-letter → escalate |
| Triage | `ops/taxonomy.py`, `task_triage` | ticket → rule-based severity + reason codes, priority, SLA due times, fingerprint, suggested playbook | compute severity from factors | let a model set severity | retry → escalate |
| Incident Intelligence | `ops/correlation.py`, `task_correlate` | ticket → link / new incident / review | explainable similarity, burst detection, severity recompute, re-investigation at 10/50/150 tickets | merge low-confidence matches silently, mix simulated and live data | serialised; retry |
| Investigation | `ops/incidents.py`, `task_investigate` | incident → facts, observations, hypotheses, summary, software-defect flag, incident-level actions | read connectors, engineering monitor, knowledge, memory | present a hypothesis as confirmed | narrative falls back to template |
| Resolution | `ops/pipeline.py` playbooks + `ops/actions.py` | ticket → playbook steps, proposed actions | run Tier 0/1 actions; propose Tier 2/3 | bypass policy, claim success without verification | timeout → retry; final → escalate with "cannot confirm" |
| Verification | `actions.verify` | executed action → verified / pending external / failed | authoritative re-checks | treat "accepted" as "completed" | ticket stays open / escalates |
| Customer Communication | `tickets.tell / broadcast`, `ops/i18n.py` | outcome → localized update (en/hi/mr) | pre-approved templates, one message per recipient in their language | improvise financial promises | - |
| Engineering Remediation | `incidents.task_engineering`, `sync_engineering`, `_post_fix` | suspected defect → engineering issue → existing pipeline → post-fix replay → close dependent tickets | reproduce in subprocess, drive simulated callbacks, follow the pipeline | deploy without approval, touch locked tests | reproduction passes → `no_defect`, hypothesis rejected |
| Learning & Knowledge | `ops/knowledge.py` | verified outcomes → findings, playbook proposals, autonomy-review proposals | propose | publish or change policy/prompts without a human | - |
| Operations Copilot | `incidents.brief / report` | incident → summary, severity rationale, next actions, draft report | summarise facts | make the human decision, file anything | template fallback |
| Orchestrator / Worker manager | `ops/workers.py`, `ops/runtime.py` | queue → workers, retries, recovery, scaling events, housekeeping tick | scale threads 1..12 | drop work silently | dead-letter + escalation hook |

## Playbooks (versioned, `playbooks` table)

`PAYMENT_STATUS_INVESTIGATION`, `SOUNDBOX_BASIC_DIAGNOSTIC`, `QR_CONFIG_CHECK`, `SETTLEMENT_STATUS`,
`PLATFORM_OUTAGE_RESPONSE`, `FRAUD_INTAKE`. Only the latest *approved* version runs. The Learning agent can
propose a new version (e.g. `restart_attempts: 2` when many remote restarts fail verification); an approver
publishes it from Knowledge & Learning.

## Model usage

LLMs are used for language (understanding, copilot narrative), never for permissions, severity or closure.
Simulated tickets always use the offline path (no LLM call per ticket). Provider, model, timeouts and fallbacks
are configuration (`backend/.env`).

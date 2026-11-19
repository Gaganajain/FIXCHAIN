# FIXCHAIN: audit report and completion tracker

**Audit date:** 19 Nov 2026 · **Auditor:** Claude Code · **Scope:** full read-through of `backend/` and `frontend/src/`, plus live runs.

**Files changed:** none in this project. Only this report was added. Live tests ran on a separate instance (port 8010, throwaway data directory) so they didn't touch the demo DB of the instance already running on :8000/:5173.

**Agent mode tested:** LLM via **Sarvam · sarvam-105b**, the key configured in `backend/.env`, plus offline deterministic mode in pytest.

**Not tested:**
- **Claude path:** `ANTHROPIC_API_KEY` is empty.
- **Mid-run crash recovery:** the code path was reviewed only.

---

## 1. Architecture: how a payment incident flows

```
Simulator (POST /api/checkout)
  └─► gateway.checkout()        creates order (PAYMENT_INITIATED) + gateway txn (authoritative status)
        └─► gateway.deliver()   HMAC-SHA256-signed callback, logged as payment_events.callback_delivered
              └─► merchant_runtime.process_callback()
                    ├─ loads the LIVE merchant file  workspace/merchant_active/payment_handler.py
                    ├─ handler.handle_callback(payload, sig, secret, SqliteOrderStore)
                    ├─ records payment_events.callback_result (before/after/reason/code_version) + app_logs
                    └─► detection.on_callback_result()            DETECTION AGENT (deterministic, no LLM)
                          compares order state with gateway_contract.json mapping
                          mismatch → incidents row (fingerprint, severity) + incident_orders
                          └─► orchestrator.maybe_autostart()      ORCHESTRATOR (state machine, 1 run at a time)
                                thread _execute(run):
                                 0. sandbox = workspace/sandboxes/run_N/{baseline,merchant} (copies of live file)
                                 1. REPRODUCING   verifier.reproduce() (subprocess replay) + run_suite(baseline)
                                 2. INVESTIGATING investigator.investigate() → LLM (Sarvam/Claude) or offline AST
                                                  output validated: approved file, function exists, line bounds,
                                                  cited order IDs cross-checked
                                 3. REPAIRING     repairer.propose() → search/replace edits on the allowlisted file
                                                  apply_edits() in the sandbox only → policy_check() (AST gate)
                                 4. VERIFYING     verifier.run_suite(): locked pytest suite (22 tests), SHA-256
                                                  pinned at startup, subprocess with secrets stripped, JUnit XML
                                    fail → feedback to repairer, up to MAX_REPAIR_ATTEMPTS (2)
                                 5. AWAITING_APPROVAL  nothing activated
HUMAN (Incidents view) ─► POST /api/patches/{id}/approve | reject
   approve: re-checks verified status, passing record, suite hash, unchanged live code
            → merchant_runtime.activate_code() (new code_versions row) → incident resolved → memory.remember()
   reconcile (POST /api/incidents/{id}/reconcile): gateway.query_status() + fresh signed callback through the
            patched handler; closes downstream incidents whose orders now match the gateway
Control room (React, Vite :5173, proxy → :8000): polls /status, /metrics, /incidents, /incidents/{id}, /logs
            every 1.2–2 s and renders run_steps (timestamped), investigation, diff, test matrix and approval.
```

**Stack:**
- **Backend:** FastAPI + SQLite (WAL) + background threads.
- **Frontend:** React 18 + TypeScript + Tailwind + Recharts (Vite).
- **LLM layer:** `agents/llm.py`, with Anthropic structured outputs or Sarvam `/v2/chat/completions` using a JSON schema, local schema validation and one retry.
- **Persistence:** 13 tables. `run_steps`, `patches`, `test_runs`, `code_versions` and `memory` form the audit trail.

**Safety:** the simulated gateway is the only gateway. Logs are sanitised before reaching the LLM (secrets, keys, 64-character hex strings, card-like digit runs and emails are redacted) and wrapped in `<untrusted_data>`. The repair agent can only edit the allowlisted file. The policy gate and the pinned verifier hash are both enforced. Activation requires a verified patch and a human approval.

---

## 2. Module audit (evidence from live runs)

### A. Payment simulator: ✅ verified
| Check | Result | Evidence |
|---|---|---|
| Initiate payment | ✅ | 15-checkout random batch: 8 SUCCESS / 5 FAILED / 2 PENDING, all mapped correctly |
| Reproduce PENDING→FAILED merchant bug | ✅ | after `inject`: PENDING checkout → `PAYMENT_FAILED` |
| Gateway vs merchant status kept separately | ✅ | `gateway_txns.status` vs `orders.status`; `/api/orders` joins both |
| Transaction logs | ✅ | `payment_events` (delivered/result/created) + `app_logs` |
| Safe replay | ⚠️ partial | duplicate replay → `duplicate`; forged → `invalid_signature` 401. Only the **last** callback can be replayed, not a chosen transaction |
| Isolated from real systems | ✅ | there is no outbound network code in the gateway or merchant code; the only network calls are LLM requests |

### B. Detection agent: ✅ verified
It compares the contract mapping with the observed order state on every callback. It opened `STATE_MISMATCH:PENDING->PAYMENT_FAILED` (high) and, after settlement, `SUCCESS->PAYMENT_FAILED` (critical). It ignores legitimate rejections (duplicate, bad signature) and auto-starts the orchestrator.

**Gap:** an incident detected while another run is active is logged as "queued", but nothing starts it later.

### C. Investigation agent: ⚠️ not reliable in LLM mode
| Check | Result |
|---|---|
| Reads real logs and source | ✅ sanitised events, logs, contract and line-numbered source are sent |
| Finds the faulty function | ⚠️ offline AST: ✅ every time. **Sarvam: wrong or empty in 2 of 3 pipeline runs** |
| Root cause with evidence | ❌ in live runs the evidence was the literal string `"..."` (see below) |
| Merchant defect vs external payment failure | ❌ not implemented. Every mismatch is assumed to be a merchant code defect |
| Structured handoff to repair | ✅ validated JSON is stored in `runs.investigation` |

**Live results for incident #1, same incident and same code:**
- **Run 1:** Sarvam returned `file: "..."`. Validation correctly rejected it and the **run FAILED** after 4 s.
- **Run 2:** returned `function: handle_callback` (wrong; the defect is in `map_gateway_status`), `root_cause: "..."`, `evidence: ["..."]`, confidence 0.95. This **passed validation** and was shown as fact.
- **Run 3:** right function and a real root cause, but `evidence: ["...", "..."]`.
- **Direct call, outside the pipeline:** a complete, correct answer.

So the provider output is unpredictable, and the grounding checks don't reject placeholder content.

### D. Repair agent: 🟡 works, but fragile
- **Real patches:** search/replace edits, written only to `workspace/sandboxes/run_N/merchant/payment_handler.py`.
- **Allowlist and path-escape checks** are in place.
- **Before/after code and diff** are stored in `patches` and shown in the UI.
- **Fragile:** the first LLM attempt failed independent tests in **both** live runs. One referenced an undefined `status_to_order_state` and left dead code (11/22 passed); the other passed 15/22. Each succeeded only on attempt 2 of 2, so there's no margin.
- **Final patches** were minimal and correct (`map_gateway_status` rebuilt; unknown statuses raise).

### E. Verification agent: ✅ verified
- **Independent locked suite:** 22 tests covering SUCCESS, FAILED, PENDING, pending→success/failed, case handling, duplicates, late failure after PAID, invalid and wrong-secret signatures, amount mismatch, unknown order, unknown statuses and retryability, and the HTTP layer.
- **Discriminates correctly:**
  - pristine handler: 22/22
  - injected bug: 10/22
  - wrong LLM patches: 11/22 and 15/22, rejected
- **Mutation check I ran:**

  | Mutant | Result |
  |---|---|
  | Signature check removed | 3 failures |
  | Idempotency removed | 1 failure |
  | Unknown status mapped to PENDING | 6 failures |
  | Final-state guard removed | 1 failure |
  | `import os` added | blocked by the policy gate |

- **Independent of the repair agent:** separate process, secrets stripped, suite hash pinned, results parsed from JUnit XML.
- **Risk:** patched code runs in a normal Python subprocess. There is no OS-level sandbox; the AST policy gate is the only containment.

### F. Human approval: ✅ verified (no identity)
- Approve activates the patch: new code version, incident resolved, memory written. A PENDING checkout then gives `PAYMENT_PENDING`.
- Reject leaves live code unchanged (version ID identical).
- Approving a rejected patch → 409. Approving twice → 409.
- An approval verified against an older suite version is blocked (pytest).
- Before approval, a new PENDING checkout still gives `PAYMENT_FAILED`.
- **Gaps:**
  - **No authentication:** any local caller can approve.
  - **No reviewer identity:** `decided_by` is always `"developer"`.

### G. Agent control room: 🟡 real data, missing pieces
| Check | Result |
|---|---|
| Real backend state | ✅ all views poll live APIs every 1.2–2 s; no mock data |
| Timestamped logs | ✅ |
| Errors shown | ✅ |
| Progress indicator | ✅ derived from `runs.state` |
| Per-agent status | ❌ only a single timeline. There's no status card per agent (detection, investigator, repairer, verifier, approval, memory) |
| Handoffs | ⚠️ implicit (state lines). No explicit "Investigator → Repairer" handoff event with payload |
| Real-time | ⚠️ polling, not push. Acceptable for an MVP |
| Accurate health | ❌ "Integration health" is calculated over the last 30 callbacks, including ones before the fix. It shows **84% / Critical** after a successful repair with 0 open incidents |
| Downstream incident | ❌ shows a red FAILED run after a successful fix (see the critical bug below) |

**Limitation:** I inspected the UI read-only on the existing :5173 instance, so I didn't click through a full run in the browser myself.

### H. Incident memory: 🟡 partial
- **Stored on approval:** ✅ (memory #1: `map_gateway_status`).
- **Recurrences linked:** ✅ via `similar_memory_id` (pytest rollback test). The hint goes to the investigator.
- **Never blindly reused:** ✅ every run regenerates and re-verifies the patch.
- **Doesn't compare root causes:** the fallback matches by **rule only**, so any `STATE_MISMATCH` (e.g. SUCCESS→FAILED) gets the PENDING defect as a "recurring defect" hint.

### I. Backend and infrastructure: ✅ mostly
- **APIs:** all exercised endpoints return the expected codes. Errors map to 404/409.
- **Persistence:** SQLite stores incidents, runs, steps, patches, tests, versions and memory.
- **Restart:** after a restart, the patched code version, incident states and memory persist, and a PENDING checkout → `PAYMENT_PENDING`.
- **Secrets:** env only, and stripped from the verifier subprocess.
- **Gaps:**
  - `GATEWAY_WEBHOOK_SECRET` is empty in `.env`, so a random secret is generated on every start.
  - API has no auth (CORS is restricted to localhost).
  - Queued incidents are never resumed.

---

## 3. Progress tracker

> **Updated 19 Nov 2026, after the P1 session.** Sections 6 and 7 describe the changes. The original audit numbers are kept below for comparison (76% at audit, 85% after the P0 fixes).

| Module | Status | Completion % | Evidence (after P1) | Remaining work |
|---|---|---:|---|---|
| Payment Simulator | COMPLETED AND VERIFIED | 90 | batch / PENDING / settle / duplicate / forged, in the UI and the API | replay a chosen transaction (P2) |
| Detection Agent | COMPLETED AND VERIFIED | 98 | state mismatches + new external rule (≥3 invalid signatures in 120 s); a single bad signature is not an incident | — |
| Investigation Agent | COMPLETED AND VERIFIED | 92 | quality gate + fallback (5/5 live). Classification: `merchant_code_defect`, `no_code_defect`, `external` | richer external causes, e.g. gateway outage (P2) |
| Repair Agent | COMPLETED AND VERIFIED | 88 | 5/5 live verified on attempt 1; undefined-name gate; outage fallback | — |
| Verification Agent | COMPLETED AND VERIFIED | 95 | 22-test locked suite, mutants, wrong LLM patches rejected | OS-level isolation (P2) |
| Human Approval | COMPLETED AND VERIFIED | 95 | in the browser: approval without a name is blocked (401 message shown); with a name it's approved and `decided_by` + note are recorded. Optional token tested in pytest | SSO / real identity provider (P2) |
| Agent Control Room | COMPLETED AND VERIFIED | 90 | per-agent status cards derived from `run_steps`; explicit handoff events in the timeline; health scoped to the current code (100% after the fix, in the browser); external and no-defect panels | push updates instead of 1–2 s polling (P2) |
| Incident Memory | COMPLETED AND VERIFIED | 85 | exact-defect matching only (SUCCESS→FAILED gets no PENDING hint); explicit root-cause comparison step; fix always re-verified | similarity beyond exact fingerprint (P2) |
| Backend Integration | COMPLETED AND VERIFIED | 90 | schema migrations ran on the existing DB; webhook secret persists in the data directory; reviewer auth on every state-changing decision | auth on read endpoints and simulator controls (P2) |
| End-to-End Testing | COMPLETED AND VERIFIED | 90 | pytest 35/35; 5/5 live Sarvam API journeys; 1 full browser-driven journey (Sarvam) incl. approve, reconcile, external incident | Claude path (no key) |

**Weighted overall completion: 92%**: 7.2 + 9.8 + 12.9 + 12.3 + 13.3 + 9.5 + 6.3 + 4.3 + 7.2 + 9.0 (same weights as before).

**Summary:**
- **Completed and verified:** 10 of 10 modules (remaining items are P2).
- **Blockers:** 0.
- **Failing automated tests:** 0.
- **Live end-to-end failures:** 0.

**MVP definition of done (section 8 of the brief):** every item met and tested.

| Item | Status |
|---|---|
| Simulated payment | ✅ |
| Reproducible merchant-side bug | ✅ |
| Detection | ✅ |
| Root cause with evidence | ✅ (quality-gated) |
| Real patch | ✅ |
| Independent verification | ✅ |
| Approve/reject with identity | ✅ |
| Approved patch applied in the isolated demo environment | ✅ |
| Same flow passes after repair | ✅ (`PAYMENT_PENDING`) |
| Control room shows real events | ✅ |
| Incident history and audit logs stored | ✅ |
| No real money | ✅ |
| No production systems | ✅ (no outbound calls except the configured LLM provider) |

#### Original audit tracker (before the fixes)

| Module | Status | Completion % | Evidence | Remaining work |
|---|---|---:|---|---|
| Payment Simulator | COMPLETED AND VERIFIED | 90 | batch/PENDING/settle/replay/forged runs | replay a chosen transaction |
| Detection Agent | COMPLETED AND VERIFIED | 90 | both incidents detected with correct severity | start queued incidents when a run ends |
| Investigation Agent | IN PROGRESS | 55 | offline ✅. Sarvam: 1 failure, 2 placeholder outputs in 3 runs | placeholder/grounding gate, retry, offline fallback, external-vs-merchant classification |
| Repair Agent | TESTING | 75 | real sandboxed patches; verified on the last attempt in 2/2 runs | more reliable first attempts, 3rd attempt, better prompt |
| Verification Agent | COMPLETED AND VERIFIED | 95 | 22-test suite + 4 mutants + 2 wrong LLM patches rejected | OS-level isolation (P2) |
| Human Approval | COMPLETED AND VERIFIED | 85 | approve/reject/double/stale all behave | reviewer identity + auth |
| Agent Control Room | TESTING | 60 | live polling, timeline, diff, matrix | per-agent status, explicit handoffs, post-fix health, downstream incident display |
| Incident Memory | IN PROGRESS | 60 | stored, linked, re-verified | compare root cause/function before hinting |
| Backend Integration | COMPLETED AND VERIFIED | 80 | APIs, persistence, restart | auth, persistent webhook secret, queue resume |
| End-to-End Testing | IN PROGRESS | 65 | pytest 16/16 (offline); live run passes end to end after retries | stable live runs; downstream incident must close |

**Weighted overall completion: 76%.** Weights favour the critical repair path:

| Module | Weight |
|---|---:|
| Simulator | 8 |
| Detection | 10 |
| Investigation | 14 |
| Repair | 14 |
| Verification | 14 |
| Approval | 10 |
| Control room | 7 |
| Memory | 5 |
| Backend | 8 |
| End-to-end | 10 |

Overall = Σ(weight × completion) / 100 = (7.2 + 9.0 + 7.7 + 10.5 + 13.3 + 8.5 + 4.2 + 3.0 + 6.4 + 6.5) = **76.3%**.

**Summary:**
- **Completed and verified:** 5 of 10 modules.
- **Incomplete:** 5.
- **Blockers:** 0. The Claude path is untested but not blocking, since Sarvam works.
- **Automated tests:**
  - backend pytest: 16/16 pass
  - verifier suite vs pristine handler: 22/22 pass
  - frontend `tsc --noEmit`: clean
- **Failures in the live end-to-end run** (each is listed in section 4):
  1. One pipeline run failed outright: Sarvam returned `file: "..."`.
  2. One placeholder investigation passed validation.
  3. One downstream incident was left open after a successful fix.

---

## 4. Gaps by priority

**P0 (must fix before the demo)**
1. **Placeholder LLM investigations are accepted.** `"..."` root cause and evidence, or the wrong function, get through. All 3 live pipeline runs were affected; 1 failed outright.
2. **The downstream critical incident never closes.** After settle + approve + reconcile, every order matches the gateway, but incident #2 stays `open` with a red FAILED run ("could not reproduce"). Cause: `_close_downstream_incidents()` exits early while a run is active, and nothing re-checks once that run finishes.
3. **No retry margin on repair.** The LLM's first patch failed in 2 of 2 runs, so with `MAX_REPAIR_ATTEMPTS=2` a single bad second attempt fails the demo.

**P1 (needed for a reliable MVP)**
4. Control room: per-agent status cards, explicit handoff events, and a health score calculated since the active code version.
5. Approval identity: reviewer name/token, recorded in `decided_by`, with auth on decision endpoints.
6. Memory: match on fingerprint and function. Label rule-only matches as weak, or drop them.
7. Queued incidents: start the next open incident when a run ends, or close it if reconciliation already fixed it.
8. Persist the webhook secret: generate it once into the data directory, or warn when it's empty.
9. Investigator: classify merchant defect vs external/gateway failure. For example, gateway-side FAILED with a correct mapping should be "no code defect".

**P2 (later)**
10. OS-level sandbox for running patched code (separate user or container).
11. Server-sent events instead of polling.
12. Replay a chosen transaction.
13. Run the Claude path with a key and add an LLM-mode regression test using recorded fixtures.

**Demo-breaking risks:** P0 items 1–3. The Sarvam variance is outside our control; a fallback is needed.

---

## 5. Completion roadmap (in order)

| # | Task | Why | Files | Expected output | How to test | Definition of done | Priority |
|---|---|---|---|---|---|---|---|
| 1 | Investigation quality gate + retry + offline fallback | LLM placeholders reach the reviewer or fail runs | `agents/investigator.py`, `orchestrator.py`, `tests/` | Rejects `...`/empty/very short root cause and evidence, and a function that doesn't contain the mismatching return; retries the LLM once with the reason; then falls back to offline AST analysis, labelled as such | Unit test with a fake LLM returning `"..."` → retried → fallback; 5 live Sarvam runs | 0 placeholder investigations stored; 5/5 live runs reach AWAITING_APPROVAL | P0 |
| 2 | Close downstream incidents after runs and handle "already fixed" | Red FAILED incident after a successful repair | `orchestrator.py` | When a run ends (any state), re-check open incidents against observed orders. "Not reproducible after fix" marks the incident as fixed-by-version, not failed | Pytest: inject → PENDING → approve → settle → reconcile → every incident resolved | No open incident when all orders match the gateway | P0 |
| 3 | Repair reliability | No margin | `.env.example`, `config.py`, `agents/repairer.py` | 3 attempts by default; prompt pinned to the investigated function and contract mapping; verifier feedback includes assertion text | 5 live runs | ≥4/5 verified on attempt ≤2 and 5/5 within 3 | P0 |
| 4 | Control room per-agent status + handoffs + post-fix health | Requested visibility; misleading "Critical" | `orchestrator.py` (`step()` handoff events), `main.py` (`/metrics` since active version), `frontend/src/views/Incidents.tsx`, `Overview.tsx` | Agent cards (idle/running/done/failed + last output), handoff arrows, health 100% after a verified fix | Drive a full run in the browser; screenshot | Every agent state matches `run_steps`; health correct after fix | P1 |
| 5 | Reviewer identity + auth on decisions | Approval audit trail | `main.py`, `orchestrator.py`, `frontend` | `X-Reviewer` header/token; 401 without it; name stored | Pytest | Unapproved or unauthenticated decision impossible | P1 |
| 6 | Memory matching on root cause | Wrong recurrence hints | `memory.py`, `detection.py` | Match on fingerprint, then fingerprint family + function; show the comparison step | Pytest with a different-rule incident | No hint for unrelated defects | P1 |
| 7 | Resume queued incidents | Incidents silently waiting | `orchestrator.py` | Next open, unresolved incident starts when a run finishes | Pytest | No orphan "queued" incidents | P1 |
| 8 | Persistent webhook secret | Signatures break across restarts | `config.py` | Secret stored in the data directory when the env value is empty | Restart test | Same secret after restart | P1 |

I'll implement tasks 1–3 first. All three are inside the existing architecture, with no architectural change.

---

## 6. Session log: P0 fixes (19 Nov 2026)

| # | Issue | Fix | Files | Tests | Result |
|---|---|---|---|---|---|
| 1 | Placeholder or ungrounded LLM investigations were accepted | `quality_check()` rejects placeholder fields, missing evidence, and a function that cannot produce the observed state. One retry with the reasons is sent to the LLM, then the labelled offline AST fallback is used. An LLM outage also falls back. The prompt now forbids placeholders | `agents/investigator.py`, `orchestrator.py` | 4 new unit tests + live | ✅ 0 placeholders in 5 live runs; 1 run correctly fell back |
| 2 | Downstream critical incident stayed open with a FAILED run | New `NOT_REPRODUCIBLE` outcome ("no code defect", no patch). The incident resolves if its orders match, otherwise it becomes `needs_reconciliation` and can be reconciled directly. `after_run()` re-checks incidents and starts queued ones after every run and decision | `orchestrator.py`, `frontend/src/views/Incidents.tsx`, `frontend/src/ui.tsx` | 3 new tests + live + browser | ✅ 5/5 journeys end with every incident resolved |
| 3 | No repair margin | 3 attempts (`config.py`, `.env`, `.env.example`). The prompt is scoped to the validated function and contract mapping. The policy gate blocks undefined names. Provider outage → labelled offline repair | `agents/repairer.py`, `orchestrator.py`, `config.py` | 3 new tests + live | ✅ 5/5 verified on attempt 1 |

**Also changed:**
- `frontend/vite.config.ts`: the proxy target and port can be overridden with `FIXCHAIN_API` / `FIXCHAIN_WEB_PORT`. Defaults are unchanged.
- README: describes the safety gates and the "no code defect" path.

**Not verified live:** the repair-outage fallback (covered by pytest only; the live server was started before that change) and the Claude path (no key).

**Next three actions (P1):**
1. Control room: per-agent status cards and explicit handoff events. Calculate the health score since the active code version. Show "not needed" instead of "No investigation result" for no-defect runs.
2. Memory: match on fingerprint and function, and stop showing the PENDING defect as a hint on SUCCESS→FAILED incidents.
3. Approval: reviewer identity and token on decision endpoints.


---

## 7. Session log: P1 (19 Nov 2026)

| Item | Change | Files | Verified by |
|---|---|---|---|
| Control room | Agent cards (status from `run_steps`: running / handed off / failed / retrying / waiting for you / not needed); `handoff` events with from→to; detection and policy now emit their own events; health score calculated over callbacks handled by the current code version (excluding correct `ignored_final_state` refusals) | `orchestrator.py`, `main.py` (`/metrics`), `frontend/src/views/Incidents.tsx`, `Overview.tsx`, `api.ts` | pytest + browser |
| Reviewer identity | `X-Reviewer` required on approve / reject / rollback / reconcile / close. Optional `FIXCHAIN_REVIEWER_TOKEN` → `X-Reviewer-Token`. Name recorded in `decided_by`, rollback notes, reconciliation logs and run steps. Reviewer field in the top bar | `main.py`, `orchestrator.py`, `frontend/src/App.tsx`, `api.ts` | pytest + browser |
| Memory | Exact-fingerprint matching only; `memory.compare()` step reports same or different root cause; the old patch is never reapplied | `memory.py`, `orchestrator.py` | pytest |
| Webhook secret | Generated once into `workspace/.webhook_secret` (git-ignored) when env is empty | `config.py` | pytest + restart |
| Merchant vs external | `incidents.category` and `runs.classification` (with migrations). Invalid-signature bursts become an external incident, never sent to repair, closed by a reviewer with a note; its impact shows ₹0 at risk because no order changed | `db.py`, `detection.py`, `orchestrator.py`, `main.py`, `Incidents.tsx` | pytest + browser |

**Bugs found and fixed during this session:**
- `db.log` was called inside an open transaction in the new detection rule, which caused a SQLite "database is locked" error. The log call now runs after commit.
- The external incident's impact showed revenue at risk for an order it never touched. It now shows ₹0, with an explanatory label.

**Tests:** backend 35/35 (16 original + 10 P0 + 9 P1), verifier suite 22/22, frontend `tsc` clean.

**Remaining work (P2):**
1. Push updates (SSE) instead of polling.
2. OS-level sandbox for running patched code.
3. Replay a chosen transaction.
4. Auth on read endpoints and simulator controls.
5. Run the Claude path with a key and add recorded-fixture LLM regression tests.

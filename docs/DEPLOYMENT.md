# Deployment, configuration and troubleshooting

## Environment variables (`backend/.env`, see `.env.example`)

| Variable | Default | Meaning |
|---|---|---|
| `ANTHROPIC_API_KEY` / `SARVAM_API_KEY` | empty | Optional model providers. Empty → labelled offline mode. |
| `FIXCHAIN_LLM_PROVIDER` / `FIXCHAIN_AGENT_MODE` | auto | Provider choice; force `offline` for a fully deterministic demo. |
| `FIXCHAIN_DEMO_MODE` | true | Demo users + password-less demo sign-in. **Set false** for anything shared. |
| `FIXCHAIN_ADMIN_PASSWORD` | empty | Password for `admin` (required when demo mode is off). |
| `FIXCHAIN_SESSION_TTL` | 43200 | Session lifetime (s). |
| `FIXCHAIN_MIN_WORKERS` / `MAX_WORKERS` / `TASKS_PER_WORKER` | 1 / 12 / 15 | In-process worker pool sizing. |
| `SARVAM_STT_MODEL` / `SARVAM_TTS_MODEL` / `SARVAM_TTS_SPEAKER_*` / `FIXCHAIN_VOICE` | saarika:v2.5 / bulbul:v2 / … / auto | Voice; verify names against Sarvam's current catalogue. |
| `FIXCHAIN_VISION` | auto | `offline` forces the colour heuristic even with an Anthropic key. |
| `FIXCHAIN_REVIEWER_TOKEN`, `GATEWAY_WEBHOOK_SECRET`, `FIXCHAIN_MAX_LLM_RUNS_PER_HOUR`, `FIXCHAIN_CORS_ORIGINS` | - | Original engineering-pipeline settings (unchanged). |
| `FIXCHAIN_DATA_DIR` | `backend/workspace` | SQLite file, sandboxes, webhook secret. |

Secrets live only in environment variables; nothing is sent to the browser except the session token.

## Render (API) + Vercel (dashboard)

The API needs one long-running process (worker threads, SSE, SQLite, pytest subprocesses for the engineering
verifier), so it runs on **Render** (`render.yaml`, `--workers 1`). The dashboard is static on **Vercel**
(`frontend/vercel.json` rewrites `/api/*` to Render, so the browser talks to one origin).

1. Render → New → Blueprint → this repo. Set `SARVAM_API_KEY` / `ANTHROPIC_API_KEY` if wanted. For a public URL
   set `FIXCHAIN_DEMO_MODE=false` and `FIXCHAIN_ADMIN_PASSWORD`.
2. Vercel → import repo → root `frontend`. Edit the rewrite target in `vercel.json` if your Render URL differs.

**Limitations to state openly:** Render's free disk is temporary - data resets on redeploy/restart of the
instance; the free instance sleeps when idle (first request ~50 s). If a proxy buffers Server-Sent Events, the
dashboard automatically falls back to polling the same persisted event log.

## Production path (not implemented in the MVP)

- Postgres instead of SQLite (swap `db.py`; `json_extract/json_set` → `->>`/`jsonb_set`); managed queue
  (e.g. Redis + workers) instead of in-process threads; multiple API replicas behind a load balancer.
- Real identity provider (SSO/OIDC) and tenant isolation; dual approval for high-value actions.
- Real connectors with signed requests, idempotency and reconciliation; per-data-class retention; DR.
- Model evaluation, prompt/version governance and native-speaker review of Hindi/Marathi copy.

## Troubleshooting

| Symptom | Cause / fix |
|---|---|
| Dashboard shows "Sign in required" after a restart | Sessions are stored in the DB; a new data dir means new sessions - sign in again. |
| "Reconnecting…" in the live feed | The client retries SSE automatically and falls back to polling after 6 s. Check the API is reachable at `/api/v1/system`. |
| Simulation start returns 409 | A feed is already running, or (reset) an engineering run is mid-pipeline - wait until it awaits approval. |
| Engineering issue stays `reproducing` | The pipeline runs pytest in a subprocess; first runs take ~10-20 s. Check `/api/incidents` in the classic console. |
| Voice button missing | No Sarvam key and the browser has no speech recognition - type instead (by design). |
| `database is locked` | Only one API process may use the SQLite file (`--workers 1`). |
| Hindi/Marathi shows boxes | Install a Devanagari-capable font (e.g. Noto Sans Devanagari). |

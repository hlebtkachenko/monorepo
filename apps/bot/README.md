# @workspace/bot

Afframe's Telegram bot — the **single choke point for all Telegram I/O**. grammY on a
Cloudflare Worker. Separate failure domain from AWS: if `api` dies, the bot still runs
and can tell you so.

Nothing else holds the bot token or formats Telegram messages. Senders call
`@workspace/notify`, which POSTs the typed `IngestPayload` to `/ingest`.

## Endpoints

| Route             | Dir      | Auth                                                | Purpose                                                 |
| ----------------- | -------- | --------------------------------------------------- | ------------------------------------------------------- |
| `GET /health`     | —        | none                                                | liveness (watchdog + OpenStatus)                        |
| `POST /ingest`    | outbound | `Authorization: Bearer <INGEST_SECRET>`             | app/CI/AWS/agent → Telegram (+ optional buttons)        |
| `POST /issue`     | outbound | `Authorization: Bearer <INGEST_SECRET>`             | event → deduped Linear issue + echo (Open/Rerun/Snooze) |
| `POST /ask`       | outbound | `Authorization: Bearer <INGEST_SECRET>`             | agent HITL question → returns `{id}` to poll            |
| `GET /answer/:id` | —        | `Authorization: Bearer <INGEST_SECRET>`             | poll a HITL decision (`decision` null until tapped)     |
| `POST /beat`      | outbound | `Authorization: Bearer <INGEST_SECRET>`             | dead-man heartbeat: `{ "job": "dast" }`                 |
| `POST /sns`       | inbound  | `?token=<INGEST_SECRET>`                            | AWS SNS → Telegram + auto-issue                         |
| `POST /webhook`   | inbound  | `X-Telegram-Bot-Api-Secret-Token: <WEBHOOK_SECRET>` | your commands + button taps                             |

## Inbound commands (allowlisted to your Telegram user id)

- **Reads:** `/status` `/scan` `/ci` `/deploys` `/pr` `/errors` `/logs <runId>` `/help`
- **Writes (confirm-gated):** `/deploy <staging|production>` · `/rollback <env> <image-tag>` ·
  `/deploybot` · `/dast`. Each persists a pending dispatch in D1, asks for a ✅ Confirm tap,
  then fires a GitHub `workflow_dispatch` (claimed once — a double-tap can't double-fire).
  The bot never execs on a server.
- **Issue:** `/issue <title>` — open a Linear incident from the phone.

Button taps route through `callbacks.ts`: confirm/cancel dispatch, answer a HITL question,
snooze/ack an incident (keyed by the short Linear identifier), rerun a failed CI run.

## Control plane (PR-2)

Write commands + the CI **Rerun** button + read commands need a Worker secret
`GITHUB_DISPATCH_TOKEN` (repo secret **`BOT_GH_DISPATCH_TOKEN`** — GitHub forbids the
`GITHUB_` prefix). Unset → the bot stays read-only. `notify-ci.yml` watches key workflows
via `workflow_run` and opens a deduped incident on a `main` failure. `nuclei-dast.yml` posts
`/beat job=dast` so the dead-man's-switch can detect a missed nightly. The 06:00 scan doubles
as a daily briefing (health + open incidents + heartbeat freshness).

## Secrets

Local: `apps/bot/.dev.vars` (gitignored, chmod 600) — `BOT_TOKEN`, `TELEGRAM_USER_ID`,
`WEBHOOK_SECRET`, `INGEST_SECRET`, `LINEAR_API_TOKEN`, `LINEAR_TEAM_ID`,
`GITHUB_DISPATCH_TOKEN`. Prod: `wrangler secret put` each (done by `deploy-bot.yml`).

## Run locally

```
pnpm --filter @workspace/bot dev        # wrangler dev on http://localhost:8787
```

Send yourself a message (what a caller does):

```
curl -X POST http://localhost:8787/ingest \
  -H "Authorization: Bearer $INGEST_SECRET" \
  -H "content-type: application/json" \
  -d '{"text":"deploy staging?","level":"warn","source":"agent","buttons":["Yes","No"]}'
```

Agent human-in-the-loop round-trip:

```
curl -X POST http://localhost:8787/ask \
  -H "Authorization: Bearer $INGEST_SECRET" -H "content-type: application/json" \
  -d '{"question":"Merge PR #42?","summary":"3 files, all tests green","options":["Approve","Reject"]}'
# -> {"id":"...","exp":...}; then poll:
curl -H "Authorization: Bearer $INGEST_SECRET" http://localhost:8787/answer/<id>
```

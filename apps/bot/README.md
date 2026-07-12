# @workspace/bot

Afframe's Telegram bot — the **single choke point for all Telegram I/O**. grammY on a
Cloudflare Worker. Separate failure domain from AWS: if `api` dies, the bot still runs
and can tell you so.

Nothing else holds the bot token or formats Telegram messages. Senders call
`@workspace/notify`, which POSTs the typed `IngestPayload` to `/ingest`.

## Endpoints

| Route             | Dir      | Auth                                                | Purpose                                             |
| ----------------- | -------- | --------------------------------------------------- | --------------------------------------------------- |
| `GET /health`     | —        | none                                                | liveness (watchdog + OpenStatus)                    |
| `POST /ingest`    | outbound | `Authorization: Bearer <INGEST_SECRET>`             | app/CI/AWS/agent → Telegram (+ optional buttons)    |
| `POST /issue`     | outbound | `Authorization: Bearer <INGEST_SECRET>`             | explicit event → deduped GitHub issue + echo        |
| `POST /ask`       | outbound | `Authorization: Bearer <INGEST_SECRET>`             | agent HITL question → returns `{id}` to poll        |
| `GET /answer/:id` | —        | `Authorization: Bearer <INGEST_SECRET>`             | poll a HITL decision (`decision` null until tapped) |
| `POST /beat`      | outbound | `Authorization: Bearer <INGEST_SECRET>`             | dead-man heartbeat: `{ "job": "dast" }`             |
| `POST /sns`       | inbound  | `?token=<INGEST_SECRET>`                            | AWS SNS → Telegram + auto-issue                     |
| `POST /webhook`   | inbound  | `X-Telegram-Bot-Api-Secret-Token: <WEBHOOK_SECRET>` | your commands + button taps                         |

## Inbound commands (allowlisted to your Telegram user id)

- **Reads:** `/status` `/scan` `/ci` `/deploys` `/pr` `/errors` `/logs <runId>` `/help`
- **Writes (confirm-gated):** `/deploy <staging|production>` · `/rollback <env> <image-tag>` ·
  `/deploybot` · `/dast`. Each persists a pending dispatch in D1, asks for a ✅ Confirm tap,
  then fires a GitHub `workflow_dispatch` (claimed once — a double-tap can't double-fire).
  The bot never execs on a server.
- **Issue:** `/issue <title>` — open a GitHub issue from the phone.

Button taps route through `callbacks.ts`: confirm/cancel dispatch, answer a HITL question,
snooze/ack an incident (keyed by the GitHub issue identifier), rerun a failed CI run.

Bot-created issues are plain GitHub issues by default. Optional Worker config can
attach them to a ProjectV2 (`GITHUB_PROJECT_ID` +
`GITHUB_PROJECT_FIELD_CONFIG`) and/or a parent Epic (`GITHUB_EPIC_ISSUE_NUMBER`).
Scheduled scans and heartbeat checks do not create issues; they only report the
current state in Telegram.

## Control plane (PR-2)

Write commands + the CI **Rerun** button + read commands need a Worker secret
`GITHUB_DISPATCH_TOKEN` (repo secret **`BOT_GH_DISPATCH_TOKEN`** — GitHub forbids the
`GITHUB_` prefix). Unset → the bot stays read-only. `notify-ci.yml` watches key workflows
via `workflow_run` and can open an explicit issue for a `main` failure. `nuclei-dast.yml`
posts `/beat job=dast` so the dead-man's-switch can report a missed nightly in Telegram.
The 06:00 scan doubles as a daily briefing (health + heartbeat freshness).

## Secrets

Local: `apps/bot/.dev.vars` (gitignored, chmod 600) — `BOT_TOKEN`, `TELEGRAM_USER_ID`,
`WEBHOOK_SECRET`, `INGEST_SECRET`, `GITHUB_DISPATCH_TOKEN`. Copy
`apps/bot/.dev.vars.example` as a starting template. Prod: `wrangler secret put`
each (done by `deploy-bot.yml`).

### Obtain / rotate INGEST_SECRET

`INGEST_SECRET` is the same shared bearer as the app's `NOTIFY_SHARED_SECRET`
(see `docs/ENVIRONMENT-VARIABLES.md`). It is not bot-specific — do not generate a new value
for the bot alone.

- **Local dev**: run `scripts/bot-dev-vars.sh` from the repo root. It fetches
  the current value from AWS SSM (`AWS_PROFILE=hleb`, `eu-central-1`) by
  default, or `--source vault` to read Vault directly, and writes/updates the
  `INGEST_SECRET=` line in `apps/bot/.dev.vars` — it never prints the value.
- **Rotation**:
  1. Generate the new value and write it to Vault:
     `vault kv put platform/<env>/notify-shared-secret value=<new-value>`.
  2. Wait up to 5 minutes for the Vault → SSM sync timer to pick it up.
  3. Update the GitHub repo secret **`INGEST_SECRET`** to the same value.
  4. Re-run `deploy-bot.yml` (or push a change to `apps/bot/`) so the Worker
     picks up the new value via `wrangler secret put`.

  The app side (`NOTIFY_SHARED_SECRET` on ECS) picks up the SSM change on its
  own rollover cadence — see `docs/runbooks/VAULT-OPS.md` for the full
  write/rotate procedure.

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

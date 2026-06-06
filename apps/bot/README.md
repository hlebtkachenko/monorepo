# @workspace/bot

Afframe's Telegram bot — the **single choke point for all Telegram I/O**. grammY on a
Cloudflare Worker. Separate failure domain from AWS: if `api` dies, the bot still runs
and can tell you so.

Nothing else holds the bot token or formats Telegram messages. Senders call
`@workspace/notify`, which POSTs the typed `IngestPayload` to `/ingest`.

## Endpoints

| Route           | Dir      | Auth                                                | Purpose                                          |
| --------------- | -------- | --------------------------------------------------- | ------------------------------------------------ |
| `GET /health`   | —        | none                                                | liveness (for OpenStatus to watch the watcher)   |
| `POST /ingest`  | outbound | `Authorization: Bearer <INGEST_SECRET>`             | app/CI/AWS/agent → Telegram (+ optional buttons) |
| `POST /webhook` | inbound  | `X-Telegram-Bot-Api-Secret-Token: <WEBHOOK_SECRET>` | your commands + button taps                      |

## Inbound commands (allowlisted to your Telegram user id)

- Reads: `/ping` `/version` `/status`
- Gated writes: `/deploy` `/rollback` `/restart` `/migrate` — **stubbed in this experiment**
  (in prod they trigger a GitHub `workflow_dispatch` behind a confirm button; the bot never
  execs on a server).

## Secrets

Local: `apps/bot/.dev.vars` (gitignored, chmod 600) — `BOT_TOKEN`, `TELEGRAM_USER_ID`,
`WEBHOOK_SECRET`, `INGEST_SECRET`. Prod: `wrangler secret put` each.

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

## Not done here (local experiment scope)

No deploy, no public webhook registration, no real `workflow_dispatch` wiring, no AWS SNS /
error-tracker fan-in. Those are later phases; this proves outbound + inbound locally.

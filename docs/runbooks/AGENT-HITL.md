# Agent ⇄ Operator (Telegram human-in-the-loop)

When an agent (Claude Code / Codex / Cursor) or a long-running task needs Hleb's
decision, it asks through the dev bot and **blocks until he answers from his phone** —
by tapping an option or replying with text. This is DEV-55.

## TL;DR for agents

Before a risky / irreversible / ambiguous step (merge, destructive migration, "which
of these?", "ok to proceed?"), don't guess and don't silently stop — **ask**. Three modes:

```bash
# 1) Choose among options — Hleb can ALSO type his own (a ✍️ Other button is added by default):
pnpm exec tsx apps/bot/scripts/ask.ts "Which DB?" --options "Postgres,MySQL,SQLite" --asker "$AGENT"

# 2) Yes/no-ish clarification — Accept / Decline + ✍️ Other (labels: --accept "Ship it" --reject "Hold"):
pnpm exec tsx apps/bot/scripts/ask.ts "Proceed with the refactor?" --confirm --asker "$AGENT"

# 3) Free-form text only:
pnpm exec tsx apps/bot/scripts/ask.ts "Any constraints before I start?" --text --asker "$AGENT"
```

`ask.ts` blocks, prints the answer (the chosen option OR his typed text) to stdout, and
exits `0` when resolved (a reply OR an applied `--on-timeout`) or `2` if it expired with
no answer. `--summary "context"` adds detail; `--on-timeout Reject` makes the result
definitive even if he never replies; `--ttl <seconds>` changes the 1h window;
`--no-custom` drops the ✍️ Other button for a strict pick.

**Default = the user-question shape**: options as buttons **plus** a "type your own"
button — so you rarely pick a mode. Use `--confirm` for yes/no, `--text` for pure free-form.

## How it works

1. The agent POSTs to the bot's `/ask` (Bearer `INGEST_SECRET`) — or calls
   `@workspace/notify`'s `ask()` / `askText()` — with `{ question, kind, options?,
summary?, asker?, onTimeout?, ttlSeconds? }`. Gets back `{ id }`.
2. The bot stores a pending approval in D1 and sends Hleb a Telegram message:
   - `kind: "choice"` → one button per option, **plus a "✍️ Other" button by default**
     (`allowCustom`, opt out with `--no-custom`). Tapping ✍️ Other opens a `force_reply`
     prompt and retargets reply-matching to it, so the same ask resolves by a tap OR text.
   - `kind: "text"` → a `force_reply` prompt; Hleb replies with text.
3. Hleb answers. **First answer wins**; the bot records it (option tap, free-text reply,
   or `/pending` cancel) and edits the message.
4. The agent polls `/answer/:id` (or `notify.waitForAnswer(id)`) until
   `answered` / `expired`. The response carries `decision` (option or `onTimeout`),
   `text` (free reply), and the `timedOut` flag.

## Endpoints (all Bearer `INGEST_SECRET`)

| Route             | Purpose                                                                                    |
| ----------------- | ------------------------------------------------------------------------------------------ |
| `POST /ask`       | `{ question, kind?, options?, summary?, asker?, onTimeout?, ttlSeconds? }` → `{ id, exp }` |
| `GET /answer/:id` | `{ id, kind, decision, text, answered, pending, expired, timedOut, options }`              |

Inbound from the phone: `/pending` lists open asks (each with a 🚫 Cancel button); a
reply to a `kind:"text"` prompt is captured automatically.

## `@workspace/notify` helpers

```ts
const n = notifierFromEnv() // BOT_INGEST_URL + NOTIFY_SHARED_SECRET
const { id } = await n!.ask({
  question: "Deploy prod now?",
  options: ["Yes", "No"],
  asker: "ci-agent",
})
const state = await n!.waitForAnswer(id) // blocks; polls until answered/expired
if (state.decision === "Yes") {
  /* … */
}
```

Shortcuts: `askConfirm(q, { accept, reject })` (Accept/Decline + ✍️ Other) and
`askText(q)` (free-form). `ask({ options, allowCustom })` is the general form — `allowCustom`
defaults true for choice. `waitForAnswer` is a poll loop (2.5s interval) returning the final
state (`state.text` for a typed reply, `state.decision` for an option/timeout) — no
hand-rolled polling.

## Delivery: the answer WAKES you — don't poll

The answer is the trigger. A non-resident agent (a turn that ends) must NOT depend on
polling or self-wakeups to catch the reply — pass a trigger on `ask` and exit; the bot
fires it the instant Hleb answers (tap, text, cancel, or timeout):

- **`resumeWorkflow: "<file>.yml"`** — the bot dispatches that GitHub workflow with inputs
  `ask_id`, `decision`, `text`. Reliable, runs on GitHub's infra, triggered by the answer —
  **preferred in this repo** (needs the bot's `GITHUB_DISPATCH_TOKEN`, already set). Your
  workflow declares those three `workflow_dispatch` inputs and continues the work.
- **`callbackUrl`** (+ `callbackToken`) — the bot POSTs `{id,kind,decision,text,asker}` there
  on resolve (Bearer `callbackToken` if set). For a service agent with an HTTP endpoint.
- Fire-on-resolve is best-effort + idempotent (`delivered` flag); `GET /answer/:id` stays the
  durable floor — the answer is always persisted, so a missed push is recoverable by a read.
- Only a resident process should use `waitForAnswer(id)` / the blocking `ask.ts` CLI.

## Notes / limits

- Only Hleb's allowlisted Telegram id can answer; everyone else is dropped.
- The bot never executes the action itself — it returns/triggers the decision; the consumer acts.
- Requires `BOT_GH_DISPATCH_TOKEN` for `resumeWorkflow` dispatch + the control-plane commands.
  Plain `/ask` + `callbackUrl` need only `INGEST_SECRET`.

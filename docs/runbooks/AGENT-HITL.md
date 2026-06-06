# Agent ⇄ Operator (Telegram human-in-the-loop)

When an agent (Claude Code / Codex / Cursor) or a long-running task needs Hleb's
decision, it asks through the dev bot and **blocks until he answers from his phone** —
by tapping an option or replying with text. This is DEV-55.

## TL;DR for agents

Before a risky / irreversible / ambiguous step (merge, destructive migration, "which
of these?", "ok to proceed?"), don't guess and don't silently stop — **ask**:

```bash
# Tap-an-option (blocks, prints the chosen label):
pnpm exec tsx apps/bot/scripts/ask.ts "Merge PR #42 to main?" \
  --options "Approve,Reject" --summary "3 files, tests green" --asker "$AGENT"

# Free-text answer (blocks, prints what Hleb typed):
pnpm exec tsx apps/bot/scripts/ask.ts "Any constraints before I refactor auth?" --text
```

`ask.ts` exits `0` and prints the answer on stdout (capture it), or `2` if it expired
with no reply. Add `--on-timeout Reject` to get a definitive decision even if he never
answers; `--ttl <seconds>` to change the 1h default.

## How it works

1. The agent POSTs to the bot's `/ask` (Bearer `INGEST_SECRET`) — or calls
   `@workspace/notify`'s `ask()` / `askText()` — with `{ question, kind, options?,
summary?, asker?, onTimeout?, ttlSeconds? }`. Gets back `{ id }`.
2. The bot stores a pending approval in D1 and sends Hleb a Telegram message:
   - `kind: "choice"` → one button per option (`Approve` / `Reject` / …).
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

`askText(question, opts)` is the free-text shortcut. `waitForAnswer` is a poll loop
(default 2.5s interval) that returns the final state — no hand-rolled polling needed.

## Notes / limits

- Only Hleb's allowlisted Telegram id can answer; everyone else is dropped.
- The bot never executes the action itself — it returns the decision; the agent acts on it.
- Polling, not push (a Worker has no agent callback). Fine for owned use; `waitForAnswer`
  hides it.
- Requires `BOT_GH_DISPATCH_TOKEN` only for the _control-plane_ commands, NOT for HITL —
  `/ask` needs just `INGEST_SECRET`.

// Ask Hleb a question on his phone and BLOCK until he answers (tap or text), then print
// the answer to stdout. For AI agents / humans driving long tasks who need a decision.
//
//   pnpm exec tsx apps/bot/scripts/ask.ts "Merge PR #42 to main?" --options Approve,Reject
//   pnpm exec tsx apps/bot/scripts/ask.ts "Any notes before I deploy?" --text
//   ... --summary "3 files, tests green" --asker "overnight-agent" --on-timeout Reject --ttl 1800
//
// Secret: NOTIFY_SHARED_SECRET env, else INGEST_SECRET from apps/bot/.dev.vars (gitignored).
// URL: BOT_INGEST_URL env, else https://bot.afframe.com/ingest.
// Exit code: 0 = resolved — a human answer OR an applied --on-timeout policy (the value is
//   printed to stdout); 2 = expired with no answer and no timeout policy.
import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { dirname, join } from "node:path"
import { createNotifier } from "@workspace/notify"

const here = dirname(fileURLToPath(import.meta.url))

function devVar(name: string): string | undefined {
  try {
    const txt = readFileSync(join(here, "..", ".dev.vars"), "utf8")
    return (txt.match(new RegExp(`^${name}=(.*)$`, "m")) ?? [])[1]?.trim()
  } catch {
    return undefined
  }
}

function arg(flag: string): string | undefined {
  const i = process.argv.indexOf(flag)
  return i >= 0 ? process.argv[i + 1] : undefined
}
const has = (flag: string) => process.argv.includes(flag)

async function main(): Promise<void> {
  const question = process.argv[2]
  if (!question || question.startsWith("--")) {
    console.error(
      'usage: ask.ts "<question>" [--options a,b] [--text] [--summary s] [--asker x] [--on-timeout Reject] [--ttl 3600]',
    )
    process.exit(1)
  }
  const url = process.env.BOT_INGEST_URL ?? "https://bot.afframe.com/ingest"
  const secret = process.env.NOTIFY_SHARED_SECRET ?? devVar("INGEST_SECRET")
  if (!secret) {
    console.error(
      "ask: no secret — set NOTIFY_SHARED_SECRET or add INGEST_SECRET to apps/bot/.dev.vars",
    )
    process.exit(1)
  }

  const notifier = createNotifier({ url, secret })
  const optionsArg = arg("--options")
  const ttl = arg("--ttl")
  const { id } = await notifier.ask({
    question,
    kind: has("--text") ? "text" : "choice",
    options: optionsArg
      ? optionsArg.split(",").map((s) => s.trim())
      : undefined,
    summary: arg("--summary"),
    asker: arg("--asker"),
    onTimeout: arg("--on-timeout"),
    ttlSeconds: ttl ? Number(ttl) : undefined,
  })
  console.error(`ask: sent (${id}) — waiting for your reply on Telegram…`)

  const state = await notifier.waitForAnswer(id)
  // `answered` is true for a human reply AND for an applied onTimeout policy.
  if (state.answered) {
    if (state.timedOut) console.error("ask: no reply — applied --on-timeout")
    // Plain answer to stdout so a caller can capture it.
    console.log(state.text ?? state.decision ?? "")
    process.exit(0)
  }
  console.error("ask: expired with no answer")
  process.exit(2)
}

void main()

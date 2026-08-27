/**
 * purge-expired-chats — the scheduled retention sweep for Asistent
 * (spec §2.8: "chats older than 12 months are purged").
 *
 * Same "plain ESM, no TypeScript, no pnpm, no tsx" contract as `migrate.mjs`
 * in this directory, and for the same reason: the runner image is a Next.js
 * standalone build (see `apps/beta/Dockerfile`'s `/migrate` stage), and this
 * script rides along the same way — a self-contained `/purge` tree with its
 * own copy of the dependency-free `postgres` package, run as its own ECS
 * scheduled task command (`infra/cdk/lib/beta-app-stack.ts`, the
 * `RetentionTaskDef` / `RetentionSchedule` construct), never as part of the
 * request-serving container.
 *
 * THE QUERY MIRRORS `purgeExpiredChats` in `lib/data/assistant.ts` EXACTLY —
 * `DELETE FROM chat WHERE updated_at < (now() - '<n> months'::interval)` — the
 * TypeScript function's own test (`lib/data/assistant.test.ts`) is the only
 * place the twelve-month window and the predicate are proved correct; this
 * script is a thin, dependency-light runner over the same predicate so a
 * scheduled run and the unit test can never quietly disagree about what
 * "expired" means. `chat_message` and `chat_usage` need no DELETE of their
 * own: both carry their own `organization_id … REFERENCES organization(id) ON
 * DELETE CASCADE`, and `chat_message` additionally cascades off `chat` itself
 * (migration 0018) — deleting the `chat` row is the whole sweep.
 *
 * Two callers, mirroring `migrate.mjs`:
 *   - the RetentionTaskDef container command (production, daily at 02:00 UTC)
 *   - `pnpm --filter beta db:purge-expired-chats` — local / manual run
 */
import process from "node:process"
import postgres from "postgres"

/** Twelve months, mirroring `CHAT_RETENTION_MONTHS` in `lib/data/assistant.ts`. */
const CHAT_RETENTION_MONTHS = 12

function readDatabaseUrl() {
  const url = process.env.DATABASE_URL
  if (!url) {
    throw new Error(
      "DATABASE_URL is not set. The beta container composes it from the RDS " +
        "secret in its task command (infra/cdk/lib/beta-app-stack.ts).",
    )
  }
  return url
}

async function main() {
  const url = readDatabaseUrl()
  const client = postgres(url, { prepare: false, max: 1, onnotice: () => {} })

  try {
    const cutoffInterval = `${CHAT_RETENTION_MONTHS} months`
    const rows = await client`
      DELETE FROM chat
       WHERE updated_at < (now() - ${cutoffInterval}::interval)
      RETURNING id
    `
    console.log(`[purge-expired-chats] purged ${rows.length} chat(s)`)
  } finally {
    await client.end({ timeout: 5 })
  }
}

main().catch((err) => {
  console.error(
    "[purge-expired-chats] fatal:",
    err instanceof Error ? err.message : err,
  )
  process.exit(1)
})

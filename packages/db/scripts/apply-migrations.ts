// TODO follow-up:
// - B1: SQL splitter is naive (split on /;\s*\n/), may corrupt DO blocks combined with CONCURRENTLY. Latent until first such migration. (Comment-line handling fixed — see scripts/split-statements.ts.)
// - B3: 0007_pgboss.sql intentionally lacks BEGIN/COMMIT (DO blocks are atomic per-block). Document if confusing.
// - B6: DATABASE_DIRECT_URL validation is shallow. Add current_user='app_owner' assertion if migration ownership errors appear.

import { createHash } from "node:crypto"
import { readFile, readdir } from "node:fs/promises"
import { fileURLToPath } from "node:url"
import { dirname, resolve } from "node:path"
import postgres from "postgres"
import { splitSqlStatements } from "./split-statements"

/**
 * apply-migrations.ts
 *
 * Applies SQL migrations from `packages/db/migrations/` to a target PostgreSQL
 * database in lexicographical order (0001_, 0002_, ...).
 *
 * Hardening over the lac reference script:
 *
 *   (a) URL validation: requires DATABASE_DIRECT_URL (port 5432, direct Postgres)
 *       not pgBouncer (port 6432). pg-boss and advisory locks require session
 *       continuity that pgBouncer transaction pooling discards. Fails loudly
 *       with explanation if the port is wrong or the var is missing.
 *       Falls back to DATABASE_URL only when the host is localhost (dev only).
 *
 *   (b) Concurrency-safe statements: detects CREATE INDEX CONCURRENTLY,
 *       REINDEX CONCURRENTLY, and ALTER TYPE ... ADD VALUE in the migration body
 *       and runs those statements outside BEGIN/COMMIT (Postgres forbids them
 *       inside a transaction block).
 *
 *   (c) Migration journal: _app_migrations table tracks every applied migration
 *       by filename + SHA-256 checksum. Refuses to re-apply a migration that
 *       was already applied with a DIFFERENT checksum (drift detection). Skips
 *       silently if checksum matches.
 *
 *   (d) Per-file output: prints [applied], [skipped], or [FAILED] for each file.
 */

const __dirname = dirname(fileURLToPath(import.meta.url))
const migrationsDir = resolve(__dirname, "..", "migrations")

const PGBOUNCER_PORT = "6432"
const FORBIDDEN_OUTSIDE_TRANSACTION = [
  /\bCREATE\s+INDEX\s+CONCURRENTLY\b/i,
  /\bREINDEX\s+CONCURRENTLY\b/i,
  /\bALTER\s+TYPE\s+\S+\s+ADD\s+VALUE\b/i,
]

function resolveUrl(): string {
  const direct = process.env["DATABASE_DIRECT_URL"]
  const fallback = process.env["DATABASE_URL"]

  if (direct) {
    const url = new URL(direct)
    if (url.port === PGBOUNCER_PORT) {
      throw new Error(
        `DATABASE_DIRECT_URL uses port ${PGBOUNCER_PORT} (pgBouncer). ` +
          "Migrations require a direct Postgres connection (port 5432). " +
          "Set DATABASE_DIRECT_URL to the direct RDS/Postgres endpoint. " +
          "pgBouncer transaction pooling discards session state required by pg-boss, " +
          "advisory locks, and CREATE INDEX CONCURRENTLY.",
      )
    }
    return direct
  }

  if (fallback) {
    const url = new URL(fallback)
    const host = url.hostname
    const isLocal =
      host === "localhost" || host === "127.0.0.1" || host === "::1"
    if (!isLocal) {
      throw new Error(
        "DATABASE_DIRECT_URL is not set. " +
          "For non-local environments, provide DATABASE_DIRECT_URL pointing at the " +
          "direct Postgres port (5432), not pgBouncer. " +
          "DATABASE_URL alone is only accepted when the host is localhost.",
      )
    }
    if (url.port === PGBOUNCER_PORT) {
      throw new Error(
        `DATABASE_URL uses port ${PGBOUNCER_PORT} (pgBouncer). ` +
          "Migrations must run against direct Postgres (port 5432). " +
          "Update DATABASE_URL or set DATABASE_DIRECT_URL.",
      )
    }
    return fallback
  }

  // Dev fallback: local direct Postgres.
  return "postgres://app_owner:dev_owner@localhost:5432/app_dev"
}

function sha256(content: string): string {
  return createHash("sha256").update(content, "utf8").digest("hex")
}

function needsOutsideTransaction(sql: string): boolean {
  return FORBIDDEN_OUTSIDE_TRANSACTION.some((re) => re.test(sql))
}

async function ensureJournal(client: postgres.Sql): Promise<void> {
  await client.unsafe(`
    CREATE TABLE IF NOT EXISTS _app_migrations (
      filename    text        PRIMARY KEY,
      applied_at  timestamptz NOT NULL DEFAULT now(),
      checksum    text        NOT NULL
    )
  `)
}

type JournalRow = { filename: string; checksum: string }

async function getApplied(client: postgres.Sql): Promise<Map<string, string>> {
  const rows = await client<
    JournalRow[]
  >`SELECT filename, checksum FROM _app_migrations`
  return new Map(rows.map((r) => [r.filename, r.checksum]))
}

async function recordApplied(
  client: postgres.Sql,
  filename: string,
  checksum: string,
): Promise<void> {
  await client`
    INSERT INTO _app_migrations (filename, checksum)
    VALUES (${filename}, ${checksum})
  `
}

async function main(): Promise<void> {
  const url = resolveUrl()
  const files = (await readdir(migrationsDir))
    .filter((f) => f.endsWith(".sql"))
    .sort()

  if (files.length === 0) {
    console.log("No migrations found in", migrationsDir)
    return
  }

  console.log(
    `Connecting to: ${new URL(url).hostname}:${new URL(url).port || 5432}`,
  )
  console.log(`Applying up to ${files.length} migration(s)…`)

  const client = postgres(url, { prepare: false, max: 1, onnotice: () => {} })

  // Propagate AUTH_TOKEN_ENV into the session as the `app.auth_token_env`
  // GUC so migration bodies can derive the right token env at backfill
  // time. Migration 0018 (auth_invite → auth_token backfill, retained
  // for history) reads `current_setting('app.auth_token_env', true)` to
  // label every imported row with the deploy environment ('dev' / 'stg'
  // / 'prd'); without this SET it would fall back to 'dev', causing
  // cross-env checksum rejection on staging + production.
  const rawTokenEnv = process.env["AUTH_TOKEN_ENV"]?.trim()
  if (rawTokenEnv === "dev" || rawTokenEnv === "stg" || rawTokenEnv === "prd") {
    await client.unsafe(`SET app.auth_token_env = '${rawTokenEnv}'`)
    console.log(`SET app.auth_token_env = '${rawTokenEnv}'`)
  }

  // Advisory lock: ensures only one migration runner executes at a time.
  // hashtext() maps the string key to a stable integer across the cluster.
  // The lock is session-scoped and released on connection close, but we also
  // release it explicitly in the finally block for fast unlock on success.
  await client.unsafe(`SELECT pg_advisory_lock(hashtext('app_migrations'))`)

  try {
    await ensureJournal(client)
    const applied = await getApplied(client)

    let countApplied = 0
    let countSkipped = 0
    let countFailed = 0

    for (const file of files) {
      const body = await readFile(resolve(migrationsDir, file), "utf8")
      const checksum = sha256(body)

      if (applied.has(file)) {
        const storedChecksum = applied.get(file)!
        if (storedChecksum !== checksum) {
          console.error(
            `[DRIFT] ${file}: checksum mismatch. ` +
              `Stored: ${storedChecksum.slice(0, 12)}… ` +
              `Current: ${checksum.slice(0, 12)}… ` +
              "Refusing to re-apply. Fix the migration file or the journal.",
          )
          process.exit(1)
        }
        console.log(`[skipped] ${file}`)
        countSkipped++
        continue
      }

      try {
        if (needsOutsideTransaction(body)) {
          // Run outside transaction: split on semicolons and execute each
          // statement individually. This is necessary for CONCURRENTLY operations
          // and ALTER TYPE ... ADD VALUE. Comment LINES are stripped before the
          // empty-chunk filter so a comment-prefixed statement is not silently
          // dropped (DB-08; see scripts/split-statements.ts + its unit test).
          const statements = splitSqlStatements(body)

          for (const stmt of statements) {
            await client.unsafe(stmt)
          }
        } else {
          await client.unsafe(body)
        }

        await recordApplied(client, file, checksum)
        console.log(`[applied] ${file}`)
        countApplied++
      } catch (err) {
        console.error(
          `[FAILED] ${file}:`,
          err instanceof Error ? err.message : err,
        )
        countFailed++
        // Stop on first failure: subsequent migrations may depend on this one.
        break
      }
    }

    console.log(
      `\nDone. Applied: ${countApplied}, Skipped: ${countSkipped}, Failed: ${countFailed}`,
    )

    if (countFailed > 0) {
      process.exit(1)
    }
  } finally {
    await client.unsafe(`SELECT pg_advisory_unlock(hashtext('app_migrations'))`)
    await client.end({ timeout: 5 })
  }
}

main().catch((err) => {
  console.error("Fatal:", err instanceof Error ? err.message : err)
  process.exit(1)
})

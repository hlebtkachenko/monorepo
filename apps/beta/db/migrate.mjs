/**
 * apply-migrations for the beta portal database.
 *
 * Applies every `NNNN_<snake>.sql` file in `./migrations` in lexicographic
 * order against $DATABASE_URL, then exits. Two callers:
 *
 *   - `apps/beta/entrypoint.sh` — runs this before `exec node
 *     apps/beta/server.js`. Beta's RDS sits in PRIVATE_ISOLATED subnets behind a
 *     VPC with zero NAT gateways, so a GitHub runner cannot reach it and prod's
 *     one-off-ECS-task bridge piggybacks a Backup stack beta does not have
 *     (plan `.context/beta-afframe/30-plan-v3-beta-env.md` Part 2 §3). The task
 *     migrates itself. desiredCount is 1, so no two runs can race — and the
 *     advisory lock below covers the deploy window where the old task and the
 *     new one briefly overlap.
 *   - `pnpm --filter beta db:migrate` — local / dev.
 *
 * Plain ESM JavaScript, not TypeScript, on purpose: the runner image is a
 * Next.js standalone build with no pnpm, no tsx and no TypeScript. `node` must
 * be able to execute this file as-is. The only dependency is `postgres`, which
 * the Dockerfile copies next to this file (it is dependency-free itself).
 *
 * Behaviour mirrors packages/db/scripts/apply-migrations.ts:
 *   - journal table `_beta_migrations` (filename PK + sha256 checksum)
 *   - already-applied files are skipped; a checksum mismatch is a hard failure
 *     (an edited migration means the deployed database and the repo disagree)
 *   - a session advisory lock serializes concurrent runners
 *   - the first failure stops the run and exits non-zero, which crash-loops the
 *     container and trips the deploy workflow's smoke step
 *
 * It deliberately does NOT copy that script's pgBouncer port validation: this
 * environment has no pgBouncer.
 *
 * TRANSACTION OWNERSHIP (Advisor carry-in SF-4): the RUNNER owns the
 * transaction, not the migration file. Each file's body and its journal INSERT
 * run inside ONE `client.begin(...)`, so a crash between "DDL applied" and
 * "journal row written" is unreachable — the pair commits or neither does. A
 * file that carries its own `BEGIN;` / `COMMIT;` would commit the DDL early and
 * re-open exactly that window, so such a file is rejected before anything runs.
 */

import { createHash } from "node:crypto"
import { readFile, readdir } from "node:fs/promises"
import { dirname, resolve } from "node:path"
import process from "node:process"
import { fileURLToPath } from "node:url"
import postgres from "postgres"

const migrationsDir = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "migrations",
)

const MIGRATION_FILENAME = /^\d{4}_[a-z][a-z0-9_]*\.sql$/
const ADVISORY_LOCK_KEY = "beta_migrations"

/**
 * A statement-level transaction keyword: `BEGIN;`, `COMMIT;`, `ROLLBACK;` or
 * `START TRANSACTION;` on its own. The trailing semicolon is what keeps the
 * `BEGIN` that opens a plpgsql function body (`AS $$ BEGIN ... END; $$`) out of
 * the match — that one is never followed by a semicolon.
 */
const TRANSACTION_KEYWORD =
  /^[ \t]*(BEGIN|COMMIT|ROLLBACK|START[ \t]+TRANSACTION)[ \t]*;/im

/** @param {string} content */
function sha256(content) {
  return createHash("sha256").update(content, "utf8").digest("hex")
}

/** Never log the connection string itself — it carries the RDS password. */
function describeTarget(url) {
  const parsed = new URL(url)
  return `${parsed.hostname}:${parsed.port || "5432"}${parsed.pathname}`
}

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

  const entries = await readdir(migrationsDir)
  const files = entries.filter((f) => f.endsWith(".sql")).sort()

  const malformed = files.filter((f) => !MIGRATION_FILENAME.test(f))
  if (malformed.length > 0) {
    throw new Error(
      `migration filenames must match NNNN_<snake>.sql: ${malformed.join(", ")}`,
    )
  }
  if (files.length === 0) {
    throw new Error(`no migrations found in ${migrationsDir}`)
  }

  console.log(`[beta migrate] target ${describeTarget(url)}`)
  console.log(`[beta migrate] ${files.length} migration(s) on disk`)

  const client = postgres(url, { prepare: false, max: 1, onnotice: () => {} })
  let failed = 0

  try {
    // Session-scoped: released explicitly below, and by the connection close on
    // any path that skips the unlock.
    await client.unsafe(
      `SELECT pg_advisory_lock(hashtext('${ADVISORY_LOCK_KEY}'))`,
    )

    await client.unsafe(`
      CREATE TABLE IF NOT EXISTS _beta_migrations (
        filename    text        PRIMARY KEY,
        applied_at  timestamptz NOT NULL DEFAULT now(),
        checksum    text        NOT NULL
      )
    `)

    const rows = await client`SELECT filename, checksum FROM _beta_migrations`
    const applied = new Map(rows.map((r) => [r.filename, r.checksum]))

    let countApplied = 0
    let countSkipped = 0

    for (const file of files) {
      const body = await readFile(resolve(migrationsDir, file), "utf8")
      const checksum = sha256(body)
      const storedChecksum = applied.get(file)

      if (storedChecksum !== undefined) {
        if (storedChecksum !== checksum) {
          throw new Error(
            `[DRIFT] ${file}: applied checksum ${storedChecksum.slice(0, 12)}… ` +
              `does not match the file on disk (${checksum.slice(0, 12)}…). ` +
              "An applied migration was edited. Add a new migration instead.",
          )
        }
        console.log(`[beta migrate] [skipped] ${file}`)
        countSkipped++
        continue
      }

      if (TRANSACTION_KEYWORD.test(body)) {
        throw new Error(
          `${file} contains a statement-level BEGIN/COMMIT. The runner wraps ` +
            "every migration body and its journal INSERT in one transaction; a " +
            "file-level BEGIN would commit the DDL before the journal row and " +
            "leave a crash window. Remove it.",
        )
      }

      try {
        // ONE transaction for the DDL *and* the journal row (SF-4): a crash
        // between the two cannot leave a migrated database with an empty
        // journal (which would re-run the file and fail on existing objects).
        await client.begin(async (tx) => {
          await tx.unsafe(body)
          await tx`
            INSERT INTO _beta_migrations (filename, checksum)
            VALUES (${file}, ${checksum})
          `
        })
        console.log(`[beta migrate] [applied] ${file}`)
        countApplied++
      } catch (err) {
        console.error(
          `[beta migrate] [FAILED] ${file}:`,
          err instanceof Error ? err.message : err,
        )
        failed++
        // Stop on the first failure: later migrations assume this one landed.
        break
      }
    }

    console.log(
      `[beta migrate] done — applied ${countApplied}, skipped ${countSkipped}, failed ${failed}`,
    )
  } finally {
    await client
      .unsafe(`SELECT pg_advisory_unlock(hashtext('${ADVISORY_LOCK_KEY}'))`)
      .catch(() => {})
    await client.end({ timeout: 5 })
  }

  if (failed > 0) process.exit(1)
}

main().catch((err) => {
  console.error(
    "[beta migrate] fatal:",
    err instanceof Error ? err.message : err,
  )
  process.exit(1)
})

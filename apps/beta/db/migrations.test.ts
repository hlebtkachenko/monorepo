/**
 * The migration runner is what stands between a deploy and a half-migrated
 * database, so it is tested through the exact file the container executes
 * (`db/migrate.mjs`) rather than a re-implementation.
 */
import { execFile } from "node:child_process"
import { copyFile, mkdir, rm, writeFile } from "node:fs/promises"
import { resolve } from "node:path"
import { promisify } from "node:util"
import postgres from "postgres"
import { afterAll, describe, expect, it } from "vitest"
import { MIGRATE_SCRIPT } from "../tests/global-setup"
import { withScratchDatabase } from "../tests/scratch-db"

const execFileAsync = promisify(execFile)

async function migrate(url: string): Promise<string> {
  const { stdout } = await execFileAsync(process.execPath, [MIGRATE_SCRIPT], {
    env: { ...process.env, DATABASE_URL: url },
  })
  return stdout
}

/**
 * A throwaway copy of the runner with a migrations directory we control.
 *
 * The runner resolves `./migrations` relative to its own file, so exercising it
 * against deliberately-broken SQL means copying it somewhere else. That
 * somewhere has to sit under a `node_modules` on the resolution path — the
 * script imports `postgres` — which is also why it is gitignored by definition.
 */
const SANDBOX = resolve(
  import.meta.dirname,
  "..",
  "node_modules",
  ".beta-migrate-sandbox",
)

afterAll(async () => {
  await rm(SANDBOX, { recursive: true, force: true })
})

async function withSandboxRunner(
  files: Record<string, string>,
  fn: (run: (url: string) => Promise<string>) => Promise<void>,
): Promise<void> {
  await rm(SANDBOX, { recursive: true, force: true })
  await mkdir(resolve(SANDBOX, "migrations"), { recursive: true })
  await copyFile(MIGRATE_SCRIPT, resolve(SANDBOX, "migrate.mjs"))
  for (const [name, body] of Object.entries(files)) {
    await writeFile(resolve(SANDBOX, "migrations", name), body, "utf8")
  }

  const run = async (url: string) => {
    const { stdout } = await execFileAsync(
      process.execPath,
      [resolve(SANDBOX, "migrate.mjs")],
      { env: { ...process.env, DATABASE_URL: url } },
    )
    return stdout
  }

  await fn(run)
}

describe("beta migration runner", () => {
  it("applies every migration to an empty database and is idempotent on re-run", async () => {
    await withScratchDatabase("beta_migrate_fresh", async (url) => {
      const first = await migrate(url)
      expect(first).toContain("[applied] 0000_init.sql")
      expect(first).not.toContain("[skipped]")

      const second = await migrate(url)
      expect(second).toContain("[skipped] 0000_init.sql")
      expect(second).not.toContain("[applied]")

      const sql = postgres(url, { max: 1, onnotice: () => {} })
      try {
        const journal = await sql<
          { filename: string; checksum: string }[]
        >`SELECT filename, checksum FROM _beta_migrations ORDER BY filename`
        expect(journal.map((r) => r.filename)).toEqual([
          "0000_init.sql",
          "0001_setup_token_guards.sql",
          "0002_ownership_locks_and_offboarding.sql",
          "0003_offboarding_completeness.sql",
          "0004_documents.sql",
          "0005_filings.sql",
          "0006_liabilities.sql",
          "0007_import_spine.sql",
          "0008_assets.sql",
          "0009_client_tasks.sql",
          "0010_document_preview.sql",
          "0011_agent_api.sql",
          "0012_notification_prefs.sql",
          "0013_two_factor_verified.sql",
          "0014_account_balance_map.sql",
          "0015_partners_saldokonto.sql",
          "0016_payroll.sql",
          "0017_loans.sql",
          "0018_assistant.sql",
          "0019_employee_seat.sql",
          "0020_indicators.sql",
        ])
        expect(journal[0]?.checksum).toMatch(/^[0-9a-f]{64}$/)

        const tables = await sql<{ table_name: string }[]>`
          SELECT table_name FROM information_schema.tables
           WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
           ORDER BY table_name
        `
        expect(tables.map((t) => t.table_name)).toEqual([
          "_beta_migrations",
          "account_balance_map",
          "activity_log",
          "agent_key",
          "app_user",
          "asset",
          "asset_event",
          "auth_account",
          "auth_session",
          "auth_verification",
          "chat",
          "chat_message",
          "chat_usage",
          "client_task",
          "document",
          "filing",
          "import_batch",
          "liability",
          "loan",
          "organization",
          "organization_indicator",
          "organization_membership",
          "partner",
          "partner_saldo",
          "payroll_employee",
          "payroll_employee_line",
          "payroll_summary",
          "reporting_period",
          "statement_line",
          "trial_balance_line",
          "two_factor",
          "user_setup_token",
        ])
      } finally {
        await sql.end({ timeout: 5 })
      }
    })
  })

  it("refuses to continue when an applied migration was edited", async () => {
    await withScratchDatabase("beta_migrate_drift", async (url) => {
      await migrate(url)

      const sql = postgres(url, { max: 1, onnotice: () => {} })
      try {
        await sql`UPDATE _beta_migrations SET checksum = ${"0".repeat(64)}`
      } finally {
        await sql.end({ timeout: 5 })
      }

      await expect(migrate(url)).rejects.toMatchObject({ code: 1 })
    })
  })

  it("fails loudly when DATABASE_URL is absent", async () => {
    const env = { ...process.env }
    delete env["DATABASE_URL"]
    await expect(
      execFileAsync(process.execPath, [MIGRATE_SCRIPT], { env }),
    ).rejects.toMatchObject({ code: 1 })
  })
})

/**
 * Advisor carry-in SF-4. The runner — not the migration file — owns the
 * transaction, so "DDL applied, journal row missing" is unreachable. That state
 * is the nasty one: the next deploy re-runs the file, the objects already
 * exist, and the container crash-loops on a database that is actually fine.
 */
describe("migration atomicity", () => {
  it("commits the DDL and its journal row together, or neither", async () => {
    await withSandboxRunner(
      {
        "0000_first.sql": "CREATE TABLE applied_ok (id integer PRIMARY KEY);",
        // First statement succeeds, second one cannot: if the runner did not
        // own the transaction, `half_applied` would survive.
        "0001_broken.sql":
          "CREATE TABLE half_applied (id integer PRIMARY KEY);\n" +
          "CREATE TABLE half_applied (id integer PRIMARY KEY);\n",
      },
      async (run) => {
        await withScratchDatabase("beta_migrate_atomic", async (url) => {
          await expect(run(url)).rejects.toMatchObject({ code: 1 })

          const sql = postgres(url, { max: 1, onnotice: () => {} })
          try {
            const journal = await sql<{ filename: string }[]>`
              SELECT filename FROM _beta_migrations ORDER BY filename
            `
            expect(journal.map((r) => r.filename)).toEqual(["0000_first.sql"])

            const tables = await sql<{ table_name: string }[]>`
              SELECT table_name FROM information_schema.tables
               WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
               ORDER BY table_name
            `
            const names = tables.map((t) => t.table_name)
            expect(names).toContain("applied_ok")
            // No partial DDL from the failed file.
            expect(names).not.toContain("half_applied")
          } finally {
            await sql.end({ timeout: 5 })
          }
        })
      },
    )
  })

  it("rejects a migration that opens its own transaction", async () => {
    await withSandboxRunner(
      {
        "0000_wrapped.sql":
          "BEGIN;\nCREATE TABLE wrapped (id integer PRIMARY KEY);\nCOMMIT;\n",
      },
      async (run) => {
        await withScratchDatabase("beta_migrate_wrapped", async (url) => {
          await expect(run(url)).rejects.toMatchObject({ code: 1 })

          const sql = postgres(url, { max: 1, onnotice: () => {} })
          try {
            const tables = await sql<{ table_name: string }[]>`
              SELECT table_name FROM information_schema.tables
               WHERE table_schema = 'public' AND table_name = 'wrapped'
            `
            expect(tables).toHaveLength(0)
          } finally {
            await sql.end({ timeout: 5 })
          }
        })
      },
    )
  })

  it("does not mistake a plpgsql BEGIN for a transaction", async () => {
    await withSandboxRunner(
      {
        "0000_plpgsql.sql": [
          "CREATE FUNCTION sandbox_noop() RETURNS trigger LANGUAGE plpgsql AS $$",
          "BEGIN",
          "  RETURN NEW;",
          "END;",
          "$$;",
        ].join("\n"),
      },
      async (run) => {
        await withScratchDatabase("beta_migrate_plpgsql", async (url) => {
          const output = await run(url)
          expect(output).toContain("[applied] 0000_plpgsql.sql")
        })
      },
    )
  })
})

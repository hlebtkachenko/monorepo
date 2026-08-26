/**
 * The migration runner is what stands between a deploy and a half-migrated
 * database, so it is tested through the exact file the container executes
 * (`db/migrate.mjs`) rather than a re-implementation.
 */
import { execFile } from "node:child_process"
import { promisify } from "node:util"
import postgres from "postgres"
import { describe, expect, it } from "vitest"
import { MIGRATE_SCRIPT } from "../tests/global-setup"
import { withScratchDatabase } from "../tests/scratch-db"

const execFileAsync = promisify(execFile)

async function migrate(url: string): Promise<string> {
  const { stdout } = await execFileAsync(process.execPath, [MIGRATE_SCRIPT], {
    env: { ...process.env, DATABASE_URL: url },
  })
  return stdout
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
        expect(journal.map((r) => r.filename)).toEqual(["0000_init.sql"])
        expect(journal[0]?.checksum).toMatch(/^[0-9a-f]{64}$/)

        const tables = await sql<{ table_name: string }[]>`
          SELECT table_name FROM information_schema.tables
           WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
           ORDER BY table_name
        `
        expect(tables.map((t) => t.table_name)).toEqual([
          "_beta_migrations",
          "app_user",
          "auth_account",
          "auth_session",
          "auth_verification",
          "organization",
          "organization_membership",
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

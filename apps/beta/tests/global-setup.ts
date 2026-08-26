/**
 * Vitest globalSetup for the `db` project: boots a disposable Postgres 18
 * container, applies the beta migrations through the REAL runner
 * (`db/migrate.mjs`, the same file the container entrypoint executes), and
 * exports DATABASE_URL.
 *
 * Why this does not call `@workspace/testcontainers` `bootPostgres18()`: that
 * helper is hardwired to the main app — it applies
 * `infra/compose/postgres/init.d` role bootstrap and every migration in
 * `packages/db/migrations`. Those migrations create their own `app_user`,
 * `organization` and `organization_membership` tables, so beta's 0000_init.sql
 * would collide on the first CREATE TABLE. Beta runs on a separate database by
 * design (plan Part 1), and its test fixture has to mirror that: a bare
 * postgres:18-alpine with beta's migrations and nothing else. The container
 * image and the reuse opt-in match bootPostgres18 so the two share a cached
 * image locally.
 */
import { execFile } from "node:child_process"
import { promisify } from "node:util"
import { resolve } from "node:path"
import { PostgreSqlContainer } from "@testcontainers/postgresql"
import type { StartedPostgreSqlContainer } from "@testcontainers/postgresql"

const execFileAsync = promisify(execFile)

export const MIGRATE_SCRIPT = resolve(
  import.meta.dirname,
  "..",
  "db",
  "migrate.mjs",
)

let container: StartedPostgreSqlContainer | null = null

/** Run the production migration runner against `url`. */
export async function runMigrations(url: string): Promise<string> {
  const { stdout } = await execFileAsync(process.execPath, [MIGRATE_SCRIPT], {
    env: { ...process.env, DATABASE_URL: url },
  })
  return stdout
}

export async function setup(): Promise<void> {
  // Escape hatch shared with @workspace/testcontainers: when
  // SKIP_TESTCONTAINER=true the caller supplies an empty Postgres 18 database
  // through DATABASE_URL (a CI service container, or a local cluster) and the
  // migrations are applied to that instead of booting Docker.
  if (process.env["SKIP_TESTCONTAINER"] === "true") {
    const url = process.env["DATABASE_URL"]
    if (!url) {
      throw new Error(
        "SKIP_TESTCONTAINER=true but DATABASE_URL is not set — nothing to migrate.",
      )
    }
    await runMigrations(url)
    return
  }

  let pg = new PostgreSqlContainer("postgres:18-alpine")
    .withDatabase("beta")
    .withUsername("postgres")
    .withPassword("postgres")
  if (process.env["TESTCONTAINERS_REUSE_ENABLE"] === "true") {
    pg = pg.withReuse()
  }
  container = await pg.start()

  const url = container.getConnectionUri()
  await runMigrations(url)
  process.env["DATABASE_URL"] = url
}

export async function teardown(): Promise<void> {
  if (container) {
    await container.stop()
    container = null
  }
}

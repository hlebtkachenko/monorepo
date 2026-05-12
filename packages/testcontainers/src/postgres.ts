/**
 * bootPostgres18 — spin up a disposable Postgres 18 testcontainer, apply
 * role bootstrap + migrations, and return usable connection URLs.
 *
 * Returns:
 *   adminUrl  — superuser connection (app_owner) for migrations + admin ops
 *   userUrl   — app role connection (app_user) for RLS-enforced tests
 *   container — the started container; call container.stop() in teardown
 *
 * Execution order (critical for trigger correctness):
 *   1. Start container (postgres:18-alpine, wait for pg_isready)
 *   2. Apply init.d role bootstrap (creates roles + GUC defaults)
 *   3. Apply migrations 0001–0011 (DDL depends on roles from step 2)
 *
 * Role bootstrap reads infra/compose/postgres/init.d/*.sql from disk, strips
 * psql meta-commands, and applies each file in dictionary order. This is the
 * single source of truth shared with the dev compose stack.
 *
 * Image: stock postgres:18-alpine (no custom extensions). The compose stack
 * uses a custom Dockerfile that installs pgvector + pgaudit via apt (Debian).
 * Testcontainers intentionally stay on the stock image to keep CI simple:
 *   - pgvector: migration 0001 wraps CREATE EXTENSION in DO/EXCEPTION, so it
 *     skips gracefully when the extension is absent.
 *   - pgaudit: audit logging is not required for correctness tests.
 * If pgvector or pgaudit are needed in tests, build and cache a custom image
 * locally and point PostgreSqlContainer at the local tag (see ADR-0012).
 *
 * Image pin: postgres:18-alpine is used without a digest pin for now. Section 4
 * will pin to a specific digest once the CI workflow is wired (pinning here
 * without CI validation adds churn without correctness benefit).
 */

import { resolve, dirname } from "node:path"
import { fileURLToPath } from "node:url"
import { PostgreSqlContainer } from "@testcontainers/postgresql"
import type { StartedPostgreSqlContainer } from "@testcontainers/postgresql"
import { applyRoleBootstrap } from "./roles"
import { applyMigrations } from "./migrations"

const __dirname = dirname(fileURLToPath(import.meta.url))

// Repo root is 3 levels up: src/ -> packages/testcontainers/ -> packages/ -> repo root
const REPO_ROOT = resolve(__dirname, "..", "..", "..")
const INITD_DIR = resolve(REPO_ROOT, "infra", "compose", "postgres", "init.d")
const MIGRATIONS_DIR = resolve(REPO_ROOT, "packages", "db", "migrations")

export interface BootResult {
  /** Superuser URL (app_owner) — use for migrations, schema queries, admin ops. */
  adminUrl: string
  /** App-role URL (app_user) — use for all RLS-enforced test queries. */
  userUrl: string
  /** The running container. Call container.stop() in vitest globalSetup teardown. */
  container: StartedPostgreSqlContainer
}

/**
 * Boot a disposable Postgres 18 container, apply role bootstrap and all
 * migrations, return ready-to-use connection URLs.
 *
 * Cold start takes ~10–20 seconds on first run (image pull + init + migrations).
 * Warm runs (image cached) take ~4–6 seconds.
 */
export async function bootPostgres18(): Promise<BootResult> {
  // Container reuse is opt-in. Set TESTCONTAINERS_REUSE_ENABLE=true to reuse
  // an already-running container across test runs (useful for local dev speed;
  // OFF by default so CI always gets a clean container).
  let pg = new PostgreSqlContainer("postgres:18-alpine")
    .withDatabase("app_dev")
    .withUsername("postgres")
    .withPassword("postgres")
  if (process.env["TESTCONTAINERS_REUSE_ENABLE"] === "true") {
    pg = pg.withReuse()
  }
  const container = await pg.start()

  // Superuser URL — used for role bootstrap + migrations.
  // The testcontainer default user (postgres) is a superuser.
  const adminUrl = container.getConnectionUri()

  // Step 1: Apply role bootstrap (creates app_owner, app_user, app_admin,
  // app_worker roles + inheritance grants + per-role GUC defaults).
  await applyRoleBootstrap(adminUrl, INITD_DIR)

  // Step 2: Apply migrations (DDL, RLS policies, triggers, functions).
  // Must run after role bootstrap so references to app_owner in OWNER TO
  // and GRANT statements resolve correctly.
  await applyMigrations(adminUrl, MIGRATIONS_DIR)

  // app_user URL — connects as app_user role. RLS applies on all tenant tables.
  const host = container.getHost()
  const port = container.getFirstMappedPort()
  const userUrl = `postgres://app_user:dev_user@${host}:${port}/app_dev`

  return { adminUrl, userUrl, container }
}

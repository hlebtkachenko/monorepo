/**
 * AFF-115 / E14a — E2E database bootstrap.
 *
 * Boots one disposable Postgres 18 testcontainer (the SAME `bootPostgres18`
 * helper the `@workspace/db` integration tests use — no forked compose file,
 * no second migration path) and seeds a genuine loginable workspace owner via
 * Better Auth's real sign-up API.
 *
 * Why this runs from `playwright.config.ts` and not from `globalSetup`
 * -------------------------------------------------------------------
 * The Next.js server under test runs in a child process spawned by
 * Playwright's `webServer`. That child does NOT reliably inherit `process.env`
 * mutations made in `globalSetup` — `pnpm dev|start` and Turbopack re-spawn,
 * and the database URL is lost. The ONLY contract Playwright guarantees for
 * passing env into the web server is `webServer.env` in the config object.
 *
 * `bootPostgres18` returns ephemeral URLs, so `webServer.env` cannot be
 * hard-coded. Therefore the container is booted here, while the config module
 * is being evaluated (Playwright supports top-level `await` in the config),
 * and the resulting URLs are spread into `webServer.env`.
 *
 * `bootAndSeedDatabase()` is memoised so the config module evaluating more
 * than once never boots a second container. The container handle is stashed
 * on `globalThis` so `global-teardown.ts` can stop it after the run.
 */

import { mkdir, writeFile } from "node:fs/promises"
import { dirname, resolve } from "node:path"
import {
  bootPostgres18,
  type StartedPostgreSqlContainer,
} from "@workspace/testcontainers"

/** Path the specs read the seeded owner credentials from. */
export const SEED_FILE = resolve(import.meta.dirname, ".auth", "seed.json")

export interface E2EDatabase {
  /** app_user connection (RLS enforced) — what the web server uses. */
  databaseUrl: string
  /** app_owner superuser connection — for migrations / admin seeding. */
  databaseDirectUrl: string
}

declare global {
  var __E2E_PG_CONTAINER__: StartedPostgreSqlContainer | undefined

  var __E2E_DB__: Promise<E2EDatabase> | undefined
}

async function boot(): Promise<E2EDatabase> {
  const result = await bootPostgres18()
  globalThis.__E2E_PG_CONTAINER__ = result.container

  const db: E2EDatabase = {
    databaseUrl: result.userUrl,
    databaseDirectUrl: result.adminUrl,
  }

  // Set the URLs on this (Playwright runner) process so the dynamically
  // imported db client + Better Auth instance below bind to the container.
  process.env["DATABASE_URL"] = db.databaseUrl
  process.env["DATABASE_DIRECT_URL"] = db.databaseDirectUrl

  // Seed a genuine loginable workspace owner. The fixture + Better Auth glue
  // are imported dynamically AFTER DATABASE_URL is set so they bind correctly.
  const { adminClient, seedWorkspaceWithOwner } =
    await import("@workspace/db/tests/fixtures")
  const { betterAuthSignUp } = await import("@workspace/auth/test-support")

  const sql = adminClient()
  try {
    const seed = await seedWorkspaceWithOwner(sql, {
      signUp: betterAuthSignUp,
      email: "e2e-owner@test.invalid",
      password: "E2eOwnerPassw0rd!",
    })
    await mkdir(dirname(SEED_FILE), { recursive: true })
    await writeFile(SEED_FILE, JSON.stringify(seed, null, 2), "utf8")
  } finally {
    await sql.end({ timeout: 5 })
  }

  return db
}

/**
 * Boot + seed exactly once per Playwright run, even if the config module is
 * evaluated multiple times. Returns the connection URLs to feed into
 * `webServer.env`.
 */
export function bootAndSeedDatabase(): Promise<E2EDatabase> {
  globalThis.__E2E_DB__ ??= boot()
  return globalThis.__E2E_DB__
}

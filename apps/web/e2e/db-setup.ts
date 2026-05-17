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
 * Multi-process evaluation guard
 * --------------------------------
 * Playwright evaluates `playwright.config.ts` in more than one process: the
 * config/loader process starts the web server, and child dispatcher processes
 * re-evaluate the config to discover test files. Each process has its own
 * `globalThis`, so the in-process `globalThis.__E2E_DB__` memo alone is not
 * enough to prevent a second container from being started.
 *
 * The guard is two-layered:
 *   1. In-process: `globalThis.__E2E_DB__ ??= boot()` — prevents double-boot
 *      within the same process even if the module is re-evaluated.
 *   2. Cross-process: the first boot stamps two env vars onto itself
 *      (`E2E_DB_URL` and `E2E_DB_DIRECT_URL`). Child processes inherit these
 *      and short-circuit `boot()` without launching a second container or
 *      overwriting the already-written `seed.json`.
 *
 * `global-teardown.ts` stops the container (stashed on `globalThis`) after
 * the run. Child processes do not stash a container, so teardown is a no-op
 * in them.
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

/**
 * Env vars stamped by the first boot. All child processes inherit them and
 * use them to skip starting a second container.
 */
const ENV_DB_URL = "E2E_DB_URL"
const ENV_DB_DIRECT_URL = "E2E_DB_DIRECT_URL"

async function boot(): Promise<E2EDatabase> {
  // Cross-process guard: if a parent process already booted the container it
  // stamps E2E_DB_URL onto itself (inherited by all children). A child that
  // sees this var must NOT start a second container — the web server was
  // already started by the parent with the first container's URLs, and
  // seed.json was already written. Return the inherited URLs immediately.
  const inheritedUrl = process.env[ENV_DB_URL]
  const inheritedDirectUrl = process.env[ENV_DB_DIRECT_URL]
  if (inheritedUrl && inheritedDirectUrl) {
    return { databaseUrl: inheritedUrl, databaseDirectUrl: inheritedDirectUrl }
  }

  const result = await bootPostgres18()
  globalThis.__E2E_PG_CONTAINER__ = result.container

  const db: E2EDatabase = {
    databaseUrl: result.userUrl,
    databaseDirectUrl: result.adminUrl,
  }

  // Stamp both URLs onto this process so all child processes see them and
  // skip the boot. Must be set before any dynamic imports so the inherited
  // DATABASE_URL in children consistently points to this container.
  process.env[ENV_DB_URL] = db.databaseUrl
  process.env[ENV_DB_DIRECT_URL] = db.databaseDirectUrl

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
 * evaluated multiple times across multiple processes. Returns the connection
 * URLs to feed into `webServer.env`.
 */
export function bootAndSeedDatabase(): Promise<E2EDatabase> {
  globalThis.__E2E_DB__ ??= boot()
  return globalThis.__E2E_DB__
}

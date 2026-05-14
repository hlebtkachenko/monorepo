/**
 * Database client — postgres-js + Drizzle factory.
 *
 * Reads DATABASE_URL from environment. Exports `db` (the Drizzle instance),
 * `sqlClient` (the raw postgres-js client for migrations / admin), and the
 * `Db` type for use in helper signatures.
 *
 * `casing: 'snake_case'` means Drizzle translates camelCase column names in
 * query builders to snake_case SQL automatically. Schema files use snake_case
 * column names directly, so this is a belt-and-suspenders setting.
 *
 * On first use, a one-time startup probe checks that `app.app_user_role_name`
 * is set on the connecting role. This GUC is configured via `ALTER ROLE` in
 * `infra/compose/postgres/init.d/00-roles.sql`. If it is absent and the current
 * role is `app_user`, the last-owner-demotion trigger will fail closed on the
 * first workspace_membership write — see ADR-0010.
 */
import { drizzle } from "drizzle-orm/postgres-js"
import postgres from "postgres"
import * as schema from "./schema/index"

/**
 * DATABASE_URL is read lazily so consumers of this module can be imported
 * in build-time contexts (Next.js page-data collection, container image
 * builds) without DATABASE_URL being set. The throw is deferred to the
 * first SQL call — the moment a connection is actually attempted.
 */
function readDatabaseUrl(): string {
  const url = process.env["DATABASE_URL"]
  if (!url) {
    throw new Error("DATABASE_URL environment variable is required")
  }
  return url
}

let _sqlClient: ReturnType<typeof postgres> | null = null
function getSqlClient(): ReturnType<typeof postgres> {
  if (_sqlClient === null) {
    _sqlClient = postgres(readDatabaseUrl(), {
      max: 10,
      idle_timeout: 20,
      connect_timeout: 10,
    })
    fireProbeOnce()
  }
  return _sqlClient
}

// Proxy target must be a function for the `apply` trap to fire — postgres-js's
// client is a tagged-template callable (sqlClient`SELECT ...`).
export const sqlClient = new Proxy(
  function () {} as unknown as ReturnType<typeof postgres>,
  {
    get(_target, prop) {
      return Reflect.get(getSqlClient(), prop)
    },
    apply(_target, thisArg, argArray) {
      const client = getSqlClient() as unknown as (
        ...args: unknown[]
      ) => unknown
      return Reflect.apply(client, thisArg, argArray)
    },
  },
)

let _db: ReturnType<typeof drizzle<typeof schema>> | null = null
function getDb(): ReturnType<typeof drizzle<typeof schema>> {
  if (_db === null) {
    _db = drizzle(getSqlClient(), {
      schema,
      casing: "snake_case",
    })
  }
  return _db
}

export const db = new Proxy({} as ReturnType<typeof drizzle<typeof schema>>, {
  get(_target, prop) {
    return Reflect.get(getDb(), prop)
  },
})

export type Db = ReturnType<typeof drizzle<typeof schema>>

// ---------------------------------------------------------------------------
// Startup GUC probe — runs once, cached in module scope
// ---------------------------------------------------------------------------

/**
 * Roles that are allowed to connect without `app.app_user_role_name` being
 * set. The migration runner (app_owner) and the admin bypass role (app_admin)
 * do not need it; it is only required for the application role (app_user).
 */
const PROBE_SKIP_ROLES = new Set(["app_owner", "app_admin", "postgres"])

let startupProbePromise: Promise<void> | null = null

/**
 * One-time startup check: if the connecting role is `app_user` and
 * `app.app_user_role_name` is not set, throw with a clear remediation hint.
 *
 * The probe is cached in module scope so it fires exactly once per process,
 * regardless of how many callers await it. Subsequent awaits resolve
 * immediately from the cached promise.
 *
 * Skipped when running as app_owner, app_admin, or postgres (migration
 * runner and admin paths do not use this GUC).
 */
export function ensureStartupProbe(): Promise<void> {
  if (startupProbePromise !== null) {
    return startupProbePromise
  }
  startupProbePromise = runStartupProbe()
  return startupProbePromise
}

async function runStartupProbe(): Promise<void> {
  // Use a single-connection client for the probe; do not consume from the
  // main pool. The probe connection is closed after the check completes.
  const probeClient = postgres(readDatabaseUrl(), {
    max: 1,
    connect_timeout: 10,
  })
  try {
    const rows = await probeClient<
      Array<{ current_role: string; guc_value: string | null }>
    >`
      SELECT
        current_user AS current_role,
        NULLIF(current_setting('app.app_user_role_name', true), '') AS guc_value
    `
    const row = rows[0]
    if (!row) return

    const { current_role, guc_value } = row

    // Skip probe for privileged roles (migration runner, admin bypass, superuser).
    if (PROBE_SKIP_ROLES.has(current_role)) return

    // For app_user (or any other application role), the GUC must be set.
    if (!guc_value) {
      throw new Error(
        `app.app_user_role_name GUC is not set on the "${current_role}" role. ` +
          `Run infra/compose/postgres/init.d/00-roles.sql to configure it, or ` +
          `execute: ALTER ROLE ${current_role} SET app.app_user_role_name = '${current_role}'; ` +
          `See ADR-0010.`,
      )
    }
  } catch (err) {
    if (
      err instanceof Error &&
      err.message.includes("app.app_user_role_name GUC is not set")
    ) {
      // Re-throw configuration errors — these are actionable and must surface.
      throw err
    }
    // Connection errors (DB unreachable at startup) are logged as warnings
    // and do not crash the module import. The first real query will fail with
    // a clear connection error if the database is genuinely unavailable.
    console.warn(
      "[db/client] startup probe failed (DB unreachable?); continuing:",
      err instanceof Error ? err.message : String(err),
    )
  } finally {
    await probeClient.end({ timeout: 5 }).catch(() => {})
  }
}

// Fire the probe once on first db/sqlClient property access. We intentionally
// do NOT fire it eagerly at module import: this module is loaded in build-time
// contexts (Next.js page-data collection, container image builds) where
// DATABASE_URL is unset. Lazy firing keeps those builds green while still
// surfacing the GUC misconfiguration on the first real query.
let probeFired = false
function fireProbeOnce(): void {
  if (probeFired) return
  probeFired = true
  if (!process.env["DATABASE_URL"]) return
  void ensureStartupProbe()
}

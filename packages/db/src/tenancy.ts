/**
 * Tenancy helpers — withOrganization, withWorkspace, withAdminBypass.
 *
 * These are the ONLY entry points into organization-scoped or workspace-scoped
 * database operations. Raw `db.*` calls outside `packages/db/src/` are blocked
 * by the `workspace-rls/require-with-organization` ESLint rule.
 *
 * GUC `app.app_user_role_name` is set per role via init.d/00-roles.sql
 * (`ALTER ROLE app_user SET app.app_user_role_name = 'app_user'`). Runtime
 * helpers do not set it. Testcontainer environments must set it explicitly on
 * connection setup or the last-owner-demotion trigger will fail closed.
 *
 * GUC contract (ADR-0010):
 *   - Every GUC mutation uses `set_config(name, value, true)` (is_local = true).
 *     This is transaction-scoped and safe under pgBouncer transaction mode.
 *   - NULLIF guard: `NULLIF(current_setting('app.X', true), '')::uuid` in SQL
 *     policies. The runtime uses the parameterized `set_config` form, never
 *     string interpolation.
 *
 * Composability (nested helpers):
 *   - Pass `outerTx` to nest inside an existing transaction via SAVEPOINT.
 *   - Prior GUCs are snapshot-and-restored in `finally` because `set_config`
 *     with `is_local = true` is transaction-scoped, not SAVEPOINT-scoped.
 *     ROLLBACK TO SAVEPOINT does NOT undo `set_config`. The save/restore pair
 *     is load-bearing.
 *   - `withWorkspace` clears `app.organization_id` in nested calls to prevent
 *     workspace-tier reads from inheriting an org GUC set by an outer scope.
 *
 * pgBouncer safety:
 *   - All GUC sets use `set_config(name, value, true)`. No bare `SET`.
 *   - The ESLint `no-set-local-outside-wrapper` rule closes the escape hatch
 *     for consumer code.
 */

import { sql } from "drizzle-orm"
import type { ExtractTablesWithRelations } from "drizzle-orm"
import type { PgTransaction } from "drizzle-orm/pg-core"
import type { PostgresJsQueryResultHKT } from "drizzle-orm/postgres-js"
import { db } from "./client"
import type * as schema from "./schema/index"

// ---------------------------------------------------------------------------
// Branded transaction types (ADR-0010 §3.2)
// ---------------------------------------------------------------------------

/**
 * Unique symbols used as brand keys. Not exported as values; only the types
 * below are consumed by callers. The cast `tx as unknown as OrganizationBoundDb`
 * happens exactly once inside `withOrganization`, after all GUCs are set.
 */
export const organizationBrand: unique symbol = Symbol("OrganizationBound")
export const workspaceBrand: unique symbol = Symbol("WorkspaceBound")
export const adminBypassBrand: unique symbol = Symbol.for(
  "@workspace/db/adminBypassBrand",
)

type Schema = typeof schema
type FullSchema = ExtractTablesWithRelations<Schema>
export type AnyTx = PgTransaction<PostgresJsQueryResultHKT, Schema, FullSchema>

/**
 * Drizzle transaction handle with app.organization_id + app.workspace_id GUCs
 * set via SET LOCAL. Callers receive this brand only through `withOrganization`.
 * Assigning a raw `Db` to a function expecting `OrganizationBoundDb` is a
 * compile error: the intersection property at `organizationBrand` is absent.
 */
export type OrganizationBoundDb = AnyTx & { readonly [organizationBrand]: true }

/**
 * Drizzle transaction handle with app.workspace_id + app.user_id GUCs set via
 * SET LOCAL. Callers receive this brand only through `withWorkspace`.
 */
export type WorkspaceBoundDb = AnyTx & { readonly [workspaceBrand]: true }

/**
 * Drizzle transaction handle after `SET LOCAL ROLE app_admin`. Callers receive
 * this brand only through `withAdminBypass`. The brand prevents passing an
 * unscoped `Db` where an `AdminBypassDb` is expected.
 */
export type AdminBypassBound = { readonly [adminBypassBrand]: true }
export type AdminBypassDb = AnyTx & AdminBypassBound

// ---------------------------------------------------------------------------
// Internal GUC helpers
// ---------------------------------------------------------------------------

async function readGuc(tx: AnyTx, name: string): Promise<string | null> {
  const rows = (await tx.execute<{ value: string | null }>(
    sql`SELECT current_setting(${name}, true) AS value`,
  )) as unknown as Array<{ value: string | null }>
  const v = rows[0]?.value
  return v == null || v === "" ? null : v
}

async function restorePriorGucs(
  tx: AnyTx,
  prior: {
    orgId: string | null
    userId: string | null
    workspaceId: string | null
  },
): Promise<void> {
  await tx.execute(
    sql`SELECT set_config('app.organization_id', ${prior.orgId ?? ""}, true)`,
  )
  await tx.execute(
    sql`SELECT set_config('app.user_id', ${prior.userId ?? ""}, true)`,
  )
  await tx.execute(
    sql`SELECT set_config('app.workspace_id', ${prior.workspaceId ?? ""}, true)`,
  )
}

// ---------------------------------------------------------------------------
// withOrganization
// ---------------------------------------------------------------------------

/**
 * Run `fn` inside a transaction with `app.organization_id`, `app.user_id`,
 * and `app.workspace_id` set via SET LOCAL (transaction-scoped).
 *
 * `workspace_id` is derived from the organization row inside the same
 * transaction so workspace-tier RLS policies resolve correctly without the
 * caller needing a separate `withWorkspace` frame.
 *
 * Pass `outerTx` to nest inside an existing transaction (SAVEPOINT). Prior
 * GUCs are snapshot-and-restored in `finally`. Without `outerTx` a fresh
 * top-level transaction opens.
 *
 * Every tool handler, worker job, AI agent step, and server action that
 * touches organization-scoped data MUST go through this helper.
 *
 * Throws if the organization row is not found, so callers receive an explicit
 * signal rather than silently operating with no workspace_id GUC.
 */
export async function withOrganization<T>(
  organizationId: string,
  userId: string | null,
  fn: (db: OrganizationBoundDb) => Promise<T>,
  outerTx?: AnyTx,
): Promise<T> {
  const runner = outerTx ?? db
  const composed = outerTx !== undefined
  return await runner.transaction(async (tx) => {
    const prior = composed
      ? {
          orgId: await readGuc(tx, "app.organization_id"),
          userId: await readGuc(tx, "app.user_id"),
          workspaceId: await readGuc(tx, "app.workspace_id"),
        }
      : null
    try {
      await tx.execute(
        sql`SELECT set_config('app.organization_id', ${organizationId}, true)`,
      )
      if (userId) {
        await tx.execute(sql`SELECT set_config('app.user_id', ${userId}, true)`)
      }

      // Derive parent workspace_id from the organization row so workspace-tier
      // RLS policies resolve inside the org-bound tx without a separate
      // withWorkspace frame.
      const wsRows = (await tx.execute<{ workspace_id: string | null }>(
        sql`SELECT workspace_id FROM organization WHERE id = ${organizationId}::uuid`,
      )) as unknown as Array<{ workspace_id: string | null }>
      if (!wsRows[0]) {
        throw new Error(
          `withOrganization: organization not found: ${organizationId}`,
        )
      }
      const workspaceId = wsRows[0].workspace_id
      if (workspaceId) {
        await tx.execute(
          sql`SELECT set_config('app.workspace_id', ${workspaceId}, true)`,
        )
      }

      return await fn(tx as unknown as OrganizationBoundDb)
    } finally {
      if (prior) {
        await restorePriorGucs(tx, prior)
      }
    }
  })
}

// ---------------------------------------------------------------------------
// withWorkspace
// ---------------------------------------------------------------------------

/**
 * Run `fn` inside a transaction with `app.workspace_id` + `app.user_id` set
 * via SET LOCAL. Mirror of `withOrganization` for workspace-tier operations:
 * workspace settings, billing, cross-org audit dashboards.
 *
 * Does NOT touch `app.organization_id` for new calls, but CLEARS it in nested
 * calls (when `outerTx` is provided): if an outer scope set `app.organization_id`,
 * inheriting it silently would narrow workspace-tier reads to the wrong scope.
 * The prior value is captured and restored in `finally`.
 *
 * Pass `outerTx` to nest inside an existing transaction (SAVEPOINT).
 */
export async function withWorkspace<T>(
  workspaceId: string,
  userId: string,
  fn: (db: WorkspaceBoundDb) => Promise<T>,
  outerTx?: AnyTx,
): Promise<T> {
  const runner = outerTx ?? db
  const composed = outerTx !== undefined
  return await runner.transaction(async (tx) => {
    const prior = composed
      ? {
          orgId: await readGuc(tx, "app.organization_id"),
          userId: await readGuc(tx, "app.user_id"),
          workspaceId: await readGuc(tx, "app.workspace_id"),
        }
      : null
    try {
      await tx.execute(
        sql`SELECT set_config('app.workspace_id', ${workspaceId}, true)`,
      )
      await tx.execute(sql`SELECT set_config('app.user_id', ${userId}, true)`)

      // Clear any inherited app.organization_id from an outer scope. Workspace-
      // tier reads must not be accidentally narrowed by an org GUC. The prior
      // value is restored in finally via restorePriorGucs.
      if (composed) {
        await tx.execute(
          sql`SELECT set_config('app.organization_id', '', true)`,
        )
      }

      return await fn(tx as unknown as WorkspaceBoundDb)
    } finally {
      if (prior) {
        await restorePriorGucs(tx, prior)
      }
    }
  })
}

// ---------------------------------------------------------------------------
// withAdminBypass
// ---------------------------------------------------------------------------

/** Validates that a role name is safe to interpolate into SET LOCAL ROLE. */
function assertSafeRoleName(name: string): void {
  if (!/^[a-z_][a-z0-9_]*$/i.test(name)) {
    throw new Error(
      `withAdminBypass: unsafe role name in restore path: "${name}"`,
    )
  }
}

/**
 * BYPASSRLS escape hatch for cross-organization admin operations.
 *
 * Opens a transaction and switches to the `app_admin` BYPASSRLS role for the
 * duration of `fn`. `SET LOCAL ROLE` scopes the role change to the transaction
 * only, so pgBouncer pool checkouts cannot leak the elevated role.
 *
 * When composed inside an outer `withOrganization`/`withWorkspace`, the prior
 * role is captured before the switch and restored in `finally`. SET LOCAL ROLE
 * is transaction-scoped, but in a SAVEPOINT context the outer transaction still
 * holds the elevated role until `finally` restores it.
 *
 * Callers are narrow by design:
 *   1. Organization-switcher bootstrap (listOrganizationsForUser) before any
 *      organization context is bound.
 *   2. Invite-token consume path (acceptInvite) which looks up a token by hash
 *      across organizations.
 *   3. Admin console mutations that must bypass RLS (impersonation records,
 *      workspace owner insertions).
 *
 * The migration chain grants `app_admin` TO `app_user` in 0002_auth.sql so
 * `app_user` can assume the role without needing to log in separately.
 *
 * Pass `outerTx` to nest inside an existing transaction (SAVEPOINT).
 */
export async function withAdminBypass<T>(
  fn: (db: AdminBypassDb) => Promise<T>,
  outerTx?: AnyTx,
): Promise<T> {
  const runner = outerTx ?? db
  const composed = outerTx !== undefined
  return await runner.transaction(async (tx) => {
    // Probe whether the current login role holds app_admin before attempting
    // SET LOCAL ROLE. A failing SET ROLE aborts the transaction and poisons
    // every subsequent statement; the defensive probe avoids that.
    const probe = await tx.execute<{ has: boolean }>(
      sql`SELECT pg_has_role(current_user, 'app_admin', 'MEMBER') AS has`,
    )
    const row = (probe as unknown as Array<{ has: boolean }>)[0]
    if (!row?.has) {
      // Fail loudly: running tenant-unscoped admin queries under FORCE RLS
      // without BYPASSRLS returns zero rows silently and every caller treats
      // that as "not found". Require the grant.
      throw new Error(
        "withAdminBypass: current role lacks MEMBER on app_admin. Apply migration 0002_auth.sql or grant app_admin to the application role.",
      )
    }

    // Capture prior role when composed so we can restore after fn completes.
    // SET LOCAL ROLE is transaction-scoped, but in a nested SAVEPOINT the outer
    // transaction keeps the elevated role until we restore it explicitly.
    const priorRole = composed
      ? ((
          (await tx.execute<{ current_user: string }>(
            sql`SELECT current_user`,
          )) as unknown as Array<{ current_user: string }>
        )[0]?.current_user ?? null)
      : null

    try {
      await tx.execute(sql`SET LOCAL ROLE app_admin`)
      return await fn(tx as unknown as AdminBypassDb)
    } finally {
      if (priorRole) {
        assertSafeRoleName(priorRole)
        await tx.execute(sql`SET LOCAL ROLE ${sql.raw(priorRole)}`)
      }
    }
  })
}

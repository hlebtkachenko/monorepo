/**
 * App user role split — RLS enforcement under the app_user connection.
 *
 * Audit #4 (ADR-0010 role split, plan task B1): web + admin containers
 * authenticate to RDS as `app_user` (LOGIN, RLS applies) instead of
 * `app_owner` (SUPERUSER, bypasses RLS). This test pins the four invariants
 * that the role split relies on:
 *
 *   1. `app_user` has MEMBER on `app_admin`.
 *      Migration `0002_auth.sql` runs `GRANT app_admin TO app_user`. Without
 *      this grant, `withAdminBypass` (which does `SET LOCAL ROLE app_admin`
 *      from inside an `app_user` session) raises `permission denied to set
 *      role "app_admin"` and the admin-elevation path is broken.
 *
 *   2. A SELECT on a tenant-scoped table without the `app.organization_id`
 *      GUC bound returns zero rows.
 *      Confirms that FORCE RLS bites for `app_user` — the policy expression
 *      `organization_id = NULLIF(current_setting('app.organization_id',
 *      true), '')::uuid` resolves to NULL and the row is filtered out.
 *      A regression here (e.g. accidentally connecting as `app_owner`) would
 *      let cross-tenant reads through silently.
 *
 *   3. INSERT into a tenant-scoped table without `app.organization_id` bound
 *      fails with the WITH CHECK violation.
 *      Symmetric to the SELECT case for the write surface.
 *
 *   4. `withAdminBypass` flips `current_user` to `app_admin` and
 *      `pg_has_role(current_user, 'app_admin', 'MEMBER')` returns TRUE
 *      inside the callback.
 *      End-to-end proof that the BYPASSRLS escape hatch survives the role
 *      split — cross-organization admin queries still work when the inbound
 *      session is `app_user`.
 *
 * The test connects directly as `app_user` via `userClient()` and seeds
 * fixtures as `app_owner` via `adminClient()` (which still bypasses RLS in
 * the testcontainer because that role is SUPERUSER there — identical
 * topology to production once the dual-user pgbouncer split lands).
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest"
import postgres from "postgres"
import { sql } from "drizzle-orm"
import {
  adminClient,
  seedTwoOrganizations,
  seedToolCallLog,
  truncateAll,
  userClient,
} from "./fixtures.js"
import { withAdminBypass } from "../src/tenancy.js"

let adminSql: postgres.Sql
let userSql: postgres.Sql

beforeAll(async () => {
  adminSql = adminClient()
  userSql = userClient()
})

afterAll(async () => {
  await truncateAll(adminSql)
  await adminSql.end({ timeout: 5 })
  await userSql.end({ timeout: 5 })
})

describe("app_user role split — connection identity + grant chain", () => {
  it("the test fixture really connects as app_user (not app_owner)", async () => {
    const rows = (await userSql.unsafe(
      `SELECT current_user, session_user`,
    )) as unknown as Array<{ current_user: string; session_user: string }>
    expect(rows[0]?.current_user).toBe("app_user")
    expect(rows[0]?.session_user).toBe("app_user")
  })

  it("app_user has MEMBER on app_admin (migration 0002_auth.sql:280-286 grant)", async () => {
    // Probe with an explicit role name (not current_user) so the assertion
    // also documents the migration-time grant. If 0002_auth.sql ever drops
    // the GRANT, this test fails immediately and surfaces the regression.
    const rows = (await adminSql.unsafe(
      `SELECT pg_has_role('app_user', 'app_admin', 'MEMBER') AS has`,
    )) as unknown as Array<{ has: boolean }>
    expect(rows[0]?.has).toBe(true)
  })

  it("inside an app_user session, pg_has_role(current_user, 'app_admin', 'MEMBER') is TRUE", async () => {
    // The probe withAdminBypass runs before SET LOCAL ROLE. If this returns
    // FALSE, withAdminBypass raises 'current role lacks MEMBER on app_admin'
    // and the entire admin-elevation flow breaks for runtime traffic.
    const rows = (await userSql.unsafe(
      `SELECT pg_has_role(current_user, 'app_admin', 'MEMBER') AS has`,
    )) as unknown as Array<{ has: boolean }>
    expect(rows[0]?.has).toBe(true)
  })
})

describe("app_user role split — RLS enforcement on a tenant-scoped table", () => {
  let orgAId: string
  let logAId: string

  beforeAll(async () => {
    const seed = await seedTwoOrganizations(adminSql)
    orgAId = seed.orgAId
    logAId = await seedToolCallLog(adminSql, orgAId)
    // Silence unused-let warning while keeping logAId in scope for the next
    // assertion's narrative.
    expect(logAId).toBeTruthy()
  })

  it("SELECT without app.organization_id returns zero rows (RLS bites)", async () => {
    // Open a fresh transaction with NO GUC set. Under app_owner (SUPERUSER)
    // every row would be returned. Under app_user with FORCE RLS the
    // policy expression resolves to NULL and the row is filtered out.
    const visible = await userSql.begin(async (tx) => {
      const rows = (await tx.unsafe(
        `SELECT id FROM tool_call_log`,
      )) as unknown as Array<{ id: string }>
      return rows
    })
    expect(visible).toHaveLength(0)
  })

  it("SELECT with a wrong app.organization_id returns zero rows", async () => {
    // Defense-in-depth: seeded a tool_call_log for org A; query under a
    // session bound to a random non-matching organization id and confirm
    // the row is not returned.
    const otherOrg = "00000000-0000-7000-8000-000000000000"
    const visible = await userSql.begin(async (tx) => {
      await tx.unsafe(
        `SELECT set_config('app.organization_id', '${otherOrg}', true)`,
      )
      const rows = (await tx.unsafe(
        `SELECT id FROM tool_call_log`,
      )) as unknown as Array<{ id: string }>
      return rows
    })
    expect(visible).toHaveLength(0)
  })

  it("SELECT with the correct app.organization_id returns the row (policy positive case)", async () => {
    // Sanity check: prove the RLS policy is not blanket-rejecting under
    // app_user. With the GUC matching the seeded org, the row IS visible.
    const visible = await userSql.begin(async (tx) => {
      await tx.unsafe(
        `SELECT set_config('app.organization_id', '${orgAId}', true)`,
      )
      const rows = (await tx.unsafe(
        `SELECT id FROM tool_call_log`,
      )) as unknown as Array<{ id: string }>
      return rows
    })
    expect(visible).toHaveLength(1)
    expect(visible[0]?.id).toBe(logAId)
  })

  it("INSERT without app.organization_id is rejected by WITH CHECK", async () => {
    // Try to write a tool_call_log row from an app_user session without the
    // GUC bound. RLS WITH CHECK on organization_isolation must reject it.
    // (The append-only BEFORE INSERT trigger is also in play but the WITH
    // CHECK fires first. Either layer rejecting is correctness; the test
    // simply asserts that the INSERT does NOT succeed.)
    await expect(
      userSql.begin(async (tx) => {
        await tx.unsafe(
          `INSERT INTO tool_call_log (organization_id, tool_name, idempotency_key, actor_kind, input_json)
           VALUES ('${orgAId}'::uuid, 'rls_probe', 'rls-probe-${Date.now()}', 'human', '{}'::jsonb)`,
        )
      }),
    ).rejects.toThrow()
  })
})

describe("app_user role split — withAdminBypass elevation path", () => {
  it("SET LOCAL ROLE app_admin succeeds from an app_user connection", async () => {
    // Direct (non-Drizzle) probe of the role-switch primitive that
    // withAdminBypass relies on. Pre-flight check before exercising the
    // full helper below.
    const observed = await userSql.begin(async (tx) => {
      await tx.unsafe(`SET LOCAL ROLE app_admin`)
      const rows = (await tx.unsafe(
        `SELECT current_user`,
      )) as unknown as Array<{ current_user: string }>
      return rows[0]?.current_user ?? null
    })
    expect(observed).toBe("app_admin")
  })

  it("withAdminBypass via the runtime helper flips current_user and unlocks BYPASSRLS", async () => {
    // The runtime helper uses the global drizzle client (DATABASE_URL → app_user
    // in this test environment, set by globalSetup). Confirm end-to-end that
    // pg_has_role(current_user, 'app_admin', 'MEMBER') is TRUE inside the
    // callback — the exact assertion that withAdminBypass's pre-flight probe
    // also runs.
    const observed = await withAdminBypass(async (boundDb) => {
      const rows = (await boundDb.execute<{
        current_user: string
        has: boolean
      }>(
        sql`SELECT current_user, pg_has_role(current_user, 'app_admin', 'MEMBER') AS has`,
      )) as unknown as Array<{ current_user: string; has: boolean }>
      return rows[0] ?? null
    })

    expect(observed).not.toBeNull()
    expect(observed?.current_user).toBe("app_admin")
    expect(observed?.has).toBe(true)
  })
})

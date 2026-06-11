/**
 * RLS cross-organization leak harness.
 *
 * Verifies that every ORGANIZATION_SCOPED_TABLE enforces isolation:
 *   - Rows belonging to org A are not visible to a session scoped to org B
 *   - INSERT WITH CHECK prevents writing rows with a foreign organization_id
 *   - Empty-string GUC (NULLIF guard) returns zero rows instead of casting error
 *
 * Known bypass surface (documented; deferred to Section 4):
 *   Destructure-rename of the db import (`import { db as myDb }`) bypasses
 *   the no-raw-db ESLint rule but is caught by require-with-organization.
 *   The rule test files document this gap.
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { ORGANIZATION_SCOPED_TABLES } from "../src/policies/rls.js"
import {
  adminClient,
  seedApiKey,
  seedTwoOrganizations,
  seedToolCallLog,
  truncateAll,
} from "./fixtures.js"
import postgres from "postgres"

// Each test uses the admin client for seeding, then re-connects as app_user
// for assertions (RLS applies on the app_user connection).

let adminSql: postgres.Sql
let userSql: postgres.Sql

beforeAll(async () => {
  adminSql = adminClient()
  // user client connects as app_user — RLS applies
  const userUrl = process.env["DATABASE_URL"]
  if (!userUrl) throw new Error("DATABASE_URL not set")
  userSql = postgres(userUrl, { prepare: false, max: 1, onnotice: () => {} })
})

afterAll(async () => {
  await truncateAll(adminSql)
  await adminSql.end({ timeout: 5 })
  await userSql.end({ timeout: 5 })
})

describe("RLS cross-organization isolation", () => {
  it("ORGANIZATION_SCOPED_TABLES matches pg_policies (drift detector)", async () => {
    // Real drift detector: compares the in-code list against the actual
    // `organization_isolation` policies present in the live database.
    // If a migration adds a new organization-scoped table but forgets to
    // update ORGANIZATION_SCOPED_TABLES, this test fails.
    const policies = await adminSql<Array<{ tablename: string }>>`
      SELECT tablename FROM pg_policies
      WHERE policyname = 'organization_isolation'
      ORDER BY tablename
    `
    const dbTables = new Set(policies.map((r) => r.tablename))
    const codeTables = new Set(ORGANIZATION_SCOPED_TABLES)
    expect(dbTables).toEqual(codeTables)
  })

  describe("tool_call_log isolation", () => {
    let orgAId: string
    let orgBId: string
    let logAId: string

    beforeAll(async () => {
      const seed = await seedTwoOrganizations(adminSql)
      orgAId = seed.orgAId
      orgBId = seed.orgBId

      // Seed a tool_call_log row for org A only
      logAId = await seedToolCallLog(adminSql, orgAId)
    })

    it("org A session sees org A rows", async () => {
      const rows = await userSql.begin(async (tx) => {
        await tx.unsafe(
          `SELECT set_config('app.organization_id', '${orgAId}', true)`,
        )
        return tx.unsafe<Array<{ id: string }>>(
          `SELECT id FROM tool_call_log WHERE id = '${logAId}'::uuid`,
        )
      })
      const ids = rows.map((r) => r.id)
      expect(ids).toContain(logAId)
    })

    it("org B session sees zero rows for org A data", async () => {
      const rows = await userSql.begin(async (tx) => {
        await tx.unsafe(
          `SELECT set_config('app.organization_id', '${orgBId}', true)`,
        )
        return tx.unsafe<Array<{ id: string }>>(
          `SELECT id FROM tool_call_log WHERE id = '${logAId}'::uuid`,
        )
      })
      const ids = rows.map((r) => r.id).filter((id) => id === logAId)
      expect(ids).toHaveLength(0)
    })

    it("empty GUC returns zero rows (NULLIF guard)", async () => {
      // set_config with '' — NULLIF converts to NULL — policy evaluates to NULL
      // (no match), not a UUID cast error.
      const rows = await userSql.begin(async (tx) => {
        await tx.unsafe(`SELECT set_config('app.organization_id', '', true)`)
        return tx.unsafe<Array<{ id: string }>>(`SELECT id FROM tool_call_log`)
      })
      expect(rows).toHaveLength(0)
    })

    it("WITH CHECK blocks INSERT with foreign org_id", async () => {
      // Connect as app_user, scope to org B, try to insert with org A's ID.
      // UUIDs are controlled values from the test seed, not user input.
      await expect(
        userSql.begin(async (tx) => {
          await tx.unsafe(
            `SELECT set_config('app.organization_id', '${orgBId}', true)`,
          )
          await tx.unsafe(
            `INSERT INTO tool_call_log (organization_id, tool_name, idempotency_key, actor_kind, input_json)
             VALUES ('${orgAId}'::uuid, 'leak_test', 'leak-key-1', 'human', '{}')`,
          )
        }),
      ).rejects.toThrow(/row-level security/)
    })
  })

  describe("api_key isolation", () => {
    // api_key rows hold credential hashes — a cross-org leak here is
    // credential disclosure, the worst-case RLS failure. T7: behavioral
    // coverage for the 3rd ORGANIZATION_SCOPED_TABLE (the harness already
    // exercises organization + tool_call_log).
    let workspaceId: string
    let orgAId: string
    let orgBId: string
    let keyAId: string

    beforeAll(async () => {
      const seed = await seedTwoOrganizations(adminSql)
      workspaceId = seed.workspaceId
      orgAId = seed.orgAId
      orgBId = seed.orgBId
      keyAId = await seedApiKey(adminSql, orgAId, workspaceId)
    })

    it("org A session sees org A's key", async () => {
      const rows = await userSql.begin(async (tx) => {
        await tx.unsafe(
          `SELECT set_config('app.organization_id', '${orgAId}', true)`,
        )
        return tx.unsafe<Array<{ id: string }>>(
          `SELECT id FROM api_key WHERE id = '${keyAId}'::uuid`,
        )
      })
      expect(rows.map((r) => r.id)).toContain(keyAId)
    })

    it("org B session sees zero rows for org A's key (SELECT leak)", async () => {
      const rows = await userSql.begin(async (tx) => {
        await tx.unsafe(
          `SELECT set_config('app.organization_id', '${orgBId}', true)`,
        )
        return tx.unsafe<Array<{ id: string }>>(`SELECT id FROM api_key`)
      })
      expect(rows.filter((r) => r.id === keyAId)).toHaveLength(0)
    })

    it("org B session cannot UPDATE org A's key (row invisible, 0 affected)", async () => {
      const updated = await userSql.begin(async (tx) => {
        await tx.unsafe(
          `SELECT set_config('app.organization_id', '${orgBId}', true)`,
        )
        return tx.unsafe<Array<{ id: string }>>(
          `UPDATE api_key SET revoked_at = now()
           WHERE id = '${keyAId}'::uuid
           RETURNING id`,
        )
      })
      expect(updated).toHaveLength(0)

      // The row is untouched — verify via the admin client (bypasses RLS).
      const [row] = await adminSql<Array<{ revoked_at: string | null }>>`
        SELECT revoked_at FROM api_key WHERE id = ${keyAId}::uuid
      `
      expect(row?.revoked_at).toBeNull()
    })

    it("org B session cannot DELETE org A's key (row invisible, 0 affected)", async () => {
      const deleted = await userSql.begin(async (tx) => {
        await tx.unsafe(
          `SELECT set_config('app.organization_id', '${orgBId}', true)`,
        )
        return tx.unsafe<Array<{ id: string }>>(
          `DELETE FROM api_key WHERE id = '${keyAId}'::uuid RETURNING id`,
        )
      })
      expect(deleted).toHaveLength(0)

      const [row] = await adminSql<Array<{ id: string }>>`
        SELECT id FROM api_key WHERE id = ${keyAId}::uuid
      `
      expect(row?.id).toBe(keyAId)
    })

    it("empty GUC returns zero rows (NULLIF guard)", async () => {
      const rows = await userSql.begin(async (tx) => {
        await tx.unsafe(`SELECT set_config('app.organization_id', '', true)`)
        return tx.unsafe<Array<{ id: string }>>(`SELECT id FROM api_key`)
      })
      expect(rows).toHaveLength(0)
    })

    it("WITH CHECK blocks INSERT with foreign org_id", async () => {
      // Scope to org B, try to plant a key under org A.
      await expect(
        userSql.begin(async (tx) => {
          await tx.unsafe(
            `SELECT set_config('app.organization_id', '${orgBId}', true)`,
          )
          await tx.unsafe(
            `INSERT INTO api_key (organization_id, workspace_id, name, prefix, key_hash)
             VALUES ('${orgAId}'::uuid, '${workspaceId}'::uuid, 'leak-key', 'affk_test_leak', 'leak-hash-${Date.now()}')`,
          )
        }),
      ).rejects.toThrow(/row-level security/)
    })
  })

  describe("organization table isolation", () => {
    let orgAId: string
    let orgBId: string

    beforeAll(async () => {
      // Re-seed in case truncateAll ran
      try {
        const seed = await seedTwoOrganizations(adminSql)
        orgAId = seed.orgAId
        orgBId = seed.orgBId
      } catch {
        // May already exist from previous describe block
        const rows = await adminSql<Array<{ id: string }>>`
          SELECT id FROM organization ORDER BY created_at LIMIT 2
        `
        orgAId = rows[0]?.id ?? ""
        orgBId = rows[1]?.id ?? ""
      }
    })

    it("org A session sees only org A row", async () => {
      const rows = await userSql.begin(async (tx) => {
        await tx.unsafe(
          `SELECT set_config('app.organization_id', '${orgAId}', true)`,
        )
        return tx.unsafe<Array<{ id: string }>>(`SELECT id FROM organization`)
      })
      // Should see only org A's row
      expect(rows.some((r) => r.id === orgAId)).toBe(true)
      expect(rows.every((r) => r.id !== orgBId)).toBe(true)
    })
  })
})

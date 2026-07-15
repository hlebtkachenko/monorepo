/**
 * Audit append-only enforcement.
 *
 * Verifies Layer 2 (BEFORE row triggers) and Layer 3 (TRUNCATE triggers)
 * on tool_call_log and audit_event. All three layers are documented in
 * 0004_audit.sql — this test suite covers Layers 2 and 3.
 *
 * Layer 1 (REVOKE DELETE/TRUNCATE from app_user) is today a no-op because
 * app_user inherits app_admin grants via GRANT app_admin TO app_user. The
 * trigger enforcement (Layers 2+3) is the authoritative defense.
 *
 * Tests run as superuser (admin client) because the triggers fire for ALL
 * roles including app_admin. Testing as app_user would add RLS complexity
 * without testing the trigger behavior differently.
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { adminClient, seedTwoOrganizations, truncateAll } from "./fixtures.js"
import postgres from "postgres"

let sql: postgres.Sql
let orgAId: string
let workspaceId: string
let periodId: string

beforeAll(async () => {
  sql = adminClient()
  const seed = await seedTwoOrganizations(sql)
  orgAId = seed.orgAId
  workspaceId = seed.workspaceId
  const [period] = await sql<Array<{ id: string }>>`
    INSERT INTO accounting_period (
      organization_id, period_start, period_end, regime_code, accounting_currency
    )
    VALUES (${orgAId}::uuid, '2090-01-01', '2090-12-31', 'DOUBLE_ENTRY', 'CZK')
    RETURNING id
  `
  if (!period) throw new Error("Failed to seed accounting period")
  periodId = period.id
})

afterAll(async () => {
  await truncateAll(sql)
  await sql.end({ timeout: 5 })
})

async function seedLog(orgId: string): Promise<string> {
  const [row] = await sql<Array<{ id: string }>>`
    INSERT INTO tool_call_log (organization_id, tool_name, idempotency_key, actor_kind, input_json)
    VALUES (
      ${orgId}::uuid,
      'audit_test_tool',
      ${"key-" + Math.random().toString(36).slice(2)},
      'human',
      '{"x": 1}'::jsonb
    )
    RETURNING id
  `
  if (!row) throw new Error("Failed to seed tool_call_log")
  return row.id
}

async function seedAuditEvent(wsId: string): Promise<string> {
  const [row] = await sql<Array<{ id: string }>>`
    INSERT INTO audit_event (workspace_id, action, payload)
    VALUES (${wsId}::uuid, 'test.action', '{"key": "val"}'::jsonb)
    RETURNING id
  `
  if (!row) throw new Error("Failed to seed audit_event")
  return row.id
}

describe("tool_call_log append-only", () => {
  it("blocks DELETE with check_violation", async () => {
    const id = await seedLog(orgAId)
    await expect(
      sql.unsafe(`DELETE FROM tool_call_log WHERE id = '${id}'::uuid`),
    ).rejects.toThrow(/check_violation|append-only/i)
  })

  it("blocks UPDATE of immutable columns (organization_id) with check_violation", async () => {
    const id = await seedLog(orgAId)
    await expect(
      sql.unsafe(
        `UPDATE tool_call_log SET tool_name = 'mutated' WHERE id = '${id}'::uuid`,
      ),
    ).rejects.toThrow(/check_violation|immutable/i)
  })

  it("blocks UPDATE of immutable period_id with check_violation", async () => {
    const id = await seedLog(orgAId)
    await expect(
      sql.unsafe(
        `UPDATE tool_call_log SET period_id = '${periodId}'::uuid WHERE id = '${id}'::uuid`,
      ),
    ).rejects.toThrow(/check_violation|immutable/i)
  })

  it("allows UPDATE of output_json (limited-update contract)", async () => {
    const id = await seedLog(orgAId)
    // output_json is in the allow-list — should succeed
    await expect(
      sql.unsafe(
        `UPDATE tool_call_log SET output_json = '{"result": true}'::jsonb WHERE id = '${id}'::uuid`,
      ),
    ).resolves.not.toThrow()
  })

  it("allows UPDATE of auto_applied (limited-update contract)", async () => {
    const id = await seedLog(orgAId)
    await expect(
      sql.unsafe(
        `UPDATE tool_call_log SET auto_applied = true WHERE id = '${id}'::uuid`,
      ),
    ).resolves.not.toThrow()
  })

  it("allows UPDATE of rationale (limited-update contract)", async () => {
    const id = await seedLog(orgAId)
    await expect(
      sql.unsafe(
        `UPDATE tool_call_log SET rationale = 'adjusted' WHERE id = '${id}'::uuid`,
      ),
    ).resolves.not.toThrow()
  })

  it("blocks TRUNCATE (Layer 3)", async () => {
    await expect(sql.unsafe(`TRUNCATE tool_call_log`)).rejects.toThrow(
      /append-only|feature_not_supported/i,
    )
  })
})

describe("audit_event append-only", () => {
  it("blocks UPDATE with check_violation", async () => {
    const id = await seedAuditEvent(workspaceId)
    await expect(
      sql.unsafe(
        `UPDATE audit_event SET action = 'mutated' WHERE id = '${id}'::uuid`,
      ),
    ).rejects.toThrow(/check_violation|append-only/i)
  })

  it("blocks DELETE with check_violation", async () => {
    const id = await seedAuditEvent(workspaceId)
    await expect(
      sql.unsafe(`DELETE FROM audit_event WHERE id = '${id}'::uuid`),
    ).rejects.toThrow(/check_violation|append-only/i)
  })

  it("blocks TRUNCATE (Layer 3)", async () => {
    await expect(sql.unsafe(`TRUNCATE audit_event`)).rejects.toThrow(
      /append-only|feature_not_supported/i,
    )
  })
})

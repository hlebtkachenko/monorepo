/**
 * RLS + cross-tier isolation for the Directories party foundation (0082/0083).
 *
 * Two guarantees under test:
 *   1. party_relationship (org-tier) obeys organization_isolation — org B cannot
 *      see or plant org A's relationships.
 *   2. The cross-tier FK lock holds: an org in workspace W1 cannot attach a
 *      relationship to a counterparty that lives in a DIFFERENT workspace W2. The
 *      two composite FKs sharing workspace_id make the forged reference fail the
 *      counterparty(id, workspace_id) target.
 *   3. party_address (workspace-tier child) obeys the 4 command policies — a row
 *      in workspace W1 is invisible + un-writable from workspace W2.
 *
 * Admin client seeds across tenants (RLS bypass); app_user client verifies RLS.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { adminClient, seedTwoOrganizations, truncateAll } from "./fixtures.js"
import type postgres from "postgres"
import { userClient } from "./fixtures.js"

let adminSql: postgres.Sql
let userSql: postgres.Sql

let workspaceA: string
let workspaceB: string
let orgAId: string
let orgBId: string
let counterpartyA: string // in workspace A
let counterpartyB: string // in workspace B
let relationshipAId: string
let addressAId: string

beforeAll(async () => {
  adminSql = adminClient()
  userSql = userClient()

  const seed = await seedTwoOrganizations(adminSql)
  workspaceA = seed.workspaceId
  orgAId = seed.orgAId
  orgBId = seed.orgBId

  // A counterparty in workspace A + a second workspace with its own counterparty.
  const [cpA] = await adminSql<Array<{ id: string }>>`
    INSERT INTO counterparty (workspace_id, name)
    VALUES (${workspaceA}, 'Party in WS A') RETURNING id`
  counterpartyA = cpA!.id

  const [wsB] = await adminSql<Array<{ id: string }>>`
    INSERT INTO workspace (display_name, created_by_user_id)
    VALUES ('Workspace B', ${seed.userAId}) RETURNING id`
  workspaceB = wsB!.id
  const [cpB] = await adminSql<Array<{ id: string }>>`
    INSERT INTO counterparty (workspace_id, name)
    VALUES (${workspaceB}, 'Party in WS B') RETURNING id`
  counterpartyB = cpB!.id

  // org A's relationship to its own party, and an address on that party.
  const [rel] = await adminSql<Array<{ id: string }>>`
    INSERT INTO party_relationship (organization_id, workspace_id, counterparty_id, relationship_type)
    VALUES (${orgAId}, ${workspaceA}, ${counterpartyA}, 'SUPPLIER') RETURNING id`
  relationshipAId = rel!.id
  const [addr] = await adminSql<Array<{ id: string }>>`
    INSERT INTO party_address (workspace_id, counterparty_id, purpose)
    VALUES (${workspaceA}, ${counterpartyA}, 'REGISTERED') RETURNING id`
  addressAId = addr!.id
})

afterAll(async () => {
  // Scope deletes to THIS test's workspaces — the container is shared across
  // db test files, so a global DELETE FROM counterparty would trip FK refs from
  // other files' accounting_event/open_item rows. truncateAll (replica role,
  // FK off) then clears the workspaces/orgs/users.
  const mine = [workspaceA, workspaceB]
  await adminSql`DELETE FROM party_relationship WHERE workspace_id = ANY(${mine}::uuid[])`
  await adminSql`DELETE FROM party_address WHERE workspace_id = ANY(${mine}::uuid[])`
  await adminSql`DELETE FROM party_bank_account WHERE workspace_id = ANY(${mine}::uuid[])`
  await adminSql`DELETE FROM party_contact WHERE workspace_id = ANY(${mine}::uuid[])`
  await adminSql`DELETE FROM party_identifier WHERE workspace_id = ANY(${mine}::uuid[])`
  await adminSql`DELETE FROM counterparty WHERE workspace_id = ANY(${mine}::uuid[])`
  await truncateAll(adminSql)
  await adminSql.end({ timeout: 5 })
  await userSql.end({ timeout: 5 })
})

describe("party_relationship — org isolation", () => {
  it("hides org A's relationship from org B (SELECT)", async () => {
    const rows = await userSql.begin(async (tx) => {
      await tx.unsafe(
        `SELECT set_config('app.organization_id', '${orgBId}', true)`,
      )
      return (await tx.unsafe(
        `SELECT id FROM party_relationship WHERE id = '${relationshipAId}'`,
      )) as unknown as Array<{ id: string }>
    })
    expect(rows).toHaveLength(0)
  })

  it("blocks INSERT with a foreign organization_id (WITH CHECK)", async () => {
    await expect(
      userSql.begin(async (tx) => {
        await tx.unsafe(
          `SELECT set_config('app.organization_id', '${orgBId}', true)`,
        )
        await tx.unsafe(
          `INSERT INTO party_relationship (organization_id, workspace_id, counterparty_id)
           VALUES ('${orgAId}'::uuid, '${workspaceA}'::uuid, '${counterpartyA}'::uuid)`,
        )
      }),
    ).rejects.toThrow(/row-level security/)
  })
})

describe("party_relationship — cross-tier FK lock", () => {
  it("cannot attach a relationship to a counterparty in another workspace", async () => {
    // org A (workspace A) tries to reference counterparty B (workspace B). The
    // organization_isolation WITH CHECK passes (org matches), but the composite FK
    // (counterparty_id, workspace_id) -> counterparty(id, workspace_id) finds no
    // (counterparty_B, workspace_A) row → foreign key violation.
    await expect(
      userSql.begin(async (tx) => {
        await tx.unsafe(
          `SELECT set_config('app.organization_id', '${orgAId}', true)`,
        )
        await tx.unsafe(
          `INSERT INTO party_relationship (organization_id, workspace_id, counterparty_id)
           VALUES ('${orgAId}'::uuid, '${workspaceA}'::uuid, '${counterpartyB}'::uuid)`,
        )
      }),
    ).rejects.toThrow(/foreign key|violates/i)
  })
})

describe("party_address — workspace isolation", () => {
  it("hides a workspace-A address from workspace B (SELECT)", async () => {
    const rows = await userSql.begin(async (tx) => {
      await tx.unsafe(
        `SELECT set_config('app.workspace_id', '${workspaceB}', true)`,
      )
      return (await tx.unsafe(
        `SELECT id FROM party_address WHERE id = '${addressAId}'`,
      )) as unknown as Array<{ id: string }>
    })
    expect(rows).toHaveLength(0)
  })

  it("blocks INSERT of an address with a foreign workspace_id (WITH CHECK)", async () => {
    await expect(
      userSql.begin(async (tx) => {
        await tx.unsafe(
          `SELECT set_config('app.workspace_id', '${workspaceB}', true)`,
        )
        await tx.unsafe(
          `INSERT INTO party_address (workspace_id, counterparty_id, purpose)
           VALUES ('${workspaceA}'::uuid, '${counterpartyA}'::uuid, 'MAILING')`,
        )
      }),
    ).rejects.toThrow(/row-level security/)
  })
})

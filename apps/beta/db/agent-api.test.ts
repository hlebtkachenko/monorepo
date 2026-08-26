/**
 * The database guards behind the agent ingestion API (migration 0011).
 *
 * Every one of these is a floor under an application rule, and each is tested
 * from SQL rather than through the API on purpose: the question here is not "does
 * the route refuse it" but "could a future route, a migration or an operator
 * with psql do it at all".
 */
import postgres from "postgres"
import { afterAll, describe, expect, it } from "vitest"

import { hashAgentKey } from "@/lib/agent/key"
import {
  createAccount,
  createAgentKeyRow,
  disableAccount,
  endFixtures,
  seedOrganization,
} from "@/tests/fixtures"
import { sharedDatabaseUrl } from "@/tests/scratch-db"

const sql = postgres(sharedDatabaseUrl(), { max: 2, onnotice: () => {} })

afterAll(async () => {
  await sql.end({ timeout: 5 })
  await endFixtures()
})

describe("agent_key", () => {
  it("refuses a key for an account that is not live office staff", async () => {
    const outsider = await createAccount({ staff: false })
    await expect(
      sql`
        INSERT INTO agent_key (label, key_hash, acting_user_id)
        VALUES ('x', ${hashAgentKey("nope")}, ${outsider.userId})
      `,
    ).rejects.toThrow(/live office account/)
  })

  it("freezes the hash, the acting user and the organization", async () => {
    const org = await seedOrganization()
    const key = await createAgentKeyRow({
      actingUserId: org.members.owner.userId,
    })
    const other = await seedOrganization()

    await expect(
      sql`UPDATE agent_key SET organization_id = ${other.organizationId} WHERE id = ${key.id}`,
    ).rejects.toThrow(/immutable/)
    await expect(
      sql`UPDATE agent_key SET acting_user_id = ${other.members.owner.userId} WHERE id = ${key.id}`,
    ).rejects.toThrow(/immutable/)
    await expect(
      sql`UPDATE agent_key SET key_hash = ${hashAgentKey("rotated")} WHERE id = ${key.id}`,
    ).rejects.toThrow(/immutable/)
  })

  it("makes revocation final", async () => {
    const org = await seedOrganization()
    const key = await createAgentKeyRow({
      actingUserId: org.members.owner.userId,
      revoked: true,
    })

    await expect(
      sql`UPDATE agent_key SET revoked_at = NULL WHERE id = ${key.id}`,
    ).rejects.toThrow(/revocation is final/)
  })

  it("revokes every key of an account the office deactivates", async () => {
    const staff = await createAccount({ staff: true })
    const key = await createAgentKeyRow({ actingUserId: staff.userId })

    await disableAccount(staff.userId)

    const [row] = await sql<{ revoked_at: Date | null }[]>`
      SELECT revoked_at FROM agent_key WHERE id = ${key.id}
    `
    expect(row?.revoked_at).not.toBeNull()
  })

  it("stores one row per secret", async () => {
    const org = await seedOrganization()
    const key = await createAgentKeyRow({
      actingUserId: org.members.owner.userId,
    })
    await expect(
      sql`
        INSERT INTO agent_key (label, key_hash, acting_user_id)
        VALUES ('dup', ${hashAgentKey(key.secret)}, ${org.members.owner.userId})
      `,
    ).rejects.toThrow()
  })
})

describe("activity_log", () => {
  it("refuses an agent act with no key, and a user act with one", async () => {
    const org = await seedOrganization()
    const key = await createAgentKeyRow({
      actingUserId: org.members.owner.userId,
    })

    await expect(
      sql`
        INSERT INTO activity_log (organization_id, actor_kind, action, entity_kind)
        VALUES (${org.organizationId}, 'agent', 'filing.upsert', 'filing')
      `,
    ).rejects.toThrow()

    await expect(
      sql`
        INSERT INTO activity_log (
          organization_id, actor_kind, actor_user_id, agent_key_id, action, entity_kind
        )
        VALUES (
          ${org.organizationId}, 'user', ${org.members.owner.userId}, ${key.id},
          'filing.upsert', 'filing'
        )
      `,
    ).rejects.toThrow()
  })

  it("is append-only", async () => {
    const org = await seedOrganization()
    const [row] = await sql<{ id: string }[]>`
      INSERT INTO activity_log (organization_id, actor_kind, actor_user_id, action, entity_kind)
      VALUES (${org.organizationId}, 'user', ${org.members.owner.userId}, 'filing.upsert', 'filing')
      RETURNING id
    `
    await expect(
      sql`UPDATE activity_log SET action = 'filing.delete' WHERE id = ${row!.id}`,
    ).rejects.toThrow(/append-only/)
  })

  it("spends one request id per key exactly once", async () => {
    const org = await seedOrganization()
    const key = await createAgentKeyRow({
      actingUserId: org.members.owner.userId,
    })

    const insert = (action: string) => sql`
      INSERT INTO activity_log (
        organization_id, actor_kind, actor_user_id, agent_key_id, action,
        entity_kind, request_id
      )
      VALUES (
        ${org.organizationId}, 'agent', ${org.members.owner.userId}, ${key.id},
        ${action}, 'filing', 'run-1'
      )
    `

    await insert("filing.upsert")
    await expect(insert("filing.upsert")).rejects.toThrow()
  })
})

describe("external_ref", () => {
  it("is unique per organization, and free to be null many times over", async () => {
    const org = await seedOrganization()
    const [period] = await sql<{ id: string }[]>`
      INSERT INTO reporting_period (organization_id, period_kind, year, month)
      VALUES (${org.organizationId}, 'month', 2026, 7)
      RETURNING id
    `

    const insert = (ref: string | null) => sql`
      INSERT INTO filing (organization_id, kind, period_id, due_on, external_ref)
      VALUES (${org.organizationId}, 'dph_priznani', ${period!.id}, '2026-08-25', ${ref})
    `

    await insert("ref-1")
    await expect(insert("ref-1")).rejects.toThrow()

    // Office-typed rows carry no ref and must never collide with each other.
    await insert(null)
    await insert(null)

    // The same ref in another book is a different row, not a collision.
    const other = await seedOrganization()
    const [otherPeriod] = await sql<{ id: string }[]>`
      INSERT INTO reporting_period (organization_id, period_kind, year, month)
      VALUES (${other.organizationId}, 'month', 2026, 7)
      RETURNING id
    `
    await sql`
      INSERT INTO filing (organization_id, kind, period_id, due_on, external_ref)
      VALUES (${other.organizationId}, 'dph_priznani', ${otherPeriod!.id}, '2026-08-25', 'ref-1')
    `
  })
})
